// ══════════════════════════════════════
//  Ascendly CRM — Contacts Routes
// ══════════════════════════════════════
const router = require("express").Router();
const pool   = require("../db/pool");
const { authenticate, authorize } = require("../middleware/auth");
const { writeAudit } = require("../middleware/audit");
const { sendOk }     = require("../middleware/respond");

const crypto          = require('crypto')
const UUID_RE         = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CSV_IMPORT_MAX  = 500

// In-memory job store for async CSV imports. Keyed by jobId (UUID).
// Entries are removed 10 minutes after completion to avoid unbounded growth.
const importJobs = new Map()
router.param('id', (req, res, next, id) => {
  if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Not found.' })
  next()
})

// GET /api/contacts  — supports ?limit=50&offset=0&search=&tag_id=
router.get("/", authenticate, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  ?? 50),  200)
    const offset = Math.max(parseInt(req.query.offset ?? 0),   0)

    const params  = [req.user.org_id]
    let   where   = 'WHERE c.org_id = $1 AND c.deleted_at IS NULL'

    if (req.query.search) {
      params.push(`%${req.query.search}%`)
      const n = params.length
      where += ` AND (c.full_name ILIKE $${n} OR c.email ILIKE $${n} OR c.company ILIKE $${n})`
    }

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT c.*, e.name AS created_by_name,
           COALESCE(
             json_agg(json_build_object('id',ct.id,'name',ct.name,'color',ct.color) ORDER BY ct.name)
             FILTER (WHERE ct.id IS NOT NULL), '[]'
           ) AS tags
         FROM contacts c
         JOIN employees e ON e.id = c.created_by
         LEFT JOIN contact_tag_assignments cta ON cta.contact_id = c.id
         LEFT JOIN contact_tags ct ON ct.id = cta.tag_id
         ${where}
         GROUP BY c.id, e.name
         ORDER BY c.full_name, c.id
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM contacts c ${where}`,
        params
      ),
    ])

    res.json({
      data:   dataRes.rows,
      total:  parseInt(countRes.rows[0].count),
      limit,
      offset,
    })
  } catch (err) {
    next(err);
  }
});

// GET /api/contacts/duplicates — must be declared before /:id to avoid Express matching "duplicates" as an id param
router.get("/duplicates", authenticate, async (req, res, next) => {
  try {
    const [emailDups, nameDups] = await Promise.all([
      pool.query(
        `SELECT json_agg(json_build_object('id',id,'full_name',full_name,'email',email,'company',company,'created_at',created_at) ORDER BY created_at) AS contacts
         FROM contacts WHERE org_id=$1 AND deleted_at IS NULL AND email IS NOT NULL AND email!=''
         GROUP BY LOWER(email) HAVING COUNT(*)>1`,
        [req.user.org_id]
      ),
      pool.query(
        `SELECT json_agg(json_build_object('id',id,'full_name',full_name,'email',email,'company',company,'created_at',created_at) ORDER BY created_at) AS contacts
         FROM contacts WHERE org_id=$1 AND deleted_at IS NULL
         GROUP BY LOWER(full_name) HAVING COUNT(*)>1`,
        [req.user.org_id]
      ),
    ])

    const seen   = new Set()
    const groups = []
    for (const { contacts } of [...emailDups.rows, ...nameDups.rows]) {
      const key = contacts.map(c => c.id).sort().join(',')
      if (!seen.has(key)) { seen.add(key); groups.push(contacts) }
    }
    res.json(groups)
  } catch (err) { next(err) }
})

// GET /api/contacts/:id
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, e.name AS created_by_name,
         COALESCE(
           json_agg(json_build_object('id',ct.id,'name',ct.name,'color',ct.color) ORDER BY ct.name)
           FILTER (WHERE ct.id IS NOT NULL), '[]'
         ) AS tags
       FROM contacts c
       JOIN employees e ON e.id = c.created_by
       LEFT JOIN contact_tag_assignments cta ON cta.contact_id = c.id
       LEFT JOIN contact_tags ct ON ct.id = cta.tag_id
       WHERE c.id = $1 AND c.org_id = $2 AND c.deleted_at IS NULL
       GROUP BY c.id, e.name`,
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Contact not found." });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/contacts

