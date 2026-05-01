// ══════════════════════════════════════════════════════════
//  Ascendly CRM — Backend Entry Point
//  Express + Security Middleware + JWT + Rate Limiting
// ══════════════════════════════════════════════════════════
require("dotenv").config();

const express    = require("express");
const helmet     = require("helmet");
const cors       = require("cors");
const morgan     = require("morgan");
const compression = require("compression");
const rateLimit  = require("express-rate-limit");
const jwt        = require("jsonwebtoken");

const pool = require("./db/pool");

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Trust proxy (nginx sits in front) ──────────────────────
app.set("trust proxy", 1);

// ── Security headers (Helmet) ───────────────────────────────
app.use(helmet());

// ── CORS ────────────────────────────────────────────────────
// credentials: false — JWT is sent in Authorization header, not cookies.
// Keeping credentials false removes any CSRF surface area.
const allowedOrigins = (process.env.CORS_ORIGIN || "https://localhost").split(",").map(o => o.trim());
const isPrivateIP = (origin) => {
  try {
    const host = new URL(origin).hostname;
    return /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)$/.test(host);
  } catch { return false; }
};
const isAllowedOrigin = (origin) =>
  allowedOrigins.includes(origin) ||
  (process.env.NODE_ENV === "development" && isPrivateIP(origin));

app.use(cors({
  origin: (origin, cb) => cb(null, !origin || isAllowedOrigin(origin)),
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
}));

// ── Origin guard for state-changing requests ─────────────────
// Defence-in-depth: reject POST/PATCH/PUT/DELETE from unexpected origins.
app.use((req, res, next) => {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next();
  const origin  = req.headers.origin;
  const referer = req.headers.referer;
  const source  = origin || (referer ? new URL(referer).origin : null);
  // Allow requests with no origin header (server-to-server, curl, Postman)
  if (!source) return next();
  if (!isAllowedOrigin(source)) {
    return res.status(403).json({ error: 'Forbidden: unexpected request origin.' });
  }
  next();
});

// ── Body parsing ────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ── Compression ─────────────────────────────────────────────
app.use(compression());

// ── HTTP request logging ────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ── Rate limiters ────────────────────────────────────────────
// To disable in dev/CI, set DISABLE_RATE_LIMIT=true explicitly.
// Never skip based on NODE_ENV — a misconfigured production deploy
// would otherwise be completely unprotected.
const skipRateLimit = () => process.env.DISABLE_RATE_LIMIT === 'true';

const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 500,
  skip:     skipRateLimit,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", globalLimiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.LOGIN_RATE_LIMIT_MAX) || 5,
  skip:     skipRateLimit,
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts. Account temporarily locked." },
});

// #37 — Per-org rate limiter: uses JWT org_id (decoded, not verified) as key.
// Falls back to IP for unauthenticated requests.
const orgLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max:      parseInt(process.env.ORG_RATE_LIMIT_MAX) || 300,
  skip:     skipRateLimit,
  keyGenerator: (req) => {
    try {
      const token = req.headers.authorization?.split(' ')[1]
      if (token) {
        const decoded = jwt.decode(token)
        if (decoded?.org_id) return `org:${decoded.org_id}`
      }
    } catch {}
    return `ip:${req.ip}`
  },
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Too many requests. Please slow down." },
})
app.use("/api/", orgLimiter)

// ── Routes ──────────────────────────────────────────────────
const authRouter    = require("./routes/auth");
const usersRouter   = require("./routes/users");
const contactsRouter = require("./routes/contacts");
const dealsRouter   = require("./routes/deals");
const tasksRouter   = require("./routes/tasks");
const approvalsRouter = require("./routes/approvals");
const reportsRouter = require("./routes/reports");
const auditRouter   = require("./routes/audit");
const pipelineStagesRouter = require("./routes/pipeline-stages");
const organizationsRouter  = require("./routes/organizations");
const leadSourcesRouter    = require('./routes/lead-sources');
const contactTagsRouter    = require('./routes/contact-tags');
const dealTemplatesRouter  = require('./routes/deal-templates');

app.use("/api/auth/login", loginLimiter); // extra protection on login
app.use("/api/auth",    authRouter);
app.use("/api/users",   usersRouter);
app.use("/api/contacts", contactsRouter);
app.use("/api/deals",   dealsRouter);
app.use("/api/tasks",   tasksRouter);
app.use("/api/approvals", approvalsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/audit",   auditRouter);
app.use("/api/pipeline-stages", pipelineStagesRouter);
app.use("/api/organizations",   organizationsRouter);
app.use('/api/lead-sources',    leadSourcesRouter);
app.use('/api/contact-tags',   contactTagsRouter);
app.use('/api/deal-templates', dealTemplatesRouter);

// ── Health check ────────────────────────────────────────────
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "ok" });
  } catch {
    res.status(503).json({ status: "error", db: "unreachable" });
  }
});

// ── 404 ─────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// ── Global error handler ────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message,
  });
});

// ── Startup: bootstrap superadmin from .env if not present ───────
;(async () => {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return
  const bcrypt = require('bcryptjs')
  const existing = await pool.query('SELECT id FROM employees WHERE LOWER(email) = LOWER($1)', [ADMIN_EMAIL]).catch(() => null)
  if (existing?.rows?.length) return
  const orgName = 'Ascendly Corp'
  let orgId
  const orgRow = await pool.query(`INSERT INTO organizations (name, industry, country) VALUES ($1, 'Software', 'USA') ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [orgName]).catch(() => null)
  orgId = orgRow?.rows?.[0]?.id
  if (!orgId) {
    const r = await pool.query('SELECT id FROM organizations WHERE name=$1', [orgName]).catch(() => null)
    orgId = r?.rows?.[0]?.id
  }
  if (!orgId) return
  const hash = await bcrypt.hash(ADMIN_PASSWORD, parseInt(process.env.BCRYPT_ROUNDS ?? 12))
  await pool.query(
    `INSERT INTO employees (org_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,'Admin') ON CONFLICT DO NOTHING`,
    [orgId, ADMIN_NAME ?? 'System Admin', ADMIN_EMAIL.toLowerCase(), hash]
  ).catch(err => console.error('[Ascendly] Superadmin seed failed:', err.message))
  console.log(`[Ascendly] Superadmin created: ${ADMIN_EMAIL}`)
})()

// ── Startup migration: seed default lead sources for orgs that have none ──
const DEFAULT_LEAD_SOURCES = ['Website', 'Referral', 'Walk-in', 'Ad Campaign', 'Cold Outreach', 'Event', 'Other'];
pool.query(
  `INSERT INTO lead_sources (org_id, label)
   SELECT o.id, s.label
   FROM organizations o
   CROSS JOIN unnest($1::text[]) AS s(label)
   ON CONFLICT DO NOTHING`,
  [DEFAULT_LEAD_SOURCES]
).catch(err => console.error('[Ascendly] Lead source seed failed:', err.message));

// ── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Ascendly] Backend running on port ${PORT}`);
});