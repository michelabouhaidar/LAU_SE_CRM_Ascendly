// ══════════════════════════════════════
//  Ascendly CRM — Contact Tags Routes
// ══════════════════════════════════════
const router = require('express').Router()
const pool   = require('../db/pool')
const { authenticate, authorize } = require('../middleware/auth')
const { sendOk }     = require('../middleware/respond')

const TAG_COLORS = ['#6B7A90','#3B82F6','#8B5CF6','#F59E0B','#62c0d5','#22C55E','#F97316','#14B8A6','#EC4899']

// GET /api/contact-tags
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ct.*, COUNT(cta.contact_id)::int AS usage_count
       FROM contact_tags ct
       LEFT JOIN contact_tag_assignments cta ON cta.tag_id = ct.id
       WHERE ct.org_id = $1
       GROUP BY ct.id ORDER BY ct.name`,
      [req.user.org_id]
    )
    res.json(rows)
  } catch (err) { next(err) }
})

// POST /api/contact-tags
router.post('/', authenticate, authorize('Admin', 'Sales Manager', 'Sales Rep', 'SDR'), async (req, res, next) => {
  try {
    const { name, color } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Tag name is required.' })
    const safeColor = TAG_COLORS.includes(color) ? color : TAG_COLORS[0]
    const { rows } = await pool.query(
      `INSERT INTO contact_tags (org_id, name, color) VALUES ($1,$2,$3) RETURNING *`,
      [req.user.org_id, name.trim(), safeColor]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Tag already exists.' })
    next(err)
  }
})

// DELETE /api/contact-tags/:id
router.delete('/:id', authenticate, authorize('Admin', 'Sales Manager'), async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM contact_tags WHERE id=$1 AND org_id=$2`, [req.params.id, req.user.org_id])
    sendOk(res, 'Tag deleted.')
  } catch (err) { next(err) }
})

module.exports = router
