

const jwt  = require('jsonwebtoken')
const pool = require('../db/pool')

async function authenticate(req, res, next) {
  const authHeader = req.headers['authorization']
  if (!authHeader || !authHeader.startsWith('Bearer '))
    return res.status(401).json({ error: 'Missing or invalid Authorization header.' })

  const token = authHeader.split(' ')[1]
  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return res.status(401).json({ error: 'Token invalid or expired.' })
  }

  
  try {
    const { rows } = await pool.query(
      'SELECT is_active, token_version FROM employees WHERE id = $1',
      [payload.id]
    )
    if (!rows[0] || !rows[0].is_active)
      return res.status(401).json({ error: 'Account is inactive.' })
    if (payload.tv !== undefined && rows[0].token_version !== payload.tv)
      return res.status(401).json({ error: 'Session has been revoked. Please log in again.' })
  } catch {
    return res.status(500).json({ error: 'Authentication check failed.' })
  }

  req.user = payload 

  
  if (isSuperAdmin({ user: payload })) {
    const selectedOrg = req.headers['x-org-id']
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (selectedOrg && UUID_RE.test(selectedOrg)) {
      req.user = { ...payload, org_id: selectedOrg }
    }
  }

  next()
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user)
      return res.status(401).json({ error: 'Unauthenticated.' })
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: 'Forbidden: insufficient permissions.' })
    next()
  }
}

function isSuperAdmin(req) {
  return req.user?.email === process.env.ADMIN_EMAIL
}

module.exports = { authenticate, authorize, isSuperAdmin }
