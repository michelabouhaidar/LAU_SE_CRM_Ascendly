// ══════════════════════════════════════
//  Ascendly CRM — Audit Log Routes
// ══════════════════════════════════════
const crypto = require("crypto");
const router = require("express").Router();
const pool   = require("../db/pool");
const { authenticate, authorize, isSuperAdmin } = require("../middleware/auth");

const ALLOWED_SORTS = new Set([
  'occurred_at', 'action', 'entity_type', 'actor_name', 'org_name', 'description',
]);

// GET /api/audit — paginated, searched, filtered, sorted audit log
// Super admin → all entries; other admins → own org only
router.get("/", authenticate, authorize("Admin"), async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const q      = (req.query.q           || '').trim();
    const action = (req.query.action      || '').trim();
    const entity = (req.query.entity_type || '').trim();
    const sortRaw = req.query.sort || 'occurred_at';
    const sort    = ALLOWED_SORTS.has(sortRaw) ? sortRaw : 'occurred_at';
    const dir     = req.query.dir === 'asc' ? 'ASC' : 'DESC';

    const sortExpr =
      sort === 'actor_name' ? 'e.name'
      : sort === 'org_name' ? 'o.name'
      : `a.${sort}`;

    // Build shared WHERE clauses
    const params  = [];
    const clauses = [];

    if (!isSuperAdmin(req)) {
      params.push(req.user.org_id);
      clauses.push(`a.org_id = $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      const p = params.length;
      clauses.push(
        `(e.name ILIKE $${p} OR e.email ILIKE $${p} OR a.action ILIKE $${p}` +
        ` OR a.description ILIKE $${p} OR a.entity_type ILIKE $${p}` +
        ` OR o.name ILIKE $${p})`
      );
    }

    if (action) {
      params.push(action);
      clauses.push(`a.action = $${params.length}`);
    }

    if (entity) {
      params.push(entity);
      clauses.push(`a.entity_type = $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const baseJoins = `
      FROM audit_log a
      LEFT JOIN employees     e ON e.id = a.actor_id
      LEFT JOIN organizations o ON o.id = a.org_id`;

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT a.id, a.action, a.description, a.entity_type, a.entity_id,
                a.occurred_at, e.name AS actor_name, e.email AS actor_email,
                o.name AS org_name
         ${baseJoins} ${where}
         ORDER BY ${sortExpr} ${dir} NULLS LAST
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*) ${baseJoins} ${where}`, params),
    ]);

    res.json({
      total:  parseInt(countRes.rows[0].count),
      limit,
      offset,
      data:   dataRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/audit/verify — recompute chain hashes and report tampered entries (#40)
router.get("/verify", authenticate, authorize("Admin"), async (req, res, next) => {
  try {
    const params = isSuperAdmin(req) ? [] : [req.user.org_id]
    const where  = isSuperAdmin(req) ? '' : 'WHERE org_id = $1'

    const { rows } = await pool.query(
      `SELECT id, action, description, occurred_at, chain_hash, org_id
       FROM audit_log ${where}
       ORDER BY org_id NULLS FIRST, occurred_at ASC, id ASC`,
      params
    )

    // Verify per-org hash chains independently
    const prevByOrg = {}
    const tamperedIds = []

    for (const row of rows) {
      if (!row.chain_hash) continue // pre-migration entries — skip
      const key      = row.org_id || '__global__'
      const prevHash = prevByOrg[key] || '0'.repeat(64)
      const input    = `${prevHash}|${row.action}|${row.description || ''}|${new Date(row.occurred_at).toISOString()}`
      const expected = crypto.createHash('sha256').update(input).digest('hex')
      if (row.chain_hash !== expected) tamperedIds.push(row.id)
      prevByOrg[key] = row.chain_hash
    }

    res.json({
      total:      rows.length,
      tampered:   tamperedIds.length,
      intact:     tamperedIds.length === 0,
      tamperedIds,
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router;
