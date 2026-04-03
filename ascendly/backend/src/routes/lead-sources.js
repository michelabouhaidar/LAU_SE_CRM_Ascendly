

const router = require('express').Router()
const pool   = require('../db/pool')
const { authenticate, authorize, isSuperAdmin } = require('../middleware/auth')
const { writeAudit } = require('../middleware/audit')

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, label FROM lead_sources WHERE org_id = $1 ORDER BY label ASC`,
      [req.user.org_id]
    )
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

router.post('/', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const { label } = req.body
    if (!label?.trim()) return res.status(400).json({ error: 'label is required.' })

    const { rows } = await pool.query(
      `INSERT INTO lead_sources (org_id, label) VALUES ($1, $2) RETURNING *`,
      [req.user.org_id, label.trim()]
    )
    await writeAudit(req.user.id, 'LEAD_SOURCE_CREATED', `Lead source "${label.trim()}" added`, req.user.org_id, 'lead_source', rows[0].id)
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'This lead source already exists.' })
    next(err)
  }
})

router.patch('/:id', authenticate, authorize('Admin'), async (req, res, next) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Forbidden: super admin only.' })
  try {
    const { label } = req.body
    if (!label?.trim()) return res.status(400).json({ error: 'label is required.' })
    const { rows } = await pool.query(
      `UPDATE lead_sources SET label = $1 WHERE id = $2 AND org_id = $3 RETURNING *`,
      [label.trim(), req.params.id, req.user.org_id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Lead source not found.' })
    await writeAudit(req.user.id, 'LEAD_SOURCE_UPDATED', `Lead source renamed to "${label.trim()}"`, req.user.org_id, 'lead_source', req.params.id)
    res.json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'This lead source already exists.' })
    next(err)
  }
})

router.delete('/:id', authenticate, authorize('Admin'), async (req, res, next) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Forbidden: super admin only.' })
  try {
    const { rows: using } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM contacts c
       JOIN lead_sources ls ON ls.label = c.lead_source AND ls.id = $1`,
      [req.params.id]
    )
    if (parseInt(using[0].cnt) > 0)
      return res.status(409).json({
        error: `Cannot delete: ${using[0].cnt} contact(s) use this lead source.`
      })

    const { rows } = await pool.query(
      'DELETE FROM lead_sources WHERE id = $1 RETURNING label',
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Lead source not found.' })
    await writeAudit(req.user.id, 'LEAD_SOURCE_DELETED', `Lead source "${rows[0].label}" deleted`, req.user.org_id, 'lead_source', req.params.id)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

module.exports = router
