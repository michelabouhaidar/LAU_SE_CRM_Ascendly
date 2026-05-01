import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

// Attach access token and optional org override on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('crm_token')
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  const selectedOrg = localStorage.getItem('crm_selected_org')
  if (selectedOrg) config.headers['X-Org-Id'] = selectedOrg
  return config
})

// Shared refresh promise — prevents multiple simultaneous refresh calls
let refreshPromise = null

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const orig = err.config
    const isAuthEndpoint = orig?.url?.includes('/auth/')

    // On 401, attempt a single token refresh then retry
    if (err.response?.status === 401 && !isAuthEndpoint && !orig._retry) {
      orig._retry = true
      const refreshToken = localStorage.getItem('crm_refresh_token')

      if (refreshToken) {
        if (!refreshPromise) {
          refreshPromise = axios.post('/api/auth/refresh', { refreshToken })
            .then(({ data }) => {
              localStorage.setItem('crm_token', data.token)
              localStorage.setItem('crm_refresh_token', data.refreshToken)
              api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`
              return data.token
            })
            .catch(() => {
              localStorage.removeItem('crm_token')
              localStorage.removeItem('crm_refresh_token')
              localStorage.removeItem('crm_user')
              window.location.href = '/login'
              return null
            })
            .finally(() => { refreshPromise = null })
        }

        const newToken = await refreshPromise
        if (newToken) {
          orig.headers['Authorization'] = `Bearer ${newToken}`
          return api(orig)
        }
      } else {
        // Only hard-redirect if we actually had a token — if both token and refreshToken
        // are already gone the user is already logged out (e.g. logout() just ran), so
        // skip the redirect and let React auth state handle navigation.
        const hadToken = !!localStorage.getItem('crm_token')
        localStorage.removeItem('crm_token')
        localStorage.removeItem('crm_user')
        if (hadToken) window.location.href = '/login'
      }
    }

    return Promise.reject(err)
  }
)

export default api
