import { useState, useEffect, useCallback, useRef } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

const AVATAR_COLORS = ['#14B8A6', '#3B82F6', '#8B5CF6', '#F59E0B', '#F97316']
const avatarColor    = (name) => AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
const avatarInitials = (name) => name?.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) ?? 'U'

const NAV_ALL = [
  { to: '/dashboard', label: 'Dashboard',  icon: <IconGrid />,  roles: null },
  { to: '/contacts',  label: 'Contacts',   icon: <IconUsers />, roles: null },
  { to: '/deals',     label: 'Pipeline',   icon: <IconDeal />,  roles: null },
  { to: '/tasks',     label: 'Tasks',      icon: <IconTask />,  roles: null },
  { to: '/approvals', label: 'Approvals',  icon: <IconCheck />, roles: ['Admin', 'Sales Manager', 'Finance'] },
  { to: '/reports',   label: 'Reports',    icon: <IconChart />, roles: ['Admin', 'Sales Manager', 'Finance'] },
  { to: '/admin',     label: 'Admin',      icon: <IconAdmin />, roles: ['Admin'] },
]

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('ascendly-theme') === 'dark' }
    catch { return false }
  })

  useEffect(() => {
    const html = document.documentElement
    if (dark) {
      html.setAttribute('data-theme', 'dark')
      localStorage.setItem('ascendly-theme', 'dark')
    } else {
      html.removeAttribute('data-theme')
      localStorage.setItem('ascendly-theme', 'light')
    }
  }, [dark])

  const toggle = useCallback(() => {
    document.documentElement.classList.add('no-transition')
    setDark(d => !d)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.documentElement.classList.remove('no-transition')
    }))
  }, [])
  return [dark, toggle]
}

