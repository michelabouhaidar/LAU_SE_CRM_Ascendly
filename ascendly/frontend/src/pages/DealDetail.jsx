import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import UserAvatar from '../components/UserAvatar'

const STAGES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost']
const SDR_STAGES = ['New', 'Contacted', 'Qualified']

const INTERACTION_TYPE_COLOR = { Call: '#3B82F6', Email: '#8B5CF6', Meeting: '#F59E0B' }
const TASK_STATUS_COLOR = { Open: '#62c0d5', 'In Progress': '#F59E0B', Done: '#22C55E' }
const STAGE_COLOR = { New: '#74ba89', Contacted: '#3B82F6', Qualified: '#8B5CF6', Proposal: '#F59E0B', Negotiation: '#62c0d5', Won: '#22C55E', Lost: '#ef4444' }
const DEAL_STATUS_COLOR = { Open: '#3B82F6', Won: '#22C55E', Lost: '#ef4444' }

const Chip = ({ color, label }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '2px 8px', borderRadius: 5,
    background: `${color}18`,
    fontSize: 11, fontWeight: 700, color, letterSpacing: '0.03em',
  }}>
    {label}
  </span>
)

function DescriptionBanner({ text }) {
  const [expanded, setExpanded] = useState(false)
  const LIMIT = 180
  const isLong = text.length > LIMIT
  const shown  = expanded || !isLong ? text : text.slice(0, LIMIT).trimEnd() + '…'
  return (
    <div style={{
      background: 'var(--bg-subtle)', border: '1px solid var(--border)',
      borderRadius: 'var(--rounded-md)', padding: '12px 16px', marginBottom: 16,
      fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 8 }}>Description</span>
      {shown}
      {isLong && (
        <button onClick={() => setExpanded(e => !e)}
          style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green-text)', fontSize: 12, fontWeight: 600, padding: 0 }}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

export default function DealDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [deal,         setDeal]         = useState(null)
  const [interactions, setInteractions] = useState([])
  const [tasks,        setTasks]        = useState([])
  const [stages,       setStages]       = useState([])
  const [history,      setHistory]      = useState([])
  const [users,        setUsers]        = useState([])
  const [comments,     setComments]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [leftTab,      setLeftTab]      = useState('timeline')

  const [showInteraction,    setShowInteraction]    = useState(false)
  const [showWon,            setShowWon]            = useState(false)
  const [showLost,           setShowLost]           = useState(false)
  const [showApproval,       setShowApproval]       = useState(false)
  const [showTask,           setShowTask]           = useState(false)
  const [showReassign,       setShowReassign]       = useState(false)
  const [showAssign,         setShowAssign]         = useState(false)
  const [showSaveTemplate,   setShowSaveTemplate]   = useState(false)
  const [cloning,            setCloning]            = useState(false)

  
  const [editingInfo, setEditingInfo] = useState(false)
  const [editForm,    setEditForm]    = useState({})
  const setEF = (k, v) => setEditForm(f => ({ ...f, [k]: v }))

  function startEdit() {
    setEditForm({
      title:               deal.title,
      description:         deal.description          ?? '',
      expected_value:      deal.expected_value        ?? '',
      probability:         deal.probability           ?? '',
      expected_close_date: deal.expected_close_date
        ? deal.expected_close_date.slice(0, 10) : '',
    })
    setEditingInfo(true)
  }

  async function saveEdit() {
    setSaving(true)
    setError('')
    try {
      await api.patch(`/deals/${id}`, {
        _updated_at:         deal.updated_at,
        title:               editForm.title               || undefined,
        description:         editForm.description         || undefined,
        expected_value:      editForm.expected_value      || undefined,
        probability:         editForm.probability         || undefined,
        expected_close_date: editForm.expected_close_date || undefined,
      })
      setEditingInfo(false)
      load()
    } catch (e) {
      if (e.response?.data?.code === 'CONFLICT') {
        setError('This deal was modified by someone else while you were editing. Close and reload to see the latest version.')
      } else {
        setError(e.response?.data?.error ?? 'Failed to save changes.')
      }
    } finally { setSaving(false) }
  }

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const canEdit   = ['Admin', 'Sales Manager', 'Sales Rep', 'SDR'].includes(user?.role)
  const isManager = ['Admin', 'Sales Manager'].includes(user?.role)
  const isSDR     = user?.role === 'SDR'
  const isSalesRep = user?.role === 'Sales Rep'

  const allowedStages = isSDR ? SDR_STAGES
    : isManager ? STAGES
    : STAGES.filter(s => s !== 'Won' && s !== 'Lost')

  const load = useCallback(() => {
    Promise.all([
      api.get(`/deals/${id}`),
      api.get(`/deals/${id}/interactions`),
      api.get(`/tasks?deal_id=${id}`),
      api.get('/pipeline-stages'),
      api.get(`/deals/${id}/stage-history`).catch(() => ({ data: [] })),
      isManager ? api.get('/users').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      api.get(`/deals/${id}/comments`).catch(() => ({ data: [] })),
    ]).then(([d, i, t, s, h, u, c]) => {
      setDeal(d.data)
      setInteractions(i.data)
      setTasks(t.data.data ?? t.data)
      setStages(s.data)
      setHistory(h.data)
      setUsers(u.data)
      setComments(c.data)
    }).catch(() => navigate('/deals'))
      .finally(() => setLoading(false))
  }, [id, navigate, isManager])

  useEffect(() => { load() }, [load])

  const fmt = (n) => {
    if (!n && n !== 0) return '—'
    const num = parseFloat(n)
    return num >= 1_000_000 ? `$${parseFloat((num / 1_000_000).toFixed(2))}M`
      : num >= 1_000 ? `$${parseFloat((num / 1_000).toFixed(2))}K`
      : `$${parseFloat(num.toFixed(2))}`
  }

  const fmtDate = (d) => d
    ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  const fmtDateTime = (d) => d
    ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'

  async function moveStage(stageName) {
    const stage = stages.find(s => s.name === stageName)
    if (!stage) return
    setSaving(true)
    try {
      await api.patch(`/deals/${id}`, { stage_id: stage.id, probability: stage.default_probability })
      load()
    } catch (e) {
      const msg = e.response?.data?.error ?? 'Failed to update stage.'
      setError(msg)
      
      if (msg.includes('Required for this stage') && !editingInfo && canEdit && deal.status === 'Open') {
        startEdit()
      }
    } finally { setSaving(false) }
  }

  async function cloneDeal() {
    setCloning(true)
    try {
      const { data } = await api.post(`/deals/${id}/clone`)
      navigate(`/deals/${data.id}`)
    } catch (e) {
      setError(e.response?.data?.error ?? 'Failed to clone deal.')
      setCloning(false)
    }
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>
      Loading deal…
    </div>
  )
  if (!deal) return null

  const stageIndex = STAGES.indexOf(deal.stage_name)
  const isQualified = deal.stage_name === 'Qualified'
  const canAssignSDR = isSDR && isQualified && deal.status === 'Open'

  return (
    <div>
      {}
      <div className="page-header">
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>
            <Link to="/deals" style={{ color: 'var(--green-text)', fontWeight: 600 }}>← Pipeline</Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {deal.deal_number && (
              <span style={{
                fontSize: 12, fontWeight: 700, letterSpacing: '0.05em',
                color: 'var(--green-text)', background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: 5, padding: '2px 8px',
                fontFamily: 'monospace',
              }}>DEAL-{deal.deal_number}</span>
            )}
            {deal.is_overdue && (
              <span title="Past expected close date" style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                color: '#ef4444', background: 'rgba(239,68,68,0.10)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 5, padding: '2px 8px',
              }}>⚠ Overdue</span>
            )}
            <div className="page-title">{deal.title}</div>
          </div>
          <div className="page-subtitle">
            {deal.contact_name} · Owned by {deal.owner_name}
          </div>
        </div>
        <div className="flex items-center gap-8" style={{ flexWrap: 'wrap' }}>
          {}
          {canEdit && (
            <button className="btn btn-ghost" onClick={cloneDeal} disabled={cloning}
              title="Create a copy of this deal at the first pipeline stage">
              {cloning ? <span className="spinner" /> : '⎘ Clone'}
            </button>
          )}
          {isManager && (
            <button className="btn btn-ghost" onClick={() => setShowSaveTemplate(true)}
              title="Save this deal as a reusable template">
              ⊞ Save as Template
            </button>
          )}
          {canEdit && deal.status === 'Open' && (
            <>
              <button className="btn btn-ghost" onClick={() => setShowTask(true)}>+ Task</button>
              {!isSDR && (
                <button className="btn btn-ghost" onClick={() => setShowApproval(true)}>Request Approval</button>
              )}
              {canAssignSDR && (
                <button className="btn btn-ghost" onClick={() => setShowAssign(true)}>Assign to Rep</button>
              )}
              <button className="btn btn-outline" onClick={() => setShowLost(true)}>Mark Lost</button>
              <button className="btn btn-primary" onClick={() => setShowWon(true)}>Mark Won ✓</button>
            </>
          )}
          {deal.status !== 'Open' && (
            <Chip color={deal.status === 'Won' ? '#22C55E' : '#ef4444'} label={deal.status} />
          )}
        </div>
      </div>

      {error && (
        <div className="login-form-error" style={{ marginBottom: 16 }}>{error}</div>
      )}

      {}
      {deal.description && <DescriptionBanner text={deal.description} />}

      {}
      {deal.status === 'Open' && (
        <div className="detail-section" style={{ marginBottom: 20 }}>
          <div className="detail-section-title">Pipeline Stage</div>
          <div className="stage-flow">
            {STAGES.filter(s => s !== 'Won' && s !== 'Lost').map((s, idx) => {
              const isCurrent = s === deal.stage_name
              const isPast = idx < stageIndex
              const isAllowed = allowedStages.includes(s) && !isCurrent
              return (
                <button
                  key={s}
                  className={`stage-pill${isCurrent ? ' current' : ''}`}
                  disabled={!isAllowed || saving || !canEdit}
                  onClick={() => moveStage(s)}
                  style={isPast ? { opacity: 0.5 } : {}}
                >
                  {isCurrent && '● '}{s}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {}
      <div className="detail-grid">
        {}
        <div>
          <div className="admin-tab-bar" style={{ marginBottom: 14 }}>
            {[
              { key: 'timeline',     label: 'Timeline' },
              { key: 'comments',     label: `Comments (${comments.length})` },
              { key: 'interactions', label: `Interactions (${interactions.length})` },
              { key: 'tasks',        label: `Tasks (${tasks.length})` },
              { key: 'history',      label: 'Stage History' },
            ].map(t => (
              <button key={t.key}
                className={`admin-tab${leftTab === t.key ? ' active' : ''}`}
                onClick={() => setLeftTab(t.key)}>{t.label}</button>
            ))}
          </div>

          {}
          {leftTab === 'comments' && (
            <CommentsPanel
              dealId={id}
              comments={comments}
              users={users}
              currentUser={user}
              onRefresh={() => api.get(`/deals/${id}/comments`).then(r => setComments(r.data)).catch(() => {})}
            />
          )}

          {}
          {leftTab === 'timeline' && (
            <DealTimeline
              deal={deal}
              history={history}
              interactions={interactions}
              tasks={tasks}
              fmtDate={fmtDate}
              fmtDateTime={fmtDateTime}
            />
          )}

          {}
          {leftTab === 'interactions' && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">Interaction Log</span>
                {canEdit && deal.status === 'Open' && (
                  <button className="btn btn-sm btn-ghost-green" onClick={() => setShowInteraction(true)}>
                    + Log
                  </button>
                )}
              </div>
              <div style={{ padding: '0 20px' }}>
                {interactions.length === 0 ? (
                  <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                    No interactions logged yet.
                  </div>
                ) : interactions.map(i => (
                  <div key={i.id} className="interaction-item">
                    <div className="interaction-header">
                      <Chip color={INTERACTION_TYPE_COLOR[i.type] ?? '#74ba89'} label={i.type} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <UserAvatar name={i.logged_by_name} size={22} />
                        <span className="interaction-date">{fmtDateTime(i.occurred_at)} · {i.logged_by_name}</span>
                      </div>
                    </div>
                    <div className="interaction-summary">{i.summary}</div>
                    {i.next_step && <div className="interaction-next">→ Next: {i.next_step}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {}
          {leftTab === 'tasks' && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">Linked Tasks</span>
                {canEdit && (
                  <button className="btn btn-sm btn-ghost-green" onClick={() => setShowTask(true)}>+ Add</button>
                )}
              </div>
              {tasks.length === 0 ? (
                <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                  No tasks linked to this deal.
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Task</th><th>Assignee</th><th>Due</th><th>Status</th></tr></thead>
                    <tbody>
                      {tasks.map(t => {
                        const overdue = t.due_date && t.status !== 'Done' && new Date(t.due_date) < new Date()
                        return (
                          <tr key={t.id}>
                            <td><div className="font-semi">{t.title}</div></td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <UserAvatar name={t.assigned_to_name} size={22} />
                                <span className="text-sm">{t.assigned_to_name ?? '—'}</span>
                              </div>
                            </td>
                            <td className="text-sm" style={overdue ? { color: 'var(--red)', fontWeight: 600 } : { color: 'var(--text-3)' }}>
                              {fmtDate(t.due_date)}
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
              )}
            </div>
          )}

          {}
          {leftTab === 'history' && (
            <div className="card" style={{ padding: '20px' }}>
              <div className="card-title" style={{ marginBottom: 20 }}>Stage History</div>
              {history.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: '20px 0' }}>
                  No stage changes recorded yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <div style={{ display: 'flex', gap: 14, paddingBottom: 18 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--green)', marginTop: 3, flexShrink: 0 }} />
                      <div style={{ width: 2, flex: 1, background: 'var(--border)', marginTop: 4 }} />
                    </div>
                    <div style={{ paddingBottom: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Deal created</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{fmtDateTime(deal.created_at)}</div>
                    </div>
                  </div>
                  {history.map((h, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 14, paddingBottom: idx < history.length - 1 ? 18 : 0 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--border-strong)', marginTop: 3, flexShrink: 0 }} />
                        {idx < history.length - 1 && <div style={{ width: 2, flex: 1, background: 'var(--border)', marginTop: 4 }} />}
                      </div>
                      <div style={{ paddingBottom: 4, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          {h.from_stage ? `${h.from_stage} → ${h.to_stage}` : `→ ${h.to_stage}`}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
                          <UserAvatar name={h.moved_by} size={20} />
                          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{fmtDateTime(h.moved_at)} · {h.moved_by}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {}
        <div>
          <div className="detail-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div className="detail-section-title" style={{ marginBottom: 0 }}>Deal Info</div>
              {canEdit && deal.status === 'Open' && !editingInfo && (
                <button onClick={startEdit} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
                  background: 'none', border: '1px solid var(--border)',
                  borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--green-text)'; e.currentTarget.style.borderColor = 'var(--green)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                >
                  <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828A2 2 0 0110 16H8v-2a2 2 0 01.586-1.414L9 13z" />
                  </svg>
                  Edit
                </button>
              )}
            </div>

            {editingInfo ? (
              <div>
                <div className="input-group" style={{ marginBottom: 10 }}>
                  <label className="input-label" style={{ fontSize: 11 }}>Title</label>
                  <input className="input" style={{ height: 30, fontSize: 13 }}
                    value={editForm.title}
                    onChange={e => setEF('title', e.target.value)} />
                </div>
                <div className="input-group" style={{ marginBottom: 10 }}>
                  <label className="input-label" style={{ fontSize: 11 }}>Description</label>
                  <textarea className="input" rows={3}
                    style={{ height: 'auto', fontSize: 12, paddingTop: 6, resize: 'vertical' }}
                    value={editForm.description}
                    onChange={e => setEF('description', e.target.value)} />
                </div>
                <div className="input-group" style={{ marginBottom: 10 }}>
                  <label className="input-label" style={{ fontSize: 11 }}>Expected Value ($)</label>
                  <input className="input" type="number" min="0" step="0.01"
                    style={{ height: 30, fontSize: 13 }}
                    value={editForm.expected_value}
                    onChange={e => setEF('expected_value', e.target.value)} />
                </div>
                <div className="input-group" style={{ marginBottom: 10 }}>
                  <label className="input-label" style={{ fontSize: 11 }}>Probability (%)</label>
                  <input className="input" type="number" min="0" max="100"
                    style={{ height: 30, fontSize: 13 }}
                    value={editForm.probability}
                    onChange={e => setEF('probability', e.target.value)} />
                </div>
                <div className="input-group" style={{ marginBottom: 12 }}>
                  <label className="input-label" style={{ fontSize: 11 }}>Close Date</label>
                  <input className="input" type="date"
                    style={{ height: 30, fontSize: 13 }}
                    value={editForm.expected_close_date}
                    onChange={e => setEF('expected_close_date', e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button className="btn btn-sm btn-ghost"
                    onClick={() => setEditingInfo(false)} disabled={saving}>
                    Cancel
                  </button>
                  <button className="btn btn-sm btn-primary"
                    onClick={saveEdit} disabled={saving || !editForm.title?.trim()}>
                    {saving ? <span className="spinner" /> : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="detail-field"><label>Stage</label><Chip color={STAGE_COLOR[deal.stage_name] ?? '#74ba89'} label={deal.stage_name} /></div>
                <div className="detail-field"><label>Status</label><Chip color={DEAL_STATUS_COLOR[deal.status] ?? '#74ba89'} label={deal.status} /></div>
                <div className="detail-field"><label>Expected Value</label><span className="mono font-bold">{fmt(deal.expected_value)}</span></div>
                <div className="detail-field"><label>Probability</label><span>{deal.probability != null ? `${deal.probability}%` : '—'}</span></div>
                <div className="detail-field"><label>Close Date</label><span>{fmtDate(deal.expected_close_date)}</span></div>
                {deal.status !== 'Open' && (
                  <>
                    <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      {deal.status === 'Won' ? 'Outcome' : 'Close Info'}
                    </div>
                    <div className="detail-field"><label>Final Value</label><span className="mono font-bold">{fmt(deal.final_value)}</span></div>
                    <div className="detail-field"><label>Contract Date</label><span>{fmtDate(deal.contract_date)}</span></div>
                    {deal.lost_reason && <div className="detail-field"><label>Lost Reason</label><span style={{ color: 'var(--red)' }}>{deal.lost_reason}</span></div>}
                  </>
                )}
              </>
            )}
          </div>

          <div className="detail-section">
            <div className="detail-section-title">Contact</div>
            <div className="detail-field">
              <label>Name</label>
              <span>
                <Link to={`/contacts/${deal.contact_id}`} style={{ color: 'var(--green-text)', fontWeight: 600 }}>
                  {deal.contact_name}
                </Link>
              </span>
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-title">Ownership</div>
            <div className="detail-field">
              <label>Owner</label>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {deal.owner_name}
                {isManager && deal.status === 'Open' && (
                  <button className="btn btn-sm btn-ghost" style={{ padding: '2px 8px', fontSize: 11 }}
                    onClick={() => setShowReassign(true)}>Reassign</button>
                )}
              </span>
            </div>
            {canAssignSDR && (
              <div className="detail-field">
                <label></label>
                <button className="btn btn-sm btn-ghost-green" onClick={() => setShowAssign(true)}>
                  Assign to Sales Rep →
                </button>
              </div>
            )}
            <div className="detail-field"><label>Created</label><span>{fmtDate(deal.created_at)}</span></div>
            <div className="detail-field"><label>Updated</label><span>{fmtDate(deal.updated_at)}</span></div>
          </div>
        </div>
      </div>

      {}
      {showInteraction && (
        <LogInteractionModal dealId={id} onClose={() => setShowInteraction(false)} onSaved={() => { setShowInteraction(false); load() }} />
      )}
      {showWon && (
        <MarkWonModal dealId={id} onClose={() => setShowWon(false)} onSaved={() => { setShowWon(false); load() }} />
      )}
      {showLost && (
        <MarkLostModal dealId={id} onClose={() => setShowLost(false)} onSaved={() => { setShowLost(false); load() }} />
      )}
      {showApproval && (
        <ApprovalModal dealId={id} onClose={() => setShowApproval(false)} onSaved={() => { setShowApproval(false); load() }} />
      )}
      {showTask && (
        <AddTaskModal dealId={id} onClose={() => setShowTask(false)} onSaved={() => { setShowTask(false); load() }} />
      )}
      {showReassign && (
        <ReassignModal dealId={id} users={users} currentOwnerId={deal.owner_id}
          onClose={() => setShowReassign(false)} onSaved={() => { setShowReassign(false); load() }} />
      )}
      {showAssign && (
        <AssignToRepModal dealId={id} onClose={() => setShowAssign(false)} onSaved={() => { setShowAssign(false); navigate('/deals') }} />
      )}
      {showSaveTemplate && (
        <SaveTemplateModal deal={deal} onClose={() => setShowSaveTemplate(false)} onSaved={() => setShowSaveTemplate(false)} />
      )}
    </div>
  )
}

function CommentsPanel({ dealId, comments, users, currentUser, onRefresh }) {
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const textareaRef = useRef(null)

  
  function renderBody(text) {
    const parts = text.split(/(@\w[\w\s]*?\w(?=\s|$|[^a-zA-Z]))/g)
    return parts.map((part, i) =>
      part.startsWith('@')
        ? <span key={i} style={{ color: 'var(--green-text)', fontWeight: 600 }}>{part}</span>
        : part
    )
  }

  
  function extractMentions(text) {
    const matches = text.match(/@(\w[\w ]*?\w)(?=\s|$)/g) ?? []
    return matches.flatMap(m => {
      const name = m.slice(1).trim().toLowerCase()
      const found = users.find(u => u.name?.toLowerCase().includes(name))
      return found ? [{ id: found.id, name: found.name }] : []
    })
  }

  async function submit(e) {
    e.preventDefault()
    if (!body.trim()) return
    setError(''); setSaving(true)
    try {
      await api.post(`/deals/${dealId}/comments`, {
        body: body.trim(),
        mentions: extractMentions(body),
      })
      setBody('')
      onRefresh()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to post comment.')
    } finally {
      setSaving(false)
    }
  }

  async function del(cid) {
    if (!window.confirm('Delete this comment?')) return
    try {
      await api.delete(`/deals/${dealId}/comments/${cid}`)
      onRefresh()
    } catch {}
  }

  function fmtTs(ts) {
    const d = new Date(ts)
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' +
           d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  const AVATAR_COLORS = ['#62c0d5', '#8B5CF6', '#F59E0B', '#F97316', '#3B82F6']
  const avatarColor = name => AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
  const initials = name => name?.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) ?? '?'

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Comments</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Use @Name to mention a teammate</span>
      </div>
      <div style={{ padding: '0 20px 16px' }}>
        {comments.length === 0 && (
          <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '12px 0' }}>No comments yet. Be the first to leave a note.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          {comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff',
                background: avatarColor(c.author_name),
              }}>{initials(c.author_name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{c.author_name}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtTs(c.created_at)}</span>
                    {(c.author_id === currentUser?.id || currentUser?.role === 'Admin') && (
                      <button onClick={() => del(c.id)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)',
                        fontSize: 12, padding: '0 2px', lineHeight: 1,
                      }} title="Delete">✕</button>
                    )}
                  </div>
                </div>
                <div style={{
                  background: 'var(--bg-subtle)', borderRadius: 8, padding: '8px 12px',
                  fontSize: 13, color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {renderBody(c.body)}
                </div>
                {c.mentions?.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                    Mentioned: {c.mentions.map(m => m.name).join(', ')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {error && <div className="login-form-error">{error}</div>}
          <textarea
            ref={textareaRef}
            className="input"
            rows={3}
            placeholder="Write a comment… use @Name to mention someone"
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e) }}
            style={{ resize: 'vertical', fontSize: 13 }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-sm btn-primary" disabled={saving || !body.trim()}>
              {saving ? 'Posting…' : 'Post Comment'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>Ctrl+Enter to submit</div>
        </form>
      </div>
    </div>
  )
}

function LogInteractionModal({ dealId, onClose, onSaved }) {
  const [form, setForm] = useState({ type: 'Call', summary: '', next_step: '', occurred_at: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.post(`/deals/${dealId}/interactions`, form)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to log interaction.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Log Interaction" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="login-form-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Type</label>
          <select className="input" value={form.type} onChange={e => set('type', e.target.value)}>
            <option>Call</option><option>Email</option><option>Meeting</option>
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Date & Time</label>
          <input className="input" type="datetime-local" value={form.occurred_at} onChange={e => set('occurred_at', e.target.value)} />
        </div>
        <div className="input-group">
          <label className="input-label">Summary *</label>
          <textarea className="input" required rows={3} style={{ height: 'auto', paddingTop: 8, resize: 'vertical' }}
            value={form.summary} onChange={e => set('summary', e.target.value)} placeholder="What was discussed..." />
        </div>
        <div className="input-group">
          <label className="input-label">Next Step</label>
          <input className="input" type="text" value={form.next_step} onChange={e => set('next_step', e.target.value)} placeholder="Follow-up action..." />
        </div>
        <div className="modal-footer" style={{ padding: 0, paddingTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner" /> : 'Log Interaction'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function MarkWonModal({ dealId, onClose, onSaved }) {
  const [form, setForm] = useState({ final_value: '', contract_date: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.patch(`/deals/${dealId}`, { status: 'Won', final_value: form.final_value || undefined, contract_date: form.contract_date || undefined })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to mark deal as Won.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Mark Deal as Won" onClose={onClose} width={400}>
      <form onSubmit={submit}>
        {error && <div className="login-form-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Final Value ($)</label>
          <input className="input" type="number" min="0" step="0.01" value={form.final_value} onChange={e => set('final_value', e.target.value)} placeholder="e.g. 25000" />
        </div>
        <div className="input-group">
          <label className="input-label">Contract Date</label>
          <input className="input" type="date" value={form.contract_date} onChange={e => set('contract_date', e.target.value)} />
        </div>
        <div className="modal-footer" style={{ padding: 0, paddingTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-success" disabled={saving}>
            {saving ? <span className="spinner" /> : 'Confirm Won'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function MarkLostModal({ dealId, onClose, onSaved }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!reason.trim()) { setError('A lost reason is required.'); return }
    setError('')
    setSaving(true)
    try {
      await api.patch(`/deals/${dealId}`, { status: 'Lost', lost_reason: reason })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to mark deal as Lost.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Mark Deal as Lost" onClose={onClose} width={400}>
      <form onSubmit={submit}>
        {error && <div className="login-form-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Lost Reason *</label>
          <select className="input" value={reason} onChange={e => setReason(e.target.value)} required>
            <option value="">Select a reason…</option>
            <option>No budget</option><option>Not interested</option><option>Wrong fit</option>
            <option>Competitor chosen</option><option>Timing</option><option>Price</option><option>Other</option>
          </select>
        </div>
        <div className="modal-footer" style={{ padding: 0, paddingTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-danger" disabled={saving}>
            {saving ? <span className="spinner" /> : 'Mark as Lost'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ApprovalModal({ dealId, onClose, onSaved }) {
  const [form, setForm] = useState({ type: 'Discount', discount_pct: '', justification: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.post('/approvals', { deal_id: dealId, ...form })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to submit approval request.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Request Approval" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="login-form-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="form-row">
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Type</label>
            <select className="input" value={form.type} onChange={e => set('type', e.target.value)}>
              <option>Discount</option><option>Special Pricing</option><option>Extended Terms</option>
            </select>
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Discount %</label>
            <input className="input" type="number" min="0" max="100" step="0.1" value={form.discount_pct} onChange={e => set('discount_pct', e.target.value)} placeholder="e.g. 15" />
          </div>
        </div>
        <div className="input-group" style={{ marginTop: 14 }}>
          <label className="input-label">Justification *</label>
          <textarea className="input" required rows={3} style={{ height: 'auto', paddingTop: 8, resize: 'vertical' }}
            value={form.justification} onChange={e => set('justification', e.target.value)} placeholder="Why is this approval needed?" />
        </div>
        <div className="modal-footer" style={{ padding: 0, paddingTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner" /> : 'Submit Request'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function AddTaskModal({ dealId, onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', type: 'Call', due_date: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.post('/tasks', { deal_id: dealId, ...form })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to create task.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Add Task" onClose={onClose} width={400}>
      <form onSubmit={submit}>
        {error && <div className="login-form-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Title *</label>
          <input className="input" type="text" required value={form.title} onChange={e => set('title', e.target.value)} placeholder="Task name…" />
        </div>
        <div className="form-row">
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Type</label>
            <select className="input" value={form.type} onChange={e => set('type', e.target.value)}>
              <option>Call</option><option>Email</option><option>Meeting</option><option>Follow-up</option>
            </select>
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Due Date</label>
            <input className="input" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer" style={{ padding: 0, paddingTop: 14 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner" /> : 'Create Task'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ReassignModal({ dealId, users, currentOwnerId, onClose, onSaved }) {
  const [ownerId, setOwnerId] = useState(currentOwnerId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (ownerId === currentOwnerId) { onClose(); return }
    setError('')
    setSaving(true)
    try {
      await api.patch(`/deals/${dealId}`, { owner_id: ownerId })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to reassign deal.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Reassign Deal" onClose={onClose} width={380}>
      <form onSubmit={submit}>
        {error && <div className="login-form-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Assign to</label>
          <select className="input" value={ownerId} onChange={e => setOwnerId(e.target.value)}>
            {users.filter(u => u.is_active).map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
            ))}
          </select>
        </div>
        <div className="modal-footer" style={{ padding: 0, paddingTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner" /> : 'Reassign'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function AssignToRepModal({ dealId, onClose, onSaved }) {
  const [reps, setReps] = useState([])
  const [ownerId, setOwnerId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/users').then(r => {
      const salesReps = r.data.filter(u => u.role === 'Sales Rep' && u.is_active)
      setReps(salesReps)
      if (salesReps[0]) setOwnerId(salesReps[0].id)
    }).catch(() => {})
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (!ownerId) return
    setError('')
    setSaving(true)
    try {
      await api.patch(`/deals/${dealId}/assign`, { owner_id: ownerId })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to assign deal.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Assign to Sales Rep" onClose={onClose} width={380}>
      <form onSubmit={submit}>
        {error && <div className="login-form-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Sales Rep</label>
          <select className="input" value={ownerId} onChange={e => setOwnerId(e.target.value)}>
            {reps.length === 0 && <option value="">No Sales Reps available</option>}
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="modal-footer" style={{ padding: 0, paddingTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving || reps.length === 0}>
            {saving ? <span className="spinner" /> : 'Assign Deal'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function SaveTemplateModal({ deal, onClose, onSaved }) {
  const [name,    setName]    = useState(`${deal.title} template`)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Template name is required.'); return }
    setSaving(true)
    setError('')
    try {
      await api.post('/deal-templates', {
        name:           name.trim(),
        title:          deal.title,
        description:    deal.description,
        expected_value: deal.expected_value,
        probability:    deal.probability,
      })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to save template.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Save as Template" onClose={onClose}>
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 0, marginBottom: 16 }}>
        Save this deal as a reusable template. It will copy the title, description, value, and probability.
      </p>
      <form onSubmit={submit}>
        {error && <div className="login-form-error" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label className="input-label">Template Name *</label>
          <input className="input" type="text" autoFocus required
            value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Enterprise License Deal" />
        </div>
        <div className="modal-footer" style={{ padding: 0, paddingTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner" /> : 'Save Template'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

const TL_ICON = {
  created: (
    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  ),
  stage: (
    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
    </svg>
  ),
  interaction: (
    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 16c0 1.1-.9 2-2 2H7l-4 4V6a2 2 0 012-2h14a2 2 0 012 2v10z" />
    </svg>
  ),
  task: (
    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
}

const TYPE_LABELS = { created: 'Deal', stage: 'Stage', interaction: 'Interaction', task: 'Task' }
const TYPE_BG     = { created: '#22C55E', stage: '#8B5CF6', interaction: '#3B82F6', task: '#F59E0B' }

function DealTimeline({ deal, history, interactions, tasks, fmtDate, fmtDateTime }) {
  
  const events = []

  events.push({
    type: 'created',
    ts: deal.created_at,
    label: 'Deal created',
    sub: `Stage: ${deal.stage_name}`,
    byLine: deal.owner_name,
    color: '#22C55E',
  })

  history.forEach(h => {
    events.push({
      type: 'stage',
      ts: h.moved_at,
      label: h.from_stage ? `${h.from_stage} → ${h.to_stage}` : `Entered ${h.to_stage}`,
      sub: h.from_stage ? 'Stage advanced' : 'Pipeline entry',
      byLine: h.moved_by,
      color: STAGE_COLOR[h.to_stage] ?? '#8B5CF6',
    })
  })

  interactions.forEach(i => {
    events.push({
      type: 'interaction',
      ts: i.occurred_at,
      label: `${i.type} logged`,
      sub: [i.summary, i.next_step ? `Next: ${i.next_step}` : null].filter(Boolean).join(' · '),
      byLine: i.logged_by_name,
      color: INTERACTION_TYPE_COLOR[i.type] ?? '#3B82F6',
    })
  })

  tasks.forEach(t => {
    const overdue = t.due_date && t.status !== 'Done' && new Date(t.due_date) < new Date()
    events.push({
      type: 'task',
      ts: t.due_date,
      label: t.title,
      sub: t.type ?? 'Task',
      byLine: t.assigned_to_name,
      status: t.status,
      color: TASK_STATUS_COLOR[t.status] ?? '#F59E0B',
      overdue,
    })
  })

  
  events.sort((a, b) => {
    if (!a.ts && !b.ts) return 0
    if (!a.ts) return 1
    if (!b.ts) return -1
    return new Date(b.ts) - new Date(a.ts)
  })

  return (
    <div className="card" style={{ padding: 20 }}>
      {}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span className="card-title">Activity Timeline</span>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {['created', 'stage', 'interaction', 'task'].map(k => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: TYPE_BG[k], flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{TYPE_LABELS[k]}</span>
            </div>
          ))}
        </div>
      </div>

      {}
      {events.length > 0 && (
      <div style={{ position: 'relative', paddingLeft: 40 }}>
        {}
        <div style={{
          position: 'absolute', left: 13, top: 14, bottom: 14,
          width: 2, background: 'var(--border)',
        }} />

        {events.map((ev, idx) => (
          <div key={idx} style={{
            position: 'relative', marginBottom: idx < events.length - 1 ? 20 : 0,
            display: 'flex', gap: 16, alignItems: 'flex-start',
          }}>
            {}
            <div style={{
              position: 'absolute', left: -40,
              width: 28, height: 28, borderRadius: '50%',
              background: `${ev.color}20`,
              border: `2px solid ${ev.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: ev.color,
              flexShrink: 0,
              zIndex: 1,
            }}>
              {TL_ICON[ev.type]}
            </div>

            {}
            <div style={{
              flex: 1,
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${ev.color}`,
              borderRadius: 8,
              padding: '10px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {}
                  <span style={{
                    fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em',
                    padding: '1px 6px', borderRadius: 4,
                    background: `${ev.color}20`, color: ev.color,
                  }}>
                    {TYPE_LABELS[ev.type]}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{ev.label}</span>
                  {ev.status && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
                      background: `${ev.color}20`, color: ev.color,
                    }}>
                      {ev.status}
                    </span>
                  )}
                  {ev.overdue && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)' }}>⚠ Overdue</span>
                  )}
                </div>
                {ev.ts && (
                  <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                    {ev.type === 'task' ? `Due ${fmtDate(ev.ts)}` : fmtDateTime(ev.ts)}
                  </span>
                )}
              </div>
              {ev.sub && (
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.5 }}>{ev.sub}</div>
              )}
              {ev.byLine && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                  <UserAvatar name={ev.byLine} size={20} />
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{ev.byLine}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  )
}
