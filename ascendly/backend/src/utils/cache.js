// Lightweight in-process Map-based TTL cache.
// No external dependencies. Suitable for dashboard queries that are
// read-heavy and tolerate up to TTL_MS seconds of staleness.
//
// Usage:
//   const cache = require('../utils/cache')
//   const hit = cache.get('key')
//   if (hit) return res.json(hit)
//   const data = await expensiveQuery()
//   cache.set('key', data, 30_000)   // 30 s TTL
//   res.json(data)
//
// Call cache.invalidate('prefix') from write routes to evict stale entries.

const store = new Map()

function get(key) {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expires) { store.delete(key); return null }
  return entry.value
}

function set(key, value, ttlMs = 30_000) {
  store.set(key, { value, expires: Date.now() + ttlMs })
}

// Remove every key that starts with prefix (e.g. 'team:org-uuid')
function invalidate(prefix) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}

module.exports = { get, set, invalidate }
