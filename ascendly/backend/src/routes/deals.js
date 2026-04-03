

const router = require('express').Router()
const pool   = require('../db/pool')
const { authenticate, authorize } = require('../middleware/auth')
const { writeAudit } = require('../middleware/audit')
const { sendOk }     = require('../middleware/respond')

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
router.param('id', (req, res, next, id) => {
  if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Not found.' })
  next()
})

const DEAL_SELECT = `
  SELECT d.id, d.deal_number, d.org_id, d.owner_id, d.contact_id, d.stage_id,
         d.title, d.description, d.expected_value, d.probability, d.expected_close_date,
         d.status, d.final_value, d.contract_date, d.lost_reason, d.created_at, d.updated_at,
         c.full_name AS contact_name, c.company AS contact_company, e.name AS owner_name, sc.name AS stage_name,
         sc.position AS stage_position,
         (d.expected_close_date < CURRENT_DATE AND d.status = 'Open') AS is_overdue,
         COALESCE(
           (SELECT CURRENT_DATE - dsh2.moved_at::date
            FROM deal_stage_history dsh2
            WHERE dsh2.deal_id = d.id AND dsh2.to_stage = d.stage_id
            ORDER BY dsh2.moved_at DESC LIMIT 1),
           CURRENT_DATE - d.created_at::date
         ) AS days_in_stage
  FROM deals d
  JOIN contacts c ON c.id = d.contact_id
  JOIN employees e ON e.id = d.owner_id
  JOIN stage_catalog sc ON sc.id = d.stage_id
`

