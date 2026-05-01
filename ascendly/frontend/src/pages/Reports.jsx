import { useEffect, useState, useCallback } from 'react'
import api from '../api/client'

const STAGE_COLOR = {
  New: '#74ba89', Contacted: '#3B82F6', Qualified: '#8B5CF6',
  Proposal: '#F59E0B', Negotiation: '#62c0d5', Won: '#22C55E', Lost: '#ef4444',
}
const INTERACTION_COLOR = { Meeting: '#8B5CF6', Email: '#3B82F6', Call: '#22C55E' }
const REP_COLORS = ['#62c0d5', '#8B5CF6', '#F59E0B', '#F97316', '#3B82F6']

function fmt(n) {
  if (!n && n !== 0) return '—'
  const num = parseFloat(n)
  if (isNaN(num)) return '—'
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

/* ══════════════════════════════════════════════════
   VBars — vertical bar chart using pixel heights (no CSS % - that's what was broken)
══════════════════════════════════════════════════ */
// data: array of { key, label, value, color }
// chartH: usable bar area height in pixels
// filter: current chart filter state { type, value } or null
// onSelect(filter_or_null): called when bar is clicked
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
            {/* inner area: fixed height, bar grows from bottom */}
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

/* ══════════════════════════════════════════════════
   GroupedVBars — two bars per column with pixel heights
══════════════════════════════════════════════════ */
// data: array of { key, label, a, b }  (a = first bar, b = second bar)
// colorA, colorB: bar colors
// filter: current filter or null
// onSelect: called with { value: key, label }
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
              {/* Bar A */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'flex-end', height: chartH, flex: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-2)', marginBottom: 2 }}>
                  {fmtA ? fmtA(d.a) : d.a}
                </div>
                <div style={{ width: '100%', height: aH, background: colorA,
                  borderRadius: '2px 2px 0 0', flexShrink: 0, transition: 'height 0.4s ease' }} />
              </div>
              {/* Bar B */}
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

/* ══════════════════════════════════════════════════
   MAIN EXPORT
══════════════════════════════════════════════════ */
export default function Reports() {
  const [revenue,        setRevenue]        = useState(null)
  const [pipeline,       setPipeline]       = useState([])
  const [leaderboard,    setLeaderboard]    = useState([])
  const [monthly,        setMonthly]        = useState([])
  const [winLoss,        setWinLoss]        = useState([])
  const [leadSources,    setLeadSources]    = useState([])
  const [velocity,       setVelocity]       = useState([])
  const [cycle,          setCycle]          = useState(null)
  const [conversion,     setConversion]     = useState([])
  const [repPipeline,    setRepPipeline]    = useState([])
  const [interactions,   setInteractions]   = useState([])
  const [approvals,      setApprovals]      = useState([])
  const [sizeBuckets,    setSizeBuckets]    = useState([])
  const [monthlyCreated, setMonthlyCreated] = useState([])
  const [contactGrowth,  setContactGrowth]  = useState([])
  const [dealAgeBuckets, setDealAgeBuckets] = useState([])
  const [loading,        setLoading]        = useState(true)

  const hasNoData = !loading && !revenue?.total_revenue && monthly.length === 0 && pipeline.length === 0

  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [applied,     setApplied]     = useState({ dateFrom: '', dateTo: '' })
  const [selectedRep, setSelectedRep] = useState(null) // { id, name } or null

  function selectRep(rep) {
    setSelectedRep(prev => prev?.id === rep.id ? null : rep)
  }

  const fetchData = useCallback((repId = null, dates = {}) => {
    setLoading(true)
    const dateParams = new URLSearchParams()
    if (dates.dateFrom) dateParams.set('date_from', dates.dateFrom)
    if (dates.dateTo)   dateParams.set('date_to',   dates.dateTo)
    const qs = dateParams.toString() ? `?${dateParams.toString()}` : ''

    function withOwner(base) {
      if (!repId) return `${base}${qs}`
      const sep = qs ? '&' : '?'
      return `${base}${qs}${sep}owner_id=${repId}`
    }

    Promise.all([
      api.get(`/reports/revenue${qs}`).catch(() => ({ data: {} })),
      api.get(withOwner(`/reports/pipeline`)).catch(() => ({ data: [] })),
      api.get(`/reports/leaderboard${qs}`).catch(() => ({ data: [] })),
      api.get(withOwner(`/reports/monthly`)).catch(() => ({ data: [] })),
      api.get(withOwner(`/reports/win-loss-monthly`)).catch(() => ({ data: [] })),
      api.get(`/reports/lead-source-revenue${qs}`).catch(() => ({ data: [] })),
      api.get(`/reports/stage-velocity`).catch(() => ({ data: [] })),
      api.get(withOwner(`/reports/deal-cycle`)).catch(() => ({ data: {} })),
      api.get(withOwner(`/reports/stage-conversion`)).catch(() => ({ data: [] })),
      api.get(`/reports/rep-pipeline`).catch(() => ({ data: [] })),
      api.get(withOwner(`/reports/interaction-types`)).catch(() => ({ data: [] })),
      api.get(`/reports/approval-stats`).catch(() => ({ data: [] })),
      api.get(`/reports/deal-size-buckets`).catch(() => ({ data: [] })),
      api.get(withOwner(`/reports/monthly-created`)).catch(() => ({ data: [] })),
      api.get(`/reports/contact-growth`).catch(() => ({ data: [] })),
      api.get(`/reports/deal-age-buckets`).catch(() => ({ data: [] })),
    ]).then(([r, p, l, m, wl, ls, sv, cy, cv, rp, it, ap, sb, mc, cg, dab]) => {
      setRevenue(r.data)
      setPipeline(p.data)
      setLeaderboard(l.data)
      setMonthly(m.data.slice(0, 12).reverse())
      setWinLoss(wl.data)
      setLeadSources(ls.data)
      setVelocity(sv.data)
      setCycle(cy.data)
      setConversion(cv.data)
      setRepPipeline(rp.data)
      setInteractions(it.data)
      setApprovals(ap.data)
      setSizeBuckets(sb.data)
      setMonthlyCreated(mc.data.slice(-6))
      setContactGrowth(cg.data)
      setDealAgeBuckets(dab.data)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchData(selectedRep?.id ?? null, { dateFrom: applied.dateFrom, dateTo: applied.dateTo })
  }, [selectedRep, applied, fetchData])

  function applyFilter() {
    setApplied({ dateFrom, dateTo })
    fetchData(selectedRep?.id ?? null, { dateFrom, dateTo })
  }

  function clearFilter() {
    setDateFrom('')
    setDateTo('')
    setApplied({ dateFrom: '', dateTo: '' })
    fetchData(selectedRep?.id ?? null, {})
  }

  /* derived maxes */
  const maxLeadRevenue = Math.max(...leadSources.map(s => parseFloat(s.revenue ?? 0)), 1)
  const maxVelocity    = Math.max(...velocity.map(s => parseFloat(s.avg_days ?? 0)), 1)
  const maxRepPipeline = Math.max(...repPipeline.map(r => parseFloat(r.pipeline_value ?? 0)), 1)
  const maxInteraction = Math.max(...interactions.map(i => i.count ?? 0), 1)

  /* approval helpers */
  const approvalTotal   = approvals.reduce((s, a) => s + (a.count ?? 0), 0)
  const approvedRow     = approvals.find(a => a.status === 'Approved')

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <div className="page-title">Reports</div>
          <div className="page-subtitle">Revenue analytics and team performance</div>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="filter-bar" style={{ marginBottom: 20 }}>
        <div className="input-group" style={{ marginBottom: 0, minWidth: 160 }}>
          <label className="input-label">From</label>
          <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="input-group" style={{ marginBottom: 0, minWidth: 160 }}>
          <label className="input-label">To</label>
          <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
          <button className="btn btn-primary" onClick={applyFilter}>Apply</button>
          {(applied.dateFrom || applied.dateTo) && (
            <button className="btn btn-ghost" onClick={clearFilter}>Clear</button>
          )}
        </div>
      </div>

      {/* ── Rep filter badge ── */}
      {selectedRep && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'inline-flex', fontSize: 12, color: 'var(--green-text)', fontWeight: 500,
            padding: '4px 10px', background: 'rgba(116,186,137,0.12)', border: '1px solid rgba(116,186,137,0.3)',
            borderRadius: 6, cursor: 'pointer', transition: 'opacity 0.3s ease' }}
            onClick={() => setSelectedRep(null)}>
            Rep: {selectedRep.name} ×
          </div>
        </div>
      )}

      {hasNoData && (
        <div style={{
          background: 'var(--bg-subtle)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '28px 24px', marginBottom: 20,
          display: 'flex', alignItems: 'flex-start', gap: 16,
        }}>
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="var(--text-3)" strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 2 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>No revenue data yet</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
              Reports will populate as your team creates deals, logs interactions, and closes them.
              Create your first deal to get started.
            </div>
          </div>
        </div>
      )}

      <div style={{
        opacity: loading ? 0.18 : 1,
        filter: loading ? 'blur(1.5px)' : 'none',
        transform: loading ? 'translateY(6px)' : 'translateY(0)',
        transition: 'opacity 0.35s ease, filter 0.35s ease, transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }}>

      {/* ── Revenue stat cards ── */}
      <div className="stats-grid mb-24">
        <RevenueCard label="Total Revenue"  value={fmt(revenue?.total_revenue)}  loading={loading} accent="#62c0d5" />
        <RevenueCard label="Deals Won"      value={revenue?.total_won ?? '—'}    loading={loading} accent="#22C55E" />
        <RevenueCard label="Avg Deal Value" value={fmt(revenue?.avg_deal_value)} loading={loading} accent="#3B82F6" />
        <RevenueCard label="Largest Deal"   value={fmt(revenue?.max_deal_value)} loading={loading} accent="#8B5CF6" />
      </div>

      {/* ── ROW 1: Revenue trends ── */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Revenue Trends</div>
      <div className="grid-2 mb-24">
        {/* Monthly Revenue */}
        <div className="card card-pad">
          <div className="flex items-center justify-between mb-16">
            <span className="card-title">Monthly Revenue</span>
          </div>
          {loading
            ? <div className="skeleton" style={{ height: 160, borderRadius: 8 }} />
            : monthly.length === 0 ? <EmptyChart />
            : (
              <VBars
                data={monthly.map(m => ({ key: m.month, label: m.month?.slice(5), value: parseFloat(m.revenue ?? 0), color: '#22C55E' }))}
                chartH={130}
                formatVal={v => fmt(v)}
              />
            )
          }
        </div>

        {/* Monthly Created vs Won */}
        <div className="card card-pad">
          <div className="flex items-center justify-between mb-16">
            <span className="card-title">Deals Created vs Won</span>
            <div className="flex items-center gap-12" style={{ fontSize: 10, color: 'var(--text-3)' }}>
              <div className="flex items-center gap-6"><div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--border)' }} />Created</div>
              <div className="flex items-center gap-6"><div style={{ width: 8, height: 8, borderRadius: 2, background: '#22C55E' }} />Won</div>
            </div>
          </div>
          {loading
            ? <div className="skeleton" style={{ height: 160, borderRadius: 8 }} />
            : monthlyCreated.length === 0 ? <EmptyChart />
            : (
              <GroupedVBars
                data={monthlyCreated.map(m => ({ key: m.month, label: m.month?.slice(5), a: m.created ?? 0, b: m.won ?? 0 }))}
                chartH={120}
                colorA="var(--border)"
                colorB="#22C55E"
              />
            )
          }
        </div>
      </div>

      {/* ── ROW 2: Pipeline analysis ── */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Pipeline Analysis</div>
      <div className="grid-3 mb-24">
        {/* Pipeline by Stage */}
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 14 }}>Pipeline by Stage</div>
          {loading
            ? <LoadingSkeleton rows={5} />
            : pipeline.filter(s => parseInt(s.deal_count) > 0).length === 0 ? <EmptyChart />
            : (() => {
                const filtered = pipeline.filter(s => parseInt(s.deal_count) > 0)
                const maxVal   = Math.max(...filtered.map(s => parseFloat(s.total_expected_value ?? 0)), 1)
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {filtered.map(s => {
                      const pct = (parseFloat(s.total_expected_value ?? 0) / maxVal) * 100
                      return (
                        <div key={s.stage}>
                          <div className="flex items-center justify-between mb-8" style={{ fontSize: 12 }}>
                            <div className="flex items-center gap-8">
                              <div style={{ width: 7, height: 7, borderRadius: '50%', background: STAGE_COLOR[s.stage] ?? '#74ba89', flexShrink: 0 }} />
                              <span className="font-semi">{s.stage}</span>
                            </div>
                            <span className="text-gray" style={{ fontSize: 11 }}>{s.deal_count} · {fmt(s.total_expected_value)}</span>
                          </div>
                          <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${pct}%`, background: STAGE_COLOR[s.stage] ?? 'var(--green)' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()
          }
        </div>

        {/* Stage Conversion Funnel */}
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 14 }}>Stage Conversion</div>
          {loading
            ? <LoadingSkeleton rows={5} />
            : conversion.length === 0 ? <EmptyChart />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {conversion.map(s => {
                  const pct      = parseFloat(s.conversion_pct ?? 0)
                  const barColor = pct >= 80 ? '#22C55E' : pct >= 60 ? '#F59E0B' : '#ef4444'
                  return (
                    <div key={s.stage}>
                      <div className="flex items-center justify-between mb-8" style={{ fontSize: 12 }}>
                        <span className="font-semi">{s.stage}</span>
                        <div className="flex items-center gap-8">
                          <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{s.total_entered}</span>
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
            )
          }
        </div>

        {/* Stage Velocity */}
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 4 }}>Stage Velocity</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>Average days per stage</div>
          {loading
            ? <LoadingSkeleton rows={5} />
            : velocity.length === 0 ? <EmptyChart />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {velocity.map(s => {
                  const pct = (parseFloat(s.avg_days ?? 0) / maxVelocity) * 100
                  return (
                    <div key={s.stage}>
                      <div className="flex items-center justify-between mb-8" style={{ fontSize: 12 }}>
                        <span className="font-semi">{s.stage}</span>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.avg_days}d</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${pct}%`, background: '#8B5CF6' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>
      </div>

      {/* ── Pipeline Health: Deal Age Distribution ── */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Pipeline Health</div>
      <div className="mb-24">
        {/* Deal Age Distribution */}
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 4 }}>Deal Age Distribution</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>Open deals grouped by days since creation</div>
          {loading
            ? <div className="skeleton" style={{ height: 160, borderRadius: 8, marginTop: 12 }} />
            : dealAgeBuckets.length === 0 ? <EmptyChart />
            : (
              <VBars
                data={dealAgeBuckets.map(b => ({ key: b.bucket, label: b.bucket, value: Number(b.count ?? 0), color: '#F97316' }))}
                chartH={130}
                formatVal={v => v}
              />
            )
          }
        </div>
      </div>

      {/* ── ROW 3: Win/Loss analysis ── */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Win / Loss Analysis</div>
      <div className="grid-2 mb-24">
        {/* Win/Loss Monthly */}
        <div className="card card-pad">
          <div className="flex items-center justify-between mb-16">
            <span className="card-title">Won vs Lost by Month</span>
            <div className="flex items-center gap-12" style={{ fontSize: 10, color: 'var(--text-3)' }}>
              <div className="flex items-center gap-6"><div style={{ width: 8, height: 8, borderRadius: 2, background: '#22C55E' }} />Won</div>
              <div className="flex items-center gap-6"><div style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444' }} />Lost</div>
            </div>
          </div>
          {loading
            ? <div className="skeleton" style={{ height: 130, borderRadius: 8 }} />
            : winLoss.length === 0 ? <EmptyChart />
            : (
              <GroupedVBars
                data={winLoss.map(m => ({ key: m.month, label: m.month?.slice(5), a: parseInt(m.won ?? 0), b: parseInt(m.lost ?? 0) }))}
                chartH={100}
                colorA="#22C55E"
                colorB="#ef4444"
              />
            )
          }
        </div>

        {/* Deal Cycle KPI */}
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 16 }}>Deal Cycle Time</div>
          {loading
            ? <LoadingSkeleton rows={3} />
            : !cycle || (!cycle.avg_won_days && !cycle.avg_lost_days) ? <EmptyChart />
            : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div style={{ textAlign: 'center', padding: '20px 8px', background: 'rgba(34,197,94,0.07)', borderRadius: 10, border: '1px solid rgba(34,197,94,0.15)' }}>
                    <div className="mono" style={{ fontSize: 40, fontWeight: 800, color: '#22C55E', lineHeight: 1 }}>{cycle.avg_won_days ?? '—'}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>avg days</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#22C55E', marginTop: 8 }}>Won</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{cycle.won_count} deals</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '20px 8px', background: 'rgba(239,68,68,0.07)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.15)' }}>
                    <div className="mono" style={{ fontSize: 40, fontWeight: 800, color: '#ef4444', lineHeight: 1 }}>{cycle.avg_lost_days ?? '—'}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>avg days</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginTop: 8 }}>Lost</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{cycle.lost_count} deals</div>
                  </div>
                </div>
                {cycle.avg_won_days && cycle.avg_lost_days && (
                  <div style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 6, fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
                    Won deals close <span className="font-semi" style={{ color: '#22C55E' }}>
                      {Math.abs(parseFloat(cycle.avg_lost_days) - parseFloat(cycle.avg_won_days)).toFixed(1)}d
                    </span> {parseFloat(cycle.avg_won_days) < parseFloat(cycle.avg_lost_days) ? 'faster' : 'slower'} than lost deals
                  </div>
                )}
              </div>
            )
          }
        </div>
      </div>

      {/* ── ROW 4: Revenue sources ── */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Revenue Sources</div>
      <div className="grid-2 mb-24">
        {/* Lead Source Revenue */}
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 14 }}>Revenue by Lead Source</div>
          {loading
            ? <LoadingSkeleton rows={5} />
            : leadSources.length === 0 ? <EmptyChart />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {leadSources.map(s => {
                  const pct = (parseFloat(s.revenue ?? 0) / maxLeadRevenue) * 100
                  return (
                    <div key={s.lead_source}>
                      <div className="flex items-center justify-between mb-8" style={{ fontSize: 12 }}>
                        <span className="font-semi">{s.lead_source}</span>
                        <span className="text-gray" style={{ fontSize: 11 }}>{s.deals_won} deals · {fmt(s.revenue)}</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${pct}%`, background: '#3B82F6' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>

        {/* Rep Pipeline */}
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 14 }}>Rep Pipeline Value</div>
          {loading
            ? <LoadingSkeleton rows={4} />
            : repPipeline.length === 0 ? <EmptyChart />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {repPipeline.map((r, i) => {
                  const pct   = (parseFloat(r.pipeline_value ?? 0) / maxRepPipeline) * 100
                  const color = REP_COLORS[i % REP_COLORS.length]
                  const isLit = !selectedRep || selectedRep.id === r.id
                  return (
                    <div key={r.id}
                      style={{ opacity: isLit ? 1 : 0.22, filter: isLit ? 'none' : 'blur(0.5px)',
                        transition: 'opacity 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), filter 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)', cursor: 'pointer' }}
                      onClick={() => selectRep({ id: r.id, name: r.name })}>
                      <div className="flex items-center justify-between mb-8" style={{ fontSize: 12 }}>
                        <div className="flex items-center gap-8">
                          <div className="avatar" style={{ background: color, width: 20, height: 20, minWidth: 20, fontSize: 9 }}>
                            {initials(r.name)}
                          </div>
                          <span className="font-semi">{r.name}</span>
                          <span style={{ color: 'var(--text-3)', fontSize: 11 }}>({r.open_count})</span>
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
            )
          }
        </div>
      </div>

      {/* ── Growth & Activity ── */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Growth & Activity</div>
      <div className="grid-3 mb-24">
        {/* Contact Growth */}
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 4 }}>Contact Growth</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>New contacts per month (last 12 mo)</div>
          {loading
            ? <div className="skeleton" style={{ height: 160, borderRadius: 8, marginTop: 12 }} />
            : contactGrowth.length === 0 ? <EmptyChart />
            : (
              <VBars
                data={contactGrowth.map(m => ({
                  key:   m.month,
                  label: new Date(m.month + '-01').toLocaleString('default', { month: 'short' }),
                  value: Number(m.count ?? 0),
                  color: '#8B5CF6',
                }))}
                chartH={130}
                formatVal={v => v}
              />
            )
          }
        </div>

        {/* Win Rate Trend */}
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 4 }}>Win Rate Trend</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>Monthly win rate %</div>
          {loading
            ? <div className="skeleton" style={{ height: 160, borderRadius: 8, marginTop: 12 }} />
            : winLoss.length === 0 ? <EmptyChart />
            : (() => {
                const rateData = winLoss.map(m => {
                  const won  = Number(m.won  ?? 0)
                  const lost = Number(m.lost ?? 0)
                  const rate = (won + lost) > 0 ? parseFloat(((won / (won + lost)) * 100).toFixed(1)) : 0
                  return { key: m.month, label: m.month?.slice(5), value: rate, color: '#22C55E' }
                })
                return (
                  <VBars
                    data={rateData}
                    chartH={130}
                    formatVal={v => `${v}%`}
                  />
                )
              })()
          }
        </div>

        {/* Avg Deal Value Trend */}
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 4 }}>Avg Deal Value Trend</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>Average value of won deals per month</div>
          {loading
            ? <div className="skeleton" style={{ height: 160, borderRadius: 8, marginTop: 12 }} />
            : monthly.length === 0 ? <EmptyChart />
            : (() => {
                const avgData = monthly
                  .filter(m => Number(m.deals_won ?? 0) > 0)
                  .map(m => {
                    const avgVal = parseFloat(m.revenue ?? 0) / Number(m.deals_won)
                    return { key: m.month, label: m.month?.slice(5), value: avgVal, color: '#62c0d5' }
                  })
                if (avgData.length === 0) return <EmptyChart />
                return (
                  <VBars
                    data={avgData}
                    chartH={130}
                    formatVal={v => fmt(v)}
                  />
                )
              })()
          }
        </div>
      </div>

      {/* ── ROW 5: Activity & distribution ── */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Activity & Distribution</div>
      <div className="grid-3 mb-24">
        {/* Interaction Types */}
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 14 }}>Interaction Types</div>
          {loading
            ? <LoadingSkeleton rows={3} />
            : interactions.length === 0 ? <EmptyChart />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {interactions.map(i => {
                  const pct   = (i.count / maxInteraction) * 100
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
            )
          }
        </div>

        {/* Approval Stats */}
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 14 }}>Approval Stats</div>
          {loading
            ? <LoadingSkeleton rows={3} />
            : approvals.length === 0 ? <EmptyChart />
            : (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                  {approvals.map(a => {
                    const pct   = approvalTotal > 0 ? (a.count / approvalTotal) * 100 : 0
                    const color = a.status === 'Approved' ? '#22C55E' : a.status === 'Rejected' ? '#ef4444' : '#F59E0B'
                    return (
                      <div key={a.status}>
                        <div className="flex items-center justify-between mb-8" style={{ fontSize: 12 }}>
                          <div className="flex items-center gap-8">
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                            <span className="font-semi">{a.status}</span>
                          </div>
                          <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.count} · {a.avg_discount}% disc</span>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                {approvedRow && (
                  <div style={{ padding: '8px 10px', background: 'rgba(34,197,94,0.07)', borderRadius: 6, border: '1px solid rgba(34,197,94,0.12)', fontSize: 11, color: 'var(--text-3)' }}>
                    Avg approved discount: <span className="mono font-bold" style={{ color: '#22C55E' }}>{approvedRow.avg_discount}%</span>
                  </div>
                )}
              </div>
            )
          }
        </div>

        {/* Deal Size Distribution */}
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 4 }}>Deal Size Distribution</div>
          {loading
            ? <div className="skeleton" style={{ height: 160, borderRadius: 8, marginTop: 12 }} />
            : sizeBuckets.length === 0 ? <EmptyChart />
            : (
              <VBars
                data={sizeBuckets.map(b => ({ key: b.bucket, label: b.bucket, value: b.count ?? 0, color: '#8B5CF6' }))}
                chartH={130}
                formatVal={v => v}
              />
            )
          }
        </div>
      </div>

      {/* ── ROW 6: Task completion + report summary ── */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Team Productivity</div>
      <div className="grid-2 mb-24">
        {/* Task Completion by Rep */}
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 14 }}>Task Completion by Rep</div>
          {loading
            ? <LoadingSkeleton rows={4} />
            : leaderboard.length === 0 ? <EmptyChart />
            : (() => {
                const taskData = leaderboard.map(r => ({
                  id:      r.id,
                  name:    r.name,
                  done:    Number(r.deals_won ?? 0),
                  open:    Number(r.deals_open ?? 0),
                  revenue: r.revenue_won,
                }))
                const maxDone = Math.max(...taskData.map(r => r.done), 1)
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {taskData.map((r, i) => {
                      const total = r.done + r.open
                      const pct   = total > 0 ? (r.done / total) * 100 : (r.done > 0 ? 100 : 0)
                      const color = REP_COLORS[i % REP_COLORS.length]
                      const isLit = !selectedRep || selectedRep.id === r.id
                      return (
                        <div key={r.name}
                          style={{ opacity: isLit ? 1 : 0.22, filter: isLit ? 'none' : 'blur(0.5px)',
                            transition: 'opacity 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), filter 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)', cursor: 'pointer' }}
                          onClick={() => selectRep({ id: r.id, name: r.name })}>
                          <div className="flex items-center justify-between mb-8" style={{ fontSize: 12 }}>
                            <div className="flex items-center gap-8">
                              <div className="avatar" style={{ background: color, width: 20, height: 20, minWidth: 20, fontSize: 9 }}>
                                {initials(r.name)}
                              </div>
                              <span className="font-semi">{r.name}</span>
                            </div>
                            <div className="flex items-center gap-8">
                              <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{r.done} won · {r.open} open</span>
                              <span className="mono font-bold" style={{ fontSize: 11, color: 'var(--green-text)' }}>{fmt(r.revenue)}</span>
                            </div>
                          </div>
                          <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${(r.done / maxDone) * 100}%`, background: color }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()
          }
        </div>

        {/* Report Summary */}
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 16 }}>Report Summary</div>
          {loading
            ? <LoadingSkeleton rows={6} />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {[
                  { label: 'Total Deals Won',    value: revenue?.total_won ?? '—',                                             color: '#22C55E' },
                  { label: 'Total Lost',         value: winLoss.reduce((s, m) => s + Number(m.lost ?? 0), 0) || '—',          color: '#ef4444' },
                  { label: 'Open Pipeline',      value: fmt(pipeline.reduce((s, p) => s + parseFloat(p.total_expected_value ?? 0), 0)), color: '#62c0d5' },
                  { label: 'Win Rate',           value: revenue?.total_won && winLoss.length
                                                    ? (() => {
                                                        const won  = Number(revenue.total_won)
                                                        const lost = winLoss.reduce((s, m) => s + Number(m.lost ?? 0), 0)
                                                        const cl   = won + lost
                                                        return cl > 0 ? `${Math.round((won / cl) * 100)}%` : '—'
                                                      })()
                                                    : '—',                                                                    color: '#62c0d5' },
                  { label: 'Avg Cycle (Won)',    value: cycle?.avg_won_days ? `${cycle.avg_won_days}d` : '—',                 color: '#22C55E' },
                  { label: 'Top Lead Source',    value: leadSources[0]?.lead_source ?? '—',                                   color: '#3B82F6' },
                  { label: 'Top Revenue Source', value: fmt(leadSources[0]?.revenue),                                          color: '#3B82F6' },
                  { label: 'Avg Deal Value',     value: fmt(revenue?.avg_deal_value),                                          color: '#8B5CF6' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between" style={{ padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-3)' }}>{item.label}</span>
                    <span className="mono font-bold" style={{ color: item.color }}>{item.value}</span>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      </div>

      {/* ── Leaderboard (full width) ── */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Sales Leaderboard</div>
      <div className="card mb-24">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="flex items-center justify-between mb-16">
            <span className="card-title">Sales Leaderboard</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{leaderboard.length} reps</span>
          </div>
        </div>
        {loading
          ? <LoadingSkeleton rows={5} />
          : leaderboard.length === 0
          ? (
            <div className="empty">
              <div className="empty-icon">
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5M8 11v5M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
                </svg>
              </div>
              <h3>No sales data yet</h3>
              <p>Leaderboard populates as deals are won.</p>
            </div>
          )
          : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Sales Rep</th>
                    <th>Deals Won</th>
                    <th>Revenue</th>
                    <th>Open Pipeline</th>
                    <th>Pipeline Value</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((rep, i) => {
                    const isLit = !selectedRep || selectedRep.id === rep.id
                    return (
                      <tr key={rep.id}
                        style={{ opacity: isLit ? 1 : 0.22, filter: isLit ? 'none' : 'blur(0.4px)',
                          transition: 'opacity 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94), filter 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)', cursor: 'pointer' }}
                        onClick={() => selectRep({ id: rep.id, name: rep.name })}>
                        <td>
                          <span style={{ fontWeight: 800, fontSize: 15, color: i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : i === 2 ? '#cd7c2f' : 'var(--text-3)' }}>
                            #{i + 1}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-12">
                            <div className="avatar" style={{ background: REP_COLORS[i % REP_COLORS.length], fontSize: 13, flexShrink: 0 }}>
                              {initials(rep.name)}
                            </div>
                            <span className="font-semi">{rep.name}</span>
                          </div>
                        </td>
                        <td className="font-bold">{rep.deals_won ?? 0}</td>
                        <td className="mono font-bold" style={{ color: 'var(--green-text)' }}>{fmt(rep.revenue_won)}</td>
                        <td className="text-sm text-gray">{rep.deals_open ?? 0}</td>
                        <td className="mono" style={{ fontSize: 12, color: 'var(--text-3)' }}>
                          {(() => {
                            const rp = repPipeline.find(r => r.id === rep.id)
                            return rp ? fmt(rp.pipeline_value) : '—'
                          })()}
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
      </div>{/* end loading fade wrapper */}
    </div>
  )
}

/* ══════════════════════════════════════════════════
   SHARED PRIMITIVES
══════════════════════════════════════════════════ */

function RevenueCard({ label, value, loading, accent }) {
  return (
    <div className="stat-card">
      <div className="stat-card-label">{label}</div>
      {loading
        ? <div className="skeleton" style={{ height: 28, width: '55%', margin: '4px 0' }} />
        : <div className="stat-card-value mono" style={{ color: accent }}>{value ?? '—'}</div>
      }
    </div>
  )
}

function EmptyChart() {
  return (
    <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
      No data yet
    </div>
  )
}

function LoadingSkeleton({ rows = 4 }) {
  return (
    <div style={{ padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 13, width: `${55 + (i % 3) * 13}%` }} />
      ))}
    </div>
  )
}
