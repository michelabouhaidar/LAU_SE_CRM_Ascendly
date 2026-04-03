

const router = require('express').Router()
const pool   = require('../db/pool')
const { authenticate, authorize } = require('../middleware/auth')
const cache  = require('../utils/cache')

const DASHBOARD_TTL = 30_000  

const ALLOWED = ['Admin', 'Sales Manager', 'Finance']

router.get('/revenue', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const { date_from, date_to, owner_id } = req.query
    const params  = [req.user.org_id]
    const clauses = [`org_id = $1`, `status = 'Won'`, `deleted_at IS NULL`]

    if (date_from) { params.push(date_from); clauses.push(`contract_date >= $${params.length}`) }
    if (date_to)   { params.push(date_to);   clauses.push(`contract_date <= $${params.length}`) }
    if (owner_id)  { params.push(owner_id);  clauses.push(`owner_id = $${params.length}`) }

    const where = `WHERE ${clauses.join(' AND ')}`
    const { rows } = await pool.query(`
      SELECT COUNT(*)       AS total_won,
             SUM(final_value) AS total_revenue,
             AVG(final_value) AS avg_deal_value,
             MIN(final_value) AS min_deal_value,
             MAX(final_value) AS max_deal_value
      FROM deals ${where}
    `, params)
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

router.get('/pipeline', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const owner_id = req.query.owner_id || null
    const { rows } = await pool.query(`
      SELECT sc.name AS stage, sc.position,
             COUNT(d.id)           AS deal_count,
             SUM(d.expected_value) AS total_expected_value,
             AVG(d.probability)    AS avg_probability
      FROM stage_catalog sc
      JOIN org_active_stages oas ON oas.stage_id = sc.id AND oas.org_id = $1 AND oas.is_active = true
      LEFT JOIN deals d ON d.stage_id = sc.id AND d.status = 'Open' AND d.org_id = $1
                        AND d.deleted_at IS NULL
                        AND ($2::uuid IS NULL OR d.owner_id = $2::uuid)
      WHERE sc.is_terminal = false OR sc.position = 1
      GROUP BY sc.id, sc.name, sc.position
      ORDER BY sc.position
    `, [req.user.org_id, owner_id])
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

router.get('/leaderboard', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const { date_from, date_to, owner_id } = req.query
    const params  = []
    const clauses = []

    if (date_from) { params.push(date_from); clauses.push(`d.contract_date >= $${params.length}`) }
    if (date_to)   { params.push(date_to);   clauses.push(`d.contract_date <= $${params.length}`) }

    const dateFilter = clauses.length ? `AND ${clauses.join(' AND ')}` : ''

    const ownerParam = owner_id || null
    params.push(ownerParam)
    const ownerIdx = params.length

    params.push(req.user.org_id)
    const orgIdx = params.length

    const { rows } = await pool.query(`
      SELECT e.id, e.name,
             COUNT(d.id) FILTER (WHERE d.status = 'Won' ${dateFilter})  AS deals_won,
             SUM(d.final_value) FILTER (WHERE d.status = 'Won' ${dateFilter}) AS revenue_won,
             COUNT(d.id) FILTER (WHERE d.status = 'Open') AS deals_open
      FROM employees e
      LEFT JOIN deals d ON d.owner_id = e.id AND d.deleted_at IS NULL AND d.org_id = $${orgIdx}
      WHERE e.role IN ('Sales Rep', 'SDR')
        AND e.org_id = $${orgIdx}
        AND ($${ownerIdx}::uuid IS NULL OR e.id = $${ownerIdx}::uuid)
      GROUP BY e.id, e.name
      ORDER BY revenue_won DESC NULLS LAST
    `, params)
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

router.get('/monthly', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const params = [req.user.org_id]
    const clauses = ["org_id = $1", "status = 'Won'", "contract_date IS NOT NULL", "deleted_at IS NULL"]
    if (req.query.owner_id) { params.push(req.query.owner_id); clauses.push(`owner_id = $${params.length}`) }
    const { rows } = await pool.query(`
      SELECT TO_CHAR(contract_date, 'YYYY-MM') AS month,
             COUNT(*) AS deals_won, SUM(final_value) AS revenue
      FROM deals WHERE ${clauses.join(' AND ')}
      GROUP BY month ORDER BY month DESC LIMIT 24
    `, params)
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/forecast', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const { rows: emp } = await pool.query(
      'SELECT org_id FROM employees WHERE id = $1', [req.user.id]
    )
    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(expected_value * probability / 100.0), 0) AS weighted_forecast,
        COALESCE(SUM(expected_value), 0)                       AS total_pipeline,
        COUNT(*)                                               AS open_deals
      FROM deals
      WHERE org_id = $1 AND status = 'Open' AND deleted_at IS NULL
    `, [emp[0].org_id])
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

router.get('/conversion', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const { rows: emp } = await pool.query(
      'SELECT org_id FROM employees WHERE id = $1', [req.user.id]
    )
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'Won')                 AS won_count,
        COUNT(*) FILTER (WHERE status = 'Lost')                AS lost_count,
        COUNT(*) FILTER (WHERE status = 'Open')                AS open_count,
        COUNT(*)                                               AS total_count,
        ROUND(
          COUNT(*) FILTER (WHERE status = 'Won')::numeric /
          NULLIF(COUNT(*) FILTER (WHERE status IN ('Won','Lost')), 0) * 100, 1
        )                                                      AS win_rate_pct
      FROM deals WHERE org_id = $1 AND deleted_at IS NULL
    `, [emp[0].org_id])
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

router.get('/search', authenticate, async (req, res, next) => {
  try {
    const q = `%${(req.query.q || '').toLowerCase()}%`
    const { rows: emp } = await pool.query(
      'SELECT org_id FROM employees WHERE id = $1', [req.user.id]
    )
    const org_id = emp[0].org_id

    const [contacts, deals, tasks] = await Promise.all([
      pool.query(
        `SELECT id, full_name AS name, email, company, 'contact' AS type
         FROM contacts WHERE org_id = $1 AND deleted_at IS NULL
           AND (LOWER(full_name) LIKE $2 OR LOWER(email) LIKE $2 OR LOWER(company) LIKE $2)
         LIMIT 5`, [org_id, q]
      ),
      pool.query(
        `SELECT d.id, d.title AS name, d.status, sc.name AS stage, 'deal' AS type
         FROM deals d JOIN stage_catalog sc ON sc.id = d.stage_id
         WHERE d.org_id = $1 AND d.deleted_at IS NULL AND LOWER(d.title) LIKE $2 LIMIT 5`, [org_id, q]
      ),
      pool.query(
        `SELECT t.id, t.title AS name, t.status, t.due_date, 'task' AS type
         FROM tasks t
         WHERE t.deal_id IN (SELECT id FROM deals WHERE org_id = $1 AND deleted_at IS NULL)
           AND LOWER(t.title) LIKE $2
         LIMIT 5`, [org_id, q]
      ),
    ])

    res.json({
      contacts: contacts.rows,
      deals:    deals.rows,
      tasks:    tasks.rows,
    })
  } catch (err) {
    next(err)
  }
})

router.get('/win-loss-monthly', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const { rows: emp } = await pool.query(
      'SELECT org_id FROM employees WHERE id = $1', [req.user.id]
    )
    const { date_from, date_to, owner_id } = req.query
    const org_id = emp[0].org_id
    const owner_id_val = owner_id || null

    const params  = [org_id, owner_id_val]
    const clauses = []
    if (date_from) { params.push(date_from); clauses.push(`close_ts >= $${params.length}`) }
    if (date_to)   { params.push(date_to);   clauses.push(`close_ts <= $${params.length}`) }
    const having = clauses.length ? `HAVING ${clauses.join(' AND ')}` : ''

    const { rows } = await pool.query(`
      SELECT month, SUM(won)::int AS won, SUM(lost)::int AS lost
      FROM (
        SELECT
          TO_CHAR(contract_date::TIMESTAMPTZ, 'YYYY-MM') AS month,
          contract_date::TIMESTAMPTZ                     AS close_ts,
          1 AS won, 0 AS lost
        FROM deals WHERE status = 'Won' AND contract_date IS NOT NULL AND org_id = $1
          AND deleted_at IS NULL
          AND ($2::uuid IS NULL OR owner_id = $2::uuid)
        UNION ALL
        SELECT
          TO_CHAR(
            (SELECT MAX(moved_at) FROM deal_stage_history WHERE deal_id = deals.id),
            'YYYY-MM'
          ) AS month,
          (SELECT MAX(moved_at) FROM deal_stage_history WHERE deal_id = deals.id) AS close_ts,
          0 AS won, 1 AS lost
        FROM deals WHERE status = 'Lost' AND org_id = $1
          AND deleted_at IS NULL
          AND ($2::uuid IS NULL OR owner_id = $2::uuid)
      ) sub
      WHERE month IS NOT NULL
      GROUP BY month
      ${having}
      ORDER BY month DESC LIMIT 12
    `, params)
    res.json(rows.reverse())
  } catch (err) { next(err) }
})