router.get('/', authenticate, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  ?? 50), 200)
    const offset = Math.max(parseInt(req.query.offset ?? 0),  0)
    const { status, contact_id, owner_id } = req.query
    const params  = [req.user.org_id]
    const clauses = [`d.org_id = $1`, `d.deleted_at IS NULL`]

    
    if (req.user.role === 'Finance') {
      clauses.push(`d.status = 'Won'`)
    }

    
    if (req.user.role === 'Sales Rep' || req.user.role === 'SDR') {
      params.push(req.user.id)
      clauses.push(`d.owner_id = $${params.length}`)
    }

    if (status) {
      params.push(status)
      clauses.push(`d.status = $${params.length}`)
    }

    if (contact_id) {
      params.push(contact_id)
      clauses.push(`d.contact_id = $${params.length}`)
    }

    if (owner_id && ['Admin', 'Sales Manager'].includes(req.user.role)) {
      params.push(owner_id)
      clauses.push(`d.owner_id = $${params.length}`)
    }

    if (req.query.search) {
      params.push(`%${req.query.search}%`)
      const n = params.length
      clauses.push(`(d.title ILIKE $${n} OR c.full_name ILIKE $${n} OR c.company ILIKE $${n})`)
    }

    const where = `WHERE ${clauses.join(' AND ')}`

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `${DEAL_SELECT} ${where} ORDER BY d.updated_at DESC, d.id ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM deals d JOIN contacts c ON c.id = d.contact_id ${where}`,
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
    next(err)
  }
})

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `${DEAL_SELECT} WHERE d.id = $1 AND d.org_id = $2 AND d.deleted_at IS NULL`,
      [req.params.id, req.user.org_id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Deal not found.' })

    
    if ((req.user.role === 'Sales Rep' || req.user.role === 'SDR') &&
        rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only view your own deals.' })
    }

    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

router.get('/:id/interactions', authenticate, async (req, res, next) => {
  try {
    
    const params = [req.params.id, req.user.org_id]
    let ownerFilter = ''
    if (req.user.role === 'Sales Rep' || req.user.role === 'SDR') {
      params.push(req.user.id)
      ownerFilter = `AND d.owner_id = $${params.length}`
    }
    const { rows } = await pool.query(
      `SELECT i.*, e.name AS logged_by_name
       FROM interactions i
       JOIN employees e ON e.id = i.logged_by
       JOIN deals d ON d.id = i.deal_id
       WHERE i.deal_id = $1 AND d.org_id = $2 AND d.deleted_at IS NULL ${ownerFilter}
       ORDER BY i.occurred_at DESC`,
      params
    )
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

router.get('/:id/stage-history', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT dsh.moved_at,
              fs.name AS from_stage,
              ts.name AS to_stage,
              e.name  AS moved_by
       FROM deal_stage_history dsh
       LEFT JOIN stage_catalog fs ON dsh.from_stage = fs.id
       JOIN  stage_catalog ts ON dsh.to_stage   = ts.id
       JOIN  employees e      ON dsh.moved_by   = e.id
       JOIN  deals d          ON d.id           = dsh.deal_id
       WHERE dsh.deal_id = $1 AND d.org_id = $2 AND d.deleted_at IS NULL
       ORDER BY dsh.moved_at ASC`,
      [req.params.id, req.user.org_id]
    )
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

router.post('/:id/interactions', authenticate,
  authorize('Admin', 'Sales Manager', 'Sales Rep', 'SDR'),
  async (req, res, next) => {
    try {
      const { type, summary, next_step, occurred_at } = req.body
      if (!type || !summary)
        return res.status(400).json({ error: 'type and summary are required.' })

      
      if (occurred_at) {
        const oat = new Date(occurred_at)
        if (oat > new Date(Date.now() + 60 * 60 * 1000))
          return res.status(400).json({ error: 'Interaction date cannot be in the future.' })
      }

      const { rows: dealRows } = await pool.query(
        `SELECT title, owner_id FROM deals WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
        [req.params.id, req.user.org_id]
      )
      if (!dealRows[0]) return res.status(404).json({ error: 'Deal not found.' })

      
      if ((req.user.role === 'Sales Rep' || req.user.role === 'SDR') && dealRows[0].owner_id !== req.user.id)
        return res.status(403).json({ error: 'You can only log interactions on your own deals.' })

      const dealTitle = dealRows[0].title

      const { rows } = await pool.query(
        `INSERT INTO interactions (deal_id, logged_by, type, summary, next_step, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.params.id, req.user.id, type, summary, next_step || null, occurred_at || new Date()]
      )
      const snippet = summary.length > 80 ? summary.slice(0, 80) + '…' : summary
      await writeAudit(req.user.id, 'INTERACTION_LOGGED',
        `${type} logged on "${dealTitle}": "${snippet}"`,
        req.user.org_id, 'deal', req.params.id)
      res.status(201).json(rows[0])
    } catch (err) {
      next(err)
    }
  }
)

router.post('/', authenticate,
  authorize('Admin', 'Sales Manager', 'Sales Rep', 'SDR'),
  async (req, res, next) => {
    try {
      const { contact_id, title, description, expected_value, expected_close_date } = req.body
      const org_id = req.user.org_id
      if (!contact_id || !title)
        return res.status(400).json({ error: 'contact_id and title are required.' })

      
      if (expected_close_date && new Date(expected_close_date) < new Date(new Date().toDateString()))
        return res.status(400).json({ error: 'Expected close date cannot be in the past.' })

      
      const { rows: dupCheck } = await pool.query(
        `SELECT id FROM deals
         WHERE org_id = $1 AND contact_id = $2 AND LOWER(title) = LOWER($3)
           AND status NOT IN ('Won', 'Lost')
         LIMIT 1`,
        [org_id, contact_id, title]
      )
      if (dupCheck[0])
        return res.status(409).json({ code: 'DUPLICATE', error: `An active deal named "${title}" already exists for this contact.` })

      
      const { rows: firstStage } = await pool.query(
        `SELECT sc.id FROM stage_catalog sc
         JOIN org_active_stages oas ON oas.stage_id = sc.id
         WHERE oas.org_id = $1 AND sc.position = 1
         LIMIT 1`,
        [org_id]
      )
      if (!firstStage[0])
        return res.status(400).json({ error: 'No pipeline stages configured for this organisation.' })

      
      const client = await pool.connect()
      let newDeal
      try {
        await client.query('BEGIN')
        const { rows: counter } = await client.query(
          `INSERT INTO org_deal_counters (org_id, last_number) VALUES ($1, 1)
           ON CONFLICT (org_id) DO UPDATE SET last_number = org_deal_counters.last_number + 1
           RETURNING last_number`,
          [org_id]
        )
        const dealNumber = counter[0].last_number

        const { rows } = await client.query(
          `INSERT INTO deals (org_id, owner_id, contact_id, stage_id, title, description, expected_value, expected_close_date, deal_number)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [org_id, req.user.id, contact_id, firstStage[0].id, title,
           description || null, expected_value || null, expected_close_date || null, dealNumber]
        )
        
        await client.query(
          `INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by) VALUES ($1, NULL, $2, $3)`,
          [rows[0].id, firstStage[0].id, req.user.id]
        )
        await client.query('COMMIT')
        newDeal = rows[0]
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }

      await writeAudit(req.user.id, 'DEAL_CREATED', `Deal "${title}" created`, newDeal.org_id, 'deal', newDeal.id)
      res.status(201).json(newDeal)
    } catch (err) {
      next(err)
    }
  }
)

