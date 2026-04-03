

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,              
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: false,           
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool error:", err.message);
});

module.exports = pool;