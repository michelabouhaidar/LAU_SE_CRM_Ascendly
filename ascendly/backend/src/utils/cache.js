

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

function invalidate(prefix) {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}

module.exports = { get, set, invalidate }
