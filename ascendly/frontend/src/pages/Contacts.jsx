import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import ViewToggle from '../components/ViewToggle'

const CSV_COLUMNS  = ['full_name', 'email', 'phone', 'company', 'lead_source', 'notes']
const TAG_COLORS   = ['#6B7A90','#3B82F6','#8B5CF6','#F59E0B','#62c0d5','#22C55E','#F97316','#14B8A6','#EC4899']

export default function Contacts() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const [contacts,     setContacts]     = useState([])
  const [orgTags,      setOrgTags]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [tagFilter,    setTagFilter]    = useState('')   // tag id or ''
  const [viewMode,     setViewMode]     = useState('list') // 'list' | 'cards'
  const [showCreate,   setShowCreate]   = useState(false)
  const [showImport,   setShowImport]   = useState(false)
  const [showDupes,    setShowDupes]    = useState(false)
  const [hasMore,      setHasMore]      = useState(false)
  const [contactOffset,setContactOffset]= useState(0)
  const [loadingMore,  setLoadingMore]  = useState(false)

  const canCreate = ['Admin', 'Sales Manager', 'Sales Rep', 'SDR'].includes(user?.role)
  const canMerge  = ['Admin', 'Sales Manager'].includes(user?.role)

  const load = useCallback(() => {
    setContactOffset(0)
    Promise.all([
      api.get('/contacts'),
      api.get('/contact-tags').catch(() => ({ data: [] })),
    ]).then(([c, t]) => {
      const data = c.data.data ?? c.data
      setContacts(data)
      setOrgTags(t.data)
      if (c.data.total != null) {
        setHasMore(c.data.total > (c.data.offset ?? 0) + data.length)
        setContactOffset(data.length)
      } else {
        setHasMore(false)
      }
    })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const loadMore = () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    api.get(`/contacts?offset=${contactOffset}`)
      .then(r => {
        const data = r.data.data ?? r.data
        setContacts(prev => [...prev, ...data])
        const newOffset = contactOffset + data.length
        setContactOffset(newOffset)
        if (r.data.total != null) {
          setHasMore(r.data.total > newOffset)
        } else {
          setHasMore(false)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false))
  }

  const filtered = contacts.filter(c => {
    const matchSearch = `${c.full_name} ${c.email ?? ''} ${c.company ?? ''}`.toLowerCase().includes(search.toLowerCase())
    const matchTag = !tagFilter || (c.tags ?? []).some(t => t.id === tagFilter)
    return matchSearch && matchTag
  })

  const initials = (name) => name?.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) ?? '?'
  const COLORS   = ['#62c0d5', '#8B5CF6', '#F59E0B', '#F97316', '#3B82F6']
  const colorFor = (name) => COLORS[(name?.charCodeAt(0) ?? 0) % COLORS.length]

  /* ── Export ─────────────────────────────────── */
  function exportCSV() {
    const header = CSV_COLUMNS.join(',')
    const rows   = contacts.map(c =>
      CSV_COLUMNS.map(col => {
        const val = c[col] ?? ''
        return val.toString().includes(',') ? `"${val}"` : val
      }).join(',')
    )
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `contacts-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Contacts</div>
          <div className="page-subtitle">{contacts.length} people in your database</div>
        </div>
        <div className="flex items-center gap-8">
          {canMerge && (
            <button className="btn btn-ghost" onClick={() => setShowDupes(true)}>Find Duplicates</button>
          )}
          {canCreate && (
            <>
              <button className="btn btn-ghost" onClick={exportCSV} title="Export all contacts as CSV">↓ Export</button>
              <button className="btn btn-ghost" onClick={() => setShowImport(true)}>↑ Import CSV</button>
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Contact</button>
            </>
          )}
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-wrap" style={{ flex: 1, maxWidth: 360 }}>
          <svg className="search-icon" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input className="input" placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {orgTags.length > 0 && (
          <select className="input" style={{ width: 'auto', minWidth: 130 }} value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
            <option value="">All tags</option>
            {orgTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
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
            <div className="empty-icon"><svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></div>
            <h3>{search ? 'No matches found' : 'No contacts yet'}</h3>
            <p>{search ? 'Try a different search term.' : 'Add your first contact to get started.'}</p>
            {!search && canCreate && (
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowCreate(true)}>+ Add Contact</button>
            )}
          </div>
        ) : viewMode === 'list' ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Company</th><th>Email</th><th>Phone</th><th>Added</th></tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/contacts/${c.id}`)}>
                    <td>
                      <div className="flex items-center gap-12">
                        <div className="avatar" style={{ background: colorFor(c.full_name), fontSize: 11, flexShrink: 0 }}>
                          {initials(c.full_name)}
                        </div>
                        <div>
                          <div className="font-semi">{c.full_name}</div>
                          {(c.tags ?? []).length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                              {c.tags.map(t => (
                                <span key={t.id} style={{
                                  display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                                  background: `${t.color}22`, color: t.color,
                                  fontSize: 10, fontWeight: 700, letterSpacing: '0.02em',
                                }}>{t.name}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="text-sm">{c.company ?? <span className="text-gray">—</span>}</td>
                    <td className="text-sm">{c.email   ?? <span className="text-gray">—</span>}</td>
                    <td className="text-sm">{c.phone   ?? <span className="text-gray">—</span>}</td>
                    <td className="text-sm text-gray">
                      {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* ── Cards view ─────────────────────────────────── */
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 16,
            padding: 20,
          }}>
            {filtered.map(c => (
              <div
                key={c.id}
                onClick={() => navigate(`/contacts/${c.id}`)}
                style={{
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 16,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--green)'
                  e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.15)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                {/* Avatar + name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="avatar" style={{
                    background: colorFor(c.full_name), fontSize: 13,
                    width: 40, height: 40, flexShrink: 0,
                  }}>
                    {initials(c.full_name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="font-semi" style={{ fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.full_name}
                    </div>
                    {c.company && (
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.company}
                      </div>
                    )}
                  </div>
                </div>

                {/* Contact info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {c.email && (
                    <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</span>
                    </div>
                  )}
                  {c.phone && (
                    <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      {c.phone}
                    </div>
                  )}
                </div>

                {/* Tags */}
                {(c.tags ?? []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {c.tags.map(t => (
                      <span key={t.id} style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                        background: `${t.color}22`, color: t.color,
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.02em',
                      }}>{t.name}</span>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 'auto', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                  Added {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {hasMore && !loading && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <button
            className="btn btn-ghost"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? <span className="spinner" /> : 'Load More'}
          </button>
        </div>
      )}

      {showCreate && (
        <CreateContactModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load() }} />
      )}
      {showImport && (
        <ImportCSVModal onClose={() => setShowImport(false)} onSaved={() => { setShowImport(false); load() }} />
      )}
      {showDupes && (
        <DuplicatesModal onClose={() => setShowDupes(false)} onMerged={load} />
      )}
    </div>
  )
}

/* ── Create Contact Modal ───────────────────────── */
function CreateContactModal({ onClose, onSaved }) {
  const [form,        setForm]        = useState({ full_name: '', email: '', phone: '', company: '', lead_source: '', notes: '' })
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [orgTags,     setOrgTags]     = useState([])
  const [selTags,     setSelTags]     = useState([])   // tag ids selected for this new contact
  const [newTagName,  setNewTagName]  = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0])
  const [leadSources, setLeadSources] = useState([])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    api.get('/contact-tags').then(r => setOrgTags(r.data)).catch(() => {})
    api.get('/lead-sources').then(r => setLeadSources(r.data)).catch(() => {})
  }, [])

  function toggleTag(id) {
    setSelTags(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  async function createTag() {
    if (!newTagName.trim()) return
    try {
      const r = await api.post('/contact-tags', { name: newTagName.trim(), color: newTagColor })
      setOrgTags(t => [...t, r.data])
      setSelTags(s => [...s, r.data.id])
      setNewTagName('')
    } catch {}
  }

  async function submit(e) {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      const res = await api.post('/contacts', form)
      await Promise.all(selTags.map(tid => api.post(`/contacts/${res.data.id}/tags`, { tag_id: tid })))
      onSaved()
    } catch (err) { setError(err.response?.data?.error ?? 'Failed to create contact.'); setSaving(false) }
  }

  return (
    <Modal title="New Contact" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="login-form-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="form-row">
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Full Name *</label>
            <input className="input" type="text" required autoFocus value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Jane Smith" />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Company *</label>
            <input className="input" type="text" required value={form.company} onChange={e => set('company', e.target.value)} placeholder="Acme Corp" />
          </div>
        </div>
        <div className="form-row" style={{ marginTop: 14 }}>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Email *</label>
            <input className="input" type="email" required value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@company.com" />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Phone *</label>
            <input className="input" type="tel" required value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 555 000 0000" />
          </div>
        </div>
        <div className="input-group" style={{ marginTop: 14 }}>
          <label className="input-label">Lead Source</label>
          <select className="input" value={form.lead_source} onChange={e => set('lead_source', e.target.value)}>
            <option value="">— Select source —</option>
            {leadSources.map(s => <option key={s.id} value={s.label}>{s.label}</option>)}
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Notes</label>
          <textarea className="input" rows={2} style={{ height: 'auto', paddingTop: 8, resize: 'vertical' }}
            value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any relevant notes…" />
        </div>

        {/* Tags */}
        <div className="input-group" style={{ marginBottom: 4 }}>
          <label className="input-label">Tags</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: orgTags.length ? 8 : 0 }}>
            {orgTags.map(t => {
              const on = selTags.includes(t.id)
              return (
                <button key={t.id} type="button" onClick={() => toggleTag(t.id)} style={{
                  padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  background: on ? `${t.color}33` : 'var(--bg-2)',
                  color: on ? t.color : 'var(--text-3)',
                  border: `1.5px solid ${on ? t.color : 'var(--border)'}`,
                  transition: 'all 0.12s',
                }}>{on ? '✓ ' : ''}{t.name}</button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input className="input" style={{ flex: 1, fontSize: 12 }} placeholder="New tag name…"
              value={newTagName} onChange={e => setNewTagName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), createTag())} />
            <div style={{ display: 'flex', gap: 4 }}>
              {TAG_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setNewTagColor(c)} style={{
                  width: 16, height: 16, borderRadius: '50%', background: c, padding: 0, cursor: 'pointer',
                  border: newTagColor === c ? '2px solid var(--text)' : '2px solid transparent',
                }} />
              ))}
            </div>
            <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12, flexShrink: 0 }}
              onClick={createTag} disabled={!newTagName.trim()}>+ Create</button>
          </div>
        </div>

        <div className="modal-footer" style={{ padding: 0, paddingTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner" /> : 'Create Contact'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ── CSV Import Modal ───────────────────────────── */
function ImportCSVModal({ onClose, onSaved }) {
  const fileRef   = useRef(null)
  const [step,    setStep]    = useState('instructions') // instructions | preview | result
  const [preview, setPreview] = useState([])
  const [dropped, setDropped] = useState([])
  const [parseError, setParseError] = useState('')
  const [importing,  setImporting]  = useState(false)
  const [result,     setResult]     = useState(null)    // { imported, errors }
  const [leadSources, setLeadSources] = useState([])

  useEffect(() => {
    api.get('/lead-sources').then(r => setLeadSources(r.data)).catch(() => {})
  }, [])

  function parseCSVLine(line) {
    const vals = []
    let cur = '', inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        vals.push(cur.trim()); cur = ''
      } else {
        cur += ch
      }
    }
    vals.push(cur.trim())
    return vals
  }

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/)
    if (lines.length < 2) return { error: 'File appears empty or has no data rows.' }
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase())
    const reqCols = ['full_name', 'email', 'phone', 'company']
    const missingCols = reqCols.filter(c => !headers.includes(c))
    if (missingCols.length > 0) return { error: `Missing required columns: ${missingCols.join(', ')}` }
    const rows = [], dropped = []
    lines.slice(1).forEach((line, idx) => {
      if (!line.trim()) return
      const vals = parseCSVLine(line)
      const r = Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
      const missing = reqCols.filter(f => !r[f])
      if (missing.length > 0) {
        dropped.push({ row: idx + 2, reason: `Missing: ${missing.join(', ')}` })
      } else {
        rows.push(r)
      }
    })
    if (rows.length === 0) return { error: 'No valid rows found. All rows must have full_name, email, phone, and company.' }
    return { rows, dropped }
  }

  function onFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const { rows, dropped: droppedRows, error } = parseCSV(ev.target.result)
      if (error) { setParseError(error); return }
      setParseError('')
      setPreview(rows)
      setDropped(droppedRows ?? [])
      setStep('preview')
    }
    reader.readAsText(file)
  }

  async function doImport() {
    setImporting(true)
    try {
      const { data: { jobId } } = await api.post('/contacts/import', { rows: preview })
      // Poll until job completes
      let job
      while (true) {
        await new Promise(r => setTimeout(r, 600))
        const { data } = await api.get(`/contacts/import/${jobId}`)
        if (data.status === 'done') { job = data; break }
      }
      setResult(job)
      setStep('result')
    } catch (e) {
      setParseError(e.response?.data?.error ?? 'Import failed.')
    } finally { setImporting(false) }
  }

  function downloadTemplate() {
    const blob = new Blob([
      CSV_COLUMNS.join(',') + '\n' +
      'Jane Smith,jane@acme.com,+1 555 0001,Acme Corp,Website,Key account\n' +
      'John Doe,john@example.com,+1 555 0002,Example Ltd,Referral,\n'
    ], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a   = document.createElement('a')
    a.href = url; a.download = 'contacts-template.csv'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <Modal title="Import Contacts from CSV" onClose={onClose} width={600}>
      {/* ── Instructions step ── */}
      {step === 'instructions' && (
        <div>
          {/* Format card */}
          <div style={{
            background: 'var(--bg-subtle)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '16px 20px', marginBottom: 20,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>CSV Format</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
              Your file must have a header row. Column names must match exactly (case-insensitive).
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { col: 'full_name', req: true,  note: "Contact's full name" },
                { col: 'email',     req: true,  note: 'Email address (must be unique)' },
                { col: 'phone',     req: true,  note: 'Phone number' },
                { col: 'company',   req: true,  note: 'Company or organisation name' },
                { col: 'lead_source', req: false, note: leadSources.length ? `One of: ${leadSources.map(s => s.label).join(', ')}` : 'Any configured lead source' },
                { col: 'notes',     req: false, note: 'Free-form notes' },
              ].map(({ col, req, note }) => (
                <div key={col} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <code style={{
                    fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 4, padding: '1px 6px', flexShrink: 0,
                    color: req ? 'var(--green-text)' : 'var(--text-2)',
                  }}>{col}</code>
                  {req && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green-text)', textTransform: 'uppercase' }}>required</span>}
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{note}</span>
                </div>
              ))}
            </div>

            <div style={{
              marginTop: 14, padding: '10px 14px', background: 'var(--bg-card)',
              borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.8,
            }}>
              full_name,email,phone,company,lead_source,notes<br />
              Jane Smith,jane@acme.com,+1 555 0001,Acme Corp,Website,Key account<br />
              John Doe,john@example.com,+1 555 0002,Example Ltd,Referral,
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--text-3)', flexShrink: 0 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Up to 500 rows per import. Rows with missing required fields are skipped. Rows with duplicate emails are skipped and reported.
            </span>
          </div>

          {parseError && <div className="login-form-error" style={{ marginBottom: 12 }}>{parseError}</div>}

          <div className="modal-footer" style={{ padding: 0, paddingTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={downloadTemplate}>↓ Download Template</button>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
              Choose CSV File
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onFileChange} />
          </div>
        </div>
      )}

      {/* ── Preview step ── */}
      {step === 'preview' && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14 }}>
            <strong>{preview.length}</strong> valid row{preview.length !== 1 ? 's' : ''} ready to import{dropped.length > 0 ? `, ${dropped.length} will be skipped` : ''}. Review below then confirm.
          </div>
          {dropped.length > 0 && (
            <div style={{
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 6, padding: '10px 14px', marginBottom: 12,
              fontSize: 12, color: '#92400E',
            }}>
              <span style={{ fontWeight: 700 }}>⚠ {dropped.length} row{dropped.length !== 1 ? 's' : ''} will be skipped</span>
              {' '}(missing required fields):
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 80, overflowY: 'auto' }}>
                {dropped.map(d => (
                  <span key={d.row} style={{ color: 'var(--text-3)' }}>Row {d.row}: {d.reason}</span>
                ))}
              </div>
            </div>
          )}
          <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
            <table className="table" style={{ margin: 0 }}>
              <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Phone</th><th>Company</th><th>Source</th></tr></thead>
              <tbody>
                {preview.slice(0, 50).map((r, i) => (
                  <tr key={i}>
                    <td className="text-gray text-sm">{i + 1}</td>
                    <td className="font-semi">{r.full_name}</td>
                    <td className="text-sm text-gray">{r.email || '—'}</td>
                    <td className="text-sm text-gray">{r.phone || '—'}</td>
                    <td className="text-sm text-gray">{r.company || '—'}</td>
                    <td className="text-sm text-gray">{r.lead_source || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 50 && (
              <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-3)', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
                …and {preview.length - 50} more rows
              </div>
            )}
          </div>
          {parseError && <div className="login-form-error" style={{ marginTop: 12 }}>{parseError}</div>}
          <div className="modal-footer" style={{ padding: 0, paddingTop: 14 }}>
            <button type="button" className="btn btn-ghost" onClick={() => { setStep('instructions'); setParseError('') }}>← Back</button>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={importing} onClick={doImport}>
              {importing ? <span className="spinner" /> : `Import ${preview.length} Contacts`}
            </button>
          </div>
        </div>
      )}

      {/* ── Result step ── */}
      {step === 'result' && result && (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
            background: result.imported > 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
            border: `1px solid ${result.imported > 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            borderRadius: 8, marginBottom: 16,
          }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: result.imported > 0 ? 'var(--green-text)' : 'var(--red)' }}>
              {result.imported}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Contact{result.imported !== 1 ? 's' : ''} imported</div>
              {result.errors.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  {result.errors.length} row{result.errors.length !== 1 ? 's' : ''} skipped
                </div>
              )}
            </div>
          </div>

          {result.errors.length > 0 && (
            <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 6 }}>Skipped rows</div>
              {result.errors.map((e, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--red)', marginBottom: 4 }}>
                  Row {e.row}: {e.reason}
                </div>
              ))}
            </div>
          )}

          <div className="modal-footer" style={{ padding: 0, paddingTop: 8 }}>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-primary" onClick={onSaved}>Done</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ── Duplicates Modal ───────────────────────────── */
function DuplicatesModal({ onClose, onMerged }) {
  const [groups,   setGroups]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [merging,  setMerging]  = useState(null)  // 'keepId:sourceId'
  const [merged,   setMerged]   = useState(new Set())
  const [error,    setError]    = useState('')

  useEffect(() => {
    api.get('/contacts/duplicates')
      .then(r => setGroups(r.data))
      .catch(() => setError('Failed to load duplicates.'))
      .finally(() => setLoading(false))
  }, [])

  async function merge(keepId, sourceId) {
    setMerging(`${keepId}:${sourceId}`)
    setError('')
    try {
      await api.post(`/contacts/${keepId}/merge`, { source_id: sourceId })
      setMerged(s => new Set([...s, sourceId]))
      onMerged()
      // Reload groups
      const r = await api.get('/contacts/duplicates')
      setGroups(r.data)
    } catch (e) {
      setError(e.response?.data?.error ?? 'Merge failed.')
    } finally { setMerging(null) }
  }

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  const activeGroups = groups.filter(g => !g.every(c => merged.has(c.id)))

  return (
    <Modal title="Find Duplicates" onClose={onClose} width={580}>
      {loading ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Scanning for duplicates…</div>
      ) : error ? (
        <div className="login-form-error">{error}</div>
      ) : activeGroups.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>No duplicates found</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>All contacts appear to be unique.</div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
            {activeGroups.length} group{activeGroups.length !== 1 ? 's' : ''} of potential duplicates found.
            The first contact in each group is kept; duplicates are merged into it.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 400, overflowY: 'auto' }}>
            {activeGroups.map((group, gi) => (
              <div key={gi} style={{
                border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
              }}>
                {group.map((c, ci) => (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px',
                    background: ci === 0 ? 'var(--bg-subtle)' : 'var(--bg-card)',
                    borderTop: ci > 0 ? '1px solid var(--border)' : 'none',
                    opacity: merged.has(c.id) ? 0.4 : 1,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c.full_name}
                        {ci === 0 && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: 'var(--green-text)', textTransform: 'uppercase' }}>keep</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                        {[c.email, c.company].filter(Boolean).join(' · ')} · Added {fmtDate(c.created_at)}
                      </div>
                    </div>
                    {ci > 0 && !merged.has(c.id) && (
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={merging !== null}
                        onClick={() => merge(group[0].id, c.id)}
                        style={{ flexShrink: 0 }}
                      >
                        {merging === `${group[0].id}:${c.id}` ? <span className="spinner" /> : 'Merge'}
                      </button>
                    )}
                    {merged.has(c.id) && (
                      <span style={{ fontSize: 11, color: 'var(--green-text)', fontWeight: 600 }}>Merged ✓</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="modal-footer" style={{ padding: 0, paddingTop: 14 }}>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
      </div>
    </Modal>
  )
}

function LoadingSkeleton({ viewMode }) {
  if (viewMode === 'cards') {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 16, padding: 20,
      }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{
            background: 'var(--bg-2)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="skeleton" style={{ height: 13, width: '70%' }} />
                <div className="skeleton" style={{ height: 11, width: '50%' }} />
              </div>
            </div>
            <div className="skeleton" style={{ height: 11, width: '85%' }} />
            <div style={{ display: 'flex', gap: 5 }}>
              <div className="skeleton" style={{ height: 18, width: 55, borderRadius: 999 }} />
              <div className="skeleton" style={{ height: 18, width: 70, borderRadius: 999 }} />
            </div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div style={{ padding: 24 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
          <div className="skeleton" style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0 }} />
          <div className="skeleton" style={{ flex: 1, height: 13 }} />
          <div className="skeleton" style={{ width: 120, height: 13 }} />
          <div className="skeleton" style={{ width: 160, height: 13 }} />
        </div>
      ))}
    </div>
  )
}
