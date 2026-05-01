// ══════════════════════════════════════
//  Ascendly CRM — Audit Logger Helper
// ══════════════════════════════════════
const crypto = require('crypto')
const pool   = require('../db/pool')

// #40 — compute SHA-256 chain hash over previous hash + event data
async function writeAudit(actorId, action, description, orgId = null, entityType = null, entityId = null) {
  try {
    // Get last chain hash for this org (NULL-safe comparison)
    const { rows: prev } = await pool.query(
      `SELECT chain_hash FROM audit_log
       WHERE org_id IS NOT DISTINCT FROM $1
       ORDER BY occurred_at DESC, id DESC LIMIT 1`,
      [orgId || null]
    )
    const prevHash   = prev[0]?.chain_hash || '0'.repeat(64)
    const occurredAt = new Date()
    const chainInput = `${prevHash}|${action}|${description || ''}|${occurredAt.toISOString()}`
    const chain_hash = crypto.createHash('sha256').update(chainInput).digest('hex')

    await pool.query(
      `INSERT INTO audit_log
         (actor_id, org_id, action, description, entity_type, entity_id, occurred_at, chain_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [actorId || null, orgId || null, action, description, entityType || null, entityId || null, occurredAt, chain_hash]
    )
  } catch (e) {
    console.error('[Audit] Failed to write audit log:', e.message)
  }
}

module.exports = { writeAudit }
