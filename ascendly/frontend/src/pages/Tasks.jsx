import { useEffect, useState, useCallback } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import ViewToggle from '../components/ViewToggle'
import UserAvatar from '../components/UserAvatar'

const STATUS_OPTS = ['All', 'Open', 'In Progress', 'Done']
const TASK_TYPES  = ['Call', 'Email', 'Meeting', 'Follow-up', 'Demo', 'Other']

const TASK_STATUS_COLOR = {
  'Open':        '#62c0d5',
  'In Progress': '#F59E0B',
  'Done':        '#22C55E',
}
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

export default function Tasks() {
  const { user } = useAuth()
  const [tasks,       setTasks]       = useState([])
  const [taskTotal,   setTaskTotal]   = useState(0)
  const [taskOffset,  setTaskOffset]  = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [users,       setUsers]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [filter,      setFilter]      = useState('All')
  const [search,      setSearch]      = useState('')
  const [viewMode,    setViewMode]    = useState('list')
  const [showCreate,  setShowCreate]  = useState(false)

  const canCreate = ['Admin', 'Sales Manager', 'Sales Rep', 'SDR'].includes(user?.role)
  const canSeeAll = ['Admin', 'Sales Manager'].includes(user?.role)

  const load = useCallback(() => {
    setLoading(true)
    setTaskOffset(0)
    const qs = new URLSearchParams({ limit: 50 })
    if (filter !== 'All') qs.set('status', filter)
    const fetches = [api.get(`/tasks?${qs}`)]
    if (canSeeAll) fetches.push(api.get('/users'))
    Promise.all(fetches)
      .then(([t, u]) => {
        setTasks(t.data.data)
        setTaskTotal(t.data.total)
        if (u) setUsers(u.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filter, canSeeAll])

  const loadMore = useCallback(() => {
    const newOffset = taskOffset + 50
    setLoadingMore(true)
    const qs = new URLSearchParams({ limit: 50, offset: newOffset })
    if (filter !== 'All') qs.set('status', filter)
    api.get(`/tasks?${qs}`)
      .then(({ data }) => {
        setTasks(prev => {
          const seen = new Set(prev.map(t => t.id))
          return [...prev, ...data.data.filter(t => !seen.has(t.id))]
        })
        setTaskOffset(newOffset)
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false))
  }, [filter, taskOffset])

  useEffect(() => { load() }, [load])

  const filtered = tasks.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase())
  )

  const fmtDate = (d) => d
    ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  const isOverdue = (d, status) =>
    d && status !== 'Done' && new Date(d) < new Date()

  async function updateStatus(id, status) {
    try {
      await api.patch(`/tasks/${id}`, { status })
      load()
    } catch (e) {
      alert(e.response?.data?.error ?? 'Error updating task.')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Tasks</div>
          <div className="page-subtitle">
            {taskTotal} task{taskTotal !== 1 ? 's' : ''}{filter !== 'All' ? ` · ${filter}` : ''}
          </div>
        </div>
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Task</button>
        )}
      </div>

      <div className="filter-bar">
        <div className="search-wrap" style={{ flex: 1, maxWidth: 320 }}>
          <svg className="search-icon" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input className="input" placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-8">
          {STATUS_OPTS.map(s => (
            <button
              key={s}
              className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <ViewToggle value={viewMode} onChange={setViewMode} />
      </div>

      <div className="card" style={{
        opacity: loading ? 0.4 : 1,
        filter: loading ? 'blur(1px)' : 'none',
        transition: 'opacity 0.35s ease, filter 0.35s ease',
      }}>
        {loading ? (
          <LoadingSkeleton viewMode={viewMode} />
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg></div>
            <h3>
              {search ? 'No matches' : filter === 'All' ? 'No tasks yet' : `No ${filter.toLowerCase()} tasks`}
            </h3>
            <p>Tasks will appear here once created.</p>
            {!search && canCreate && (
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowCreate(true)}>
                + Create Task
              </button>
            )}
          </div>
        ) : viewMode === 'list' ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Task</th><th>Type</th><th>Assigned To</th><th>Due Date</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const overdue = isOverdue(t.due_date, t.status)
                  return (
                    <tr key={t.id}>
                      <td><div className="font-semi">{t.title}</div></td>
                      <td>
                        {t.type ? <Chip color="#3B82F6" label={t.type} /> : <span className="text-gray text-sm">—</span>}
                      </td>
                      <td>
                        <div className="flex items-center gap-8">
                          <UserAvatar name={t.assigned_to_name} size={24} />
                          <span className="text-sm">{t.assigned_to_name ?? '—'}</span>
                        </div>
                      </td>
                      <td className="text-sm" style={overdue ? { color: 'var(--red)', fontWeight: 600 } : { color: 'var(--text-3)' }}>
                        {fmtDate(t.due_date)}
                      </td>
                      <td><Chip color={TASK_STATUS_COLOR[t.status] ?? '#74ba89'} label={t.status} /></td>
                      <td>
                        {t.status === 'Open' && (
                          <button className="btn btn-sm btn-ghost" onClick={() => updateStatus(t.id, 'In Progress')}>Start</button>
                        )}
                        {t.status === 'In Progress' && (
                          <button className="btn btn-sm btn-ghost-green" onClick={() => updateStatus(t.id, 'Done')}>Done</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* ── Cards view ─────────────────────────────── */
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 16, padding: 20,
          }}>
            {filtered.map(t => {
              const overdue = isOverdue(t.due_date, t.status)
              const statusColor = TASK_STATUS_COLOR[t.status] ?? '#74ba89'
              return (
                <div key={t.id} style={{
                  background: 'var(--bg-2)', border: `1px solid var(--border)`,
                  borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
                  borderLeft: `3px solid ${statusColor}`,
                }}>
                  {/* Title */}
                  <div className="font-semi" style={{ fontSize: 14, lineHeight: 1.4 }}>{t.title}</div>

                  {/* Type + Status */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {t.type && <Chip color="#3B82F6" label={t.type} />}
                    <Chip color={statusColor} label={t.status} />
                  </div>

                  {/* Assigned to */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <UserAvatar name={t.assigned_to_name} size={22} />
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t.assigned_to_name ?? '—'}</span>
                  </div>

                  {/* Footer: due date + action */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 11, fontWeight: overdue ? 700 : 400, color: overdue ? 'var(--red)' : 'var(--text-3)' }}>
                      {overdue ? '⚠ ' : ''}{fmtDate(t.due_date)}
                    </span>
                    <div>
                      {t.status === 'Open' && (
                        <button className="btn btn-sm btn-ghost" onClick={() => updateStatus(t.id, 'In Progress')}>Start</button>
                      )}
                      {t.status === 'In Progress' && (
                        <button className="btn btn-sm btn-ghost-green" onClick={() => updateStatus(t.id, 'Done')}>Done</button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Load More ── */}
      {!loading && tasks.length < taskTotal && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button
            className="btn btn-outline"
            onClick={loadMore}
            disabled={loadingMore}
            style={{ minWidth: 160 }}
          >
            {loadingMore ? 'Loading…' : `Load more (${tasks.length} of ${taskTotal})`}
          </button>
        </div>
      )}

      {showCreate && (
        <CreateTaskModal
          users={users}
          currentUser={user}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}

/* ── Create Task Modal ──────────────────────────── */
function CreateTaskModal({ users, currentUser, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: '',
    type: 'Call',
    due_date: '',
    assigned_to: currentUser?.id ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.post('/tasks', form)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to create task.')
      setSaving(false)
    }
  }

  return (
    <Modal title="New Task" onClose={onClose} width={440}>
      <form onSubmit={submit}>
        {error && <div className="login-form-error" style={{ marginBottom: 14 }}>{error}</div>}

        <div className="input-group">
          <label className="input-label">Title *</label>
          <input className="input" type="text" required autoFocus
            value={form.title} onChange={e => set('title', e.target.value)}
            placeholder="Task description…" />
        </div>

        <div className="form-row">
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Type</label>
            <select className="input" value={form.type} onChange={e => set('type', e.target.value)}>
              {TASK_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Due Date</label>
            <input className="input" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
          </div>
        </div>

        {users.length > 0 && (
          <div className="input-group" style={{ marginTop: 14 }}>
            <label className="input-label">Assign To</label>
            <select className="input" value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
              {users.filter(u => u.is_active).map(u => (
                <option key={u.id} value={u.id}>
                  {u.name}{u.id === currentUser?.id ? ' (me)' : ''} — {u.role}
                </option>
              ))}
            </select>
          </div>
        )}

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

function LoadingSkeleton({ viewMode }) {
  if (viewMode === 'cards') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, padding: 20 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="skeleton" style={{ height: 14, width: '80%' }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <div className="skeleton" style={{ height: 20, width: 50, borderRadius: 5 }} />
              <div className="skeleton" style={{ height: 20, width: 70, borderRadius: 5 }} />
            </div>
            <div className="skeleton" style={{ height: 11, width: '50%' }} />
            <div className="skeleton" style={{ height: 11, width: '40%', marginTop: 4 }} />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 14, width: `${60 + (i % 4) * 10}%` }} />
      ))}
    </div>
  )
}