router.get('/lead-source-revenue', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const { rows: emp } = await pool.query(
      'SELECT org_id FROM employees WHERE id = $1', [req.user.id]
    )
    const { date_from, date_to } = req.query
    const params  = [emp[0].org_id]
    const clauses = [`d.status = 'Won'`, `d.org_id = $1`, `d.deleted_at IS NULL`]
    if (date_from) { params.push(date_from); clauses.push(`d.contract_date >= $${params.length}`) }
    if (date_to)   { params.push(date_to);   clauses.push(`d.contract_date <= $${params.length}`) }

    const { rows } = await pool.query(`
      SELECT COALESCE(c.lead_source, 'Unknown') AS lead_source,
             COUNT(d.id)::int        AS deals_won,
             SUM(d.final_value)      AS revenue
      FROM deals d
      JOIN contacts c ON c.id = d.contact_id
      WHERE ${clauses.join(' AND ')}
      GROUP BY c.lead_source
      ORDER BY revenue DESC NULLS LAST
    `, params)
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/stage-velocity', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      WITH ranked AS (
        SELECT dsh.to_stage,
               dsh.moved_at,
               LEAD(dsh.moved_at) OVER (PARTITION BY dsh.deal_id ORDER BY dsh.moved_at) AS next_moved_at
        FROM deal_stage_history dsh
        JOIN deals d ON d.id = dsh.deal_id AND d.org_id = $1 AND d.deleted_at IS NULL
      )
      SELECT sc.name AS stage, sc.position,
             ROUND(AVG(
               EXTRACT(EPOCH FROM (next_moved_at - moved_at)) / 86400.0
             )::numeric, 1) AS avg_days
      FROM ranked r
      JOIN stage_catalog sc ON sc.id = r.to_stage
      WHERE r.next_moved_at IS NOT NULL
      GROUP BY sc.name, sc.position
      ORDER BY sc.position
    `, [req.user.org_id])
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/deal-cycle', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const owner_id = req.query.owner_id || null
    const { rows } = await pool.query(`
      SELECT
        ROUND(AVG(EXTRACT(EPOCH FROM (contract_date::TIMESTAMPTZ - created_at))/86400) FILTER (WHERE status='Won')::numeric,1) AS avg_won_days,
        ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE((SELECT MAX(moved_at) FROM deal_stage_history WHERE deal_id=d.id), created_at+INTERVAL'35 days') - created_at))/86400) FILTER (WHERE status='Lost')::numeric,1) AS avg_lost_days,
        COUNT(*) FILTER (WHERE status='Won') AS won_count,
        COUNT(*) FILTER (WHERE status='Lost') AS lost_count
      FROM deals d WHERE status IN ('Won','Lost') AND org_id=$1 AND deleted_at IS NULL
        AND ($2::uuid IS NULL OR owner_id = $2::uuid)
    `, [req.user.org_id, owner_id])
    res.json(rows[0])
  } catch (err) { next(err) }
})

router.get('/stage-conversion', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const owner_id = req.query.owner_id || null
    const { rows } = await pool.query(`
      WITH deal_moves AS (
        SELECT dsh.deal_id,
               dsh.to_stage,
               LEAD(dsh.moved_at) OVER (PARTITION BY dsh.deal_id ORDER BY dsh.moved_at) AS next_move
        FROM deal_stage_history dsh
        JOIN deals d ON d.id = dsh.deal_id AND d.org_id = $1 AND d.deleted_at IS NULL
          AND ($2::uuid IS NULL OR d.owner_id = $2::uuid)
      )
      SELECT sc.name AS stage, sc.position,
        COUNT(DISTINCT dm.deal_id) AS total_entered,
        COUNT(DISTINCT dm.deal_id) FILTER (WHERE dm.next_move IS NOT NULL) AS advanced,
        ROUND(
          COUNT(DISTINCT dm.deal_id) FILTER (WHERE dm.next_move IS NOT NULL)::numeric
          / NULLIF(COUNT(DISTINCT dm.deal_id), 0) * 100, 0
        ) AS conversion_pct
      FROM deal_moves dm
      JOIN stage_catalog sc ON sc.id = dm.to_stage AND sc.is_terminal = false
      GROUP BY sc.name, sc.position
      ORDER BY sc.position
    `, [req.user.org_id, owner_id])
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/rep-pipeline', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const stage = req.query.stage || null
    const { rows } = await pool.query(`
      SELECT e.id, e.name,
        COUNT(d.id) FILTER (WHERE d.status='Open' AND ($2::text IS NULL OR sc.name=$2))::int AS open_count,
        COALESCE(SUM(d.expected_value) FILTER (WHERE d.status='Open' AND ($2::text IS NULL OR sc.name=$2)),0) AS pipeline_value,
        COUNT(d.id) FILTER (WHERE d.status='Won')::int AS won_count,
        COALESCE(SUM(d.final_value) FILTER (WHERE d.status='Won'),0) AS revenue_won
      FROM employees e
      LEFT JOIN deals d ON d.owner_id=e.id AND d.deleted_at IS NULL
      LEFT JOIN stage_catalog sc ON sc.id=d.stage_id
      WHERE e.role IN ('Sales Rep','SDR') AND e.org_id=$1
      GROUP BY e.id,e.name ORDER BY pipeline_value DESC NULLS LAST
    `, [req.user.org_id, stage])
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/interaction-types', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const owner_id = req.query.owner_id || null
    const { rows } = await pool.query(`
      SELECT i.type, COUNT(*)::int AS count
      FROM interactions i JOIN deals d ON d.id=i.deal_id AND d.org_id=$1 AND d.deleted_at IS NULL
        AND ($2::uuid IS NULL OR d.owner_id = $2::uuid)
      GROUP BY i.type ORDER BY count DESC
    `, [req.user.org_id, owner_id])
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/approval-stats', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.status, COUNT(*)::int AS count, ROUND(AVG(a.discount_pct)::numeric,1) AS avg_discount
      FROM approvals a JOIN deals d ON d.id=a.deal_id AND d.org_id=$1 AND d.deleted_at IS NULL
      GROUP BY a.status ORDER BY CASE a.status WHEN 'Approved' THEN 1 WHEN 'Pending' THEN 2 ELSE 3 END
    `, [req.user.org_id])
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/deal-size-buckets', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        CASE WHEN final_value<20000 THEN '< $20K' WHEN final_value<50000 THEN '$20K–$50K'
             WHEN final_value<100000 THEN '$50K–$100K' WHEN final_value<200000 THEN '$100K–$200K'
             ELSE '> $200K' END AS bucket,
        COUNT(*)::int AS count,
        CASE WHEN final_value<20000 THEN 1 WHEN final_value<50000 THEN 2
             WHEN final_value<100000 THEN 3 WHEN final_value<200000 THEN 4 ELSE 5 END AS sort_order
      FROM deals WHERE status='Won' AND org_id=$1 AND deleted_at IS NULL
      GROUP BY bucket,sort_order ORDER BY sort_order
    `, [req.user.org_id])
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/monthly-created', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const owner_id = req.query.owner_id || null
    const { rows } = await pool.query(`
      SELECT TO_CHAR(created_at,'YYYY-MM') AS month, COUNT(*)::int AS created,
        COUNT(*) FILTER (WHERE status='Won')::int AS won
      FROM deals WHERE org_id=$1 AND deleted_at IS NULL
        AND ($2::uuid IS NULL OR owner_id = $2::uuid)
      GROUP BY month ORDER BY month DESC LIMIT 12
    `, [req.user.org_id, owner_id])
    res.json(rows.reverse())
  } catch (err) { next(err) }
})

router.get('/task-completion-by-rep', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const owner_id = req.query.owner_id || null
    const { rows } = await pool.query(`
      SELECT e.id, e.name, COUNT(t.id) FILTER (WHERE t.status='Done')::int AS done,
        COUNT(t.id) FILTER (WHERE t.status!='Done')::int AS open
      FROM employees e LEFT JOIN tasks t ON t.assigned_to=e.id
      WHERE e.role IN ('Sales Rep','SDR') AND e.org_id=$1
        AND ($2::uuid IS NULL OR e.id = $2::uuid)
      GROUP BY e.id,e.name ORDER BY done DESC
    `, [req.user.org_id, owner_id])
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/my-stats', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE status='Won') AS won, COUNT(*) FILTER (WHERE status='Lost') AS lost,
        COUNT(*) FILTER (WHERE status='Open') AS open,
        COALESCE(SUM(final_value) FILTER (WHERE status='Won'),0) AS revenue,
        ROUND(COUNT(*) FILTER (WHERE status='Won')::numeric / NULLIF(COUNT(*) FILTER (WHERE status IN ('Won','Lost')),0)*100,1) AS win_rate_pct,
        ROUND(AVG(EXTRACT(EPOCH FROM(contract_date::TIMESTAMPTZ-created_at))/86400) FILTER (WHERE status='Won')::numeric,1) AS avg_cycle_days
      FROM deals WHERE owner_id=$1 AND deleted_at IS NULL
    `, [req.user.id])
    res.json(rows[0])
  } catch (err) { next(err) }
})

