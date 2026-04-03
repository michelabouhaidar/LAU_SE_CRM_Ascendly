import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

export default function ChangePassword() {
  const { user, logout, clearPasswordReset } = useAuth()
  const navigate = useNavigate()
  const [newPassword,     setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error,           setError]           = useState('')
  const [loading,         setLoading]         = useState(false)
  const [showNew,         setShowNew]         = useState(false)
  const [showConfirm,     setShowConfirm]     = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/change-password', { newPassword })
      clearPasswordReset()
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error ?? 'Failed to update password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="login-left-top">
          <div className="login-brand">
            <div className="login-brand-mark">A</div>
            <div className="login-brand-name">Ascendly</div>
          </div>
        </div>
        <div className="login-left-mid">
          <p className="login-tagline">
            Secure your<br />account.<br />
            <em>Set a new password.</em>
          </p>
        </div>
        <div className="login-left-footer">
          © {new Date().getFullYear()} Ascendly. All rights reserved.
        </div>
      </div>

      <div className="login-right">
        <div className="login-right-topbar">
          <button className="login-back-btn" onClick={logout}>
            ← Sign out
          </button>
        </div>

        <div className="login-form-wrap fade-in">
          <div className="login-form-header">
            <h2>Set a new password</h2>
            <p>
              Hi <strong>{user?.name}</strong>, your password was reset by an administrator.
              Please choose a new password to continue.
            </p>
          </div>

          {error && (
            <div className="login-form-error">
              <IcoAlert /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="input-label">New Password</label>
              <div className="input-pwd-wrap">
                <input
                  className="input"
                  type={showNew ? 'text' : 'password'}
                  placeholder="Min. 8 characters, uppercase, number"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  autoFocus
                />
                <button
                  type="button"
                  className="input-pwd-toggle"
                  onMouseDown={() => setShowNew(true)}
                  onMouseUp={() => setShowNew(false)}
                  onMouseLeave={() => setShowNew(false)}
                  tabIndex={-1}
                >
                  {showNew ? <IcoEyeOff /> : <IcoEye />}
                </button>
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Confirm New Password</label>
              <div className="input-pwd-wrap">
                <input
                  className="input"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="input-pwd-toggle"
                  onMouseDown={() => setShowConfirm(true)}
                  onMouseUp={() => setShowConfirm(false)}
                  onMouseLeave={() => setShowConfirm(false)}
                  tabIndex={-1}
                >
                  {showConfirm ? <IcoEyeOff /> : <IcoEye />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
              disabled={loading}
            >
              {loading ? <span className="spinner" /> : 'Update Password →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
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
