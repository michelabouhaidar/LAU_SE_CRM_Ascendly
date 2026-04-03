import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

const STAGE_COLOR = {
  New: '#74ba89', Contacted: '#3B82F6', Qualified: '#8B5CF6',
  Proposal: '#F59E0B', Negotiation: '#62c0d5', Won: '#22C55E', Lost: '#ef4444',
}
const TASK_STATUS_COLOR = { Open: '#62c0d5', 'In Progress': '#F59E0B', Done: '#22C55E' }
const REP_COLORS = ['#62c0d5', '#8B5CF6', '#F59E0B', '#F97316', '#3B82F6']
const INTERACTION_COLOR = { Meeting: '#8B5CF6', Email: '#3B82F6', Call: '#22C55E' }

function fmt(n) {
  if (!n && n !== 0) return '—'
  const num = parseFloat(n)
  return num >= 1_000_000 ? `$${parseFloat((num / 1_000_000).toFixed(2))}M`
    : num >= 1_000 ? `$${parseFloat((num / 1_000).toFixed(2))}K`
    : `$${parseFloat(num.toFixed(2))}`
}

function initials(name) {
  if (!name) return '??'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function VBars({ data, chartH = 130, filter, onSelect, formatVal }) {
  const max = Math.max(...data.map(d => parseFloat(d.value) || 0), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
      {data.map(d => {
        const barH  = Math.max((parseFloat(d.value) / max) * chartH, 3)
        const isLit = !filter || filter.value === d.key
        return (
          <div key={d.key} onClick={() => onSelect?.(isLit && filter ? null : { value: d.key, label: d.label })}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              cursor: onSelect ? 'pointer' : 'default', opacity: isLit ? 1 : 0.28, transition: 'opacity 0.2s' }}>
            {}
            <div style={{ height: chartH, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'flex-end', width: '100%' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-2)', marginBottom: 3, lineHeight: 1 }}>
                {formatVal ? formatVal(d.value) : d.value}
              </div>
              <div style={{ width: '70%', height: barH, background: d.color ?? 'var(--green)',
                borderRadius: '3px 3px 0 0', flexShrink: 0, transition: 'height 0.4s ease' }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 5, textAlign: 'center',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
              {d.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function GroupedVBars({ data, chartH = 120, colorA = '#74ba89', colorB = '#ef4444', filter, onSelect, fmtA, fmtB }) {
  const max = Math.max(...data.flatMap(d => [parseFloat(d.a) || 0, parseFloat(d.b) || 0]), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
      {data.map(d => {
        const aH    = Math.max((parseFloat(d.a) / max) * chartH, 3)
        const bH    = Math.max((parseFloat(d.b) / max) * chartH, 3)
        const isLit = !filter || filter.value === d.key
        return (
          <div key={d.key} onClick={() => onSelect?.(isLit && filter ? null : { value: d.key, label: d.label })}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              cursor: onSelect ? 'pointer' : 'default', opacity: isLit ? 1 : 0.28, transition: 'opacity 0.2s' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: chartH }}>
              {}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'flex-end', height: chartH, flex: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-2)', marginBottom: 2 }}>
                  {fmtA ? fmtA(d.a) : d.a}
                </div>
                <div style={{ width: '100%', height: aH, background: colorA,
                  borderRadius: '2px 2px 0 0', flexShrink: 0, transition: 'height 0.4s ease' }} />
              </div>
              {}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'flex-end', height: chartH, flex: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-2)', marginBottom: 2 }}>
                  {fmtB ? fmtB(d.b) : d.b}
                </div>
                <div style={{ width: '100%', height: bH, background: colorB,
                  borderRadius: '2px 2px 0 0', flexShrink: 0, transition: 'height 0.4s ease' }} />
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 5 }}>{d.label}</div>
          </div>
        )
      })}
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const isPersonal = ['Sales Rep', 'SDR'].includes(user?.role)
  const isFinance  = user?.role === 'Finance'
  if (isFinance) return <FinanceDashboard />
  return isPersonal
    ? <PersonalDashboard user={user} navigate={navigate} />
    : <TeamDashboard user={user} navigate={navigate} />
}

function TeamDashboard({ user, navigate }) {
  const [stats,         setStats]         = useState(null)
  const [deals,         setDeals]         = useState([])
  const [tasks,         setTasks]         = useState([])
  const [pipeline,      setPipeline]      = useState([])
  const [monthly,       setMonthly]       = useState([])
  const [topReps,       setTopReps]       = useState([])
  const [cycle,         setCycle]         = useState(null)
  const [conversion,    setConversion]    = useState([])
  const [repPipeline,   setRepPipeline]   = useState([])
  const [monthlyCreated,setMonthlyCreated]= useState([])
  const [interactions,  setInteractions]  = useState([])
  const [approvals,     setApprovals]     = useState([])
  const [taskByRep,     setTaskByRep]     = useState([])
  const [loading,       setLoading]       = useState(true)
  const [selectedRep,   setSelectedRep]   = useState(null) 
  const [apiError,      setApiError]      = useState(false)

  function selectRep(rep) {
    setSelectedRep(prev => prev?.id === rep.id ? null : rep)
  }

  const fetchData = useCallback((repId = null) => {
    setLoading(true)
    setApiError(false)
    const q = repId ? `?owner_id=${repId}` : ''
    api.get(`/reports/team-summary${q}`)
      .then(({ data }) => {
        setStats({
          revenue:   data.revenue.total_revenue ?? 0,
          won:       Number(data.revenue.total_won ?? 0),
          openDeals: data.openDealsCount,
          tasks:     data.openTasksCount,
          contacts:  data.contactsCount,
          winRate:   data.conversion.win_rate_pct,
          lost:      Number(data.conversion.lost_count ?? 0),
          avgDeal:   data.revenue.avg_deal_value ?? 0,
        })
        setDeals(data.openDeals.slice(0, 5))
        setTasks(data.openTasks.slice(0, 5))
        setPipeline(data.pipeline.filter(s => parseInt(s.deal_count) > 0))
        setMonthly(data.monthly)
        setTopReps(data.leaderboard.slice(0, 3))
        setCycle(data.cycle)
        setConversion(data.stageConversion)
        setRepPipeline(data.repPipeline)
        setMonthlyCreated(data.monthlyCreated)
        setInteractions(data.interactions)
        setApprovals(data.approvals)
        setTaskByRep(data.taskByRep)
      })
      .catch(() => setApiError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchData(selectedRep?.id ?? null) }, [selectedRep, fetchData])

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const totalPipeline = pipeline.reduce((s, p) => s + parseFloat(p.total_expected_value ?? 0), 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{greeting}, {user?.name?.split(' ')[0]}</div>
          <div className="page-subtitle">Team-wide overview · {user?.role}</div>
        </div>
        {selectedRep ? (
          <div className="flex items-center gap-8">
            <div style={{ fontSize: 12, color: 'var(--green-text)', fontWeight: 500, padding: '4px 10px',
              background: 'rgba(116,186,137,0.12)', border: '1px solid rgba(116,186,137,0.3)', borderRadius: 'var(--rounded-md)',
              cursor: 'pointer', transition: 'opacity 0.3s ease' }}
              onClick={() => setSelectedRep(null)}>
              Rep: {selectedRep.name} ×
            </div>
            <DateChip />
          </div>
        ) : <DateChip />}
      </div>

      {apiError && (
        <div style={{
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 8, padding: '10px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          fontSize: 13, color: 'var(--red)',
        }}>
          <span>⚠ Some dashboard data failed to load.</span>
          <button
            onClick={() => { setApiError(false); fetchData(selectedRep?.id ?? null) }}
            style={{ background: 'none', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 5,
              padding: '3px 10px', fontSize: 12, color: 'var(--red)', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}

      {}
      <div className="stats-grid">
        <StatCard label="Revenue Won"    value={fmt(stats?.revenue)}     sub={`from ${stats?.won ?? 0} deals won`}                                    loading={loading} />
        <StatCard label="Avg Deal Value" value={fmt(stats?.avgDeal)}     sub="per won deal"                                                           loading={loading} />
        <StatCard label="Open Deals"     value={stats?.openDeals ?? '—'} sub="deals across the team"                                                  loading={loading} />
        <StatCard label="Win Rate"
          value={stats?.winRate != null ? `${stats.winRate}%` : '—'}
          sub={`${stats?.won ?? 0} won of ${(stats?.won ?? 0) + (stats?.lost ?? 0)} closed`}
          loading={loading}
        />
      </div>

      <div style={{
        opacity: loading ? 0.18 : 1,
        filter: loading ? 'blur(1.5px)' : 'none',
        transform: loading ? 'translateY(6px)' : 'translateY(0)',
        transition: 'opacity 0.35s ease, filter 0.35s ease, transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }}>

      {}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Pipeline Overview</div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 14, marginBottom: 14 }}>
        <PipelineFunnelCard pipeline={pipeline} loading={loading} />
        <MonthlyWinsCard monthly={monthly} loading={loading} />
      </div>

      {}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Top Performers</div>
      <div style={{ marginBottom: 14 }}>
        <MiniLeaderboard reps={topReps} loading={loading} selectedRep={selectedRep} onSelectRep={selectRep} />
      </div>

      </div>{}

      <DualCardGrid
        deals={selectedRep ? deals.filter(d => d.owner_id === selectedRep.id) : deals}
        tasks={selectedRep ? tasks.filter(t => t.assigned_to === selectedRep.id) : tasks}
        loading={loading}
        navigate={navigate}
        emptyDealsLabel={selectedRep ? `No open deals for ${selectedRep.name}` : 'No open deals'}
        emptyTasksLabel={selectedRep ? `No open tasks for ${selectedRep.name}` : 'No open tasks'}
      />
    </div>
  )
}

function PersonalDashboard({ user, navigate }) {
  const [stats,      setStats]      = useState(null)
  const [myStats,    setMyStats]    = useState(null)
  const [myMonthly,  setMyMonthly]  = useState([])
  const [deals,      setDeals]      = useState([])
  const [allDeals,   setAllDeals]   = useState([])
  const [tasks,      setTasks]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [apiError,   setApiError]   = useState(false)

  useEffect(() => {
    setApiError(false)
    api.get('/reports/personal-summary')
      .then(({ data }) => {
        const pipelineValue = data.myDeals.reduce((s, d) => s + parseFloat(d.expected_value ?? 0), 0)
        setStats({
          myDeals:      data.myDeals.length,
          pipelineValue,
          openTasks:    data.openTasksCount,
          doneTasks:    data.doneTasksCount,
          overdueTasks: data.overdueCount,
          contacts:     data.contactsCount,
        })
        setMyStats(data.myStats)
        setMyMonthly(data.myMonthly)
        setAllDeals(data.myDeals)
        setDeals(data.myDeals.slice(0, 5))
        setTasks(data.myTasks)
      })
      .catch(() => setApiError(true))
      .finally(() => setLoading(false))
  }, [user.id])

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{greeting}, {user?.name?.split(' ')[0]}</div>
          <div className="page-subtitle">Your personal pipeline · {user?.role}</div>
        </div>
        <DateChip />
      </div>

      {apiError && (
        <div style={{
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 8, padding: '10px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          fontSize: 13, color: 'var(--red)',
        }}>
          <span>⚠ Some dashboard data failed to load.</span>
          <button
            onClick={() => { setApiError(false); window.location.reload() }}
            style={{ background: 'none', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 5,
              padding: '3px 10px', fontSize: 12, color: 'var(--red)', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}

      {}
      <div className="stats-grid">
        <StatCard label="My Open Deals"  value={stats?.myDeals ?? '—'}     sub="in your pipeline"           loading={loading} />
        <StatCard label="Pipeline Value" value={fmt(stats?.pipelineValue)} sub="expected across open deals" loading={loading} />
        <StatCard label="Open Tasks"     value={stats?.openTasks ?? '—'}   sub="assigned to you"            loading={loading} />
        <StatCard
          label="Overdue Tasks"
          value={stats?.overdueTasks ?? '—'}
          sub={stats?.overdueTasks > 0 ? 'need immediate attention' : 'all on track'}
          alert={stats?.overdueTasks > 0}
          loading={loading}
        />
      </div>

      {}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>My Performance</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <MyWinRateCard myStats={myStats} loading={loading} />
        <MyPipelineCard deals={allDeals} loading={loading} />
      </div>

      {}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Activity</div>
      <div className="grid-2" style={{ marginBottom: 14 }}>
        <MyMonthlyCard myMonthly={myMonthly} loading={loading} />
        <TaskRingCard stats={stats} loading={loading} />
      </div>

      {}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Quick Metrics</div>
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <DealCyclePersonalCard myStats={myStats} loading={loading} />
        <MyRevenueCard myStats={myStats} loading={loading} />
        <MyActivitySummaryCard stats={stats} myStats={myStats} loading={loading} />
      </div>

      <DualCardGrid
        deals={deals}
        tasks={tasks}
        loading={loading}
        navigate={navigate}
        emptyDealsLabel="No open deals assigned to you"
        emptyTasksLabel="No open tasks assigned to you"
      />
    </div>
  )
}

function FinanceDashboard() {
  const { user }  = useAuth()
  const navigate   = useNavigate()
  const [revenue,       setRevenue]       = useState(null)
  const [pipeline,      setPipeline]      = useState([])
  const [forecast,      setForecast]      = useState(null)
  const [monthly,       setMonthly]       = useState([])
  const [repPipeline,   setRepPipeline]   = useState([])
  const [sizeBuckets,   setSizeBuckets]   = useState([])
  const [monthlyCreated,setMonthlyCreated]= useState([])
  const [leadSources,   setLeadSources]   = useState([])
  const [cycle,         setCycle]         = useState(null)
  const [approvals,     setApprovals]     = useState([])
  const [loading,       setLoading]       = useState(true)
  const [selectedRep,   setSelectedRep]   = useState(null) 
  const [apiError,      setApiError]      = useState(false)

  function selectRep(rep) {
    setSelectedRep(prev => prev?.id === rep.id ? null : rep)
  }

  const fetchData = useCallback((repId = null) => {
    setLoading(true)
    setApiError(false)
    let failed = false
    const q = repId ? `?owner_id=${repId}` : ''

    Promise.all([
      api.get('/reports/revenue').catch(() => { failed = true; return { data: {} } }),
      api.get(`/reports/pipeline${q}`).catch(() => { failed = true; return { data: [] } }),
      api.get('/reports/forecast').catch(() => { failed = true; return { data: {} } }),
      api.get(`/reports/monthly${q}`).catch(() => { failed = true; return { data: [] } }),
      api.get('/reports/rep-pipeline').catch(() => { failed = true; return { data: [] } }),
      api.get('/reports/deal-size-buckets').catch(() => { failed = true; return { data: [] } }),
      api.get(`/reports/monthly-created${q}`).catch(() => { failed = true; return { data: [] } }),
      api.get('/reports/lead-source-revenue').catch(() => { failed = true; return { data: [] } }),
      api.get(`/reports/deal-cycle${q}`).catch(() => { failed = true; return { data: {} } }),
      api.get('/reports/approval-stats').catch(() => { failed = true; return { data: [] } }),
    ]).then(([r, p, f, m, rp, sb, mc, ls, cy, ap]) => {
      if (failed) setApiError(true)
      setRevenue(r.data)
      setPipeline(p.data)
      setForecast(f.data)
      setMonthly(m.data.slice(0, 6).reverse())
      setRepPipeline(rp.data)
      setSizeBuckets(sb.data)
      setMonthlyCreated(mc.data.slice(-6))
      setLeadSources(ls.data)
      setCycle(cy.data)
      setApprovals(ap.data)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchData(selectedRep?.id ?? null) }, [selectedRep, fetchData])

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{greeting}, {user?.name?.split(' ')[0]}</div>
          <div className="page-subtitle">Revenue overview · Finance</div>
        </div>
        <div className="flex items-center gap-8">
          {selectedRep && (
            <div style={{ fontSize: 12, color: 'var(--green-text)', fontWeight: 500, padding: '4px 10px',
              background: 'rgba(116,186,137,0.12)', border: '1px solid rgba(116,186,137,0.3)', borderRadius: 'var(--rounded-md)',
              cursor: 'pointer', transition: 'opacity 0.3s ease' }}
              onClick={() => setSelectedRep(null)}>
              Rep: {selectedRep.name} ×
            </div>
          )}
          <DateChip />
          <button className="btn btn-ghost-green" onClick={() => navigate('/reports')}>Full Reports →</button>
        </div>
      </div>

      {apiError && (
        <div style={{
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 8, padding: '10px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          fontSize: 13, color: 'var(--red)',
        }}>
          <span>⚠ Some dashboard data failed to load.</span>
          <button
            onClick={() => { setApiError(false); fetchData(selectedRep?.id ?? null) }}
            style={{ background: 'none', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 5,
              padding: '3px 10px', fontSize: 12, color: 'var(--red)', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}

      {}
      <div className="stats-grid">
        <StatCard label="Total Revenue"     value={fmt(revenue?.total_revenue)}      sub={`from ${revenue?.total_won ?? 0} won deals`}      loading={loading} />
        <StatCard label="Avg Deal Value"    value={fmt(revenue?.avg_deal_value)}     sub="per won deal"                                     loading={loading} />
        <StatCard label="Largest Deal"      value={fmt(revenue?.max_deal_value)}     sub="single deal"                                      loading={loading} />
        <StatCard label="Weighted Forecast" value={fmt(forecast?.weighted_forecast)} sub={`across ${forecast?.open_deals ?? 0} open deals`} loading={loading} />
      </div>

      {}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Revenue</div>
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14, marginBottom: 14 }}>
        <MonthlyRevenueCard monthly={monthly} loading={loading} />
        <DealCycleCard cycle={cycle} loading={loading} />
      </div>

      {}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Pipeline & Distribution</div>
      <div className="grid-2" style={{ marginBottom: 14 }}>
        <PipelineByStageCard pipeline={pipeline} loading={loading} />
        <DealSizeCard sizeBuckets={sizeBuckets} loading={loading} />
      </div>

      {}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Rep & Source Breakdown</div>
      <div className="grid-2" style={{ marginBottom: 14 }}>
        <RepPipelineCard repPipeline={repPipeline} loading={loading} selectedRep={selectedRep} onSelectRep={selectRep} />
        <LeadSourceCard leadSources={leadSources} loading={loading} />
      </div>

      {}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Monthly Trends</div>
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <MonthlyCreatedCard monthlyCreated={monthlyCreated} loading={loading} />
        <ApprovalStatsCard approvals={approvals} loading={loading} />
      </div>
    </div>
  )
}

function DonutRing({ value, total, color = '#22C55E', size = 100, thickness = 11 }) {
  const R   = (size - thickness) / 2
  const C   = 2 * Math.PI * R
  const pct = total > 0 ? Math.min(value / total, 1) : 0
  const cx  = size / 2
  const cy  = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--border)" strokeWidth={thickness} />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={color} strokeWidth={thickness}
        strokeDasharray={`${pct * C} ${C}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
    </svg>
  )
}

function WinRateCard({ stats, loading }) {
  const won    = stats?.won ?? 0
  const lost   = stats?.lost ?? 0
  const closed = won + lost
  return (
    <div className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {loading
          ? <div className="skeleton" style={{ width: 100, height: 100, borderRadius: '50%' }} />
          : (
            <>
              <DonutRing value={won} total={closed} size={100} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span className="mono" style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>
                  {closed > 0 ? `${Math.round((won / closed) * 100)}%` : '—'}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>win rate</span>
              </div>
            </>
          )
        }
      </div>
      <div>
        <div className="card-title" style={{ marginBottom: 10 }}>Win Rate</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 13 }}><span className="mono font-bold" style={{ color: '#22C55E' }}>{won}</span> <span style={{ color: 'var(--text-3)' }}>won</span></div>
          <div style={{ fontSize: 13 }}><span className="mono font-bold" style={{ color: '#ef4444' }}>{lost}</span> <span style={{ color: 'var(--text-3)' }}>lost</span></div>
          <div style={{ fontSize: 13 }}><span className="mono" style={{ color: 'var(--text-2)' }}>{closed}</span> <span style={{ color: 'var(--text-3)' }}>total closed</span></div>
        </div>
      </div>
    </div>
  )
}

function PipelineFunnelCard({ pipeline, loading }) {
  const maxVal = Math.max(...pipeline.map(s => parseFloat(s.total_expected_value ?? 0)), 1)
  return (
    <div className="card card-pad">
      <div className="card-title" style={{ marginBottom: 14 }}>Pipeline Health</div>
      {loading ? <Skeleton rows={5} /> : pipeline.length === 0 ? <EmptyMini label="No open deals" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pipeline.map(s => {
            const pct = (parseFloat(s.total_expected_value ?? 0) / maxVal) * 100
            return (
              <div key={s.stage}>
                <div className="flex items-center justify-between mb-8" style={{ fontSize: 12 }}>
                  <div className="flex items-center gap-8">
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: STAGE_COLOR[s.stage] ?? '#74ba89', flexShrink: 0 }} />
                    <span className="font-semi">{s.stage}</span>
                    <span style={{ color: 'var(--text-3)', fontSize: 11 }}>({s.deal_count})</span>
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmt(s.total_expected_value)}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%`, background: STAGE_COLOR[s.stage] ?? 'var(--green)' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StageConversionCard({ conversion, loading }) {
  return (
    <div className="card card-pad">
      <div className="card-title" style={{ marginBottom: 14 }}>Stage Conversion</div>
      {loading ? <Skeleton rows={5} /> : conversion.length === 0 ? <EmptyMini label="No data yet" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {conversion.map(s => {
            const pct      = parseFloat(s.conversion_pct ?? 0)
            const barColor = pct >= 80 ? '#22C55E' : pct >= 60 ? '#F59E0B' : '#ef4444'
            return (
              <div key={s.stage}>
                <div className="flex items-center justify-between mb-8" style={{ fontSize: 12 }}>
                  <span className="font-semi">{s.stage}</span>
                  <div className="flex items-center gap-8">
                    <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{s.total_entered} entered</span>
                    <span className="mono font-bold" style={{ fontSize: 12, color: barColor }}>{pct}%</span>
                  </div>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%`, background: barColor }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DealCycleCard({ cycle, loading }) {
  return (
    <div className="card card-pad">
      <div className="card-title" style={{ marginBottom: 16 }}>Deal Cycle Time</div>
      {loading ? <Skeleton rows={3} /> : !cycle ? <EmptyMini label="No data yet" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ textAlign: 'center', padding: '16px 8px', background: 'rgba(34,197,94,0.07)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.15)' }}>
            <div className="mono" style={{ fontSize: 32, fontWeight: 800, color: '#22C55E', lineHeight: 1 }}>
              {cycle.avg_won_days ?? '—'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>avg days</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#22C55E', marginTop: 6 }}>Won</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{cycle.won_count} deals</div>
          </div>
          <div style={{ textAlign: 'center', padding: '16px 8px', background: 'rgba(239,68,68,0.07)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)' }}>
            <div className="mono" style={{ fontSize: 32, fontWeight: 800, color: '#ef4444', lineHeight: 1 }}>
              {cycle.avg_lost_days ?? '—'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>avg days</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', marginTop: 6 }}>Lost</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{cycle.lost_count} deals</div>
          </div>
        </div>
      )}
    </div>
  )
}

function RepPipelineCard({ repPipeline, loading, selectedRep, onSelectRep }) {
  const maxVal = Math.max(...repPipeline.map(r => parseFloat(r.pipeline_value ?? 0)), 1)
  return (
    <div className="card card-pad">
      <div className="card-title" style={{ marginBottom: 14 }}>Rep Pipeline</div>
      {loading ? <Skeleton rows={4} /> : repPipeline.length === 0 ? <EmptyMini label="No data yet" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {repPipeline.map((r, i) => {
            const pct   = (parseFloat(r.pipeline_value ?? 0) / maxVal) * 100
            const color = REP_COLORS[i % REP_COLORS.length]
            const isLit = !selectedRep || selectedRep.id === r.id
            return (
              <div key={r.id}
                style={{ opacity: isLit ? 1 : 0.22, filter: isLit ? 'none' : 'blur(0.5px)',
                  transition: 'opacity 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), filter 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)', cursor: 'pointer' }}
                onClick={() => onSelectRep?.({ id: r.id, name: r.name })}>
                <div className="flex items-center justify-between mb-8" style={{ fontSize: 12 }}>
                  <div className="flex items-center gap-8">
                    <div className="avatar" style={{ background: color, fontSize: 10, width: 22, height: 22, minWidth: 22 }}>
                      {initials(r.name)}
                    </div>
                    <span className="font-semi">{r.name}</span>
                    <span style={{ color: 'var(--text-3)', fontSize: 11 }}>({r.open_count} open)</span>
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmt(r.pipeline_value)}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MonthlyCreatedCard({ monthlyCreated, loading }) {
  return (
    <div className="card card-pad">
      <div className="flex items-center justify-between mb-16">
        <span className="card-title">Deals Created vs Won</span>
        <div className="flex items-center gap-12" style={{ fontSize: 10, color: 'var(--text-3)' }}>
          <div className="flex items-center gap-6"><div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--border)' }} />Created</div>
          <div className="flex items-center gap-6"><div style={{ width: 8, height: 8, borderRadius: 2, background: '#22C55E' }} />Won</div>
        </div>
      </div>
      {loading
        ? <div className="skeleton" style={{ height: 120, borderRadius: 6 }} />
        : monthlyCreated.length === 0 ? <EmptyMini label="No data yet" />
        : (
          <GroupedVBars
            data={monthlyCreated.map(m => ({ key: m.month, label: m.month?.slice(5), a: m.created, b: m.won }))}
            chartH={100}
            colorA="var(--border)"
            colorB="#22C55E"
          />
        )
      }
    </div>
  )
}

function InteractionTypesCard({ interactions, loading }) {
  const maxVal = Math.max(...interactions.map(i => i.count ?? 0), 1)
  return (
    <div className="card card-pad">
      <div className="card-title" style={{ marginBottom: 14 }}>Interaction Types</div>
      {loading ? <Skeleton rows={3} /> : interactions.length === 0 ? <EmptyMini label="No data yet" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {interactions.map(i => {
            const pct   = (i.count / maxVal) * 100
            const color = INTERACTION_COLOR[i.type] ?? '#74ba89'
            return (
              <div key={i.type}>
                <div className="flex items-center justify-between mb-8" style={{ fontSize: 12 }}>
                  <div className="flex items-center gap-8">
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span className="font-semi">{i.type}</span>
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{i.count}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ApprovalStatsCard({ approvals, loading }) {
  const total   = approvals.reduce((s, a) => s + (a.count ?? 0), 0)
  const approved = approvals.find(a => a.status === 'Approved')
  return (
    <div className="card card-pad">
      <div className="card-title" style={{ marginBottom: 14 }}>Approval Stats</div>
      {loading ? <Skeleton rows={3} /> : approvals.length === 0 ? <EmptyMini label="No data yet" /> : (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            {approvals.map(a => {
              const pct   = total > 0 ? (a.count / total) * 100 : 0
              const color = a.status === 'Approved' ? '#22C55E' : a.status === 'Rejected' ? '#ef4444' : '#F59E0B'
              return (
                <div key={a.status}>
                  <div className="flex items-center justify-between mb-8" style={{ fontSize: 12 }}>
                    <div className="flex items-center gap-8">
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <span className="font-semi">{a.status}</span>
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.count} · avg {a.avg_discount}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>
          {approved && (
            <div style={{ padding: '8px 10px', background: 'rgba(34,197,94,0.07)', borderRadius: 6, border: '1px solid rgba(34,197,94,0.12)', fontSize: 11, color: 'var(--text-3)' }}>
              Avg approved discount: <span className="mono font-bold" style={{ color: '#22C55E' }}>{approved.avg_discount}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TaskCompletionByRepCard({ taskByRep, loading, selectedRep, onSelectRep }) {
  return (
    <div className="card card-pad">
      <div className="card-title" style={{ marginBottom: 14 }}>Task Completion</div>
      {loading ? <Skeleton rows={4} /> : taskByRep.length === 0 ? <EmptyMini label="No data yet" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {taskByRep.map(r => {
            const total = (r.done ?? 0) + (r.open ?? 0)
            const pct   = total > 0 ? (r.done / total) * 100 : 0
            const isLit = !selectedRep || selectedRep.id === r.id
            return (
              <div key={r.name}
                style={{ opacity: isLit ? 1 : 0.22, filter: isLit ? 'none' : 'blur(0.5px)',
                  transition: 'opacity 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), filter 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)', cursor: 'pointer' }}
                onClick={() => onSelectRep?.({ id: r.id, name: r.name })}>
                <div className="flex items-center justify-between mb-8" style={{ fontSize: 12 }}>
                  <span className="font-semi">{r.name}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.done}/{total} done</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%`, background: '#22C55E' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MonthlyWinsCard({ monthly, loading }) {
  return (
    <div className="card card-pad">
      <div className="card-title" style={{ marginBottom: 4 }}>Monthly Revenue</div>
      {loading
        ? <div className="skeleton" style={{ height: 140, borderRadius: 6, marginTop: 12 }} />
        : monthly.length === 0 ? <EmptyMini label="No data yet" />
        : (
          <VBars
            data={monthly.map(m => ({ key: m.month, label: m.month?.slice(5), value: parseInt(m.deals_won ?? 0), color: '#22C55E' }))}
            chartH={110}
            formatVal={v => v}
          />
        )
      }
    </div>
  )
}

function MiniLeaderboard({ reps, loading, selectedRep, onSelectRep }) {
  return (
    <div className="card card-pad">
      <div className="flex items-center justify-between mb-16">
        <span className="card-title">Top Performers</span>
        <a href="/reports" style={{ fontSize: 11, color: 'var(--green-text)', fontWeight: 600 }}>Full report →</a>
      </div>
      {loading ? <Skeleton rows={3} /> : reps.length === 0 ? <EmptyMini label="No data yet" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {reps.map((rep, i) => {
            const isLit = !selectedRep || selectedRep.id === rep.id
            return (
              <div key={rep.id} className="flex items-center gap-12"
                style={{ opacity: isLit ? 1 : 0.22, filter: isLit ? 'none' : 'blur(0.5px)',
                  transition: 'opacity 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), filter 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)', cursor: 'pointer' }}
                onClick={() => onSelectRep?.({ id: rep.id, name: rep.name })}>
                <span style={{ fontWeight: 800, width: 20, flexShrink: 0, fontSize: 13, color: i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : '#cd7c2f' }}>#{i + 1}</span>
                <div className="avatar" style={{ background: REP_COLORS[i % REP_COLORS.length], fontSize: 12, width: 28, height: 28, minWidth: 28, flexShrink: 0 }}>
                  {initials(rep.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="font-semi" style={{ fontSize: 13 }}>{rep.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{rep.deals_won} deals won</div>
                </div>
                <span className="mono font-bold" style={{ fontSize: 12, color: 'var(--green-text)', flexShrink: 0 }}>{fmt(rep.revenue_won)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function QuickStatsCard({ stats, totalPipeline, loading }) {
  const items = [
    { label: 'Total Deals Won',   value: stats?.won ?? '—' },
    { label: 'Avg Deal Value',    value: fmt(stats?.avgDeal) },
    { label: 'Total Pipeline',    value: fmt(totalPipeline) },
    { label: 'Total Contacts',    value: stats?.contacts ?? '—' },
  ]
  return (
    <div className="card card-pad">
      <div className="card-title" style={{ marginBottom: 16 }}>Quick Stats</div>
      {loading ? <Skeleton rows={4} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {items.map(item => (
            <div key={item.label} style={{ padding: '12px 14px', background: 'var(--bg-subtle)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{item.label}</div>
              <div className="mono font-bold" style={{ fontSize: 18, color: 'var(--text-1)' }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MyWinRateCard({ myStats, loading }) {
  const won    = Number(myStats?.won ?? 0)
  const lost   = Number(myStats?.lost ?? 0)
  const closed = won + lost
  const pct    = closed > 0 ? Math.round((won / closed) * 100) : 0
  return (
    <div className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {loading
          ? <div className="skeleton" style={{ width: 100, height: 100, borderRadius: '50%' }} />
          : (
            <>
              <DonutRing value={won} total={closed} size={100} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span className="mono" style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>
                  {closed > 0 ? `${pct}%` : '—'}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>win rate</span>
              </div>
            </>
          )
        }
      </div>
      <div>
        <div className="card-title" style={{ marginBottom: 10 }}>My Win Rate</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 13 }}><span className="mono font-bold" style={{ color: '#22C55E' }}>{won}</span> <span style={{ color: 'var(--text-3)' }}>won</span></div>
          <div style={{ fontSize: 13 }}><span className="mono font-bold" style={{ color: '#ef4444' }}>{lost}</span> <span style={{ color: 'var(--text-3)' }}>lost</span></div>
          {myStats?.avg_cycle_days && (
            <div style={{ fontSize: 13 }}><span className="mono" style={{ color: 'var(--text-2)' }}>{myStats.avg_cycle_days}d</span> <span style={{ color: 'var(--text-3)' }}>avg cycle</span></div>
          )}
        </div>
      </div>
    </div>
  )
}

function MyPipelineCard({ deals, loading }) {
  const stageOrder = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation']
  const groups = deals.reduce((acc, d) => {
    const s = d.stage_name
    if (!acc[s]) acc[s] = { count: 0, value: 0 }
    acc[s].count++
    acc[s].value += parseFloat(d.expected_value ?? 0)
    return acc
  }, {})
  const stageData = stageOrder.filter(s => groups[s]).map(s => ({ stage: s, ...groups[s] }))
  const maxVal    = Math.max(...stageData.map(s => s.value), 1)
  return (
    <div className="card card-pad">
      <div className="card-title" style={{ marginBottom: 14 }}>My Pipeline</div>
      {loading ? <Skeleton rows={4} /> : stageData.length === 0 ? <EmptyMini label="No open deals" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {stageData.map(s => (
            <div key={s.stage}>
              <div className="flex items-center justify-between mb-8" style={{ fontSize: 12 }}>
                <div className="flex items-center gap-8">
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: STAGE_COLOR[s.stage] ?? '#74ba89', flexShrink: 0 }} />
                  <span className="font-semi">{s.stage}</span>
                  <span style={{ color: 'var(--text-3)', fontSize: 11 }}>({s.count})</span>
                </div>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmt(s.value)}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${(s.value / maxVal) * 100}%`, background: STAGE_COLOR[s.stage] ?? 'var(--green)' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MyMonthlyCard({ myMonthly, loading }) {
  return (
    <div className="card card-pad">
      <div className="card-title" style={{ marginBottom: 4 }}>My Monthly Won</div>
      {loading
        ? <div className="skeleton" style={{ height: 120, borderRadius: 6, marginTop: 12 }} />
        : myMonthly.length === 0 ? <EmptyMini label="No won deals yet" />
        : (
          <VBars
            data={myMonthly.map(m => ({ key: m.month, label: m.month?.slice(5), value: m.won, color: '#22C55E' }))}
            chartH={100}
            formatVal={v => v}
          />
        )
      }
    </div>
  )
}

function TaskRingCard({ stats, loading }) {
  const done  = stats?.doneTasks ?? 0
  const open  = stats?.openTasks ?? 0
  const total = done + open
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {loading
          ? <div className="skeleton" style={{ width: 100, height: 100, borderRadius: '50%' }} />
          : (
            <>
              <DonutRing value={done} total={total} size={100} color="#22C55E" />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span className="mono" style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{pct}%</span>
                <span style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>done</span>
              </div>
            </>
          )
        }
      </div>
      <div>
        <div className="card-title" style={{ marginBottom: 10 }}>Task Progress</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontSize: 13 }}><span className="mono font-bold" style={{ color: '#22C55E' }}>{done}</span> <span style={{ color: 'var(--text-3)' }}>completed</span></div>
          <div style={{ fontSize: 13 }}><span className="mono font-bold" style={{ color: '#F59E0B' }}>{open}</span> <span style={{ color: 'var(--text-3)' }}>open</span></div>
          {(stats?.overdueTasks ?? 0) > 0 && (
            <div style={{ fontSize: 13 }}><span className="mono font-bold" style={{ color: '#ef4444' }}>{stats.overdueTasks}</span> <span style={{ color: 'var(--text-3)' }}>overdue</span></div>
          )}
        </div>
      </div>
    </div>
  )
}

function DealCyclePersonalCard({ myStats, loading }) {
  return (
    <div className="card card-pad">
      <div className="card-title" style={{ marginBottom: 14 }}>My Avg Cycle</div>
      {loading ? <Skeleton rows={2} /> : (
        <div style={{ textAlign: 'center', padding: '20px 8px' }}>
          <div className="mono" style={{ fontSize: 40, fontWeight: 800, color: '#22C55E', lineHeight: 1 }}>
            {myStats?.avg_cycle_days ?? '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>avg days to close</div>
          {myStats?.avg_cycle_days && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-3)' }}>
              Based on <span className="font-semi" style={{ color: 'var(--text-2)' }}>{myStats.won}</span> won deals
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MyRevenueCard({ myStats, loading }) {
  return (
    <div className="card card-pad">
      <div className="card-title" style={{ marginBottom: 14 }}>My Revenue</div>
      {loading ? <Skeleton rows={2} /> : (
        <div style={{ textAlign: 'center', padding: '20px 8px' }}>
          <div className="mono" style={{ fontSize: 32, fontWeight: 800, color: '#22C55E', lineHeight: 1 }}>
            {fmt(myStats?.revenue)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>total won revenue</div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-3)' }}>
            <span className="font-semi" style={{ color: 'var(--text-2)' }}>{myStats?.won ?? 0}</span> deals won · <span className="font-semi" style={{ color: '#ef4444' }}>{myStats?.lost ?? 0}</span> lost
          </div>
        </div>
      )}
    </div>
  )
}

function MyActivitySummaryCard({ stats, myStats, loading }) {
  const won    = Number(myStats?.won ?? 0)
  const lost   = Number(myStats?.lost ?? 0)
  const closed = won + lost
  const items = [
    { label: 'Open Deals',      value: myStats?.open ?? stats?.myDeals ?? '—', color: '#3B82F6' },
    { label: 'Open Tasks',      value: stats?.openTasks ?? '—',                color: '#F59E0B' },
    { label: 'Overdue Tasks',   value: stats?.overdueTasks ?? '—',             color: stats?.overdueTasks > 0 ? '#ef4444' : 'var(--text-3)' },
    { label: 'Win Rate',        value: closed > 0 ? `${Math.round((won / closed) * 100)}%` : '—', color: '#22C55E' },
  ]
  return (
    <div className="card card-pad">
      <div className="card-title" style={{ marginBottom: 14 }}>Activity Summary</div>
      {loading ? <Skeleton rows={4} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => (
            <div key={item.label} className="flex items-center justify-between" style={{ fontSize: 13 }}>
              <span style={{ color: 'var(--text-3)' }}>{item.label}</span>
              <span className="mono font-bold" style={{ color: item.color }}>{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MonthlyRevenueCard({ monthly, loading }) {
  return (
    <div className="card card-pad">
      <div className="card-title" style={{ marginBottom: 4 }}>Monthly Revenue</div>
      {loading
        ? <div className="skeleton" style={{ height: 160, borderRadius: 6, marginTop: 12 }} />
        : monthly.length === 0 ? <EmptyMini label="No data yet" />
        : (
          <VBars
            data={monthly.map(m => ({ key: m.month, label: m.month?.slice(5), value: parseFloat(m.revenue ?? 0), color: '#22C55E' }))}
            chartH={120}
            formatVal={v => fmt(v)}
          />
        )
      }
    </div>
  )
}

function PipelineByStageCard({ pipeline, loading }) {
  const filtered  = pipeline.filter(s => parseInt(s.deal_count) > 0)
  const maxVal    = Math.max(...filtered.map(s => parseFloat(s.total_expected_value ?? 0)), 1)
  return (
    <div className="card card-pad">
      <div className="card-title" style={{ marginBottom: 14 }}>Pipeline by Stage</div>
      {loading ? <Skeleton rows={5} /> : filtered.length === 0 ? <EmptyMini label="No open deals" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map(s => {
            const pct = (parseFloat(s.total_expected_value ?? 0) / maxVal) * 100
            return (
              <div key={s.stage}>
                <div className="flex items-center justify-between mb-8" style={{ fontSize: 13 }}>
                  <span className="font-semi">{s.stage}</span>
                  <span className="text-gray">{s.deal_count} deals · {fmt(s.total_expected_value)}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%`, background: STAGE_COLOR[s.stage] ?? 'var(--green)' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DealSizeCard({ sizeBuckets, loading }) {
  return (
    <div className="card card-pad">
      <div className="card-title" style={{ marginBottom: 14 }}>Deal Size Distribution</div>
      {loading ? <Skeleton rows={5} /> : sizeBuckets.length === 0 ? <EmptyMini label="No won deals yet" /> : (
        <VBars
          data={sizeBuckets.map(b => ({ key: b.bucket, label: b.bucket, value: b.count, color: '#8B5CF6' }))}
          chartH={110}
          formatVal={v => v}
        />
      )}
    </div>
  )
}

function LeadSourceCard({ leadSources, loading }) {
  const maxVal = Math.max(...leadSources.map(s => parseFloat(s.revenue ?? 0)), 1)
  return (
    <div className="card card-pad">
      <div className="card-title" style={{ marginBottom: 14 }}>Revenue by Lead Source</div>
      {loading ? <Skeleton rows={5} /> : leadSources.length === 0 ? <EmptyMini label="No data yet" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {leadSources.map(s => {
            const pct = (parseFloat(s.revenue ?? 0) / maxVal) * 100
            return (
              <div key={s.lead_source}>
                <div className="flex items-center justify-between mb-8" style={{ fontSize: 12 }}>
                  <span className="font-semi">{s.lead_source}</span>
                  <span className="text-gray text-sm">{s.deals_won} deals · {fmt(s.revenue)}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${pct}%`, background: '#3B82F6' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Chip({ color, label }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 5,
      background: `${color}18`,
      fontSize: 11, fontWeight: 700, color, letterSpacing: '0.03em',
    }}>
      {label}
    </span>
  )
}

function DualCardGrid({ deals, tasks, loading, navigate, emptyDealsLabel = 'No open deals', emptyTasksLabel = 'No open tasks' }) {
  return (
    <div className="grid-2">
      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Deals</span>
          <a href="/deals" style={{ fontSize: 12, color: 'var(--green-text)', fontWeight: 600 }}>View all →</a>
        </div>
        {loading
          ? <Skeleton rows={4} />
          : deals.length === 0
          ? <EmptyMini label={emptyDealsLabel} />
          : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Deal</th><th>Value</th><th>Stage</th></tr></thead>
                <tbody>
                  {deals.map(d => (
                    <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/deals/${d.id}`)}>
                      <td>
                        <div className="font-semi truncate" style={{ maxWidth: 175 }}>{d.title}</div>
                        <div className="text-xs text-gray">
                          {d.deal_number && <span style={{ fontFamily: 'monospace', color: 'var(--green-text)', marginRight: 6 }}>DEAL-{d.deal_number}</span>}
                          {d.contact_name}
                        </div>
                      </td>
                      <td><span className="mono font-bold" style={{ fontSize: 13 }}>{fmt(d.expected_value)}</span></td>
                      <td><Chip color={STAGE_COLOR[d.stage_name] ?? '#74ba89'} label={d.stage_name} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Open Tasks</span>
          <a href="/tasks" style={{ fontSize: 12, color: 'var(--green-text)', fontWeight: 600 }}>View all →</a>
        </div>
        {loading
          ? <Skeleton rows={4} />
          : tasks.length === 0
          ? <EmptyMini label={emptyTasksLabel} />
          : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Task</th><th>Due</th><th>Status</th></tr></thead>
                <tbody>
                  {tasks.map(t => {
                    const overdue = t.due_date && t.status !== 'Done' && new Date(t.due_date) < new Date()
                    return (
                      <tr key={t.id}>
                        <td>
                          <div className="font-semi truncate" style={{ maxWidth: 175 }}>{t.title}</div>
                          <div className="text-xs text-gray">{t.type}</div>
                        </td>
                        <td className="text-sm" style={overdue ? { color: 'var(--red)', fontWeight: 600 } : { color: 'var(--text-3)' }}>
                          {t.due_date ? new Date(t.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                        </td>
                        <td>
                          <Chip color={TASK_STATUS_COLOR[t.status] ?? '#74ba89'} label={t.status} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, alert, loading }) {
  return (
    <div className={`stat-card${alert ? ' stat-card-alert' : ''}`}>
      <div className="stat-card-label">{label}</div>
      {loading
        ? <div className="skeleton" style={{ height: 28, width: '50%', margin: '4px 0' }} />
        : <div className="stat-card-value mono">{value ?? '—'}</div>
      }
      <div className="stat-card-sub">{sub}</div>
    </div>
  )
}

function DateChip() {
  return (
    <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500, padding: '6px 10px', background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--rounded-md)', flexShrink: 0 }}>
      {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })}
    </div>
  )
}

function Skeleton({ rows = 3 }) {
  return (
    <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 13, width: `${60 + (i % 3) * 12}%` }} />
      ))}
    </div>
  )
}

function EmptyMini({ label }) {
  return (
    <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
      {label}
    </div>
  )
}
