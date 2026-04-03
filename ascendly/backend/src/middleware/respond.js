

function sendError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra })
}

function sendOk(res, message) {
  return res.json(message ? { ok: true, message } : { ok: true })
}

module.exports = { sendError, sendOk }