router.get('/my-monthly', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT TO_CHAR(contract_date,'YYYY-MM') AS month, COUNT(*)::int AS won, SUM(final_value) AS revenue
      FROM deals WHERE owner_id=$1 AND status='Won' AND contract_date IS NOT NULL AND deleted_at IS NULL
      GROUP BY month ORDER BY month DESC LIMIT 6
    `, [req.user.id])
    res.json(rows.reverse())
  } catch (err) { next(err) }
})

router.get('/contact-growth', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month, COUNT(*) AS count
      FROM contacts
      WHERE org_id = $1 AND created_at >= NOW() - INTERVAL '12 months'
      GROUP BY 1 ORDER BY 1
    `, [req.user.org_id])
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/deal-age-buckets', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        CASE WHEN age_days < 7 THEN '<7 days'
             WHEN age_days < 30 THEN '7–30 days'
             WHEN age_days < 60 THEN '30–60 days'
             WHEN age_days < 90 THEN '60–90 days'
             ELSE '>90 days' END AS bucket,
        COUNT(*) AS count,
        CASE WHEN age_days < 7 THEN 1
             WHEN age_days < 30 THEN 2
             WHEN age_days < 60 THEN 3
             WHEN age_days < 90 THEN 4
             ELSE 5 END AS sort_order
      FROM (
        SELECT EXTRACT(EPOCH FROM (NOW() - created_at))/86400 AS age_days
        FROM deals WHERE org_id = $1 AND status = 'Open'
      ) t
      GROUP BY bucket, sort_order ORDER BY sort_order
    `, [req.user.org_id])
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/revenue-by-month-rep', authenticate, authorize(...ALLOWED), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT TO_CHAR(d.contract_date, 'YYYY-MM') AS month,
             e.name AS rep_name,
             SUM(d.final_value) AS revenue
      FROM deals d
      JOIN employees e ON e.id = d.owner_id
      WHERE d.org_id = $1 AND d.status = 'Won' AND d.contract_date IS NOT NULL AND d.deleted_at IS NULL
        AND d.contract_date >= NOW() - INTERVAL '6 months'
      GROUP BY 1, 2 ORDER BY 1, 2
    `, [req.user.org_id])
    res.json(rows)
  } catch (err) { next(err) }
})

