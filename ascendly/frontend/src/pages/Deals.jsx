import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

const STAGE_COLOR = {
  New:         '#74ba89',
  Contacted:   '#3B82F6',
  Qualified:   '#8B5CF6',
  Proposal:    '#F59E0B',
  Negotiation: '#62c0d5',
  Won:         '#22C55E',
  Lost:        '#CBD5E1',
}

const STATUS_COLOR = {
  Open: { color: '#3B82F6', bg: 'rgba(59,130,246,0.08)' },
  Won:  { color: '#22C55E', bg: 'rgba(34,197,94,0.08)'  },
  Lost: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)'  },
}

export default function Deals() {
  const { user } = useAuth()
  const navigate  = useNavigate()

  const [deals,          setDeals]          = useState([])
  const [dealTotal,      setDealTotal]      = useState(0)
  const [dealOffset,     setDealOffset]     = useState(0)
  const [loadingMore,    setLoadingMore]    = useState(false)
  const [contacts,       setContacts]       = useState([])
  const [stages,         setStages]         = useState([])
  const [users,          setUsers]          = useState([])
  const [loading,        setLoading]        = useState(true)
  const [showCreate,     setShowCreate]     = useState(false)

  // ── filters (#52 — persisted to localStorage)
  const [search,     setSearch]     = useState('')
  const [fStatus,    setFStatus]    = useState(() => localStorage.getItem('deals_fStatus')  ?? 'Open')
  const [fStage,     setFStage]     = useState(() => localStorage.getItem('deals_fStage')   ?? '')
  const [fOwner,     setFOwner]     = useState(() => localStorage.getItem('deals_fOwner')   ?? '')
  const [fContact,   setFContact]   = useState(() => localStorage.getItem('deals_fContact') ?? '')

  // ── column visibility (#57)
  const DEFAULT_COLS = { num: true, title: true, contact: true, stage: true, owner: true, value: true, close: true, status: true, updated: true, age: true, probability: false, created: false }
  const [visibleCols, setVisibleCols] = useState(() => {
    try { return { ...DEFAULT_COLS, ...JSON.parse(localStorage.getItem('deals_cols') ?? '{}') } }
    catch { return DEFAULT_COLS }
  })
  const [showColPicker, setShowColPicker] = useState(false)
  function toggleCol(col) {
    setVisibleCols(v => {
      const next = { ...v, [col]: !v[col] }
      localStorage.setItem('deals_cols', JSON.stringify(next))
      return next
    })
  }

  // ── sort
  const [sortKey, setSortKey] = useState('updated_at')
  const [sortDir, setSortDir] = useState('desc')

  // ── view mode
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('deals_view') ?? 'list')
  function switchView(mode) { setViewMode(mode); localStorage.setItem('deals_view', mode) }

  const isManager = ['Admin', 'Sales Manager'].includes(user?.role)
  const canCreate = ['Admin', 'Sales Manager', 'Sales Rep', 'SDR'].includes(user?.role)

  // #52 — persist filters
  useEffect(() => {
    localStorage.setItem('deals_fStatus',  fStatus)
    localStorage.setItem('deals_fStage',   fStage)
    localStorage.setItem('deals_fOwner',   fOwner)
    localStorage.setItem('deals_fContact', fContact)
  }, [fStatus, fStage, fOwner, fContact])

  // #56 — keyboard shortcut: N → new deal
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'n' && e.key !== 'N') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (canCreate) { e.preventDefault(); setShowCreate(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canCreate])

  const load = useCallback(() => {
    setLoading(true)
    setDealOffset(0)
    const qs = new URLSearchParams({ limit: 50 })
    if (fStatus !== 'All') qs.set('status', fStatus)
    Promise.all([
      api.get(`/deals?${qs}`),
      api.get('/contacts?limit=200'),
      api.get('/pipeline-stages'),
      isManager ? api.get('/users').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
    ]).then(([d, c, s, u]) => {
      setDeals(d.data.data)
      setDealTotal(d.data.total)
      setContacts(c.data.data)
      setStages(s.data.filter(s => s.is_active))
      setUsers(u.data)
    }).catch(() => {})
      .finally(() => setLoading(false))
  }, [fStatus, isManager])

  const loadMore = useCallback(() => {
    const newOffset = dealOffset + 50
    setLoadingMore(true)
    const qs = new URLSearchParams({ limit: 50, offset: newOffset })
    if (fStatus !== 'All') qs.set('status', fStatus)
    api.get(`/deals?${qs}`)
      .then(({ data }) => {
        setDeals(prev => [...prev, ...data.data])
        setDealOffset(newOffset)
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false))
  }, [fStatus, dealOffset])

  useEffect(() => { load() }, [load])

  const fmt = (n) => {
    if (!n && n !== 0) return '—'
    const num = parseFloat(n)
    return num >= 1_000_000 ? `$${parseFloat((num / 1_000_000).toFixed(2))}M`
      : num >= 1_000 ? `$${parseFloat((num / 1_000).toFixed(2))}K`
      : `$${parseFloat(num.toFixed(2))}`
  }

  const fmtDate = (d) => d
    ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
    : '—'

  const fmtUpdated = (d) => {
    if (!d) return '—'
    const diff = Date.now() - new Date(d)
    const mins = Math.floor(diff / 60000)
    if (mins < 60)    return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24)     return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 7)     return `${days}d ago`
    return fmtDate(d)
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const SortIcon = ({ field }) => {
    if (sortKey !== field) return <span style={{ opacity: 0.3, marginLeft: 4 }}>↕</span>
    return <span style={{ marginLeft: 4, color: 'var(--green-text)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  // apply filters
  let filtered = deals.filter(d => {
    if (fStage   && d.stage_name !== fStage)       return false
    if (fOwner   && d.owner_id   !== fOwner)        return false
    if (fContact && d.contact_id !== fContact)      return false
    if (search) {
      const q = search.toLowerCase()
      const hit = [d.title, d.contact_name, d.owner_name, d.stage_name, d.deal_number?.toString()]
        .some(v => v?.toLowerCase().includes(q))
      if (!hit) return false
    }
    return true
  })

  // In kanban mode, stage filter is meaningless (columns ARE stages) — filter without it
  const kanbanDeals = viewMode !== 'kanban' ? filtered : deals.filter(d => {
    if (fOwner   && d.owner_id   !== fOwner)   return false
    if (fContact && d.contact_id !== fContact)  return false
    if (search) {
      const q = search.toLowerCase()
      const hit = [d.title, d.contact_name, d.owner_name, d.stage_name, d.deal_number?.toString()]
        .some(v => v?.toLowerCase().includes(q))
      if (!hit) return false
    }
    return true
  })

  // apply sort
  filtered = [...filtered].sort((a, b) => {
    let av = a[sortKey] ?? '', bv = b[sortKey] ?? ''
    if (sortKey === 'expected_value' || sortKey === 'deal_number' || sortKey === 'probability') {
      av = parseFloat(av) || 0; bv = parseFloat(bv) || 0
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ?  1 : -1
    return 0
  })

  const totalValue = filtered
    .filter(d => d.status !== 'Lost')
    .reduce((s, d) => s + parseFloat(d.expected_value ?? 0), 0)

  const th = { cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <div className="page-title">Pipeline</div>
          <div className="page-subtitle">
            {filtered.length} deal{filtered.length !== 1 ? 's' : ''}
            {filtered.length !== deals.length ? ` (filtered from ${deals.length})` : ''}
            {' · '}{fmt(totalValue)} active value
          </div>
        </div>
        <div className="flex items-center gap-8">
          {/* view toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            <button onClick={() => switchView('list')} title="List view" style={{
              padding: '5px 9px', background: viewMode === 'list' ? 'var(--green-text)' : 'var(--bg-2)',
              color: viewMode === 'list' ? '#fff' : 'var(--text-3)', border: 'none', cursor: 'pointer',
              borderRight: '1px solid var(--border)',
            }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button onClick={() => switchView('kanban')} title="Kanban view" style={{
              padding: '5px 9px', background: viewMode === 'kanban' ? 'var(--green-text)' : 'var(--bg-2)',
              color: viewMode === 'kanban' ? '#fff' : 'var(--text-3)', border: 'none', cursor: 'pointer',
            }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="3" width="5" height="18" rx="1" /><rect x="10" y="3" width="5" height="12" rx="1" /><rect x="17" y="3" width="5" height="15" rx="1" />
              </svg>
            </button>
          </div>
            {/* #57 Column visibility */}
          <div style={{ position: 'relative' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setShowColPicker(c => !c)} title="Columns">
              ⋮ Columns
            </button>
            {showColPicker && (
              <div onMouseLeave={() => setShowColPicker(false)} style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: 'var(--shadow-lg)', padding: '8px 0', minWidth: 150,
              }}>
                {[
                  ['num', '#'], ['title', 'Summary'], ['contact', 'Contact'], ['stage', 'Stage'],
                  ['owner', 'Owner'], ['value', 'Value'], ['probability', 'Probability'],
                  ['close', 'Close Date'], ['status', 'Status'], ['updated', 'Updated'],
                  ['created', 'Created'], ['age', 'Stage Age'],
                ].map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', cursor: 'pointer', fontSize: 13 }}>
                    <input type="checkbox" checked={!!visibleCols[key]} onChange={() => toggleCol(key)} />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>
        {canCreate && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)} title="New Deal (N)">+ New Deal</button>
          )}
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 8 }}>
        {/* search */}
        <div className="search-wrap" style={{ flex: '1 1 200px', minWidth: 160, maxWidth: 280 }}>
          <svg className="search-icon" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input className="input" placeholder="Search deals…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* status */}
        <div style={{ display: 'flex', gap: 4 }}>
          {['Open', 'Won', 'Lost', 'All'].map(s => (
            <button key={s}
              className={`btn btn-sm ${fStatus === s ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFStatus(s)}
            >{s}</button>
          ))}
        </div>

        {/* stage — hidden in kanban (columns are the stages) */}
        {viewMode !== 'kanban' && (
          <select className="input" style={{ width: 'auto', minWidth: 130, fontSize: 13 }}
            value={fStage} onChange={e => setFStage(e.target.value)}>
            <option value="">All Stages</option>
            {stages.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        )}

        {/* owner — managers only */}
        {isManager && users.length > 0 && (
          <select className="input" style={{ width: 'auto', minWidth: 130, fontSize: 13 }}
            value={fOwner} onChange={e => setFOwner(e.target.value)}>
            <option value="">All Owners</option>
            {users.filter(u => ['Sales Rep','Sales Manager','SDR','Admin'].includes(u.role)).map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}

        {/* contact */}
        <select className="input" style={{ width: 'auto', minWidth: 150, fontSize: 13 }}
          value={fContact} onChange={e => setFContact(e.target.value)}>
          <option value="">All Contacts</option>
          {contacts.map(c => (
            <option key={c.id} value={c.id}>{c.full_name}{c.company ? ` · ${c.company}` : ''}</option>
          ))}
        </select>

        {/* clear */}
        {(search || (viewMode !== 'kanban' && fStage) || fOwner || fContact) && (
          <button className="btn btn-sm btn-ghost"
            onClick={() => { setSearch(''); setFStage(''); setFOwner(''); setFContact('') }}>
            Clear
          </button>
        )}
      </div>

      {/* ── Kanban ── */}
      {viewMode === 'kanban' && loading && (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>Loading pipeline…</div>
      )}
      {viewMode === 'kanban' && !loading && (
        <KanbanView
          filtered={kanbanDeals} stages={stages} isManager={isManager}
          userRole={user?.role}
          fmt={fmt} fmtDate={fmtDate} navigate={navigate}
          onMoved={load}
        />
      )}

      {/* ── Table ── */}
      {viewMode === 'list' && (<div className="card" style={{ marginTop: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>
            Loading pipeline…
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3>{search || fStage || fOwner || fContact ? 'No matches' : 'No deals yet'}</h3>
            <p>{search || fStage || fOwner || fContact ? 'Try adjusting your filters.' : 'Create your first deal to get started.'}</p>
            {canCreate && !search && !fStage && !fOwner && !fContact && (
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowCreate(true)}>
                + Create First Deal
              </button>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {visibleCols.num         && <th style={th} onClick={() => toggleSort('deal_number')}>#<SortIcon field="deal_number" /></th>}
                  {visibleCols.title       && <th style={th} onClick={() => toggleSort('title')}>Summary<SortIcon field="title" /></th>}
                  {visibleCols.contact     && <th style={th} onClick={() => toggleSort('contact_name')}>Contact<SortIcon field="contact_name" /></th>}
                  {visibleCols.stage       && <th style={th} onClick={() => toggleSort('stage_position')}>Stage<SortIcon field="stage_position" /></th>}
                  {visibleCols.age         && <th style={th} onClick={() => toggleSort('days_in_stage')} title="Days in current stage">Age<SortIcon field="days_in_stage" /></th>}
                  {visibleCols.owner       && isManager && <th style={th} onClick={() => toggleSort('owner_name')}>Owner<SortIcon field="owner_name" /></th>}
                  {visibleCols.value       && <th style={{ ...th, textAlign: 'right' }} onClick={() => toggleSort('expected_value')}>Value<SortIcon field="expected_value" /></th>}
                  {visibleCols.probability && <th style={{ ...th, textAlign: 'right' }} onClick={() => toggleSort('probability')}>Prob %<SortIcon field="probability" /></th>}
                  {visibleCols.close       && <th style={th} onClick={() => toggleSort('expected_close_date')}>Close<SortIcon field="expected_close_date" /></th>}
                  {visibleCols.status      && <th style={th} onClick={() => toggleSort('status')}>Status<SortIcon field="status" /></th>}
                  {visibleCols.updated     && <th style={th} onClick={() => toggleSort('updated_at')}>Updated<SortIcon field="updated_at" /></th>}
                  {visibleCols.created     && <th style={th} onClick={() => toggleSort('created_at')}>Created<SortIcon field="created_at" /></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => {
                  const stageColor = STAGE_COLOR[d.stage_name] ?? 'var(--border-strong)'
                  const statusStyle = STATUS_COLOR[d.status] ?? STATUS_COLOR.Open
                  const isOverdue = d.expected_close_date && d.status === 'Open'
                    && new Date(d.expected_close_date) < new Date()
                  return (
                    <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/deals/${d.id}`)}>
                      {/* # */}
                      {visibleCols.num && <td>
                        {d.deal_number
                          ? <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--green-text)', fontWeight: 600 }}>
                              DEAL-{d.deal_number}
                            </span>
                          : <span className="text-gray text-sm">—</span>
                        }
                      </td>}
                      {/* title */}
                      {visibleCols.title && <td>
                        <div className="flex items-center gap-6">
                          <div className="font-semi" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.title}
                          </div>
                          {d.description && (
                            <span title={d.description}
                              style={{ flexShrink: 0, fontSize: 13, color: 'var(--text-3)', cursor: 'default', lineHeight: 1 }}>⋯</span>
                          )}
                        </div>
                      </td>}
                      {/* contact */}
                      {visibleCols.contact && <td>
                        <div className="text-sm">{d.contact_name ?? '—'}</div>
                        {d.contact_company && <div className="text-gray" style={{ fontSize: 11, marginTop: 1 }}>{d.contact_company}</div>}
                      </td>}
                      {/* stage */}
                      {visibleCols.stage && <td>
                        <div className="flex items-center gap-6">
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: stageColor, flexShrink: 0 }} />
                          <span className="text-sm">{d.stage_name}</span>
                        </div>
                      </td>}
                      {/* stage age #53 */}
                      {visibleCols.age && <td>
                        {d.days_in_stage != null && d.status === 'Open' && (
                          <span title={`${d.days_in_stage} days in ${d.stage_name}`} style={{
                            fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                            background: d.days_in_stage >= 30 ? 'rgba(239,68,68,0.1)' : d.days_in_stage >= 15 ? 'rgba(245,158,11,0.1)' : 'var(--bg-2)',
                            color: d.days_in_stage >= 30 ? '#ef4444' : d.days_in_stage >= 15 ? '#F59E0B' : 'var(--text-3)',
                          }}>{d.days_in_stage}d</span>
                        )}
                      </td>}
                      {/* owner */}
                      {visibleCols.owner && isManager && <td className="text-sm text-gray">{d.owner_name}</td>}
                      {/* value */}
                      {visibleCols.value && <td style={{ textAlign: 'right' }}>
                        <span className="mono text-sm">{fmt(d.expected_value)}</span>
                      </td>}
                      {/* probability */}
                      {visibleCols.probability && <td style={{ textAlign: 'right' }}>
                        <span className="text-sm text-gray">{d.probability != null ? `${d.probability}%` : '—'}</span>
                      </td>}
                      {/* close date */}
                      {visibleCols.close && <td>
                        <span className="text-sm" style={isOverdue ? { color: '#62c0d5', fontWeight: 600 } : { color: 'var(--text-3)' }}>
                          {fmtDate(d.expected_close_date)}{isOverdue ? ' !' : ''}
                        </span>
                      </td>}
                      {/* status */}
                      {visibleCols.status && <td>
                        <span style={{
                          fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
                          padding: '2px 8px', borderRadius: 4,
                          color: statusStyle.color, background: statusStyle.bg,
                        }}>{d.status}</span>
                      </td>}
                      {/* updated */}
                      {visibleCols.updated && <td className="text-sm text-gray" style={{ whiteSpace: 'nowrap' }}>
                        {fmtUpdated(d.updated_at)}
                      </td>}
                      {/* created */}
                      {visibleCols.created && <td className="text-sm text-gray" style={{ whiteSpace: 'nowrap' }}>
                        {fmtDate(d.created_at)}
                      </td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>)}

      {/* ── Load More ── */}
      {!loading && deals.length < dealTotal && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button
            className="btn btn-outline"
            onClick={loadMore}
            disabled={loadingMore}
            style={{ minWidth: 160 }}
          >
            {loadingMore ? 'Loading…' : `Load more (${deals.length} of ${dealTotal})`}
          </button>
        </div>
      )}

      {showCreate && (
        <CreateDealModal
          contacts={contacts}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}

/* ── Kanban View ─────────────────────────────────────── */
const WIP_LIMIT = 10 // #55 — deals per stage before warning

function KanbanView({ filtered, stages, isManager, userRole, fmt, fmtDate, navigate, onMoved }) {
  const draggingRef = useRef(null)
  const [dragOverStage, setDragOverStage] = useState(null)
  const [moveError,     setMoveError]     = useState(null) // { msg, id }

  const isSDR = userRole === 'SDR'
  // SDR ceiling: stages at position > 3 and terminal stages are locked for SDRs
  const sdrLocked = (stage) => isSDR && (stage.position > 3 || stage.is_terminal)

  const stageDeals = useMemo(() => {
    const map = {}
    stages.forEach(s => { map[s.id] = [] })
    const wonStage  = stages.find(s => s.name === 'Won')
    const lostStage = stages.find(s => s.name === 'Lost')
    filtered.forEach(d => {
      // Force Won/Lost deals into their correct terminal columns regardless of stage_id
      if (d.status === 'Won'  && wonStage)  { map[wonStage.id].push(d);  return }
      if (d.status === 'Lost' && lostStage) { map[lostStage.id].push(d); return }
      if (map[d.stage_id] !== undefined) map[d.stage_id].push(d)
    })
    return map
  }, [filtered, stages])

  const stageValue = (stageId) => (stageDeals[stageId] ?? [])
    .filter(d => d.status !== 'Lost')
    .reduce((s, d) => s + parseFloat(d.expected_value ?? 0), 0)

  async function handleDrop(stage) {
    const deal = draggingRef.current
    draggingRef.current = null
    setDragOverStage(null)
    if (!deal || deal.stage_id === stage.id) return
    if (sdrLocked(stage)) return
    if (deal.status !== 'Open') return
    if (!stage.is_terminal && stage.position < deal.stage_position) return
    try {
      await api.patch(`/deals/${deal.id}`, { stage_id: stage.id })
      onMoved()
    } catch (e) {
      setMoveError({ id: deal.id, msg: e.response?.data?.error ?? 'Move failed.' })
      setTimeout(() => setMoveError(null), 5000)
    }
  }

  const STAGE_COLOR = { New:'#74ba89', Contacted:'#3B82F6', Qualified:'#8B5CF6', Proposal:'#F59E0B', Negotiation:'#62c0d5', Won:'#22C55E', Lost:'#ef4444' }

  return (
    <div>
      {moveError && (
        <div style={{
          margin: '0 0 12px', padding: '10px 14px', borderRadius: 6,
          background: 'rgba(239,68,68,0.1)', border: '1px solid #62c0d5',
          color: '#62c0d5', fontSize: 13, fontWeight: 500,
        }}>
          {moveError.msg}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start' }}>
        {stages.map(stage => {
          const color    = STAGE_COLOR[stage.name] ?? '#74ba89'
          const cards    = stageDeals[stage.id] ?? []
          const val      = stageValue(stage.id)
          const isOver   = dragOverStage === stage.id
          const locked   = sdrLocked(stage)
          return (
            <div key={stage.id}
              onDragOver={e => { if (!locked) { e.preventDefault(); setDragOverStage(stage.id) } }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverStage(null) }}
              onDrop={() => handleDrop(stage)}
              style={{
                minWidth: 248, width: 248, flexShrink: 0,
                background: locked ? 'var(--bg)' : isOver ? `${color}18` : 'var(--bg-2)',
                border: `2px solid ${isOver && !locked ? color : 'transparent'}`,
                borderTop: `3px solid ${locked ? 'var(--border)' : color}`,
                borderRadius: 10, display: 'flex', flexDirection: 'column',
                boxShadow: 'var(--shadow-sm)',
                opacity: locked ? 0.45 : 1,
                transition: 'border-color 0.15s, background 0.15s, opacity 0.15s',
              }}
            >
              {/* Column header */}
              <div style={{ padding: '10px 12px 9px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: val > 0 ? 4 : 0 }}>
                  <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 0 2px ${color}30` }} />
                  <span style={{ fontWeight: 800, fontSize: 11, color: 'var(--text)', letterSpacing: '0.07em' }}>
                    {stage.name.toUpperCase()}
                  </span>
                  <span style={{
                    marginLeft: 'auto',
                    minWidth: 22, textAlign: 'center',
                    background: cards.length > WIP_LIMIT ? '#F59E0B' : color,
                    color: '#fff',
                    borderRadius: 999,
                    fontSize: 11, fontWeight: 700, padding: '1px 8px',
                    boxShadow: `0 1px 4px ${cards.length > WIP_LIMIT ? '#F59E0B' : color}55`,
                  }} title={cards.length > WIP_LIMIT ? `⚠ WIP limit: ${cards.length}/${WIP_LIMIT} deals` : undefined}>
                    {cards.length > WIP_LIMIT ? `⚠ ${cards.length}` : cards.length}
                  </span>
                </div>
                {val > 0 && (
                  <div style={{ fontSize: 11, color, fontWeight: 700, paddingLeft: 16, opacity: 0.85 }}>
                    {fmt(val)}
                  </div>
                )}
              </div>

              {/* Cards */}
              <div style={{ padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 80, maxHeight: '70vh', overflowY: 'auto' }}>
                {cards.map(d => {
                  const isOverdue  = d.expected_close_date && d.status === 'Open'
                    && new Date(d.expected_close_date) < new Date()
                  const hasError   = moveError?.id === d.id
                  const isDraggable = d.status === 'Open' && !locked
                  return (
                    <div key={d.id}
                      draggable={isDraggable}
                      onDragStart={() => { if (isDraggable) draggingRef.current = d }}
                      onDragEnd={() => { draggingRef.current = null; setDragOverStage(null) }}
                      onClick={() => navigate(`/deals/${d.id}`)}
                      style={{
                        background: 'var(--bg-card)', border: `1px solid ${hasError ? '#62c0d5' : 'var(--border)'}`,
                        borderLeft: `3px solid ${d.status === 'Won' ? '#22C55E' : d.status === 'Lost' ? '#ef4444' : color}`,
                        borderRadius: 7, padding: '9px 10px', cursor: isDraggable ? 'grab' : 'pointer',
                        opacity: d.status !== 'Open' ? 0.7 : 1,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                        transition: 'box-shadow 0.12s',
                        userSelect: 'none',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.15)' }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)' }}
                    >
                      {/* deal number + aging #53 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        {d.deal_number && (
                          <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--green-text)', fontWeight: 700 }}>
                            DEAL-{d.deal_number}
                          </span>
                        )}
                        {d.days_in_stage >= 15 && d.status === 'Open' && (
                          <span title={`${d.days_in_stage} days in stage`} style={{
                            fontSize: 9, fontWeight: 700,
                            color: d.days_in_stage >= 30 ? '#ef4444' : '#F59E0B',
                          }}>⏱ {d.days_in_stage}d</span>
                        )}
                      </div>
                      {/* title */}
                      <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)', lineHeight: 1.35, marginBottom: 5, wordBreak: 'break-word' }}>
                        {d.title}
                      </div>
                      {/* contact */}
                      {d.contact_name && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0 }}>
                            <path strokeLinecap="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.contact_name}{d.contact_company ? ` · ${d.contact_company}` : ''}
                          </span>
                        </div>
                      )}
                      {/* footer row: value + close date */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace' }}>
                          {fmt(d.expected_value)}
                        </span>
                        {d.expected_close_date && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: isOverdue ? '#62c0d5' : 'var(--text-3)' }}>
                            {fmtDate(d.expected_close_date)}{isOverdue ? ' !' : ''}
                          </span>
                        )}
                      </div>
                      {/* probability bar */}
                      {d.probability != null && d.probability !== '' && (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${d.probability}%`, background: color, borderRadius: 2, transition: 'width 0.3s' }} />
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2, textAlign: 'right' }}>{d.probability}%</div>
                        </div>
                      )}
                      {/* owner badge (managers) */}
                      {isManager && d.owner_name && (
                        <div style={{ marginTop: 5, fontSize: 10, color: 'var(--text-3)', textAlign: 'right' }}>{d.owner_name}</div>
                      )}
                    </div>
                  )
                })}
                {cards.length === 0 && (
                  <div style={{ color: 'var(--text-3)', fontSize: 12, textAlign: 'center', padding: '20px 0', opacity: 0.5 }}>
                    No deals
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Create Deal Modal (Jira-style) ──────────────────── */
function CreateDealModal({ contacts, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: '', description: '', contact_id: '',
    expected_value: '', expected_close_date: '', probability: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // templates
  const [templates,       setTemplates]       = useState([])
  const [selectedTpl,     setSelectedTpl]     = useState('')

  useEffect(() => {
    api.get('/deal-templates').then(r => setTemplates(r.data)).catch(() => {})
  }, [])

  function applyTemplate(tplId) {
    setSelectedTpl(tplId)
    if (!tplId) return
    const tpl = templates.find(t => t.id === tplId)
    if (!tpl) return
    setForm(f => ({
      ...f,
      title:          tpl.title,
      description:    tpl.description ?? '',
      expected_value: tpl.expected_value ?? '',
      probability:    tpl.probability   ?? '',
    }))
  }

  const [contactSearch,   setContactSearch]   = useState('')
  const [contactDropOpen, setContactDropOpen] = useState(false)
  const [selectedContact, setSelectedContact] = useState(null)

  const filteredContacts = contacts.filter(c =>
    `${c.full_name} ${c.company ?? ''}`.toLowerCase().includes(contactSearch.toLowerCase())
  )

  function pickContact(c) {
    setSelectedContact(c)
    set('contact_id', c.id)
    setContactSearch(c.full_name + (c.company ? ` · ${c.company}` : ''))
    setContactDropOpen(false)
  }

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!form.contact_id) { setError('Please select a contact.'); return }
    setError('')
    setSaving(true)
    try {
      await api.post('/deals', form)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to create deal.')
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onMouseDown={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: '100%', maxWidth: 700,
        background: 'var(--bg-card)',
        borderRadius: 'var(--rounded-lg, 10px)',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg-2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="var(--green-text)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z" />
            </svg>
            <div>
              <div className="modal-title" style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Create Deal</div>
              <div className="text-sm text-gray" style={{ marginTop: 1 }}>New deals start at the <strong>New</strong> stage</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} style={{ fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        <form onSubmit={submit}>
          <div style={{ display: 'flex', minHeight: 320 }}>
            <div style={{ flex: 1, padding: '20px 24px', borderRight: '1px solid var(--border)' }}>
              {error && <div className="login-form-error" style={{ marginBottom: 14 }}>{error}</div>}
              <div className="input-group" style={{ marginBottom: 18 }}>
                <label className="input-label">Summary *</label>
                <input className="input" type="text" required autoFocus
                  style={{ fontSize: 15, fontWeight: 600 }}
                  placeholder="e.g. Acme Corp — Enterprise License"
                  value={form.title} onChange={e => set('title', e.target.value)} />
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label">Description</label>
                <textarea className="input" rows={6}
                  style={{ height: 'auto', resize: 'vertical', paddingTop: 8, fontSize: 13 }}
                  placeholder="Add context, goals, or background on this deal…"
                  value={form.description} onChange={e => set('description', e.target.value)} />
              </div>
            </div>

            <div style={{ width: 220, flexShrink: 0, padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {templates.length > 0 && (
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label">From Template</label>
                  <select className="input" style={{ fontSize: 13 }}
                    value={selectedTpl} onChange={e => applyTemplate(e.target.value)}>
                    <option value="">— none —</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              <div className="input-group" style={{ marginBottom: 0, position: 'relative' }}>
                <label className="input-label">Contact *</label>
                <input className="input" placeholder="Search contacts…"
                  value={contactSearch}
                  onChange={e => {
                    setContactSearch(e.target.value)
                    setContactDropOpen(true)
                    if (selectedContact) { setSelectedContact(null); set('contact_id', '') }
                  }}
                  onFocus={() => setContactDropOpen(true)}
                  onBlur={() => setTimeout(() => setContactDropOpen(false), 150)}
                  autoComplete="off" style={{ fontSize: 13 }} />
                {contactDropOpen && filteredContacts.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 'var(--rounded-md)', boxShadow: 'var(--shadow-lg)',
                    maxHeight: 180, overflowY: 'auto', marginTop: 2,
                  }}>
                    {filteredContacts.map(c => (
                      <div key={c.id} onMouseDown={() => pickContact(c)}
                        className="contact-option"
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                        <div className="font-semi" style={{ fontSize: 13 }}>{c.full_name}</div>
                        {c.company && <div className="text-gray" style={{ fontSize: 11 }}>{c.company}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label">Value ($)</label>
                <input className="input" type="number" min="0" step="0.01"
                  placeholder="e.g. 25000" value={form.expected_value}
                  onChange={e => set('expected_value', e.target.value)} style={{ fontSize: 13 }} />
              </div>

              <div className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label">Close Date <span className="text-gray">(optional)</span></label>
                <input className="input" type="date" value={form.expected_close_date}
                  onChange={e => set('expected_close_date', e.target.value)} style={{ fontSize: 13 }} />
              </div>

              <div className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label">Probability (%) <span className="text-gray">(optional)</span></label>
                <input className="input" type="number" min="0" max="100" step="1"
                  placeholder="e.g. 20" value={form.probability}
                  onChange={e => set('probability', e.target.value)} style={{ fontSize: 13 }} />
              </div>

              <div className="input-group" style={{ marginBottom: 0 }}>
                <label className="input-label">Stage</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#74ba89', flexShrink: 0 }} />
                  <span className="font-semi text-sm">New</span>
                  <span className="text-gray" style={{ fontSize: 11 }}>(auto-assigned)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', padding: '14px 24px' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" /> : 'Create Deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
