

const router = require("express").Router();
const bcrypt = require("bcryptjs");
const pool   = require("../db/pool");
const { authenticate, authorize, isSuperAdmin } = require("../middleware/auth");
const { writeAudit } = require("../middleware/audit");
const { sendOk }     = require("../middleware/respond");

const SALT_ROUNDS = 12;

function validatePassword(password) {
  if (!password || password.length < 8) return 'Password must be at least 8 characters.'
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.'
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.'
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.'
  return null
}

const USER_SELECT = `
  SELECT e.id, e.org_id, e.name, e.email, e.phone, e.role,
         e.join_date, e.is_active, e.created_at,
         o.name AS org_name
  FROM employees e
  LEFT JOIN organizations o ON o.id = e.org_id
`;

router.get("/", authenticate, async (req, res, next) => {
  try {
    let query, params
    if (isSuperAdmin(req)) {
      const orgFilter = req.query.org_id
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (orgFilter && UUID_RE.test(orgFilter)) {
        query = `${USER_SELECT} WHERE e.org_id = $1 ORDER BY e.name`
        params = [orgFilter]
      } else {
        query = `${USER_SELECT} ORDER BY o.name, e.name`
        params = []
      }
    } else {
      query = `${USER_SELECT} WHERE e.org_id = $1 ORDER BY e.name`
      params = [req.user.org_id]
    }
    const { rows } = await pool.query(query, params)
    res.json(rows)
  } catch (err) { next(err) }
})

router.get("/:id", authenticate, authorize("Admin"), async (req, res, next) => {
  try {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: "User not found." })
    const { rows } = await pool.query(`${USER_SELECT} WHERE e.id = $1`, [req.params.id])
    if (!rows[0]) return res.status(404).json({ error: "User not found." })
    if (!isSuperAdmin(req) && rows[0].org_id !== req.user.org_id)
      return res.status(403).json({ error: "Forbidden." })
    res.json(rows[0])
  } catch (err) { next(err) }
})

router.post("/", authenticate, authorize("Admin"), async (req, res, next) => {
  try {
    let { org_id, name, email, phone, password, role } = req.body
    
    
    org_id = isSuperAdmin(req) ? (org_id || req.user.org_id) : req.user.org_id
    if (!org_id || !name || !email || !password || !role)
      return res.status(400).json({ error: "org_id, name, email, password, and role are required." })

    const pwError = validatePassword(password)
    if (pwError) return res.status(400).json({ error: pwError })

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS)
    const { rows } = await pool.query(
      `INSERT INTO employees (org_id, name, email, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, org_id, name, email, phone, role, join_date, is_active, created_at`,
      [org_id, name, email.toLowerCase().trim(), phone || null, password_hash, role]
    )
    await writeAudit(req.user.id, 'USER_CREATED', `User "${email}" created with role ${role}`, req.user.org_id, 'user', rows[0].id)
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Email already in use." })
    next(err)
  }
})

router.patch("/:id", authenticate, authorize("Admin"), async (req, res, next) => {
  try {
    
    const { rows: existing } = await pool.query("SELECT org_id, email FROM employees WHERE id = $1", [req.params.id])
    if (!existing[0]) return res.status(404).json({ error: "User not found." })
    if (!isSuperAdmin(req) && existing[0].org_id !== req.user.org_id)
      return res.status(403).json({ error: "Forbidden." })

    const { name, email, phone, role, org_id, is_active } = req.body
    
    const targetOrgId = isSuperAdmin(req) ? (org_id ?? existing[0].org_id) : existing[0].org_id

    const { rows } = await pool.query(
      `UPDATE employees
       SET name      = COALESCE($1, name),
           email     = COALESCE($2, email),
           phone     = $3,
           role      = COALESCE($4, role),
           org_id    = $5,
           is_active = COALESCE($6, is_active)
       WHERE id = $7
       RETURNING id, org_id, name, email, phone, role, join_date, is_active`,
      [name, email ? email.toLowerCase().trim() : null, phone ?? null, role, targetOrgId, is_active, req.params.id]
    )
    await writeAudit(req.user.id, 'USER_UPDATED', `User "${existing[0].email}" updated`, req.user.org_id, 'user', req.params.id)
    res.json(rows[0])
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Email already in use." })
    next(err)
  }
})

router.post("/:id/reset-password", authenticate, authorize("Admin"), async (req, res, next) => {
  try {
    const { rows: existing } = await pool.query("SELECT org_id, email FROM employees WHERE id = $1", [req.params.id])
    if (!existing[0]) return res.status(404).json({ error: "User not found." })
    if (!isSuperAdmin(req) && existing[0].org_id !== req.user.org_id)
      return res.status(403).json({ error: "Forbidden." })

    const { password } = req.body
    const pwError = validatePassword(password)
    if (pwError) return res.status(400).json({ error: pwError })

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS)
    await pool.query(
      `UPDATE employees SET password_hash = $1, failed_attempts = 0, locked_until = NULL,
       password_reset_required = TRUE WHERE id = $2`,
      [password_hash, req.params.id]
    )
    await writeAudit(req.user.id, 'PASSWORD_RESET', `Password reset for "${existing[0].email}"`, req.user.org_id, 'user', req.params.id)
    sendOk(res, "Password reset successfully.")
  } catch (err) { next(err) }
})

router.delete("/:id", authenticate, authorize("Admin"), async (req, res, next) => {
  try {
    const { rows: existing } = await pool.query("SELECT org_id, email FROM employees WHERE id = $1", [req.params.id])
    if (!existing[0]) return res.status(404).json({ error: "User not found." })
    if (!isSuperAdmin(req) && existing[0].org_id !== req.user.org_id)
      return res.status(403).json({ error: "Forbidden." })

    
    await pool.query(
      "UPDATE employees SET is_active = FALSE, token_version = token_version + 1 WHERE id = $1",
      [req.params.id]
    )
    await writeAudit(req.user.id, 'USER_DEACTIVATED', `User "${existing[0].email}" deactivated`, req.user.org_id, 'user', req.params.id)
    sendOk(res, "User deactivated.")
  } catch (err) { next(err) }
})

module.exports = router;
