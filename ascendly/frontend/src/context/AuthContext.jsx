import { createContext, useContext, useState, useCallback } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('crm_token'))
  const [user, setUser]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('crm_user')) } catch { return null }
  })
  const [mustChangePassword, setMustChangePassword] = useState(() => {
    try {
      const u = JSON.parse(localStorage.getItem('crm_user'))
      return u?.password_reset_required === true
    } catch { return false }
  })

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('crm_token',         data.token)
    localStorage.setItem('crm_refresh_token', data.refreshToken)
    localStorage.setItem('crm_user',          JSON.stringify(data.user))
    api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`
    setToken(data.token)
    setUser(data.user)
    setMustChangePassword(data.user.password_reset_required === true)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('crm_refresh_token')
    try {
      await api.post('/auth/logout', { refreshToken })
    } catch {
      // best-effort — clear locally regardless
    }
    localStorage.removeItem('crm_token')
    localStorage.removeItem('crm_refresh_token')
    localStorage.removeItem('crm_user')
    localStorage.removeItem('crm_selected_org')
    delete api.defaults.headers.common['Authorization']
    delete api.defaults.headers.common['X-Org-Id']
    setToken(null)
    setUser(null)
    setMustChangePassword(false)
  }, [])

  const clearPasswordReset = useCallback(() => {
    setMustChangePassword(false)
    const stored = JSON.parse(localStorage.getItem('crm_user') || 'null')
    if (stored) {
      stored.password_reset_required = false
      localStorage.setItem('crm_user', JSON.stringify(stored))
    }
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, login, logout, mustChangePassword, clearPasswordReset }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
