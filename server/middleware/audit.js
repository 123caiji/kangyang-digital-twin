const db = require('../db')

function getClientIp(req) {
  return req.ip || req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown'
}

function writeAudit(userId, username, action, target, method, ip, status, detail) {
  try {
    db.prepare(
      `INSERT INTO audit_log (user_id, username, action, target, method, ip, status, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(userId || null, username || '', action, target, method, ip, status, detail || '')
  } catch (e) {
    console.error('审计日志写入失败:', e.message)
  }
}

function auditMiddleware(req, res, next) {
  const originalJson = res.json.bind(res)
  res.json = function (data) {
    if (req.method !== 'GET' && req.user) {
      const action = `${req.method.toLowerCase()}_${req.path.split('/').slice(-2).join('_')}`
      writeAudit(
        req.user.id, req.user.username, action,
        req.path, req.method, getClientIp(req),
        data.code === 0 ? 'success' : 'failed',
        JSON.stringify(req.body || {}).slice(0, 500)
      )
    }
    return originalJson(data)
  }
  next()
}

module.exports = { auditMiddleware, writeAudit, getClientIp }
