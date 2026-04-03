import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'

const ROLES = ['Admin', 'Sales Manager', 'Sales Rep', 'SDR', 'Finance']

const SUPER_ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL ?? 'admin@ascendly.io'

export default function Admin() {
  const { user } = useAuth()
  const [tab, setTab] = useState('users')
  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Admin Panel</div>
          <div className="page-subtitle">User management, organizations, pipeline configuration, and audit logs</div>
        </div>
      </div>

      <div className="admin-tab-bar">
        {[
          { key: 'users',           label: 'Users' },
          { key: 'organizations',   label: 'Organizations' },
          { key: 'pipeline',        label: 'Pipeline Stages' },
          { key: 'deal-templates',  label: 'Deal Templates' },
          { key: 'audit',           label: 'Audit Log' },
          { key: 'lead-sources',    label: 'Lead Sources' },
        ].map(t => (
          <button key={t.key} className={`admin-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users'           && <UsersTab currentUserId={user?.id} isSuperAdmin={isSuperAdmin} />}
      {tab === 'organizations'   && <OrgsTab canEdit={isSuperAdmin} />}
      {tab === 'pipeline'        && <PipelineTab canEdit={isSuperAdmin || user?.role === 'Admin'} />}
      {tab === 'deal-templates'  && <TemplatesTab canEdit={user?.role === 'Admin' || user?.role === 'Sales Manager'} />}
      {tab === 'audit'           && <AuditTab />}
      {tab === 'lead-sources'    && <LeadSourcesTab canEdit={isSuperAdmin} canAdd={true} />}
    </div>
  )
}

const SORT_FIELDS = [
  { value: 'name',      label: 'Name' },
  { value: 'email',     label: 'Email' },
  { value: 'phone',     label: 'Phone' },
  { value: 'role',      label: 'Role' },
  { value: 'org_name',  label: 'Organization' },
  { value: 'join_date', label: 'Joined' },
  { value: 'is_active', label: 'Status' },
]

function UsersTab({ currentUserId, isSuperAdmin }) {
  const [users,        setUsers]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [roleFilter,   setRoleFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [orgFilter,    setOrgFilter]    = useState('')
  const [orgs,         setOrgs]         = useState([])
  const [sortField,    setSortField]    = useState('name')
  const [sortDir,      setSortDir]      = useState('asc')
  const [showCreate,   setShowCreate]   = useState(false)
  const [editUser,     setEditUser]     = useState(null)
  const [resetUser,    setResetUser]    = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/users')
      .then(r => setUsers(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (isSuperAdmin) {
      api.get('/organizations').then(r => setOrgs(r.data)).catch(() => {})
    }
  }, [isSuperAdmin])

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  async function toggleActive(u) {
    if (u.id === currentUserId) return
    try {
      await api.patch(`/users/${u.id}`, { is_active: !u.is_active })
      load()
    } catch (e) {
      alert(e.response?.data?.error ?? 'Error')
    }
  }

  const q = search.toLowerCase()
  const displayed = users
    .filter(u => {
      const joined = u.join_date ? new Date(u.join_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
      const text = `${u.name} ${u.email} ${u.phone ?? ''} ${u.role} ${u.org_name ?? ''} ${joined}`.toLowerCase()
      if (q && !text.includes(q)) return false
      if (roleFilter && u.role !== roleFilter) return false
      if (statusFilter === 'active'   && !u.is_active) return false
      if (statusFilter === 'inactive' &&  u.is_active) return false
      if (orgFilter && u.org_id !== orgFilter) return false
      return true
    })
    .sort((a, b) => {
      let av = a[sortField] ?? ''
      let bv = b[sortField] ?? ''
      if (typeof av === 'boolean') { av = av ? 1 : 0; bv = bv ? 1 : 0 }
      else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase() }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ?  1 : -1
      return 0
    })

  const COLORS = ['#62c0d5', '#8B5CF6', '#F59E0B', '#F97316', '#3B82F6']
  const colorFor = (name) => COLORS[(name?.charCodeAt(0) ?? 0) % COLORS.length]
  const initials = (name) => {
    if (!name) return '?'
    const parts = name.trim().split(' ')
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase()
  }

  function SortIcon({ field }) {
    if (sortField !== field) return <span style={{ opacity: 0.25, fontSize: 10 }}>↕</span>
    return <span style={{ fontSize: 10 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const thStyle = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }

  return (
    <div>
      <div className="filter-bar">
        <div className="search-wrap" style={{ flex: 1, maxWidth: 260 }}>
          <svg className="search-icon" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input className="input" placeholder="Search any field…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input" style={{ width: 150 }} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="input" style={{ width: 130 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        {isSuperAdmin && (
          <select className="input" style={{ width: 190 }} value={orgFilter} onChange={e => setOrgFilter(e.target.value)}>
            <option value="">All Organizations</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New User</button>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 14, width: `${60 + i * 8}%` }} />
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div>
            <h3>No users found</h3>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={thStyle} onClick={() => toggleSort('name')}>User <SortIcon field="name" /></th>
                  <th style={thStyle} onClick={() => toggleSort('email')}>Email <SortIcon field="email" /></th>
                  <th style={thStyle} onClick={() => toggleSort('phone')}>Phone <SortIcon field="phone" /></th>
                  <th style={thStyle} onClick={() => toggleSort('role')}>Role <SortIcon field="role" /></th>
                  <th style={thStyle} onClick={() => toggleSort('org_name')}>Organization <SortIcon field="org_name" /></th>
                  <th style={thStyle} onClick={() => toggleSort('join_date')}>Joined <SortIcon field="join_date" /></th>
                  <th style={thStyle} onClick={() => toggleSort('is_active')}>Status <SortIcon field="is_active" /></th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-12">
                        <div className="avatar" style={{ background: colorFor(u.name), flexShrink: 0 }}>
                          {initials(u.name)}
                        </div>
                        <span className="font-semi">{u.name}</span>
                        {u.id === currentUserId && (
                          <Chip color="#3B82F6" label="you" />
                        )}
                      </div>
                    </td>
                    <td className="text-sm text-gray">{u.email}</td>
                    <td className="text-sm text-gray">{u.phone || '—'}</td>
                    <td><Chip color={ROLE_COLOR[u.role] ?? '#74ba89'} label={u.role} /></td>
                    <td className="text-sm text-gray">{u.org_name || '—'}</td>
                    <td className="text-sm text-gray">
                      {u.join_date ? new Date(u.join_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td>
                      <Chip color={u.is_active ? '#22C55E' : '#6B7A90'} label={u.is_active ? 'Active' : 'Inactive'} />
                    </td>
                    <td>
                      <div className="flex items-center gap-8">
                        <button className="btn btn-sm btn-ghost" onClick={() => setEditUser(u)}>Edit</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setResetUser(u)}>Reset PW</button>
                        {u.id !== currentUserId && (
                          <button
                            className={`btn btn-sm ${u.is_active ? 'btn-outline' : 'btn-ghost-green'}`}
                            onClick={() => toggleActive(u)}
                          >
                            {u.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load() }} />
      )}
      {editUser && (
        <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSaved={() => { setEditUser(null); load() }} />
      )}
      {resetUser && (
        <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />
      )}
    </div>
  )
}

const STAGE_COLOR = { New: '#74ba89', Contacted: '#3B82F6', Qualified: '#8B5CF6', Proposal: '#F59E0B', Negotiation: '#62c0d5', Won: '#22C55E', Lost: '#ef4444' }

const ROLE_COLOR = {
  'Admin':         '#62c0d5',
  'Sales Manager': '#8B5CF6',
  'Sales Rep':     '#3B82F6',
  'SDR':           '#F59E0B',
  'Finance':       '#22C55E',
}
const Chip = ({ color, label, mono }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center',
    padding: '2px 8px', borderRadius: 5,
    background: `${color}18`,
    fontSize: 11, fontWeight: 700, color,
    letterSpacing: mono ? '0.05em' : '0.03em',
    fontFamily: mono ? 'monospace' : 'inherit',
    whiteSpace: 'nowrap',
  }}>
    {label}
  </span>
)

function CreateUserModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'Sales Rep', phone: '', org_id: '' })
  const [orgs,   setOrgs]   = useState([])
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    api.get('/organizations').then(r => {
      setOrgs(r.data)
      if (r.data.length > 0) set('org_id', r.data[0].id)
    }).catch(() => {})
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (!form.org_id) { setError('Please select an organization.'); return }
    setError('')
    setSaving(true)
    try {
      await api.post('/users', form)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to create user.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Create New User" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="login-form-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="form-row">
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Full Name *</label>
            <input className="input" type="text" required value={form.name} onChange={e => set('name', e.target.value)} placeholder="Jane Smith" />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Phone</label>
            <input className="input" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 555 000 0000" />
          </div>
        </div>
        <div className="input-group" style={{ marginTop: 14 }}>
          <label className="input-label">Email Address *</label>
          <input className="input" type="email" required value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@company.com" />
        </div>
        <div className="input-group">
          <label className="input-label">Organization *</label>
          <select className="input" value={form.org_id} onChange={e => set('org_id', e.target.value)} required>
            <option value="">— Select organization —</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div className="form-row">
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Role *</label>
            <select className="input" value={form.role} onChange={e => set('role', e.target.value)}>
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Initial Password *</label>
            <input className="input" type="password" required value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" />
          </div>
        </div>
        <div className="modal-footer" style={{ padding: 0, paddingTop: 14 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner" /> : 'Create User'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function EditUserModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:   user.name,
    email:  user.email,
    phone:  user.phone ?? '',
    role:   user.role,
    org_id: user.org_id ?? '',
  })
  const [orgs,   setOrgs]   = useState([])
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    api.get('/organizations').then(r => setOrgs(r.data)).catch(() => {})
  }, [])

  async function submit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.patch(`/users/${user.id}`, form)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to update user.')
      setSaving(false)
    }
  }

  return (
    <Modal title={`Edit — ${user.name}`} onClose={onClose} width={460}>
      <form onSubmit={submit}>
        {error && <div className="login-form-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="form-row">
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Full Name *</label>
            <input className="input" type="text" required value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Phone</label>
            <input className="input" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="—" />
          </div>
        </div>
        <div className="input-group" style={{ marginTop: 14 }}>
          <label className="input-label">Email Address *</label>
          <input className="input" type="email" required value={form.email} onChange={e => set('email', e.target.value)} />
        </div>
        <div className="form-row">
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Role</label>
            <select className="input" value={form.role} onChange={e => set('role', e.target.value)}>
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Organization</label>
            <select className="input" value={form.org_id} onChange={e => set('org_id', e.target.value)}>
              <option value="">— Select —</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-footer" style={{ padding: 0, paddingTop: 14 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner" /> : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ResetPasswordModal({ user, onClose }) {
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return }
    setError('')
    setSaving(true)
    try {
      await api.post(`/users/${user.id}/reset-password`, { password })
      setSuccess(true)
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to reset password.')
      setSaving(false)
    }
  }

  return (
    <Modal title={`Reset Password — ${user.name}`} onClose={onClose} width={400}>
      {success ? (
        <div>
          <p className="text-sm" style={{ marginBottom: 20 }}>
            Password for <strong>{user.name}</strong> has been reset successfully.
            They will be prompted to set a new password on their next login.
          </p>
          <div className="modal-footer" style={{ padding: 0 }}>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit}>
          {error && <div className="login-form-error" style={{ marginBottom: 14 }}>{error}</div>}
          <div className="input-group">
            <label className="input-label">New Password *</label>
            <input className="input" type="password" required autoFocus value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" />
          </div>
          <div className="input-group">
            <label className="input-label">Confirm Password *</label>
            <input className="input" type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" />
          </div>
          <div className="modal-footer" style={{ padding: 0, paddingTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" /> : 'Reset Password'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

function OrgsTab({ canEdit }) {
  const [orgs,       setOrgs]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [sortField,  setSortField]  = useState('name')
  const [sortDir,    setSortDir]    = useState('asc')
  const [showCreate, setShowCreate] = useState(false)
  const [editOrg,    setEditOrg]    = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/organizations')
      .then(r => setOrgs(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  function toggleSort(f) {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(f); setSortDir('asc') }
  }

  const q = search.toLowerCase()
  const displayed = orgs
    .filter(o => {
      const founded = o.founded_date ? String(new Date(o.founded_date).getFullYear()) : ''
      return !q || `${o.name} ${o.industry ?? ''} ${o.country ?? ''} ${founded}`.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      let av = a[sortField] ?? '', bv = b[sortField] ?? ''
      av = String(av).toLowerCase(); bv = String(bv).toLowerCase()
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    })

  function SI({ f }) {
    if (sortField !== f) return <span style={{ opacity: 0.25, fontSize: 10 }}>↕</span>
    return <span style={{ fontSize: 10 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }
  const th = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }

  return (
    <div>
      <div className="filter-bar">
        <div className="search-wrap" style={{ flex: 1, maxWidth: 280 }}>
          <svg className="search-icon" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input className="input" placeholder="Search organizations…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Organization</button>}
      </div>
      <div className="card">
        {loading ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 14, width: `${60 + i * 8}%` }} />)}
          </div>
        ) : displayed.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg></div>
            <h3>No organizations yet</h3>
            {!q && canEdit && <><p>Create an organization to assign users to it.</p><button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowCreate(true)}>+ Create Organization</button></>}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={th} onClick={() => toggleSort('name')}>Name <SI f="name" /></th>
                  <th style={th} onClick={() => toggleSort('industry')}>Industry <SI f="industry" /></th>
                  <th style={th} onClick={() => toggleSort('country')}>Country <SI f="country" /></th>
                  <th style={th} onClick={() => toggleSort('founded_date')}>Founded <SI f="founded_date" /></th>
                  <th style={th} onClick={() => toggleSort('created_at')}>Created <SI f="created_at" /></th>
                  {canEdit && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {displayed.map(o => (
                  <tr key={o.id}>
                    <td><span className="font-semi">{o.name}</span></td>
                    <td className="text-sm text-gray">{o.industry || '—'}</td>
                    <td className="text-sm text-gray">{o.country || '—'}</td>
                    <td className="text-sm text-gray">{o.founded_date ? new Date(o.founded_date).getFullYear() : '—'}</td>
                    <td className="text-sm text-gray">{new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    {canEdit && <td><button className="btn btn-sm btn-ghost" onClick={() => setEditOrg(o)}>Edit</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showCreate && <CreateOrgModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load() }} />}
      {editOrg    && <EditOrgModal org={editOrg} onClose={() => setEditOrg(null)} onSaved={() => { setEditOrg(null); load() }} />}
    </div>
  )
}

function CreateOrgModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', industry: '', country: '', founded_date: '' })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.post('/organizations', form)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to create organization.')
      setSaving(false)
    }
  }

  return (
    <Modal title="New Organization" onClose={onClose} width={440}>
      <form onSubmit={submit}>
        {error && <div className="login-form-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Organization Name *</label>
          <input className="input" type="text" required autoFocus value={form.name} onChange={e => set('name', e.target.value)} placeholder="Acme Corp" />
        </div>
        <div className="form-row">
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Industry</label>
            <input className="input" type="text" value={form.industry} onChange={e => set('industry', e.target.value)} placeholder="e.g. Technology" />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Country</label>
            <input className="input" type="text" value={form.country} onChange={e => set('country', e.target.value)} placeholder="e.g. United States" />
          </div>
        </div>
        <div className="input-group" style={{ marginTop: 14 }}>
          <label className="input-label">Founded Date</label>
          <input className="input" type="date" value={form.founded_date} onChange={e => set('founded_date', e.target.value)} />
        </div>
        <div className="modal-footer" style={{ padding: 0, paddingTop: 14 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner" /> : 'Create Organization'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function EditOrgModal({ org, onClose, onSaved }) {
  const [form, setForm] = useState({ name: org.name, industry: org.industry ?? '', country: org.country ?? '', founded_date: org.founded_date ? org.founded_date.slice(0, 10) : '' })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError(''); setSaving(true)
    try { await api.patch(`/organizations/${org.id}`, form); onSaved() }
    catch (err) { setError(err.response?.data?.error ?? 'Failed to update.'); setSaving(false) }
  }

  return (
    <Modal title={`Edit — ${org.name}`} onClose={onClose} width={440}>
      <form onSubmit={submit}>
        {error && <div className="login-form-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Organization Name *</label>
          <input className="input" type="text" required value={form.name} onChange={e => set('name', e.target.value)} />
        </div>
        <div className="form-row">
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Industry</label>
            <input className="input" type="text" value={form.industry} onChange={e => set('industry', e.target.value)} placeholder="e.g. Technology" />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Country</label>
            <input className="input" type="text" value={form.country} onChange={e => set('country', e.target.value)} placeholder="e.g. South Africa" />
          </div>
        </div>
        <div className="input-group" style={{ marginTop: 14 }}>
          <label className="input-label">Founded Date</label>
          <input className="input" type="date" value={form.founded_date} onChange={e => set('founded_date', e.target.value)} />
        </div>
        <div className="modal-footer" style={{ padding: 0, paddingTop: 14 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" /> : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

const FIELD_LABELS = {
  expected_value:      'Value',
  expected_close_date: 'Close Date',
  probability:         'Probability',
  description:         'Description',
}
const ALL_FIELDS = Object.keys(FIELD_LABELS)

function PipelineTab({ canEdit }) {
  const [stages,       setStages]       = useState([])
  const [saving,       setSaving]       = useState(null)   
  const [fieldAdding,  setFieldAdding]  = useState(null)   
  const [fieldSaving,  setFieldSaving]  = useState(null)   

  function load() {
    api.get('/pipeline-stages').then(r => setStages(r.data)).catch(() => {})
  }
  useEffect(() => { load() }, [])

  async function toggle(stage) {
    if (stage.position === 1) return
    setSaving(stage.id)
    try {
      await api.patch(`/pipeline-stages/${stage.id}/toggle`, { is_active: !stage.is_active })
      load()
    } catch (e) {
      alert(e.response?.data?.error ?? 'Failed to update stage.')
    } finally {
      setSaving(null)
    }
  }

  async function addField(stage, field) {
    setFieldAdding(null)
    setFieldSaving(`${stage.id}:${field}`)
    try {
      await api.post(`/pipeline-stages/${stage.id}/required-fields`, { field })
      load()
    } catch (e) {
      alert(e.response?.data?.error ?? 'Failed to add required field.')
    } finally {
      setFieldSaving(null)
    }
  }

  async function removeField(stage, field) {
    setFieldSaving(`${stage.id}:${field}`)
    try {
      await api.delete(`/pipeline-stages/${stage.id}/required-fields/${field}`)
      load()
    } catch (e) {
      alert(e.response?.data?.error ?? 'Failed to remove field.')
    } finally {
      setFieldSaving(null)
    }
  }

  return (
    <div className="card">
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div className="font-semi" style={{ fontSize: 14 }}>Pipeline Stages</div>
        <div className="text-sm text-gray" style={{ marginTop: 2 }}>
          Activate stages your team uses and configure which fields are required before a deal can advance.{' '}
          <strong>New</strong> is always on and cannot be removed.
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Stage</th>
              <th>Win Probability</th>
              <th>Type</th>
              <th>Required Fields</th>
              {canEdit && <th style={{ textAlign: 'right' }}>Active</th>}
            </tr>
          </thead>
          <tbody>
            {stages.map(s => {
              const locked     = s.position === 1
              const isTerminal = s.is_terminal
              const fields     = s.required_fields ?? []
              const available  = ALL_FIELDS.filter(f => !fields.includes(f))
              return (
                <tr key={s.id} style={{ opacity: s.is_active ? 1 : 0.5 }}>
                  <td className="text-gray text-sm">{s.position}</td>
                  <td>
                    <div className="flex items-center gap-8">
                      <Chip color={s.is_active ? STAGE_COLOR[s.name] ?? '#3B82F6' : '#74ba89'} label={s.name} />
                      {locked && <span className="text-gray" style={{ fontSize: 11 }}>default</span>}
                    </div>
                  </td>
                  <td className="text-sm">{s.default_probability}%</td>
                  <td>
                    <Chip color={isTerminal ? '#62c0d5' : '#3B82F6'} label={isTerminal ? 'Terminal' : 'Progressive'} />
                  </td>
                  {}
                  <td>
                    {isTerminal ? (
                      <span className="text-gray" style={{ fontSize: 11 }}>n/a</span>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                        {fields.map(f => (
                          <span key={f} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 6px', borderRadius: 4,
                            background: 'rgba(99,102,241,0.1)', color: '#818CF8',
                            fontSize: 11, fontWeight: 600,
                          }}>
                            {FIELD_LABELS[f] ?? f}
                            {canEdit && (
                              <button
                                onClick={() => removeField(s, f)}
                                disabled={fieldSaving === `${s.id}:${f}`}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#818CF8', padding: 0, lineHeight: 1, fontSize: 13 }}
                                title={`Remove ${FIELD_LABELS[f]} requirement`}
                              >×</button>
                            )}
                          </span>
                        ))}
                        {canEdit && available.length > 0 && (
                          <div style={{ position: 'relative' }}>
                            {fieldAdding === s.id ? (
                              <div style={{
                                position: 'absolute', top: '100%', left: 0, zIndex: 50,
                                background: 'var(--bg-card)', border: '1px solid var(--border)',
                                borderRadius: 6, boxShadow: 'var(--shadow-lg)',
                                minWidth: 130, marginTop: 2, overflow: 'hidden',
                              }}>
                                {available.map(f => (
                                  <div key={f}
                                    onMouseDown={() => addField(s, f)}
                                    style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}
                                    className="contact-option"
                                  >
                                    {FIELD_LABELS[f]}
                                  </div>
                                ))}
                                <div
                                  onMouseDown={() => setFieldAdding(null)}
                                  style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}
                                >Cancel</div>
                              </div>
                            ) : null}
                            <button
                              className="btn btn-sm btn-ghost"
                              style={{ padding: '2px 7px', fontSize: 12 }}
                              onClick={() => setFieldAdding(fieldAdding === s.id ? null : s.id)}
                              onBlur={() => setTimeout(() => setFieldAdding(null), 150)}
                              title="Add required field"
                            >+ field</button>
                          </div>
                        )}
                        {fields.length === 0 && !canEdit && (
                          <span className="text-gray" style={{ fontSize: 11 }}>none</span>
                        )}
                      </div>
                    )}
                  </td>
                  {canEdit && (
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className={`btn btn-sm ${s.is_active ? 'btn-primary' : 'btn-outline'}`}
                        disabled={locked || saving === s.id}
                        onClick={() => toggle(s)}
                        style={{ minWidth: 80 }}
                        title={locked ? 'New stage is always active' : s.is_active ? 'Click to deactivate' : 'Click to activate'}
                      >
                        {saving === s.id
                          ? <span className="spinner" />
                          : locked ? 'Always On'
                          : s.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LeadSourcesTab({ canEdit, canAdd }) {
  const [sources,    setSources]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [sortDir,    setSortDir]    = useState('asc')
  const [showCreate, setShowCreate] = useState(false)
  const [editSource, setEditSource] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/lead-sources')
      .then(r => setSources(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function deleteSource(s) {
    if (!confirm(`Delete lead source "${s.label}"? This cannot be undone.`)) return
    try {
      await api.delete(`/lead-sources/${s.id}`)
      load()
    } catch (e) {
      alert(e.response?.status === 409 ? `Cannot delete "${s.label}" — it is used by existing contacts.` : e.response?.data?.error ?? 'Failed to delete lead source.')
    }
  }

  const q = search.toLowerCase()
  const displayed = sources
    .filter(s => !q || s.label.toLowerCase().includes(q))
    .sort((a, b) => sortDir === 'asc' ? a.label.localeCompare(b.label) : b.label.localeCompare(a.label))

  return (
    <div>
      <div className="filter-bar">
        <div className="search-wrap" style={{ flex: 1, maxWidth: 260 }}>
          <svg className="search-icon" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input className="input" placeholder="Search lead sources…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {canAdd && <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Add Source</button>}
      </div>
      <div className="card">
        {loading ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 14, width: `${50 + i * 7}%` }} />)}
          </div>
        ) : displayed.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg></div>
            <h3>No lead sources yet</h3>
            {!q && canAdd && <><p>Add lead sources to categorize your contacts.</p><button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowCreate(true)}>+ Add Source</button></>}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>
                    Source Name {sortDir === 'asc' ? '↑' : '↓'}
                  </th>
                  {canEdit && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {displayed.map(s => (
                  <tr key={s.id}>
                    <td><span className="font-semi">{s.label}</span></td>
                    {canEdit && (
                      <td>
                        <div className="flex items-center gap-8">
                          <button className="btn btn-sm btn-ghost" onClick={() => setEditSource(s)}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => deleteSource(s)}>Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showCreate  && <CreateLeadSourceModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load() }} />}
      {editSource  && <EditLeadSourceModal source={editSource} onClose={() => setEditSource(null)} onSaved={() => { setEditSource(null); load() }} />}
    </div>
  )
}

function CreateLeadSourceModal({ onClose, onSaved }) {
  const [name,   setName]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.post('/lead-sources', { label: name })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to create lead source.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Add Lead Source" onClose={onClose} width={360}>
      <form onSubmit={submit}>
        {error && <div className="login-form-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Source Name *</label>
          <input className="input" type="text" required autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. LinkedIn" />
        </div>
        <div className="modal-footer" style={{ padding: 0, paddingTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner" /> : 'Add Source'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function EditLeadSourceModal({ source, onClose, onSaved }) {
  const [label,  setLabel]  = useState(source.label)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function submit(e) {
    e.preventDefault()
    setError(''); setSaving(true)
    try { await api.patch(`/lead-sources/${source.id}`, { label }); onSaved() }
    catch (err) { setError(err.response?.data?.error ?? 'Failed to update.'); setSaving(false) }
  }

  return (
    <Modal title={`Edit — ${source.label}`} onClose={onClose} width={360}>
      <form onSubmit={submit}>
        {error && <div className="login-form-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Source Name *</label>
          <input className="input" type="text" required autoFocus value={label} onChange={e => setLabel(e.target.value)} />
        </div>
        <div className="modal-footer" style={{ padding: 0, paddingTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" /> : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

const ENTITY_LINK = {
  contact: id => `/contacts/${id}`,
  deal:    id => `/deals/${id}`,
}
const ENTITY_LABEL = {
  contact: 'Contact', deal: 'Deal', task: 'Task', approval: 'Approval',
  user: 'User', stage: 'Stage', lead_source: 'Lead Source', org: 'Organization',
}
const ACTION_COLOR = {
  LOGIN: '#22C55E', LOGOUT: '#74ba89', ACCOUNT_LOCKED: '#62c0d5',
  DEAL_WON: '#22C55E', DEAL_LOST: '#62c0d5', DEAL_DELETED: '#62c0d5',
  CONTACT_DELETED: '#62c0d5', TASK_DELETED: '#62c0d5',
  USER_DEACTIVATED: '#62c0d5', APPROVAL_REJECTED: '#62c0d5',
  APPROVAL_APPROVED: '#22C55E',
}

function AuditDetailModal({ log, onClose }) {
  if (!log) return null
  const navigate = useNavigate()
  const link = log.entity_type && ENTITY_LINK[log.entity_type] && log.entity_id
    ? ENTITY_LINK[log.entity_type](log.entity_id)
    : null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Audit Event #{log.id}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '10px 16px', alignItems: 'start' }}>
            <span className="text-sm text-gray">Timestamp</span>
            <span className="text-sm mono">
              {new Date(log.occurred_at).toLocaleString('en-GB', {
                day: 'numeric', month: 'long', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
              })}
            </span>

            <span className="text-sm text-gray">Actor</span>
            <span className="text-sm">
              <span className="font-semi">{log.actor_name ?? 'System'}</span>
              {log.actor_email && <span className="text-gray"> · {log.actor_email}</span>}
            </span>

            <span className="text-sm text-gray">Organization</span>
            <span className="text-sm">{log.org_name ?? <span className="text-gray">—</span>}</span>

            <span className="text-sm text-gray">Action</span>
            <Chip color={ACTION_COLOR[log.action] ?? '#3B82F6'} label={log.action} mono />

            <span className="text-sm text-gray">Description</span>
            <span className="text-sm">{log.description ?? <span className="text-gray">—</span>}</span>

            <span className="text-sm text-gray">Entity Type</span>
            <span className="text-sm">{log.entity_type ? (ENTITY_LABEL[log.entity_type] ?? log.entity_type) : <span className="text-gray">—</span>}</span>

            <span className="text-sm text-gray">Entity ID</span>
            <span className="text-sm mono text-gray" style={{ wordBreak: 'break-all', fontSize: 11 }}>
              {log.entity_id ?? '—'}
            </span>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          {link && (
            <button
              className="btn btn-primary"
              onClick={() => { onClose(); navigate(link) }}
            >
              View {ENTITY_LABEL[log.entity_type]} →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const AUDIT_ACTIONS = [
  'APPROVAL_APPROVED','APPROVAL_REJECTED','APPROVAL_REQUESTED',
  'CONTACT_UPDATED','DEAL_CLONED','DEAL_CREATED','DEAL_LOST',
  'DEAL_STAGE_CHANGE','DEAL_UPDATED','DEAL_WON',
  'INTERACTION_LOGGED','LEAD_SOURCE_CREATED','LEAD_SOURCE_UPDATED',
  'LOGIN','STAGE_ACTIVATED','STAGE_DEACTIVATED',
  'TASK_CREATED','TASK_UPDATED','TEMPLATE_CREATED','TEMPLATE_DELETED',
  'USER_CREATED',
]
const AUDIT_ENTITIES = ['deal','task','contact','approval','interaction','user','stage','lead_source','org']
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200]

function AuditTab() {
  const [logs,         setLogs]         = useState([])
  const [total,        setTotal]        = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [offset,       setOffset]       = useState(0)
  const [limit,        setLimit]        = useState(50)
  const [search,       setSearch]       = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [sortField,    setSortField]    = useState('occurred_at')
  const [sortDir,      setSortDir]      = useState('desc')
  const [selected,     setSelected]     = useState(null)

  
  const buildQuery = useCallback((off, lim, sf, sd, q, af, ef) => {
    const p = new URLSearchParams({
      limit:  lim,
      offset: off,
      sort:   sf,
      dir:    sd,
    })
    if (q)  p.set('q',           q)
    if (af) p.set('action',      af)
    if (ef) p.set('entity_type', ef)
    return `/audit?${p.toString()}`
  }, [])

  const load = useCallback((off, lim, sf, sd, q, af, ef) => {
    setLoading(true)
    api.get(buildQuery(off, lim, sf, sd, q, af, ef))
      .then(r => {
        setLogs(r.data.data ?? [])
        setTotal(r.data.total ?? 0)
        setOffset(off)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [buildQuery])

  
  useEffect(() => {
    load(0, limit, sortField, sortDir, search, actionFilter, entityFilter)
  }, []) 

  
  function applyFilters(newSearch, newAction, newEntity, newLimit) {
    load(0, newLimit, sortField, sortDir, newSearch, newAction, newEntity)
  }

  function handleSearch(val) {
    setSearch(val)
    applyFilters(val, actionFilter, entityFilter, limit)
  }
  function handleActionFilter(val) {
    setActionFilter(val)
    applyFilters(search, val, entityFilter, limit)
  }
  function handleEntityFilter(val) {
    setEntityFilter(val)
    applyFilters(search, actionFilter, val, limit)
  }
  function handleLimitChange(val) {
    const l = parseInt(val)
    setLimit(l)
    applyFilters(search, actionFilter, entityFilter, l)
  }

  function toggleSort(f) {
    const newDir = sortField === f ? (sortDir === 'asc' ? 'desc' : 'asc') : (f === 'occurred_at' ? 'desc' : 'asc')
    setSortField(f)
    setSortDir(newDir)
    load(0, limit, f, newDir, search, actionFilter, entityFilter)
  }

  function goToPage(newOffset) {
    load(newOffset, limit, sortField, sortDir, search, actionFilter, entityFilter)
  }

  function clearFilters() {
    setSearch(''); setActionFilter(''); setEntityFilter('')
    load(0, limit, sortField, sortDir, '', '', '')
  }

  const hasFilters = search || actionFilter || entityFilter

  function SI({ f }) {
    if (sortField !== f) return <span style={{ opacity: 0.25, fontSize: 10 }}>↕</span>
    return <span style={{ fontSize: 10 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }
  const th = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }

  const totalPages = Math.ceil(total / limit)
  const currentPage = Math.floor(offset / limit) + 1
  const rangeStart = total === 0 ? 0 : offset + 1
  const rangeEnd   = Math.min(offset + limit, total)

  return (
    <div>
      {selected && <AuditDetailModal log={selected} onClose={() => setSelected(null)} />}

      {}
      <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="search-wrap" style={{ flex: '1 1 220px', maxWidth: 300 }}>
          <svg className="search-icon" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input
            className="input"
            placeholder="Search actor, action, description…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>

        <select
          className="input"
          style={{ width: 200 }}
          value={actionFilter}
          onChange={e => handleActionFilter(e.target.value)}
        >
          <option value="">All Actions</option>
          {AUDIT_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <select
          className="input"
          style={{ width: 150 }}
          value={entityFilter}
          onChange={e => handleEntityFilter(e.target.value)}
        >
          <option value="">All Entities</option>
          {AUDIT_ENTITIES.map(e => (
            <option key={e} value={e}>{ENTITY_LABEL[e] ?? e}</option>
          ))}
        </select>

        {hasFilters && (
          <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear filters</button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="text-sm text-gray">Rows per page</span>
          <select
            className="input"
            style={{ width: 80 }}
            value={limit}
            onChange={e => handleLimitChange(e.target.value)}
          >
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 14, width: `${55 + i * 5}%` }} />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3>{hasFilters ? 'No results match your filters' : 'No audit entries yet'}</h3>
            <p>{hasFilters ? <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear filters</button> : 'System actions will appear here.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={th} onClick={() => toggleSort('occurred_at')}>Time <SI f="occurred_at" /></th>
                  <th style={th} onClick={() => toggleSort('actor_name')}>Actor <SI f="actor_name" /></th>
                  <th style={th} onClick={() => toggleSort('org_name')}>Organization <SI f="org_name" /></th>
                  <th style={th} onClick={() => toggleSort('action')}>Action <SI f="action" /></th>
                  <th style={th} onClick={() => toggleSort('description')}>Description <SI f="description" /></th>
                  <th style={th} onClick={() => toggleSort('entity_type')}>Entity <SI f="entity_type" /></th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(l)}>
                    <td className="text-sm mono text-gray" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(l.occurred_at).toLocaleString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <div className="text-sm font-semi">{l.actor_name ?? <span className="text-gray">System</span>}</div>
                      <div className="text-sm text-gray">{l.actor_email ?? ''}</div>
                    </td>
                    <td className="text-sm text-gray">{l.org_name ?? '—'}</td>
                    <td><Chip color={ACTION_COLOR[l.action] ?? '#3B82F6'} label={l.action} mono /></td>
                    <td className="text-sm text-gray" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.description ?? '—'}
                    </td>
                    <td>
                      {l.entity_type
                        ? <Chip color="#74ba89" label={ENTITY_LABEL[l.entity_type] ?? l.entity_type} />
                        : <span className="text-gray">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {}
        {!loading && total > 0 && (
          <div className="flex items-center justify-between" style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
            <button
              className="btn btn-sm btn-ghost"
              disabled={offset === 0}
              onClick={() => goToPage(Math.max(0, offset - limit))}
            >
              ← Previous
            </button>

            <span className="text-sm text-gray">
              {rangeStart}–{rangeEnd} of <strong>{total}</strong>
              {hasFilters && <span style={{ marginLeft: 6, opacity: 0.6 }}>(filtered)</span>}
              &ensp;·&ensp;Page {currentPage} of {totalPages}
            </span>

            <button
              className="btn btn-sm btn-ghost"
              disabled={offset + logs.length >= total}
              onClick={() => goToPage(offset + limit)}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function TemplatesTab({ canEdit }) {
  const [templates, setTemplates] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editTpl,    setEditTpl]    = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/deal-templates')
      .then(r => setTemplates(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function deleteTpl(tpl) {
    if (!window.confirm(`Delete template "${tpl.name}"?`)) return
    try {
      await api.delete(`/deal-templates/${tpl.id}`)
      load()
    } catch (e) {
      alert(e.response?.data?.error ?? 'Error deleting template.')
    }
  }

  const fmt = (n) => {
    if (!n) return '—'
    const num = parseFloat(n)
    return num >= 1_000_000 ? `$${(num/1_000_000).toFixed(1)}M`
      : num >= 1_000 ? `$${(num/1_000).toFixed(0)}K`
      : `$${num}`
  }

  return (
    <div className="card" style={{ marginTop: 0 }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="font-semi" style={{ fontSize: 14 }}>Deal Templates</div>
          <div className="text-sm text-gray" style={{ marginTop: 2 }}>Pre-filled templates for quick deal creation</div>
        </div>
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ New Template</button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>Loading…</div>
      ) : templates.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3>No templates yet</h3>
          <p>Create templates to pre-fill deals with common values.</p>
          {canEdit && (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowCreate(true)}>
              + Create First Template
            </button>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Title</th>
                <th style={{ textAlign: 'right' }}>Value</th>
                <th>Probability</th>
                <th>Created by</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id}>
                  <td><div className="font-semi text-sm">{t.name}</div></td>
                  <td className="text-sm">{t.title}</td>
                  <td style={{ textAlign: 'right' }}><span className="mono text-sm">{fmt(t.expected_value)}</span></td>
                  <td className="text-sm">{t.probability != null ? `${t.probability}%` : '—'}</td>
                  <td className="text-sm text-gray">{t.created_by_name}</td>
                  {canEdit && (
                    <td>
                      <div className="flex items-center gap-6" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => setEditTpl(t)}>Edit</button>
                        <button className="btn btn-sm btn-ghost" style={{ color: '#62c0d5' }} onClick={() => deleteTpl(t)}>Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <TemplateFormModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load() }} />}
      {editTpl    && <TemplateFormModal template={editTpl} onClose={() => setEditTpl(null)} onSaved={() => { setEditTpl(null); load() }} />}
    </div>
  )
}

function TemplateFormModal({ template, onClose, onSaved }) {
  const isEdit = !!template
  const [form, setForm] = useState({
    name:           template?.name           ?? '',
    title:          template?.title          ?? '',
    description:    template?.description    ?? '',
    expected_value: template?.expected_value ?? '',
    probability:    template?.probability    ?? '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.title.trim()) { setError('Name and title are required.'); return }
    setSaving(true); setError('')
    try {
      if (isEdit) {
        await api.patch(`/deal-templates/${template.id}`, form)
      } else {
        await api.post('/deal-templates', form)
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to save template.')
      setSaving(false)
    }
  }

  return (
    <Modal title={isEdit ? 'Edit Template' : 'New Template'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="login-form-error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="input-group">
          <label className="input-label">Template Name *</label>
          <input className="input" type="text" required autoFocus
            value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="e.g. Enterprise License" />
        </div>
        <div className="input-group">
          <label className="input-label">Deal Title *</label>
          <input className="input" type="text" required
            value={form.title} onChange={e => set('title', e.target.value)}
            placeholder="e.g. Acme Corp — Enterprise License" />
        </div>
        <div className="input-group">
          <label className="input-label">Description</label>
          <textarea className="input" rows={3} style={{ height: 'auto', resize: 'vertical', fontSize: 13, paddingTop: 8 }}
            value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="Default description for this template…" />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
            <label className="input-label">Value ($)</label>
            <input className="input" type="number" min="0" step="0.01"
              value={form.expected_value} onChange={e => set('expected_value', e.target.value)}
              placeholder="e.g. 25000" />
          </div>
          <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
            <label className="input-label">Probability (%)</label>
            <input className="input" type="number" min="0" max="100" step="1"
              value={form.probability} onChange={e => set('probability', e.target.value)}
              placeholder="e.g. 20" />
          </div>
        </div>
        <div className="modal-footer" style={{ padding: 0, paddingTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <span className="spinner" /> : isEdit ? 'Save Changes' : 'Create Template'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
