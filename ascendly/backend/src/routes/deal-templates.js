// ══════════════════════════════════════════════════════
//  Ascendly CRM — Deal Templates Routes
// ══════════════════════════════════════════════════════
const router = require('express').Router()
const pool   = require('../db/pool')
const { authenticate, authorize } = require('../middleware/auth')
const { writeAudit } = require('../middleware/audit')
const { sendOk }     = require('../middleware/respond')

// GET /api/deal-templates  — all templates for org
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT dt.*, e.name AS created_by_name
       FROM deal_templates dt
       JOIN employees e ON e.id = dt.created_by
       WHERE dt.org_id = $1
       ORDER BY dt.name`,
      [req.user.org_id]
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// POST /api/deal-templates  — create template (Admin / Manager only)
router.post('/', authenticate,
  authorize('Admin', 'Sales Manager'),
  async (req, res, next) => {
    try {
      const { name, title, description, expected_value, probability } = req.body
      if (!name?.trim() || !title?.trim())
        return res.status(400).json({ error: 'name and title are required.' })

      const { rows } = await pool.query(
        `INSERT INTO deal_templates (org_id, created_by, name, title, description, expected_value, probability)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.user.org_id, req.user.id, name.trim(), title.trim(),
         description || null, expected_value || null, probability || null]
      )
      await writeAudit(req.user.id, 'TEMPLATE_CREATED',
        `Deal template "${name.trim()}" created`, req.user.org_id, 'template', rows[0].id)
      res.status(201).json(rows[0])
    } catch (err) { next(err) }
  }
)

// PATCH /api/deal-templates/:id  — update template (Admin / Manager only)
router.patch('/:id', authenticate,
  authorize('Admin', 'Sales Manager'),
  async (req, res, next) => {
    try {
      const { name, title, description, expected_value, probability } = req.body
      const { rows } = await pool.query(
        `UPDATE deal_templates
         SET name           = COALESCE($1, name),
             title          = COALESCE($2, title),
             description    = COALESCE($3, description),
             expected_value = COALESCE($4, expected_value),
             probability    = COALESCE($5, probability),
             updated_at     = NOW()
         WHERE id = $6 AND org_id = $7
         RETURNING *`,
        [name || null, title || null, description || null,
         expected_value || null, probability || null,
         req.params.id, req.user.org_id]
      )
      if (!rows[0]) return res.status(404).json({ error: 'Template not found.' })
      res.json(rows[0])
    } catch (err) { next(err) }
  }
)

// DELETE /api/deal-templates/:id  — Admin only
router.delete('/:id', authenticate,
  authorize('Admin', 'Sales Manager'),
  async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `DELETE FROM deal_templates WHERE id = $1 AND org_id = $2 RETURNING id, name`,
        [req.params.id, req.user.org_id]
      )
      if (!rows[0]) return res.status(404).json({ error: 'Template not found.' })
      await writeAudit(req.user.id, 'TEMPLATE_DELETED',
        `Deal template "${rows[0].name}" deleted`, req.user.org_id, 'template', rows[0].id)
      sendOk(res, 'Template deleted.')
    } catch (err) { next(err) }
  }
)

module.exports = router