router.post("/", authenticate, authorize("Admin", "Sales Manager", "Sales Rep", "SDR"), async (req, res, next) => {
  try {
    const { full_name, email, phone, company, lead_source, notes } = req.body;
    const missing = [];
    if (!full_name?.trim()) missing.push('full_name');
    if (!email?.trim())     missing.push('email');
    if (!phone?.trim())     missing.push('phone');
    if (!company?.trim())   missing.push('company');
    if (missing.length > 0)
      return res.status(400).json({ error: `Required fields missing: ${missing.join(', ')}.` });

    const { rows } = await pool.query(
      `INSERT INTO contacts (org_id, created_by, full_name, email, phone, company, lead_source, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.user.org_id, req.user.id, full_name.trim(), email.trim(), phone.trim(), company.trim(), lead_source || null, notes || null]
    );
    await writeAudit(req.user.id, 'CONTACT_CREATED', `Contact "${full_name}" created`, req.user.org_id, 'contact', rows[0].id);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A contact with this email already exists in your organisation.' })
    next(err);
  }
});

// PATCH /api/contacts/:id
router.patch("/:id", authenticate, authorize("Admin", "Sales Manager", "Sales Rep", "SDR"), async (req, res, next) => {
  try {
    const { full_name, email, phone, company, lead_source, notes } = req.body;
    const missing = [];
    if (full_name !== undefined && !full_name?.trim()) missing.push('full_name');
    if (email     !== undefined && !email?.trim())     missing.push('email');
    if (phone     !== undefined && !phone?.trim())     missing.push('phone');
    if (company   !== undefined && !company?.trim())   missing.push('company');
    if (missing.length > 0)
      return res.status(400).json({ error: `Required fields cannot be empty: ${missing.join(', ')}.` });
    const { rows } = await pool.query(
      `UPDATE contacts
       SET full_name   = COALESCE($1, full_name),
           email       = COALESCE($2, email),
           phone       = COALESCE($3, phone),
           company     = COALESCE($4, company),
           lead_source = COALESCE($5, lead_source),
           notes       = COALESCE($6, notes)
       WHERE id = $7 AND org_id = $8 AND deleted_at IS NULL
       RETURNING *`,
      [full_name, email, phone, company, lead_source, notes, req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Contact not found." });
    await writeAudit(req.user.id, 'CONTACT_UPDATED', `Contact "${rows[0].full_name}" updated`, req.user.org_id, 'contact', rows[0].id);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A contact with this email already exists in your organisation.' })
    next(err);
  }
});


// ── CSV Import ───────────────────────────────────────────────────────────────
// POST /api/contacts/import
// Body: { rows: [{ full_name, email, phone, company, lead_source, notes }] }
// Returns 202 immediately with { jobId }; poll GET /import/:jobId for status.
router.post("/import", authenticate,
  authorize("Admin", "Sales Manager", "Sales Rep", "SDR"),
  (req, res, next) => {
    const rawRows = req.body.rows
    if (!Array.isArray(rawRows) || rawRows.length === 0)
      return res.status(400).json({ error: "No rows provided." })
    if (rawRows.length > CSV_IMPORT_MAX)
      return res.status(400).json({ error: `Maximum ${CSV_IMPORT_MAX} rows per import.` })

    const jobId   = crypto.randomUUID()
    const orgId   = req.user.org_id
    const userId  = req.user.id

    importJobs.set(jobId, { status: 'pending', imported: 0, errors: [], total: rawRows.length })
    res.status(202).json({ jobId })

    // Process rows after the HTTP response is flushed (non-blocking to caller).
    setImmediate(async () => {
      let imported = 0
      const errors = []
      for (let i = 0; i < rawRows.length; i++) {
        const r = rawRows[i]
        if (!r.full_name?.trim()) {
          errors.push({ row: i + 1, reason: "Missing full_name" }); continue
        }
        try {
          await pool.query(
            `INSERT INTO contacts (org_id, created_by, full_name, email, phone, company, lead_source, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [orgId, userId,
             r.full_name.trim(), r.email?.trim() || null, r.phone?.trim() || null,
             r.company?.trim() || null, r.lead_source?.trim() || null, r.notes?.trim() || null]
          )
          imported++
        } catch (e) {
          errors.push({ row: i + 1, reason: e.message.includes("unique") ? "Duplicate email" : "Insert failed" })
        }
      }
      if (imported > 0)
        await writeAudit(userId, 'CONTACTS_IMPORTED',
          `${imported} contacts imported via CSV`, orgId, 'contact', null).catch(() => {})

      importJobs.set(jobId, { status: 'done', imported, errors, total: rawRows.length })
      // Auto-remove after 10 minutes to prevent memory leak
      setTimeout(() => importJobs.delete(jobId), 10 * 60 * 1000)
    })
  }
)

// GET /api/contacts/import/:jobId — poll import job status
router.get("/import/:jobId", authenticate,
  authorize("Admin", "Sales Manager", "Sales Rep", "SDR"),
  (req, res) => {
    const job = importJobs.get(req.params.jobId)
    if (!job) return res.status(404).json({ error: "Job not found or already expired." })
    res.json(job)
  }
)

