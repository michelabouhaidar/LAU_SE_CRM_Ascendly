// ══════════════════════════════════════
//  Ascendly CRM — Auth Routes
// ══════════════════════════════════════
const crypto  = require('crypto')
const router  = require('express').Router()
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const pool    = require('../db/pool')
const { authenticate } = require('../middleware/auth')
const { writeAudit }   = require('../middleware/audit')
const { sendOk }       = require('../middleware/respond')

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MINUTES     = 15
const REFRESH_TOKEN_DAYS  = 7

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function issueAccessToken(user) {
  return jwt.sign(
    { id: user.id, org_id: user.org_id, email: user.email, role: user.role, tv: user.token_version },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  )
}

async function issueRefreshToken(employeeId) {
  const raw     = crypto.randomBytes(40).toString('hex')
  const expires = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000)
  await pool.query(
    `INSERT INTO refresh_tokens (employee_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [employeeId, hashToken(raw), expires]
  )
  return raw
}

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' })

    // #41 — query by LOWER(email) to support per-org uniqueness
    const { rows } = await pool.query(
      `SELECT id, org_id, email, name, role, password_hash, is_active, token_version,
              failed_attempts, locked_until, password_reset_required
       FROM employees WHERE LOWER(email) = $1 AND is_active = TRUE
       ORDER BY created_at ASC`,
      [email.toLowerCase().trim()]
    )

    if (!rows.length)
      return res.status(401).json({ error: 'Invalid credentials.' })

    // Check lockout for single-org case (common path)
    if (rows.length === 1 && rows[0].locked_until && new Date(rows[0].locked_until) > new Date()) {
      const until = new Date(rows[0].locked_until).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      return res.status(423).json({ error: `Account temporarily locked. Try again after ${until}.` })
    }

    // Try each candidate (handles same email in multiple orgs)
    let user = null
    for (const candidate of rows) {
      if (candidate.locked_until && new Date(candidate.locked_until) > new Date()) continue
      if (await bcrypt.compare(password, candidate.password_hash)) {
        user = candidate
        break
      }
    }

    if (!user) {
      // Apply failed_attempts to the first non-locked active candidate
      const target = rows.find(r => !r.locked_until || new Date(r.locked_until) <= new Date())
      if (target) {
        const attempts = (target.failed_attempts || 0) + 1
        const lockout  = attempts >= MAX_FAILED_ATTEMPTS
        await pool.query(
          `UPDATE employees SET failed_attempts = $1, locked_until = $2 WHERE id = $3`,
          [lockout ? 0 : attempts, lockout ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null, target.id]
        )
        if (lockout) {
          await writeAudit(target.id, 'ACCOUNT_LOCKED',
            `Account ${target.email} locked after ${MAX_FAILED_ATTEMPTS} failed login attempts`, target.org_id, 'user', target.id)
          return res.status(423).json({ error: `Account locked for ${LOCKOUT_MINUTES} minutes after ${MAX_FAILED_ATTEMPTS} failed attempts.` })
        }
        const remaining = MAX_FAILED_ATTEMPTS - attempts
        return res.status(401).json({
          error: `Invalid credentials. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        })
      }
      return res.status(401).json({ error: 'Invalid credentials.' })
    }

    // Success — reset lockout counters
    await pool.query(
      `UPDATE employees SET failed_attempts = 0, locked_until = NULL WHERE id = $1`,
      [user.id]
    )

    // #36 — issue short-lived access token + long-lived refresh token
    const token        = issueAccessToken(user)
    const refreshToken = await issueRefreshToken(user.id)

    await writeAudit(user.id, 'LOGIN', `User ${user.email} logged in`, user.org_id, 'user', user.id)

    res.json({
      token,
      refreshToken,
      user: {
        id: user.id, org_id: user.org_id, name: user.name,
        email: user.email, role: user.role,
        password_reset_required: user.password_reset_required,
      },
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/refresh — rotate refresh token, issue new access + refresh token pair
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required.' })

    const { rows } = await pool.query(
      `SELECT rt.id AS rt_id,
              e.id AS id, e.org_id, e.email, e.name, e.role, e.is_active, e.token_version
       FROM refresh_tokens rt
       JOIN employees e ON e.id = rt.employee_id
       WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > NOW()`,
      [hashToken(refreshToken)]
    )

    const row = rows[0]
    if (!row || !row.is_active)
      return res.status(401).json({ error: 'Invalid or expired refresh token.' })

    // Revoke used token (rotation — one-time use)
    await pool.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [row.rt_id])

    const newToken        = issueAccessToken(row)
    const newRefreshToken = await issueRefreshToken(row.id)

    res.json({ token: newToken, refreshToken: newRefreshToken })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { refreshToken } = req.body
    if (refreshToken) {
      await pool.query(
        `UPDATE refresh_tokens SET revoked_at = NOW()
         WHERE token_hash = $1 AND employee_id = $2`,
        [hashToken(refreshToken), req.user.id]
      )
    }
    // #39 — increment token_version to invalidate all existing JWTs
    await pool.query(
      `UPDATE employees SET token_version = token_version + 1 WHERE id = $1`,
      [req.user.id]
    )
    await writeAudit(req.user.id, 'LOGOUT', `User ${req.user.email} logged out`, req.user.org_id, 'user', req.user.id)
    sendOk(res, 'Logged out successfully.')
  } catch (err) {
    res.status(500).json({ error: 'Logout failed.' })
  }
})

// GET /api/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, org_id FROM employees WHERE id = $1',
      [req.user.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'User not found.' })
    res.json(rows[0])
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/change-password — forced password change after admin reset
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { newPassword } = req.body
    if (!newPassword) return res.status(400).json({ error: 'New password is required.' })

    // Reuse same complexity rules
    if (newPassword.length < 8)          return res.status(400).json({ error: 'Password must be at least 8 characters.' })
    if (!/[A-Z]/.test(newPassword))      return res.status(400).json({ error: 'Password must contain at least one uppercase letter.' })
    if (!/[a-z]/.test(newPassword))      return res.status(400).json({ error: 'Password must contain at least one lowercase letter.' })
    if (!/[0-9]/.test(newPassword))      return res.status(400).json({ error: 'Password must contain at least one number.' })

    const password_hash = await bcrypt.hash(newPassword, 12)
    await pool.query(
      `UPDATE employees
       SET password_hash = $1, password_reset_required = FALSE,
           token_version = token_version + 1
       WHERE id = $2`,
      [password_hash, req.user.id]
    )
    await writeAudit(req.user.id, 'PASSWORD_CHANGED', `User ${req.user.email} set a new password after reset`, req.user.org_id, 'user', req.user.id)
    sendOk(res, 'Password updated successfully.')
  } catch (err) { next(err) }
})

module.exports = router
