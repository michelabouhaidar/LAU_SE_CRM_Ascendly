

const express  = require("express");
const router   = express.Router();
const pool     = require("../db/pool");
const { authenticate, authorize, isSuperAdmin } = require("../middleware/auth");
const { writeAudit } = require("../middleware/audit");

router.get("/", authenticate, authorize("Admin"), async (req, res, next) => {
  try {
    if (isSuperAdmin(req)) {
      const { rows } = await pool.query(
        `SELECT id, name, industry, country, founded_date, created_at
         FROM organizations ORDER BY name ASC`
      );
      return res.json(rows);
    }
    
    const { rows } = await pool.query(
      `SELECT id, name, industry, country, founded_date, created_at
       FROM organizations WHERE id = $1`,
      [req.user.org_id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/", authenticate, authorize("Admin"), async (req, res, next) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: "Forbidden: super admin only." });
  try {
    const { name, industry, country, founded_date } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Organization name is required." });

    const { rows } = await pool.query(
      `INSERT INTO organizations (name, industry, country, founded_date)
       VALUES ($1, $2, $3, $4) RETURNING id, name, industry, country, founded_date, created_at`,
      [name.trim(), industry || null, country || null, founded_date || null]
    );
    await writeAudit(req.user.id, 'ORG_CREATED', `Organization "${name.trim()}" created`, null, 'org', rows[0].id);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "An organization with that name already exists." });
    next(err);
  }
});

router.patch("/:id", authenticate, authorize("Admin"), async (req, res, next) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: "Forbidden: super admin only." });
  try {
    const { name, industry, country, founded_date } = req.body;
    const { rows } = await pool.query(
      `UPDATE organizations
       SET name         = COALESCE($1, name),
           industry     = $2,
           country      = $3,
           founded_date = $4
       WHERE id = $5
       RETURNING id, name, industry, country, founded_date, created_at`,
      [name?.trim() || null, industry || null, country || null, founded_date || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Organization not found." });
    await writeAudit(req.user.id, 'ORG_UPDATED', `Organization "${rows[0].name}" updated`, null, 'org', req.params.id);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "An organization with that name already exists." });
    next(err);
  }
});

module.exports = router;
