import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    try { return document.documentElement.getAttribute('data-theme') === 'dark' }
    catch { return false }
  })
  const toggle = useCallback(() => {
    setDark(d => {
      const next = !d
      const html = document.documentElement
      if (next) {
        html.setAttribute('data-theme', 'dark')
        localStorage.setItem('ascendly-theme', 'dark')
      } else {
        html.removeAttribute('data-theme')
        localStorage.setItem('ascendly-theme', 'light')
      }
      return next
    })
  }, [])
  return [dark, toggle]
}

export default function Login() {
  const { login }  = useAuth()
  const navigate   = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [dark, toggleDark] = useDarkMode()
  const [showPwd, setShowPwd] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(email, password)
      navigate(user.password_reset_required ? '/change-password' : '/dashboard')
    } catch (err) {
      setError(err.response?.data?.error ?? 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">

      {/* ── Left panel ───────────────────────────────── */}
      <div className="login-left">
        <div className="login-left-top">
          <div className="login-brand">
            <div className="login-brand-mark">A</div>
            <div className="login-brand-name">Ascendly</div>
          </div>
        </div>

        <div className="login-left-mid">
          <p className="login-tagline">
            Every deal<br />has a story.<br />
            <em>Own the ending.</em>
          </p>
        </div>

        <div className="login-left-footer">
          © {new Date().getFullYear()} Ascendly. All rights reserved.
        </div>
      </div>

      {/* ── Right panel ──────────────────────────────── */}
      <div className="login-right">
        <div className="login-right-topbar">
          <button className="login-back-btn" onClick={() => navigate('/')}>
            ← Back
          </button>
          <button
            onClick={toggleDark}
            className="login-theme-btn"
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? <IcoSun /> : <IcoMoon />}
          </button>
        </div>

        <div className="login-form-wrap fade-in">
          <div className="login-form-header">
            <h2>Welcome back</h2>
            <p>Sign in to continue to your workspace.</p>
          </div>

          {error && (
            <div className="login-form-error">
              <IcoAlert /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="input-label">Email address</label>
              <input
                className="input"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="input-group">
              <label className="input-label">Password</label>
              <div className="input-pwd-wrap">
                <input
                  className="input"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="input-pwd-toggle"
                  onMouseDown={() => setShowPwd(true)}
                  onMouseUp={() => setShowPwd(false)}
                  onMouseLeave={() => setShowPwd(false)}
                  tabIndex={-1}
                  aria-label="Hold to reveal password"
                >
                  {showPwd ? <IcoEyeOff /> : <IcoEye />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
              disabled={loading}
            >
              {loading ? <span className="spinner" /> : 'Sign in →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function IcoMoon() {
  return <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
}
function IcoSun() {
  return <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="5"/><path strokeLinecap="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
}
function IcoEye() {
  return <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
}
function IcoEyeOff() {
  return <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
}
function IcoAlert() {
  return <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
}