// ── Merge ────────────────────────────────────────────────────────────────────
// POST /api/contacts/:id/merge  — keep :id, delete source_id
router.post("/:id/merge", authenticate, authorize("Admin", "Sales Manager"), async (req, res, next) => {
  try {
    const { source_id } = req.body
    if (!source_id) return res.status(400).json({ error: "source_id is required." })
    if (source_id === req.params.id) return res.status(400).json({ error: "Cannot merge a contact with itself." })

    const { rows: both } = await pool.query(
      `SELECT id FROM contacts WHERE id = ANY($1) AND org_id=$2`,
      [[req.params.id, source_id], req.user.org_id]
    )
    if (both.length < 2) return res.status(404).json({ error: "One or both contacts not found." })

    // Run all merge steps in a single transaction so a mid-way failure
    // never leaves deals/tasks pointing to a deleted contact.
    const client = await pool.connect()
    let deleted
    try {
      await client.query('BEGIN')
      await client.query(
        `UPDATE deals SET contact_id=$1 WHERE contact_id=$2 AND org_id=$3`,
        [req.params.id, source_id, req.user.org_id]
      )
      await client.query(
        `UPDATE tasks SET contact_id=$1 WHERE contact_id=$2
         AND contact_id IN (SELECT id FROM contacts WHERE org_id=$3)`,
        [req.params.id, source_id, req.user.org_id]
      )
      const { rows } = await client.query(
        `DELETE FROM contacts WHERE id=$1 AND org_id=$2 RETURNING full_name`,
        [source_id, req.user.org_id]
      )
      deleted = rows
      await client.query('COMMIT')
    } catch (txErr) {
      await client.query('ROLLBACK')
      throw txErr
    } finally {
      client.release()
    }

    await writeAudit(req.user.id, 'CONTACT_MERGED',
      `"${deleted[0]?.full_name}" merged into this contact`, req.user.org_id, 'contact', req.params.id)

    sendOk(res, "Contacts merged.")
  } catch (err) { next(err) }
})

// ── Per-contact timeline batch endpoints (#72 — eliminates N+1 in ContactDetail) ──
// GET /api/contacts/:id/interactions — all interactions across every deal for this contact
router.get("/:id/interactions", authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.id, i.type, i.summary, i.next_step, i.occurred_at, i.logged_by,
              d.id AS deal_id, d.title AS deal_title
       FROM interactions i
       JOIN deals d ON d.id = i.deal_id AND d.org_id = $1 AND d.deleted_at IS NULL
       WHERE d.contact_id = $2
       ORDER BY i.occurred_at DESC`,
      [req.user.org_id, req.params.id]
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// GET /api/contacts/:id/stage-history — all stage moves across every deal for this contact
router.get("/:id/stage-history", authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT dsh.id, dsh.moved_at, dsh.moved_by,
              d.id AS deal_id, d.title AS deal_title,
              sc.name AS stage_name, sc.position AS stage_position
       FROM deal_stage_history dsh
       JOIN deals d ON d.id = dsh.deal_id AND d.org_id = $1 AND d.deleted_at IS NULL
       JOIN stage_catalog sc ON sc.id = dsh.to_stage
       WHERE d.contact_id = $2
       ORDER BY dsh.moved_at DESC`,
      [req.user.org_id, req.params.id]
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// ── Tags (per contact) ───────────────────────────────────────────────────────
// GET /api/contacts/:id/tags
router.get("/:id/tags", authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ct.* FROM contact_tags ct
       JOIN contact_tag_assignments cta ON cta.tag_id = ct.id
       JOIN contacts c ON c.id = cta.contact_id
       WHERE cta.contact_id = $1 AND c.org_id = $2 AND c.deleted_at IS NULL
       ORDER BY ct.name`,
      [req.params.id, req.user.org_id]
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// POST /api/contacts/:id/tags  — assign tag
router.post("/:id/tags", authenticate,
  authorize("Admin", "Sales Manager", "Sales Rep", "SDR"),
  async (req, res, next) => {
    try {
      const { tag_id } = req.body
      if (!tag_id) return res.status(400).json({ error: "tag_id is required." })

      // Verify contact and tag both belong to the caller's org
      const { rows: contactCheck } = await pool.query(
        `SELECT id FROM contacts WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
        [req.params.id, req.user.org_id]
      )
      if (!contactCheck[0]) return res.status(404).json({ error: "Contact not found." })

      const { rows: tagCheck } = await pool.query(
        `SELECT id FROM contact_tags WHERE id = $1 AND org_id = $2`,
        [tag_id, req.user.org_id]
      )
      if (!tagCheck[0]) return res.status(404).json({ error: "Tag not found." })

      await pool.query(
        `INSERT INTO contact_tag_assignments (contact_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [req.params.id, tag_id]
      )
      res.status(201).json({ contact_id: req.params.id, tag_id })
    } catch (err) { next(err) }
  }
)

// DELETE /api/contacts/:id/tags/:tagId  — remove tag
router.delete("/:id/tags/:tagId", authenticate,
  authorize("Admin", "Sales Manager", "Sales Rep", "SDR"),
  async (req, res, next) => {
    try {
      // Verify contact belongs to the caller's org before removing tag
      const { rows: contactCheck } = await pool.query(
        `SELECT id FROM contacts WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
        [req.params.id, req.user.org_id]
      )
      if (!contactCheck[0]) return res.status(404).json({ error: "Contact not found." })

      await pool.query(
        `DELETE FROM contact_tag_assignments WHERE contact_id=$1 AND tag_id=$2`,
        [req.params.id, req.params.tagId]
      )
      sendOk(res, "Tag removed.")
    } catch (err) { next(err) }
  }
)

module.exports = router;
