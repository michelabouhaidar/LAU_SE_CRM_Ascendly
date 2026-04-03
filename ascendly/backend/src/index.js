

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

app.set("trust proxy", 1);

app.use(helmet());

const allowedOrigin = process.env.CORS_ORIGIN || "https://localhost";
app.use(cors({
  origin: allowedOrigin,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
}));

app.use((req, res, next) => {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next();
  const origin  = req.headers.origin;
  const referer = req.headers.referer;
  const source  = origin || (referer ? new URL(referer).origin : null);
  
  if (!source) return next();
  if (source !== allowedOrigin) {
    return res.status(403).json({ error: 'Forbidden: unexpected request origin.' });
  }
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(compression());

app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

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

const orgLimiter = rateLimit({
  windowMs: 60 * 1000, 
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

app.use("/api/auth/login", loginLimiter); 
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

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "ok" });
  } catch {
    res.status(503).json({ status: "error", db: "unreachable" });
  }
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message,
  });
});

app.listen(PORT, () => {
  console.log(`[Ascendly] Backend running on port ${PORT}`);
});