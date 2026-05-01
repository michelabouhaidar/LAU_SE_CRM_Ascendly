// ══════════════════════════════════════
//  Ascendly CRM — Pipeline Stages Routes
// ══════════════════════════════════════
const router = require('express').Router()
const pool   = require('../db/pool')
const { authenticate, authorize, isSuperAdmin } = require('../middleware/auth')

function requireSuperAdmin(req, res, next) {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Forbidden: super-admin only.' })
  next()
}
const { writeAudit } = require('../middleware/audit')
const { sendOk }     = require('../middleware/respond')

// GET /api/pipeline-stages
// Returns all catalog stages with is_active flag + required_fields for the user's org.
// 'New' (position=1) is always returned as active regardless of the toggle.
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT sc.id, sc.name, sc.position, sc.default_probability, sc.is_terminal,
              COALESCE(oas.is_active, false) AS is_active,
              COALESCE(
                json_agg(srf.field ORDER BY srf.field) FILTER (WHERE srf.field IS NOT NULL),
                '[]'::json
              ) AS required_fields
       FROM stage_catalog sc
       LEFT JOIN org_active_stages oas
         ON oas.stage_id = sc.id AND oas.org_id = $1
       LEFT JOIN stage_required_fields srf ON srf.stage_id = sc.id
       GROUP BY sc.id, sc.name, sc.position, sc.default_probability, sc.is_terminal, oas.is_active
       ORDER BY sc.position ASC`,
      [req.user.org_id]
    )
    // New stage is always active
    const result = rows.map(r => ({
      ...r,
      is_active: r.position === 1 ? true : r.is_active,
    }))
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/pipeline-stages/:id/toggle — org Admin only
// Activates or deactivates a stage for the org. Cannot deactivate position=1 (New).
router.patch('/:id/toggle', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    // Verify stage exists in catalog
    const { rows: stage } = await pool.query(
      `SELECT id, name, position FROM stage_catalog WHERE id = $1`, [req.params.id]
    )
    if (!stage[0]) return res.status(404).json({ error: 'Stage not found.' })
    if (stage[0].position === 1)
      return res.status(400).json({ error: 'The New stage cannot be deactivated.' })

    const { is_active } = req.body
    if (typeof is_active !== 'boolean')
      return res.status(400).json({ error: 'is_active (boolean) is required.' })

    await pool.query(
      `INSERT INTO org_active_stages (org_id, stage_id, is_active)
       VALUES ($1, $2, $3)
       ON CONFLICT (org_id, stage_id) DO UPDATE SET is_active = $3`,
      [req.user.org_id, req.params.id, is_active]
    )

    await writeAudit(
      req.user.id,
      is_active ? 'STAGE_ACTIVATED' : 'STAGE_DEACTIVATED',
      `Stage "${stage[0].name}" ${is_active ? 'activated' : 'deactivated'} for org`,
      req.user.org_id, 'stage', req.params.id
    )

    res.json({ id: req.params.id, is_active })
  } catch (err) {
    next(err)
  }
})

const VALID_FIELDS = ['expected_value', 'expected_close_date', 'probability', 'description']

// POST /api/pipeline-stages/:id/required-fields — super-admin only (global config, affects all orgs)
router.post('/:id/required-fields', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    const { field } = req.body
    if (!VALID_FIELDS.includes(field))
      return res.status(400).json({ error: `Invalid field. Must be one of: ${VALID_FIELDS.join(', ')}` })

    const { rows: stage } = await pool.query('SELECT id FROM stage_catalog WHERE id = $1', [req.params.id])
    if (!stage[0]) return res.status(404).json({ error: 'Stage not found.' })

    await pool.query(
      `INSERT INTO stage_required_fields (stage_id, field) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.params.id, field]
    )
    await writeAudit(req.user.id, 'STAGE_FIELD_REQUIRED',
      `Field "${field}" marked required for stage`, req.user.org_id, 'stage', req.params.id)
    res.status(201).json({ stage_id: req.params.id, field })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/pipeline-stages/:id/required-fields/:field — super-admin only (global config, affects all orgs)
router.delete('/:id/required-fields/:field', authenticate, requireSuperAdmin, async (req, res, next) => {
  try {
    await pool.query(
      `DELETE FROM stage_required_fields WHERE stage_id = $1 AND field = $2`,
      [req.params.id, req.params.field]
    )
    await writeAudit(req.user.id, 'STAGE_FIELD_UNREQUIRED',
      `Field "${req.params.field}" removed from required fields for stage`,
      req.user.org_id, 'stage', req.params.id)
    sendOk(res, 'Field requirement removed.')
  } catch (err) {
    next(err)
  }
})

module.exports = router
