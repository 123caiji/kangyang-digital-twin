const jwt = require('jsonwebtoken')

/**
 * 签发密钥只应来自环境变量。
 * 这里的兜底值仅用于本地开发（源码公开，写死真密钥等于公开凭证）；
 * 生产部署请通过 server/.env 或 systemd/pm2 注入随机值。
 */
const DEV_FALLBACK_SECRET = 'kangyang-dev-only-secret-please-set-JWT_SECRET'
const JWT_SECRET = process.env.JWT_SECRET || DEV_FALLBACK_SECRET

if (JWT_SECRET === DEV_FALLBACK_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[warn] 生产环境未设置 JWT_SECRET，正在使用开发兜底值，请尽快配置随机密钥')
}

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