router.patch('/:id', authenticate,
  authorize('Admin', 'Sales Manager', 'Sales Rep', 'SDR'),
  async (req, res, next) => {
    try {
      
      const { rows: current } = await pool.query(
        `${DEAL_SELECT} WHERE d.id = $1 AND d.org_id = $2 AND d.deleted_at IS NULL`,
        [req.params.id, req.user.org_id]
      )
      if (!current[0]) return res.status(404).json({ error: 'Deal not found.' })
      const deal = current[0]

      
      if (req.body._updated_at) {
        const clientTs = new Date(req.body._updated_at).getTime()
        const serverTs = new Date(deal.updated_at).getTime()
        if (Math.abs(clientTs - serverTs) > 1000) {
          return res.status(409).json({
            code: 'CONFLICT',
            error: 'This deal was modified by another user while you were editing. Reload the page and try again.',
          })
        }
      }

      
      if ((req.user.role === 'Sales Rep' || req.user.role === 'SDR') && deal.owner_id !== req.user.id)
        return res.status(403).json({ error: 'You can only edit your own deals.' })

      const { stage_id, title, description, expected_value, probability, expected_close_date,
              status, final_value, contract_date, lost_reason } = req.body

      
      let owner_id = undefined
      if ((req.user.role === 'Admin' || req.user.role === 'Sales Manager') && req.body.owner_id) {
        const { rows: ownerCheck } = await pool.query(
          `SELECT id FROM employees WHERE id = $1 AND org_id = $2 AND is_active = true`,
          [req.body.owner_id, req.user.org_id]
        )
        if (!ownerCheck[0])
          return res.status(400).json({ error: 'New owner not found in your organisation.' })
        owner_id = req.body.owner_id
      }

      
      if (status === 'Lost' && !lost_reason?.trim())
        return res.status(400).json({ error: 'A lost reason is required when marking a deal as Lost.' })

      
      let resolvedStageId = stage_id
      let autoStatus      = status

      
      if (stage_id && stage_id !== deal.stage_id) {
        
        const { rows: activeStages } = await pool.query(
          `SELECT sc.id, sc.name, sc.position
           FROM stage_catalog sc
           JOIN org_active_stages oas ON oas.stage_id = sc.id
           WHERE oas.org_id = $1
           ORDER BY sc.position`,
          [req.user.org_id]
        )

        const currentIdx = activeStages.findIndex(s => s.id === deal.stage_id)
        const targetIdx  = activeStages.findIndex(s => s.id === stage_id)

        if (targetIdx === -1)
          return res.status(400).json({ error: 'Invalid stage.' })

        
        if (Math.abs(targetIdx - currentIdx) > 1)
          return res.status(400).json({
            error: `Stages must be moved one step at a time. Next: "${activeStages[currentIdx + 1]?.name ?? activeStages[currentIdx - 1]?.name}".`
          })

        
        if (req.user.role === 'SDR' && activeStages[targetIdx].position > 3)
          return res.status(403).json({ error: 'SDRs can only move deals up to the Qualified stage.' })

        
        if (targetIdx > currentIdx) {
          const { rows: activity } = await pool.query(
            `SELECT
               (SELECT COUNT(*) FROM interactions WHERE deal_id = $1) AS interactions,
               (SELECT COUNT(*) FROM tasks       WHERE deal_id = $1) AS tasks`,
            [req.params.id]
          )
          if (parseInt(activity[0].interactions) < 1)
            return res.status(400).json({ error: 'Log at least one interaction before advancing to the next stage.' })
          if (parseInt(activity[0].tasks) < 1)
            return res.status(400).json({ error: 'Create at least one task before advancing to the next stage.' })
        }

        
        if (activeStages[targetIdx].name === 'Won') {
          const effectiveFinalValue = final_value ?? deal.final_value
          if (!effectiveFinalValue)
            return res.status(400).json({ error: 'Set a final value before moving a deal to Won.' })
          autoStatus = 'Won'
        }

        
        const { rows: reqFields } = await pool.query(
          `SELECT field FROM stage_required_fields WHERE stage_id = $1`, [stage_id]
        )
        if (reqFields.length > 0) {
          const LABELS = {
            expected_value:      'Value',
            expected_close_date: 'Close Date',
            probability:         'Probability',
            description:         'Description',
          }
          const merged = {
            expected_value:      expected_value      ?? deal.expected_value,
            expected_close_date: expected_close_date ?? deal.expected_close_date,
            probability:         probability         ?? deal.probability,
            description:         description         ?? deal.description,
          }
          const missing = reqFields.map(r => r.field).filter(f => !merged[f])
          if (missing.length > 0)
            return res.status(400).json({
              error: `Required for this stage: ${missing.map(f => LABELS[f] ?? f).join(', ')}.`
            })
        }

        
        await pool.query(
          `INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by)
           VALUES ($1, $2, $3, $4)`,
          [req.params.id, deal.stage_id, stage_id, req.user.id]
        )

        const direction = targetIdx > currentIdx ? '→' : '←'
        await writeAudit(req.user.id, 'DEAL_STAGE_CHANGE',
          `Deal "${deal.title}" (DEAL-${deal.deal_number}) moved ${direction} ${deal.stage_name} → ${activeStages[targetIdx].name}`,
          deal.org_id, 'deal', req.params.id)
      }

      
      
      if (autoStatus === 'Won' && !stage_id) {
        
        const effectiveFinalValue = final_value ?? deal.final_value
        if (!effectiveFinalValue)
          return res.status(400).json({ error: 'Set a final value before marking a deal as Won.' })

        const { rows: wonStage } = await pool.query(
          `SELECT sc.id FROM stage_catalog sc
           JOIN org_active_stages oas ON oas.stage_id = sc.id
           WHERE oas.org_id = $1 AND sc.name = 'Won' LIMIT 1`,
          [req.user.org_id]
        )
        if (wonStage[0]) {
          resolvedStageId = wonStage[0].id

          
          const { rows: reqFields } = await pool.query(
            `SELECT field FROM stage_required_fields WHERE stage_id = $1`, [wonStage[0].id]
          )
          if (reqFields.length > 0) {
            const LABELS = {
              expected_value:      'Value',
              expected_close_date: 'Close Date',
              probability:         'Probability',
              description:         'Description',
            }
            const merged = {
              expected_value:      expected_value      ?? deal.expected_value,
              expected_close_date: expected_close_date ?? deal.expected_close_date,
              probability:         probability         ?? deal.probability,
              description:         description         ?? deal.description,
            }
            const missing = reqFields.map(r => r.field).filter(f => !merged[f])
            if (missing.length > 0)
              return res.status(400).json({
                error: `Required before marking Won: ${missing.map(f => LABELS[f] ?? f).join(', ')}.`
              })
          }
        }
      }

      const fmtVal = v => (v != null ? `$${Number(v).toLocaleString()}` : '—')

      if (autoStatus === 'Won')
        await writeAudit(req.user.id, 'DEAL_WON',
          `Deal "${deal.title}" (DEAL-${deal.deal_number}) won — final value: ${fmtVal(final_value ?? deal.final_value)}`,
          deal.org_id, 'deal', req.params.id)
      if (autoStatus === 'Lost')
        await writeAudit(req.user.id, 'DEAL_LOST',
          `Deal "${deal.title}" (DEAL-${deal.deal_number}) lost — reason: "${lost_reason}"`,
          deal.org_id, 'deal', req.params.id)

      const isStageChange  = stage_id && stage_id !== deal.stage_id
      const isStatusChange = autoStatus === 'Won' || autoStatus === 'Lost'
      if (!isStageChange && !isStatusChange) {
        const changes = []
        if (title             && title             !== deal.title)
          changes.push(`title: "${deal.title}" → "${title}"`)
        if (expected_value    != null && String(expected_value) !== String(deal.expected_value ?? ''))
          changes.push(`value: ${fmtVal(deal.expected_value)} → ${fmtVal(expected_value)}`)
        if (probability       != null && String(probability) !== String(deal.probability ?? ''))
          changes.push(`probability: ${deal.probability ?? '—'}% → ${probability}%`)
        if (expected_close_date && expected_close_date !== deal.expected_close_date)
          changes.push(`close date: ${deal.expected_close_date ?? '—'} → ${expected_close_date}`)
        if (description !== undefined && description !== deal.description)
          changes.push('description updated')
        if (changes.length > 0)
          await writeAudit(req.user.id, 'DEAL_UPDATED',
            `Deal "${deal.title}" (DEAL-${deal.deal_number}) updated — ${changes.join('; ')}`,
            deal.org_id, 'deal', req.params.id)
      }

      const { rows } = await pool.query(
        `UPDATE deals
         SET stage_id            = COALESCE($1,  stage_id),
             title               = COALESCE($2,  title),
             description         = COALESCE($3,  description),
             expected_value      = COALESCE($4,  expected_value),
             probability         = COALESCE($5,  probability),
             expected_close_date = COALESCE($6,  expected_close_date),
             status              = COALESCE($7,  status),
             final_value         = COALESCE($8,  final_value),
             contract_date       = COALESCE($9,  contract_date),
             lost_reason         = COALESCE($10, lost_reason),
             owner_id            = COALESCE($11, owner_id),
             updated_at          = NOW()
         WHERE id = $12 AND org_id = $13
         RETURNING *`,
        [resolvedStageId, title, description, expected_value, probability, expected_close_date,
         autoStatus, final_value, contract_date, lost_reason, owner_id, req.params.id, req.user.org_id]
      )

      
      if (expected_value != null && String(expected_value) !== String(deal.expected_value ?? '')) {
        await pool.query(
          `INSERT INTO deal_value_history (deal_id, changed_by, old_value, new_value)
           VALUES ($1, $2, $3, $4)`,
          [req.params.id, req.user.id, deal.expected_value, expected_value]
        )
      }

      res.json(rows[0])
    } catch (err) {
      next(err)
    }
  }
)

