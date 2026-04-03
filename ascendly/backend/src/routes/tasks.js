

const router = require("express").Router();
const pool   = require("../db/pool");
const { authenticate, authorize } = require("../middleware/auth");
const { writeAudit } = require("../middleware/audit");
const { sendOk }     = require("../middleware/respond");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
router.param('id', (req, res, next, id) => {
  if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Not found.' })
  next()
})

router.get("/", authenticate, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  ?? 50), 200)
    const offset = Math.max(parseInt(req.query.offset ?? 0),  0)
    const { status, assigned_to, deal_id } = req.query;
    
    const params = [req.user.org_id];
    let where = `WHERE e1.org_id = $1`;

    
    if (req.user.role === 'Sales Rep' || req.user.role === 'SDR') {
      params.push(req.user.id);
      where += ` AND t.assigned_to = $${params.length}`;
    }

    if (status) {
      params.push(status);
      where += ` AND t.status = $${params.length}`;
    }
    if (assigned_to && ['Admin', 'Sales Manager'].includes(req.user.role)) {
      params.push(assigned_to);
      where += ` AND t.assigned_to = $${params.length}`;
    }
    if (deal_id) {
      params.push(deal_id);
      where += ` AND t.deal_id = $${params.length}`;
    }
    if (req.query.search) {
      params.push(`%${req.query.search}%`)
      where += ` AND t.title ILIKE $${params.length}`
    }

    const baseQuery = `
      SELECT t.*,
             e1.name AS created_by_name,
             e2.name AS assigned_to_name
      FROM tasks t
      JOIN employees e1 ON e1.id = t.created_by
      LEFT JOIN employees e2 ON e2.id = t.assigned_to
      ${where}
    `

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `${baseQuery} ORDER BY t.due_date ASC NULLS LAST, t.id ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM tasks t JOIN employees e1 ON e1.id = t.created_by ${where}`,
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

router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*,
              e1.name AS created_by_name,
              e2.name AS assigned_to_name
       FROM tasks t
       JOIN employees e1 ON e1.id = t.created_by
       LEFT JOIN employees e2 ON e2.id = t.assigned_to
       WHERE t.id = $1 AND e1.org_id = $2`,
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Task not found." });
    
    if ((req.user.role === 'Sales Rep' || req.user.role === 'SDR') &&
        rows[0].assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'You can only view your own tasks.' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/", authenticate, authorize("Admin", "Sales Manager", "Sales Rep", "SDR"), async (req, res, next) => {
  try {
    const { deal_id, contact_id, assigned_to, title, type, due_date } = req.body;
    if (!title) {
      return res.status(400).json({ error: "title is required." });
    }

    
    if (deal_id) {
      const { rows: d } = await pool.query(
        `SELECT id FROM deals WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [deal_id, req.user.org_id]
      );
      if (!d[0]) return res.status(400).json({ error: "Deal not found in your organisation." });
    }
    if (contact_id) {
      const { rows: c } = await pool.query(
        `SELECT id FROM contacts WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`, [contact_id, req.user.org_id]
      );
      if (!c[0]) return res.status(400).json({ error: "Contact not found in your organisation." });
    }
    const effectiveAssignee = assigned_to || req.user.id;
    const { rows: assignee } = await pool.query(
      `SELECT id FROM employees WHERE id = $1 AND org_id = $2 AND is_active = true`, [effectiveAssignee, req.user.org_id]
    );
    if (!assignee[0]) return res.status(400).json({ error: "Assignee not found in your organisation." });

    const { rows } = await pool.query(
      `INSERT INTO tasks (deal_id, contact_id, created_by, assigned_to, title, type, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [deal_id || null, contact_id || null, req.user.id, effectiveAssignee, title, type || null, due_date || null]
    );
    await writeAudit(req.user.id, 'TASK_CREATED', `Task "${title}" created`, req.user.org_id, 'task', rows[0].id);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", authenticate, authorize("Admin", "Sales Manager", "Sales Rep", "SDR"), async (req, res, next) => {
  try {
    const { title, type, due_date, status } = req.body;

    
    const canReassign = req.user.role === 'Admin' || req.user.role === 'Sales Manager'
    const assigned_to = canReassign ? req.body.assigned_to : undefined

    
    const { rows: before } = await pool.query(
      `SELECT t.*, e1.org_id, e2.name AS assigned_to_name
       FROM tasks t
       JOIN employees e1 ON e1.id = t.created_by
       LEFT JOIN employees e2 ON e2.id = t.assigned_to
       WHERE t.id = $1 AND e1.org_id = $2`,
      [req.params.id, req.user.org_id]
    );
    if (!before[0]) return res.status(404).json({ error: "Task not found." });

    
    if ((req.user.role === 'Sales Rep' || req.user.role === 'SDR') &&
        before[0].assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'You can only update your own tasks.' });
    }

    
    if (assigned_to) {
      const { rows: assignee } = await pool.query(
        `SELECT id FROM employees WHERE id = $1 AND org_id = $2 AND is_active = true`,
        [assigned_to, req.user.org_id]
      );
      if (!assignee[0]) return res.status(400).json({ error: "Assignee not found in your organisation." });
    }

    const { rows } = await pool.query(
      `UPDATE tasks
       SET title       = COALESCE($1, title),
           type        = COALESCE($2, type),
           due_date    = COALESCE($3, due_date),
           status      = COALESCE($4, status),
           assigned_to = COALESCE($5, assigned_to)
       WHERE id = $6
         AND created_by IN (SELECT id FROM employees WHERE org_id = $7)
       RETURNING *`,
      [title, type, due_date, status, assigned_to, req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Task not found." });

    
    const changes = []
    if (status && status !== before[0].status) changes.push(`status → ${status}`)
    if (assigned_to && assigned_to !== before[0].assigned_to) {
      const { rows: newAssignee } = await pool.query('SELECT name FROM employees WHERE id = $1', [assigned_to])
      changes.push(`reassigned to ${newAssignee[0]?.name ?? 'unknown'}`)
    }
    if (due_date && due_date !== before[0].due_date) changes.push(`due date → ${due_date}`)
    if (title && title !== before[0].title) changes.push(`renamed to "${title}"`)
    const desc = changes.length
      ? `Task "${before[0].title}": ${changes.join(', ')}`
      : `Task "${rows[0].title}" updated`

    await writeAudit(req.user.id, 'TASK_UPDATED', desc, req.user.org_id, 'task', rows[0].id);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", authenticate, authorize("Admin", "Sales Manager"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM tasks
       WHERE id = $1
         AND created_by IN (SELECT id FROM employees WHERE org_id = $2)
       RETURNING id, title`,
      [req.params.id, req.user.org_id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Task not found." });
    await writeAudit(req.user.id, 'TASK_DELETED', `Task "${rows[0].title}" deleted`, req.user.org_id, 'task', rows[0].id);
    sendOk(res, "Task deleted.");
  } catch (err) {
    next(err);
  }
});

module.exports = router;