export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate  = useNavigate()
  const [dark, toggleDark] = useDarkMode()
  const [collapsed, setCollapsed] = useState(false)
  const toggleSidebar = useCallback(() => setCollapsed(c => !c), [])

  const [pendingCount,   setPendingCount]   = useState(0)
  const [searchQ,        setSearchQ]        = useState('')
  const [searchResults,  setSearchResults]  = useState(null)
  const [searchLoading,  setSearchLoading]  = useState(false)
  const [searchOpen,     setSearchOpen]     = useState(false)
  const searchRef = useRef(null)

  // Org switcher for super admin
  const [orgs,          setOrgs]          = useState([])
  const [selectedOrgId, setSelectedOrgId] = useState(() => localStorage.getItem('crm_selected_org') ?? '')

  useEffect(() => {
    if (!['Admin', 'Sales Manager', 'Finance'].includes(user?.role)) return
    const fetchPending = () => {
      api.get('/approvals?status=Pending')
        .then(r => setPendingCount(r.data.length))
        .catch(() => {})
    }
    fetchPending()
    const interval = setInterval(fetchPending, 60000)
    return () => clearInterval(interval)
  }, [user?.role])

  // Global search with debounce
  useEffect(() => {
    if (searchQ.trim().length < 2) { setSearchResults(null); setSearchLoading(false); return }
    setSearchLoading(true)
    const timer = setTimeout(() => {
      api.get(`/reports/search?q=${encodeURIComponent(searchQ.trim())}`)
        .then(r => setSearchResults(r.data))
        .catch(() => setSearchResults(null))
        .finally(() => setSearchLoading(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQ])

  function handleSearchKey(e) {
    if (e.key === 'Escape') { setSearchOpen(false); setSearchQ(''); setSearchResults(null) }
  }

  function goToResult(type, id) {
    setSearchOpen(false); setSearchQ(''); setSearchResults(null)
    if (type === 'contact') navigate(`/contacts/${id}`)
    else if (type === 'deal') navigate(`/deals/${id}`)
    else if (type === 'task') navigate('/tasks')
  }

  const totalResults = searchResults
    ? (searchResults.contacts?.length ?? 0) + (searchResults.deals?.length ?? 0) + (searchResults.tasks?.length ?? 0)
    : 0

  // Fetch all orgs for super admin org switcher (only Admins with multiple orgs get it)
  useEffect(() => {
    if (user?.role !== 'Admin') return
    api.get('/organizations')
      .then(r => {
        if (r.data.length > 1) {
          setOrgs(r.data)
          // Default to first org if nothing stored
          if (!localStorage.getItem('crm_selected_org')) {
            const first = r.data[0]?.id
            if (first) { localStorage.setItem('crm_selected_org', first); setSelectedOrgId(first) }
          }
        }
      })
      .catch(() => {})
  }, [user?.role])

  function handleOrgChange(orgId) {
    localStorage.setItem('crm_selected_org', orgId)
    setSelectedOrgId(orgId)
    // Reload page so all data re-fetches under the new org context
    window.location.reload()
  }

  // #56 — keyboard shortcut: / → focus global search
  useEffect(() => {
    function onKey(e) {
      if (e.key !== '/') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      setSearchOpen(true)
      const input = searchRef.current?.querySelector('input')
      input?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleLogout = useCallback(async () => {
    await logout()
    navigate('/')
  }, [logout, navigate])

  const nav = NAV_ALL.filter(n => !n.roles || n.roles.includes(user?.role))
  const currentPage = nav.find(n => location.pathname.startsWith(n.to))?.label ?? 'Ascendly'

  return (
    <div className="app-shell">
      {/* ── Sidebar ────────────────────────────────── */}
      <aside className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`}>
        <div
          className="sidebar-logo sidebar-logo-btn"
          onClick={toggleSidebar}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <div className="sidebar-logo-mark">A</div>
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-name">Ascendly</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {nav.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <span className="nav-item-icon">{icon}</span>
              <span className="nav-item-label">{label}</span>
              {label === 'Approvals' && pendingCount > 0 && (
                <span style={{
                  marginLeft: 'auto', background: 'var(--green)', color: '#fff',
                  borderRadius: 999, fontSize: 10, fontWeight: 700,
                  padding: '1px 6px', minWidth: 18, textAlign: 'center'
                }}>{pendingCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user" onClick={handleLogout} title="Sign out">
            <div className={`su-expanded${collapsed ? ' su-hide' : ''}`}>
              <div className="avatar" style={{ background: avatarColor(user?.name), flexShrink: 0 }}>{avatarInitials(user?.name)}</div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{user?.name ?? 'User'}</div>
                <div className="sidebar-user-role">{user?.role ?? ''}</div>
              </div>
              <IconLogout />
            </div>
            <div className={`su-collapsed${collapsed ? '' : ' su-hide'}`}>
              <IconLogout />
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ───────────────────────────────────── */}
      <div className="main">
        <header className="topbar">
          <div className="topbar-breadcrumb">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" />
            </svg>
            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span>{currentPage}</span>
          </div>

          <div className="topbar-search" style={{ position: 'relative' }} ref={searchRef}>
            <svg className="search-icon" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search contacts, deals, tasks…"
              value={searchQ}
              onChange={e => { setSearchQ(e.target.value); setSearchOpen(true) }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              onKeyDown={handleSearchKey}
            />
            {searchOpen && searchQ.trim().length >= 2 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 200,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: 'var(--shadow-lg)',
                minWidth: 320, maxHeight: 400, overflowY: 'auto',
              }}>
                {searchLoading && (
                  <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-3)' }}>Searching…</div>
                )}
                {!searchLoading && totalResults === 0 && (
                  <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-3)' }}>No results for "{searchQ}"</div>
                )}
                {!searchLoading && searchResults && totalResults > 0 && (
                  <>
                    {searchResults.contacts?.length > 0 && (
                      <div>
                        <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)' }}>Contacts</div>
                        {searchResults.contacts.map(c => (
                          <div key={c.id} onMouseDown={() => goToResult('contact', c.id)}
                            style={{ padding: '8px 14px', cursor: 'pointer', borderTop: '1px solid var(--border)' }}
                            className="contact-option">
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                            {c.company && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.company}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                    {searchResults.deals?.length > 0 && (
                      <div>
                        <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', borderTop: searchResults.contacts?.length > 0 ? '1px solid var(--border)' : 'none' }}>Deals</div>
                        {searchResults.deals.map(d => (
                          <div key={d.id} onMouseDown={() => goToResult('deal', d.id)}
                            style={{ padding: '8px 14px', cursor: 'pointer', borderTop: '1px solid var(--border)' }}
                            className="contact-option">
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{d.stage} · {d.status}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {searchResults.tasks?.length > 0 && (
                      <div>
                        <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>Tasks</div>
                        {searchResults.tasks.map(t => (
                          <div key={t.id} onMouseDown={() => goToResult('task', t.id)}
                            style={{ padding: '8px 14px', cursor: 'pointer', borderTop: '1px solid var(--border)' }}
                            className="contact-option">
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{t.status}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="topbar-actions">
            {orgs.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} style={{ color: 'var(--text-3)', flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <select
                  className="input"
                  value={selectedOrgId}
                  onChange={e => handleOrgChange(e.target.value)}
                  style={{ padding: '3px 8px', fontSize: 12, height: 28, minWidth: 140, maxWidth: 200 }}
                  title="Switch organization"
                >
                  {orgs.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              className="btn-icon"
              onClick={toggleDark}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle dark mode"
            >
              {dark ? <IconSun /> : <IconMoon />}
            </button>

            <div className="avatar avatar-lg" title={user?.name} style={{ cursor: 'default', background: avatarColor(user?.name) }}>
              {avatarInitials(user?.name)}
            </div>
          </div>
        </header>

        <main key={location.pathname} className="page-content fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/* ── Icons ──────────────────────────────────────────── */
function IconGrid() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}
function IconUsers() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}
function IconDeal() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  )
}
function IconTask() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}
function IconCheck() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function IconChart() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}
function IconAdmin() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
function IconLogout() {
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} style={{ color: 'var(--text-3)', flexShrink: 0 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  )
}
function IconMoon() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  )
}
function IconSun() {
  return (
    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="5" />
      <path strokeLinecap="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  )
}
