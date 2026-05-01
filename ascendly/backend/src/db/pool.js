// ══════════════════════════════════
//  Ascendly CRM — Database Pool (pg)
// ══════════════════════════════════
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,              // max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: false,           // SSL terminated at nginx; internal network is trusted
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool error:", err.message);
});

module.exports = pool;