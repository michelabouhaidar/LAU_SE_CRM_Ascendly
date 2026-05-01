// ══════════════════════════════════════
//  Ascendly CRM — Approvals Routes
// ══════════════════════════════════════
const router = require('express').Router()
const pool   = require('../db/pool')
const { authenticate, authorize } = require('../middleware/auth')
const { writeAudit } = require('../middleware/audit')

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
router.param('id', (req, res, next, id) => {
  if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Not found.' })
  next()
})

const APPROVAL_SELECT = `
  SELECT a.*,
         e1.name        AS requested_by_name,
         e2.name        AS reviewed_by_name,
         d.title        AS deal_title,
         d.deal_number  AS deal_number
  FROM approvals a
  JOIN employees e1 ON e1.id = a.requested_by
  LEFT JOIN employees e2 ON e2.id = a.reviewed_by
  JOIN deals d ON d.id = a.deal_id
`

// GET /api/approvals
router.get('/', authenticate, authorize('Admin', 'Sales Manager', 'Finance'), async (req, res, next) => {
  try {
    const { status } = req.query
    const params = [req.user.org_id]
    let query = `${APPROVAL_SELECT} WHERE d.org_id = $1`

    if (status) {
      params.push(status)
      query += ` AND a.status = $${params.length}`
    }
    query += ' ORDER BY a.request_date DESC'

    const { rows } = await pool.query(query, params)
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// GET /api/approvals/:id
router.get('/:id', authenticate, authorize('Admin', 'Sales Manager', 'Finance'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `${APPROVAL_SELECT} WHERE a.id = $1 AND d.org_id = $2`,
      [req.params.id, req.user.org_id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Approval not found.' })
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

// POST /api/approvals — SDR removed per SRS §3.2.4 restrictions
router.post('/', authenticate, authorize('Admin', 'Sales Manager', 'Sales Rep'), async (req, res, next) => {
  try {
    const { deal_id, type, discount_pct, justification } = req.body
    if (!deal_id || !type)
      return res.status(400).json({ error: 'deal_id and type are required.' })

    // Verify deal belongs to the requester's org
    const { rows: dealCheck } = await pool.query(
      `SELECT id FROM deals WHERE id = $1 AND org_id = $2`,
      [deal_id, req.user.org_id]
    )
    if (!dealCheck[0]) return res.status(404).json({ error: 'Deal not found.' })

    // Duplicate guard: no pending approval for same deal
    const { rows: existing } = await pool.query(
      `SELECT id FROM approvals WHERE deal_id = $1 AND status = 'Pending' LIMIT 1`,
      [deal_id]
    )
    if (existing[0])
      return res.status(409).json({ error: 'A pending approval already exists for this deal. Wait for it to be resolved.' })

    const { rows } = await pool.query(
      `INSERT INTO approvals (deal_id, requested_by, type, discount_pct, justification)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [deal_id, req.user.id, type, discount_pct || null, justification || null]
    )

    await writeAudit(req.user.id, 'APPROVAL_REQUESTED',
      `Approval requested for deal: ${type}${discount_pct ? ` (${discount_pct}% discount)` : ''}`,
      req.user.org_id, 'approval', rows[0].id)

    res.status(201).json(rows[0])
  } catch (err) {
    next(err)
  }
})

// PATCH /api/approvals/:id  — Sales Manager / Admin decide
router.patch('/:id', authenticate, authorize('Admin', 'Sales Manager'), async (req, res, next) => {
  try {
    const { status } = req.body
    if (!status || !['Approved', 'Rejected'].includes(status))
      return res.status(400).json({ error: "status must be 'Approved' or 'Rejected'." })

    // Fetch approval — scoped to org via deal join
    const { rows: existing } = await pool.query(
      `SELECT a.*, d.title AS deal_title, d.deal_number, d.owner_id AS deal_owner_id
       FROM approvals a
       JOIN deals d ON d.id = a.deal_id AND d.org_id = $2
       WHERE a.id = $1`,
      [req.params.id, req.user.org_id]
    )
    if (!existing[0]) return res.status(404).json({ error: 'Approval not found or already decided.' })
    if (existing[0].status !== 'Pending')
      return res.status(409).json({ error: 'Approval already decided.' })

    // Self-approval guard: block the requester from deciding their own request
    if (existing[0].requested_by === req.user.id)
      return res.status(403).json({ error: 'You cannot approve or reject your own approval request.' })

    // Deal-owner guard: block the deal owner from deciding approvals on their own deal
    // (prevents a manager from requesting via a rep account then approving as themselves)
    if (existing[0].deal_owner_id === req.user.id)
      return res.status(403).json({ error: 'The deal owner cannot approve or reject approval requests on their own deal.' })

    const { rows } = await pool.query(
      `UPDATE approvals
       SET status = $1, reviewed_by = $2, decision_date = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, req.user.id, req.params.id]
    )

    const a = existing[0]
    const discountInfo = a.discount_pct ? ` — ${a.discount_pct}% discount` : ''
    const action = status === 'Approved' ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED'
    await writeAudit(req.user.id, action,
      `${a.type} approval ${status.toLowerCase()} by ${req.user.name} on deal "${a.deal_title}" (DEAL-${a.deal_number})${discountInfo}`,
      req.user.org_id, 'approval', req.params.id)

    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

module.exports = router