router.patch('/:id/assign', authenticate,
  authorize('Admin', 'Sales Manager', 'SDR'),
  async (req, res, next) => {
    try {
      const { owner_id } = req.body
      if (!owner_id)
        return res.status(400).json({ error: 'owner_id is required.' })

      
      const { rows: newOwner } = await pool.query(
        `SELECT id, name, role FROM employees WHERE id = $1 AND org_id = $2 AND is_active = true`,
        [owner_id, req.user.org_id]
      )
      if (!newOwner[0])
        return res.status(404).json({ error: 'Employee not found.' })
      if (newOwner[0].role !== 'Sales Rep')
        return res.status(400).json({ error: 'Can only assign deals to Sales Reps.' })

      
      const { rows: dealRows } = await pool.query(
        `SELECT d.*, sc.name AS stage_name, e.name AS owner_name FROM deals d
         JOIN stage_catalog sc ON sc.id = d.stage_id
         JOIN employees e ON e.id = d.owner_id
         WHERE d.id = $1 AND d.org_id = $2`,
        [req.params.id, req.user.org_id]
      )
      if (!dealRows[0]) return res.status(404).json({ error: 'Deal not found.' })

      
      if (req.user.role === 'SDR' && dealRows[0].stage_name !== 'Qualified')
        return res.status(403).json({ error: 'SDRs can only assign deals at the Qualified stage.' })

      const { rows } = await pool.query(
        `UPDATE deals SET owner_id = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3 RETURNING *`,
        [owner_id, req.params.id, req.user.org_id]
      )
      if (!rows[0]) return res.status(404).json({ error: 'Deal not found.' })

      await writeAudit(req.user.id, 'DEAL_ASSIGNED',
        `Deal "${dealRows[0].title}" (DEAL-${dealRows[0].deal_number}) reassigned from ${dealRows[0].owner_name} to ${newOwner[0].name}`,
        req.user.org_id, 'deal', req.params.id)

      res.json(rows[0])
    } catch (err) {
      next(err)
    }
  }
)

