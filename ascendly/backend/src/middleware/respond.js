// ══════════════════════════════════════════════════════════
//  Ascendly CRM — Shared response helpers
//
//  Convention:
//   • Error   responses: { error: string }           (4xx / 5xx)
//   • Success responses: resource object OR { ok: true, message?: string }
//
//  Using these helpers keeps the shape consistent across all routes.
// ══════════════════════════════════════════════════════════

/**
 * Send a standardised error response.
 * @param {import('express').Response} res
 * @param {number} status  HTTP status code
 * @param {string} message Human-readable error message
 * @param {object} [extra] Optional extra fields (e.g. { code: 'CONFLICT' })
 */
function sendError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra })
}

/**
 * Send a standardised success-with-no-body response (e.g. DELETE, logout).
 * @param {import('express').Response} res
 * @param {string} [message] Optional human-readable confirmation
 */
function sendOk(res, message) {
  return res.json(message ? { ok: true, message } : { ok: true })
}

module.exports = { sendError, sendOk }