router.get('/team-summary', authenticate, authorize('Admin', 'Sales Manager'), async (req, res, next) => {
  try {
    const org      = req.user.org_id
    const owner_id = req.query.owner_id || null
    const q_owner  = owner_id ? `AND d.owner_id = '${owner_id}'::uuid` : ''   
    
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (owner_id && !UUID_RE.test(owner_id))
      return res.status(400).json({ error: 'Invalid owner_id.' })

    const cacheKey = `team:${org}:${owner_id || 'all'}`
    const hit = cache.get(cacheKey)
    if (hit) return res.json(hit)

    const [
      revenue, openDeals, openTasks, contacts, conv,
      pipeline, monthly, leaderboard, cycle, stageConv,
      repPipeline, monthlyCreated, interactions, approvals, taskByRep, taskCount,
    ] = await Promise.all([

      
      pool.query(`SELECT COUNT(*)::int AS total_won, SUM(final_value) AS total_revenue,
                         AVG(final_value) AS avg_deal_value, MAX(final_value) AS max_deal_value
                  FROM deals WHERE status='Won' AND org_id=$1 AND deleted_at IS NULL`, [org]),

      
      pool.query(`SELECT d.id, d.deal_number, d.title, d.expected_value, d.stage_id,
                         sc.name AS stage_name, e.name AS owner_name, d.owner_id
                  FROM deals d
                  JOIN stage_catalog sc ON sc.id=d.stage_id
                  JOIN employees e ON e.id=d.owner_id
                  WHERE d.org_id=$1 AND d.status='Open' AND d.deleted_at IS NULL ${q_owner}
                  ORDER BY d.updated_at DESC LIMIT 8`, [org]),

      
      pool.query(`SELECT t.id, t.title, t.status, t.due_date, t.type, t.assigned_to,
                         e2.name AS assigned_to_name
                  FROM tasks t
                  JOIN employees e1 ON e1.id=t.created_by AND e1.org_id=$1
                  LEFT JOIN employees e2 ON e2.id=t.assigned_to
                  WHERE t.status != 'Done'
                  ORDER BY t.due_date ASC NULLS LAST LIMIT 8`, [org]),

      
      pool.query(`SELECT COUNT(*)::int AS count FROM contacts WHERE org_id=$1 AND deleted_at IS NULL`, [org]),

      
      pool.query(`SELECT ROUND(COUNT(*) FILTER (WHERE status='Won')::numeric /
                    NULLIF(COUNT(*) FILTER (WHERE status IN ('Won','Lost')),0)*100,1) AS win_rate_pct,
                    COUNT(*) FILTER (WHERE status='Won')::int AS won_count,
                    COUNT(*) FILTER (WHERE status='Lost')::int AS lost_count
                  FROM deals WHERE org_id=$1 AND deleted_at IS NULL`, [org]),

      
      pool.query(`SELECT sc.name AS stage, sc.position,
                    COUNT(d.id)::int AS deal_count,
                    COALESCE(SUM(d.expected_value),0) AS total_expected_value,
                    AVG(d.probability) AS avg_probability
                  FROM stage_catalog sc
                  JOIN org_active_stages oas ON oas.stage_id=sc.id AND oas.org_id=$1
                  LEFT JOIN deals d ON d.stage_id=sc.id AND d.status='Open' AND d.org_id=$1
                            AND d.deleted_at IS NULL ${q_owner}
                  WHERE sc.is_terminal=false OR sc.position=1
                  GROUP BY sc.id,sc.name,sc.position ORDER BY sc.position`, [org]),

      
      pool.query(`SELECT TO_CHAR(d.contract_date,'YYYY-MM') AS month, SUM(d.final_value) AS revenue
                  FROM deals d WHERE d.status='Won' AND d.org_id=$1 AND d.deleted_at IS NULL ${q_owner}
                    AND d.contract_date IS NOT NULL
                  GROUP BY month ORDER BY month DESC LIMIT 6`, [org]),

      
      pool.query(`SELECT e.id, e.name,
                    COUNT(d.id) FILTER (WHERE d.status='Won')::int AS won_count,
                    COALESCE(SUM(d.final_value) FILTER (WHERE d.status='Won'),0) AS revenue_won,
                    COUNT(d.id) FILTER (WHERE d.status='Open')::int AS open_count
                  FROM employees e
                  LEFT JOIN deals d ON d.owner_id=e.id AND d.org_id=$1 AND d.deleted_at IS NULL
                  WHERE e.role IN ('Sales Rep','SDR') AND e.org_id=$1
                  GROUP BY e.id,e.name ORDER BY revenue_won DESC LIMIT 5`, [org]),

      
      pool.query(`SELECT
                    ROUND(AVG(EXTRACT(EPOCH FROM(contract_date::TIMESTAMPTZ-created_at))/86400)
                      FILTER (WHERE status='Won')::numeric,1) AS avg_won_days,
                    ROUND(AVG(EXTRACT(EPOCH FROM(COALESCE(
                      (SELECT MAX(moved_at) FROM deal_stage_history WHERE deal_id=d.id),
                      created_at+INTERVAL'35 days')-created_at))/86400)
                      FILTER (WHERE status='Lost')::numeric,1) AS avg_lost_days
                  FROM deals d WHERE status IN ('Won','Lost') AND org_id=$1 AND deleted_at IS NULL ${q_owner}`, [org]),

      
      pool.query(`WITH dm AS (
                    SELECT dsh.deal_id, dsh.to_stage,
                           LEAD(dsh.moved_at) OVER (PARTITION BY dsh.deal_id ORDER BY dsh.moved_at) AS next_move
                    FROM deal_stage_history dsh
                    JOIN deals d ON d.id=dsh.deal_id AND d.org_id=$1 AND d.deleted_at IS NULL ${q_owner}
                  )
                  SELECT sc.name AS stage, sc.position,
                    COUNT(DISTINCT dm.deal_id) AS total_entered,
                    COUNT(DISTINCT dm.deal_id) FILTER (WHERE dm.next_move IS NOT NULL) AS advanced,
                    ROUND(COUNT(DISTINCT dm.deal_id) FILTER (WHERE dm.next_move IS NOT NULL)::numeric
                      / NULLIF(COUNT(DISTINCT dm.deal_id),0)*100,0) AS conversion_pct
                  FROM dm JOIN stage_catalog sc ON sc.id=dm.to_stage AND sc.is_terminal=false
                  GROUP BY sc.name,sc.position ORDER BY sc.position`, [org]),

      
      pool.query(`SELECT e.id, e.name,
                    COUNT(d.id) FILTER (WHERE d.status='Open')::int AS open_count,
                    COALESCE(SUM(d.expected_value) FILTER (WHERE d.status='Open'),0) AS pipeline_value,
                    COUNT(d.id) FILTER (WHERE d.status='Won')::int AS won_count,
                    COALESCE(SUM(d.final_value) FILTER (WHERE d.status='Won'),0) AS revenue_won
                  FROM employees e LEFT JOIN deals d ON d.owner_id=e.id AND d.deleted_at IS NULL
                  WHERE e.role IN ('Sales Rep','SDR') AND e.org_id=$1
                  GROUP BY e.id,e.name ORDER BY pipeline_value DESC`, [org]),

      
      pool.query(`SELECT TO_CHAR(d.created_at,'YYYY-MM') AS month,
                    COUNT(*)::int AS created,
                    COUNT(*) FILTER (WHERE d.status='Won')::int AS won
                  FROM deals d WHERE d.org_id=$1 AND d.deleted_at IS NULL ${q_owner}
                  GROUP BY month ORDER BY month DESC LIMIT 6`, [org]),

      
      pool.query(`SELECT i.type, COUNT(*)::int AS count
                  FROM interactions i
                  JOIN deals d ON d.id=i.deal_id AND d.org_id=$1 AND d.deleted_at IS NULL ${q_owner}
                  GROUP BY i.type ORDER BY count DESC`, [org]),

      
      pool.query(`SELECT a.status, COUNT(*)::int AS count,
                    ROUND(AVG(a.discount_pct)::numeric,1) AS avg_discount
                  FROM approvals a
                  JOIN deals d ON d.id=a.deal_id AND d.org_id=$1 AND d.deleted_at IS NULL
                  GROUP BY a.status ORDER BY CASE a.status WHEN 'Approved' THEN 1 WHEN 'Pending' THEN 2 ELSE 3 END`, [org]),

      
      pool.query(`SELECT e.id, e.name,
                    COUNT(t.id) FILTER (WHERE t.status='Done')::int AS done,
                    COUNT(t.id) FILTER (WHERE t.status!='Done')::int AS open
                  FROM employees e LEFT JOIN tasks t ON t.assigned_to=e.id
                  WHERE e.role IN ('Sales Rep','SDR') AND e.org_id=$1
                  GROUP BY e.id,e.name ORDER BY done DESC`, [org]),

      
      pool.query(`SELECT COUNT(*)::int AS count
                  FROM tasks t
                  JOIN employees e ON e.id=t.created_by AND e.org_id=$1
                  WHERE t.status != 'Done'`, [org]),
    ])

    
    const now = new Date()
    const overdueCount = openTasks.rows.filter(t =>
      t.due_date && new Date(t.due_date) < now
    ).length

    const openDealsCount = pipeline.rows.reduce((s, r) => s + parseInt(r.deal_count), 0)

    const payload = {
      revenue:        revenue.rows[0],
      openDeals:      openDeals.rows,
      openTasks:      openTasks.rows,
      overdueCount,
      openDealsCount,
      openTasksCount: taskCount.rows[0].count,
      contactsCount:  contacts.rows[0].count,
      conversion:     conv.rows[0],
      pipeline:       pipeline.rows,
      monthly:        monthly.rows.reverse(),
      leaderboard:    leaderboard.rows,
      cycle:          cycle.rows[0],
      stageConversion: stageConv.rows,
      repPipeline:    repPipeline.rows,
      monthlyCreated: monthlyCreated.rows.reverse(),
      interactions:   interactions.rows,
      approvals:      approvals.rows,
      taskByRep:      taskByRep.rows,
    }
    cache.set(cacheKey, payload, DASHBOARD_TTL)
    res.json(payload)
  } catch (err) { next(err) }
})