router.post('/:id/clone', authenticate,
  authorize('Admin', 'Sales Manager', 'Sales Rep', 'SDR'),
  async (req, res, next) => {
    try {
      const { rows: src } = await pool.query(
        `SELECT * FROM deals WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
        [req.params.id, req.user.org_id]
      )
      if (!src[0]) return res.status(404).json({ error: 'Deal not found.' })

      const { rows: firstStage } = await pool.query(
        `SELECT sc.id FROM stage_catalog sc
         JOIN org_active_stages oas ON oas.stage_id = sc.id
         WHERE oas.org_id = $1 AND sc.position = 1 LIMIT 1`,
        [req.user.org_id]
      )
      if (!firstStage[0]) return res.status(400).json({ error: 'No pipeline stages configured.' })

      const d = src[0]
      
      const cloneClient = await pool.connect()
      let clonedDeal
      try {
        await cloneClient.query('BEGIN')
        const { rows: counter } = await cloneClient.query(
          `INSERT INTO org_deal_counters (org_id, last_number) VALUES ($1, 1)
           ON CONFLICT (org_id) DO UPDATE SET last_number = org_deal_counters.last_number + 1
           RETURNING last_number`,
          [req.user.org_id]
        )
        const { rows } = await cloneClient.query(
          `INSERT INTO deals (org_id, owner_id, contact_id, stage_id, title, description, expected_value, probability, expected_close_date, deal_number)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [req.user.org_id, req.user.id, d.contact_id, firstStage[0].id,
           `${d.title} (copy)`, d.description, d.expected_value, d.probability, d.expected_close_date, counter[0].last_number]
        )
        await cloneClient.query(
          `INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, moved_by) VALUES ($1, NULL, $2, $3)`,
          [rows[0].id, firstStage[0].id, req.user.id]
        )
        await cloneClient.query('COMMIT')
        clonedDeal = rows[0]
      } catch (err) {
        await cloneClient.query('ROLLBACK')
        throw err
      } finally {
        cloneClient.release()
      }

      await writeAudit(req.user.id, 'DEAL_CLONED', `Deal "${d.title}" cloned`, req.user.org_id, 'deal', clonedDeal.id)
      res.status(201).json(clonedDeal)
    } catch (err) { next(err) }
  }
)

