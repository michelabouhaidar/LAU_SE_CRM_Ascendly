import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'

const LEAD_SOURCES = ['Website','Referral','Walk-in','Ad Campaign','Cold Outreach','Event','Other']
const TAG_COLORS   = ['#6B7A90','#3B82F6','#8B5CF6','#F59E0B','#62c0d5','#22C55E','#F97316','#14B8A6','#EC4899']

export default function ContactDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [contact,      setContact]      = useState(null)
  const [deals,        setDeals]        = useState([])
  const [interactions, setInteractions] = useState([])
  const [stageHistory, setStageHistory] = useState([])  // all stage history across deals
  const [tasks,        setTasks]        = useState([])
  const [tags,         setTags]         = useState([])
  const [orgTags,      setOrgTags]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [tab,          setTab]          = useState('deals')
  const [showEdit,     setShowEdit]     = useState(false)
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [newTagName,    setNewTagName]    = useState('')
  const [newTagColor,   setNewTagColor]   = useState(TAG_COLORS[0])
  const [tagSaving,     setTagSaving]     = useState(false)
  const tagPickerRef = useRef(null)

  const canEdit = ['Admin', 'Sales Manager', 'Sales Rep', 'SDR'].includes(user?.role)

  const initials = (name) => name?.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) ?? '?'
  const COLORS   = ['#62c0d5', '#8B5CF6', '#F59E0B', '#F97316', '#3B82F6']
  const colorFor = (name) => COLORS[(name?.charCodeAt(0) ?? 0) % COLORS.length]

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

  const load = useCallback(async () => {
    try {
      const [c, d, allOrgTags] = await Promise.all([
        api.get(`/contacts/${id}`),
        api.get(`/deals?contact_id=${id}`),
        api.get('/contact-tags').catch(() => ({ data: [] })),
      ])
      const dealList = d.data.data ?? d.data
      setContact(c.data)
      setDeals(dealList)
      setTags(c.data.tags ?? [])
      setOrgTags(allOrgTags.data)

      // Fetch interactions + stage history with 2 batched queries instead of 2N per-deal calls
      const [iRes, hRes] = await Promise.all([
        api.get(`/contacts/${id}/interactions`).catch(() => ({ data: [] })),
        api.get(`/contacts/${id}/stage-history`).catch(() => ({ data: [] })),
      ])
      setInteractions(iRes.data.map(i => ({ ...i, _type: 'interaction', _dealTitle: i.deal_title, _dealId: i.deal_id })))
      setStageHistory(hRes.data.map(h => ({ ...h, _type: 'stage', _dealTitle: h.deal_title, _dealId: h.deal_id })))

      // Fetch tasks linked to this contact
      const taskRes = await api.get(`/tasks?contact_id=${id}`).catch(() => ({ data: { data: [] } }))
      setTasks(taskRes.data.data ?? taskRes.data)
    } catch {
      navigate('/contacts')
    } finally {
      setLoading(false)
    }
  }, [id, navigate])

  async function assignTag(tagId) {
    setTagSaving(true)
    try {
      await api.post(`/contacts/${id}/tags`, { tag_id: tagId })
      const r = await api.get(`/contacts/${id}`)
      setTags(r.data.tags ?? [])
    } catch {} finally { setTagSaving(false); setTagPickerOpen(false) }
  }

  async function removeTag(tagId) {
    try {
      await api.delete(`/contacts/${id}/tags/${tagId}`)
      setTags(t => t.filter(x => x.id !== tagId))
    } catch {}
  }

  async function createAndAssignTag() {
    if (!newTagName.trim()) return
    setTagSaving(true)
    try {
      const res = await api.post('/contact-tags', { name: newTagName.trim(), color: newTagColor })
      await api.post(`/contacts/${id}/tags`, { tag_id: res.data.id })
      const [contactRes, orgTagsRes] = await Promise.all([
        api.get(`/contacts/${id}`),
        api.get('/contact-tags'),
      ])
      setTags(contactRes.data.tags ?? []); setOrgTags(orgTagsRes.data)
      setNewTagName(''); setTagPickerOpen(false)
    } catch {} finally { setTagSaving(false) }
  }

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!tagPickerOpen) return
    function handleClickOutside(e) {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target)) {
        setTagPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [tagPickerOpen])


  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>
      Loading contact…
    </div>
  )
  if (!contact) return null

  const INTERACTION_TYPE_COLOR = { Call: '#3B82F6', Email: '#8B5CF6', Meeting: '#F59E0B' }
  const STAGE_COLOR = { New: '#74ba89', Contacted: '#3B82F6', Qualified: '#8B5CF6', Proposal: '#F59E0B', Negotiation: '#62c0d5', Won: '#22C55E', Lost: '#ef4444' }
  const STATUS_COLOR = { Open: '#3B82F6', Won: '#22C55E', Lost: '#ef4444' }
  const TASK_STATUS_COLOR = { Open: '#62c0d5', 'In Progress': '#F59E0B', Done: '#22C55E' }
  const Chip = ({ color, label }) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 5,
      background: `${color}18`,
      fontSize: 11, fontWeight: 700, color, letterSpacing: '0.03em',
    }}>
      {label}
    </span>
  )

  // Build unified timeline: interactions + tasks + stage history, sorted newest first
  const timeline = [
    ...interactions.map(i => ({ _date: i.occurred_at, _kind: 'interaction', ...i })),
    ...tasks.map(t => ({ _date: t.created_at, _kind: 'task', ...t })),
    ...stageHistory.map(h => ({ _date: h.moved_at, _kind: 'stage', ...h })),
  ].sort((a, b) => new Date(b._date) - new Date(a._date))

  const unassignedOrgTags = orgTags.filter(t => !tags.find(ct => ct.id === t.id))

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>
            <Link to="/contacts" style={{ color: 'var(--green-text)', fontWeight: 600 }}>← Contacts</Link>
          </div>
          <div className="page-title">{contact.full_name}</div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            <span className="page-subtitle" style={{ marginTop: 0 }}>{contact.company || 'No company'} · {contact.lead_source || 'Unknown source'}</span>
            {tags.map(t => (
              <span key={t.id} style={{
                display: 'inline-block', padding: '2px 9px', borderRadius: 999,
                background: `${t.color}22`, color: t.color,
                fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
              }}>{t.name}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-8">
          {canEdit && <button className="btn btn-ghost" onClick={() => setShowEdit(true)}>Edit</button>}
        </div>
      </div>

      <div className="detail-grid">
        {/* Left: profile card */}
        <div>
          <div className="detail-section">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: colorFor(contact.full_name),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, fontWeight: 700, color: '#fff',
              }}>
                {initials(contact.full_name)}
              </div>
            </div>
            <div className="detail-field"><label>Full Name</label><span>{contact.full_name}</span></div>
            <div className="detail-field"><label>Email</label>
              <span>{contact.email
                ? <a href={`mailto:${contact.email}`} style={{ color: 'var(--green-text)' }}>{contact.email}</a>
                : '—'}</span>
            </div>
            <div className="detail-field"><label>Phone</label><span>{contact.phone || '—'}</span></div>
            <div className="detail-field"><label>Company</label><span>{contact.company || '—'}</span></div>
            {contact.notes && (
              <div className="detail-field" style={{ flexDirection: 'column', gap: 4 }}>
                <label>Notes</label>
                <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{contact.notes}</span>
              </div>
            )}

            {/* ── Tags ── */}
            <div className="detail-field" style={{ flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
              <label>Tags</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {tags.map(t => (
                  <span key={t.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 999,
                    background: `${t.color}22`, color: t.color,
                    fontSize: 11, fontWeight: 600,
                  }}>
                    {t.name}
                    {canEdit && (
                      <button onClick={() => removeTag(t.id)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: t.color, padding: 0, fontSize: 13, lineHeight: 1,
                      }}>×</button>
                    )}
                  </span>
                ))}
                {canEdit && (
                  <div ref={tagPickerRef} style={{ position: 'relative' }}>
                    <button className="btn btn-sm btn-ghost" style={{ padding: '2px 8px', fontSize: 11 }}
                      onClick={() => setTagPickerOpen(o => !o)}>
                      + tag
                    </button>
                    {tagPickerOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: 4,
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        borderRadius: 8, boxShadow: 'var(--shadow-lg)', minWidth: 210, padding: 10,
                      }}>
                        {unassignedOrgTags.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            {unassignedOrgTags.map(t => (
                              <div key={t.id} onClick={() => assignTag(t.id)}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 5, cursor: 'pointer' }}
                                className="contact-option">
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                                <span style={{ fontSize: 13 }}>{t.name}</span>
                              </div>
                            ))}
                            <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                          </div>
                        )}
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>New tag</div>
                        <input className="input" style={{ fontSize: 12, marginBottom: 6 }}
                          placeholder="Tag name…" value={newTagName}
                          onChange={e => setNewTagName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createAndAssignTag() } }} />
                        <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
                          {TAG_COLORS.map(c => (
                            <button key={c} type="button" onClick={() => setNewTagColor(c)} style={{
                              width: 16, height: 16, borderRadius: '50%', background: c,
                              border: newTagColor === c ? '2px solid var(--text)' : '2px solid transparent',
                              cursor: 'pointer', padding: 0,
                            }} />
                          ))}
                        </div>
                        <button type="button" className="btn btn-sm btn-primary" style={{ width: '100%' }}
                          disabled={!newTagName.trim() || tagSaving} onClick={createAndAssignTag}>
                          {tagSaving ? <span className="spinner" /> : 'Create & Assign'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {tags.length === 0 && !canEdit && <span className="text-gray" style={{ fontSize: 12 }}>None</span>}
              </div>
            </div>

            <div className="detail-field"><label>Added by</label><span>{contact.creator_name || '—'}</span></div>
            <div className="detail-field"><label>Added on</label><span>{fmtDate(contact.created_at)}</span></div>
          </div>
        </div>

        {/* Right: tabs */}
        <div>
          <div className="admin-tab-bar" style={{ marginBottom: 16 }}>
            {[
              { key: 'deals',    label: `Deals (${deals.length})` },
              { key: 'timeline', label: `Timeline (${timeline.length})` },
              { key: 'tasks',    label: `Tasks (${tasks.length})` },
            ].map(t => (
              <button key={t.key}
                className={`admin-tab${tab === t.key ? ' active' : ''}`}
                onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>

          {/* Deals tab */}
          {tab === 'deals' && (
            <div className="card">
              {deals.length === 0 ? (
                <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                  No deals linked to this contact yet.
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Deal</th><th>Stage</th><th>Value</th><th>Owner</th><th>Status</th></tr></thead>
                    <tbody>
                      {deals.map(d => (
                        <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/deals/${d.id}`)}>
                          <td>
                            <div className="font-semi">{d.title}</div>
                            {d.deal_number && <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--green-text)', marginTop: 1 }}>DEAL-{d.deal_number}</div>}
                          </td>
                          <td><Chip color={STAGE_COLOR[d.stage_name] ?? '#74ba89'} label={d.stage_name} /></td>
                          <td><span className="mono">{fmt(d.expected_value)}</span></td>
                          <td>{d.owner_name}</td>
                          <td><Chip color={STATUS_COLOR[d.status] ?? '#74ba89'} label={d.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Unified Timeline tab */}
          {tab === 'timeline' && (
            <div className="card" style={{ padding: '4px 20px 20px' }}>
              {timeline.length === 0 ? (
                <div style={{ padding: '32px 4px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                  No activity recorded yet.
                </div>
              ) : timeline.map((item, idx) => {
                if (item._kind === 'interaction') return (
                  <div key={`i-${item.id}`} className="interaction-item">
                    <div className="interaction-header">
                      <Chip color={INTERACTION_TYPE_COLOR[item.type] ?? '#74ba89'} label={item.type} />
                      <span className="interaction-date">
                        {fmtDateTime(item.occurred_at)} · {item.logged_by_name}
                        {item._dealTitle && <span style={{ marginLeft: 6, opacity: 0.6 }}>via {item._dealTitle}</span>}
                      </span>
                    </div>
                    <div className="interaction-summary">{item.summary}</div>
                    {item.next_step && <div className="interaction-next">→ Next: {item.next_step}</div>}
                  </div>
                )
                if (item._kind === 'task') return (
                  <div key={`t-${item.id}`} className="interaction-item">
                    <div className="interaction-header">
                      <Chip color={TASK_STATUS_COLOR[item.status] ?? '#74ba89'} label={item.status} />
                      <span className="interaction-date">Task · {fmtDate(item.created_at)}</span>
                    </div>
                    <div className="interaction-summary">{item.title}</div>
                    {item.due_date && <div className="interaction-next">Due: {fmtDate(item.due_date)}</div>}
                  </div>
                )
                if (item._kind === 'stage') return (
                  <div key={`s-${idx}`} className="interaction-item">
                    <div className="interaction-header">
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
                      }}>↗ Stage move</span>
                      <span className="interaction-date">{fmtDateTime(item.moved_at)} · {item.moved_by}</span>
                    </div>
                    <div className="interaction-summary" style={{ fontSize: 12 }}>
                      {item._dealTitle} — {item.from_stage ? `${item.from_stage} → ` : ''}{item.to_stage}
                    </div>
                  </div>
                )
                return null
              })}
            </div>
          )}

          {/* Tasks tab */}
          {tab === 'tasks' && (
            <div className="card">
              {tasks.length === 0 ? (
                <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                  No tasks linked to this contact.
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Task</th><th>Type</th><th>Due</th><th>Status</th></tr></thead>
                    <tbody>
                      {tasks.map(t => {
                        const overdue = t.due_date && t.status !== 'Done' && new Date(t.due_date) < new Date()
                        return (
                          <tr key={t.id}>
                            <td><div className="font-semi">{t.title}</div></td>
                            <td><Chip color="#3B82F6" label={t.type} /></td>
                            <td style={overdue ? { color: 'var(--red)', fontWeight: 600 } : { color: 'var(--text-3)' }}>
                              {t.due_date ? new Date(t.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                              {overdue && ' !'}</td>
                            <td><Chip color={TASK_STATUS_COLOR[t.status] ?? '#74ba89'} label={t.status} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showEdit && (
        <EditContactModal
          contact={contact}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); load() }}
        />
      )}
    </div>
  )
}

function EditContactModal({ contact, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name:   contact.full_name,
    email:       contact.email || '',
    phone:       contact.phone || '',
    company:     contact.company || '',
    lead_source: contact.lead_source || '',
    notes:       contact.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.patch(`/contacts/${contact.id}`, form)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to update contact.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Edit Contact" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="login-form-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="form-row">
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Full Name *</label>
            <input className="input" required value={form.full_name} onChange={e => set('full_name', e.target.value)} />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Company *</label>
            <input className="input" required value={form.company} onChange={e => set('company', e.target.value)} />
          </div>
        </div>
        <div className="form-row" style={{ marginTop: 14 }}>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Email *</label>
            <input className="input" type="email" required value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Phone *</label>
            <input className="input" required value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
        </div>
        <div className="input-group" style={{ marginTop: 14 }}>
          <label className="input-label">Lead Source</label>
          <select className="input" value={form.lead_source} onChange={e => set('lead_source', e.target.value)}>
            <option value="">Select…</option>
            {LEAD_SOURCES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Notes</label>
          <textarea className="input" rows={3} style={{ height: 'auto', paddingTop: 8, resize: 'vertical' }}
            value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        <div className="modal-footer" style={{ padding: 0, paddingTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner" /> : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
