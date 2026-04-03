#!/usr/bin/env node

require('dotenv').config()
const fs   = require('fs')
const path = require('path')
const { Pool } = require('pg')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const MIGRATIONS_DIR = path.join(__dirname, 'migrations')

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
    )
  `)
}

async function appliedVersions(client) {
  const { rows } = await client.query('SELECT version FROM schema_migrations ORDER BY version')
  return new Set(rows.map(r => r.version))
}

async function run() {
  const statusOnly = process.argv.includes('--status')
  const client = await pool.connect()

  try {
    await ensureMigrationsTable(client)
    const applied = await appliedVersions(client)

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort()

    if (statusOnly) {
      console.log('\nMigration status:\n')
      for (const f of files) {
        const version = path.basename(f, '.sql')
        const status  = applied.has(version) ? '✓ applied' : '○ pending'
        console.log(`  ${status}  ${f}`)
      }
      console.log()
      return
    }

    const pending = files.filter(f => !applied.has(path.basename(f, '.sql')))

    if (pending.length === 0) {
      console.log('✓ Database is up to date — no pending migrations.')
      return
    }

    console.log(`Applying ${pending.length} migration(s)…\n`)

    for (const file of pending) {
      const version = path.basename(file, '.sql')
      const sql     = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      console.log(`  → ${file}`)
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [version]
        )
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        console.error(`\n✗ Migration failed: ${file}\n`, err.message)
        process.exit(1)
      }
    }

    console.log('\n✓ All migrations applied successfully.')
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch(err => {
  console.error('Migration runner error:', err)
  process.exit(1)
})