router.get('/:id/comments', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT dc.id, dc.body, dc.mentions, dc.created_at, dc.updated_at,
              e.id AS author_id, e.name AS author_name
       FROM deal_comments dc
       JOIN employees e ON e.id = dc.author_id
       JOIN deals d ON d.id = dc.deal_id
       WHERE dc.deal_id = $1 AND d.org_id = $2 AND d.deleted_at IS NULL
       ORDER BY dc.created_at ASC`,
      [req.params.id, req.user.org_id]
    )
    res.json(rows)
  } catch (err) { next(err) }
})

router.post('/:id/comments', authenticate,
  authorize('Admin', 'Sales Manager', 'Sales Rep', 'SDR'),
  async (req, res, next) => {
    try {
      const { body, mentions = [] } = req.body
      if (!body?.trim()) return res.status(400).json({ error: 'Comment body is required.' })

      
      const { rows: dealCheck } = await pool.query(
        `SELECT id FROM deals WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
        [req.params.id, req.user.org_id]
      )
      if (!dealCheck[0]) return res.status(404).json({ error: 'Deal not found.' })

      const { rows: ins } = await pool.query(
        `INSERT INTO deal_comments (deal_id, author_id, body, mentions)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [req.params.id, req.user.id, body.trim(), JSON.stringify(mentions)]
      )
      const { rows } = await pool.query(
        `SELECT dc.id, dc.body, dc.mentions, dc.created_at, dc.updated_at,
                e.id AS author_id, e.name AS author_name
         FROM deal_comments dc
         JOIN employees e ON e.id = dc.author_id
         WHERE dc.id = $1`,
        [ins[0].id]
      )
      res.status(201).json(rows[0])
    } catch (err) { next(err) }
  }
)

router.delete('/:id/comments/:cid', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT dc.author_id FROM deal_comments dc
       JOIN deals d ON d.id = dc.deal_id
       WHERE dc.id = $1 AND dc.deal_id = $2 AND d.org_id = $3 AND d.deleted_at IS NULL`,
      [req.params.cid, req.params.id, req.user.org_id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Comment not found.' })
    if (rows[0].author_id !== req.user.id && req.user.role !== 'Admin')
      return res.status(403).json({ error: 'You can only delete your own comments.' })

    await pool.query(`DELETE FROM deal_comments WHERE id = $1`, [req.params.cid])
    sendOk(res, 'Comment deleted.')
  } catch (err) { next(err) }
})

router.get('/:id/value-history', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT dvh.id, dvh.old_value, dvh.new_value, dvh.changed_at, e.name AS changed_by_name
       FROM deal_value_history dvh
       JOIN employees e ON e.id = dvh.changed_by
       JOIN deals d ON d.id = dvh.deal_id
       WHERE dvh.deal_id = $1 AND d.org_id = $2 AND d.deleted_at IS NULL
       ORDER BY dvh.changed_at ASC`,
      [req.params.id, req.user.org_id]
    )
    res.json(rows)
  } catch (err) { next(err) }
})

router.delete('/:id', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE deals SET deleted_at = NOW()
       WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
       RETURNING id, title`,
      [req.params.id, req.user.org_id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Deal not found.' })
    await writeAudit(req.user.id, 'DEAL_DELETED', `Deal "${rows[0].title}" deleted`, req.user.org_id, 'deal', rows[0].id)
    sendOk(res, 'Deal deleted.')
  } catch (err) {
    next(err)
  }
})

module.exports = router