router.get('/personal-summary', authenticate, async (req, res, next) => {
  try {
    const uid = req.user.id
    const org = req.user.org_id

    const cacheKey = `personal:${uid}`
    const hit = cache.get(cacheKey)
    if (hit) return res.json(hit)

    const [myDeals, myTasks, contacts, myStats, myMonthly, myTaskCounts] = await Promise.all([

      
      pool.query(`SELECT d.id, d.deal_number, d.title, d.expected_value, d.owner_id,
                         sc.name AS stage_name
                  FROM deals d JOIN stage_catalog sc ON sc.id=d.stage_id
                  WHERE d.owner_id=$1 AND d.status='Open' AND d.deleted_at IS NULL
                  ORDER BY d.updated_at DESC`, [uid]),

      
      pool.query(`SELECT t.id, t.title, t.status, t.due_date, t.type,
                         e2.name AS assigned_to_name, t.assigned_to
                  FROM tasks t
                  JOIN employees e1 ON e1.id=t.created_by AND e1.org_id=$2
                  LEFT JOIN employees e2 ON e2.id=t.assigned_to
                  WHERE t.assigned_to=$1 AND t.status!='Done'
                  ORDER BY t.due_date ASC NULLS LAST`, [uid, org]),

      
      pool.query(`SELECT COUNT(*)::int AS count FROM contacts WHERE org_id=$1 AND deleted_at IS NULL`, [org]),

      
      pool.query(`SELECT COUNT(*) FILTER (WHERE status='Won')::int AS won,
                    COUNT(*) FILTER (WHERE status='Lost')::int AS lost,
                    COUNT(*) FILTER (WHERE status='Open')::int AS open,
                    COALESCE(SUM(final_value) FILTER (WHERE status='Won'),0) AS revenue,
                    ROUND(COUNT(*) FILTER (WHERE status='Won')::numeric /
                      NULLIF(COUNT(*) FILTER (WHERE status IN ('Won','Lost')),0)*100,1) AS win_rate_pct,
                    ROUND(AVG(EXTRACT(EPOCH FROM(contract_date::TIMESTAMPTZ-created_at))/86400)
                      FILTER (WHERE status='Won')::numeric,1) AS avg_cycle_days
                  FROM deals WHERE owner_id=$1 AND deleted_at IS NULL`, [uid]),

      
      pool.query(`SELECT TO_CHAR(contract_date,'YYYY-MM') AS month, COUNT(*)::int AS won, SUM(final_value) AS revenue
                  FROM deals WHERE owner_id=$1 AND status='Won' AND contract_date IS NOT NULL AND deleted_at IS NULL
                  GROUP BY month ORDER BY month DESC LIMIT 6`, [uid]),

      
      pool.query(`SELECT
                    COUNT(*) FILTER (WHERE status!='Done')::int AS open_count,
                    COUNT(*) FILTER (WHERE status='Done')::int AS done_count
                  FROM tasks WHERE assigned_to=$1`, [uid]),
    ])

    const now = new Date()
    const overdueCount = myTasks.rows.filter(t =>
      t.due_date && new Date(t.due_date) < now
    ).length

    const payload = {
      myDeals:        myDeals.rows,
      myTasks:        myTasks.rows.slice(0, 8),
      overdueCount,
      openTasksCount: myTaskCounts.rows[0].open_count,
      doneTasksCount: myTaskCounts.rows[0].done_count,
      contactsCount:  contacts.rows[0].count,
      myStats:       myStats.rows[0],
      myMonthly:     myMonthly.rows.reverse(),
    }
    cache.set(cacheKey, payload, DASHBOARD_TTL)
    res.json(payload)
  } catch (err) { next(err) }
})

module.exports = router
