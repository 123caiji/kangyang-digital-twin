const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'smart-city-digital-twin-secret-2026'

function auth(required = true) {
  return (req, res, next) => {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) {
      if (required) return res.status(401).json({ code: 401, message: '未登录或令牌失效' })
      req.user = null
      return next()
    }
    try {
      req.user = jwt.verify(token, JWT_SECRET)
      next()
    } catch {
      return res.status(401).json({ code: 401, message: '令牌无效或已过期' })
    }
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ code: 401, message: '未登录' })
    if (roles.includes(req.user.role) || req.user.role === 'admin') return next()
    return res.status(403).json({ code: 403, message: '权限不足' })
  }
}

function requirePerm(perm) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ code: 401, message: '未登录' })
    if (req.user.role === 'admin') return next()
    const perms = req.user.permissions || []
    if (perms.includes(perm)) return next()
    return res.status(403).json({ code: 403, message: '无此功能权限' })
  }
}

module.exports = { auth, requireRole, requirePerm, JWT_SECRET }
