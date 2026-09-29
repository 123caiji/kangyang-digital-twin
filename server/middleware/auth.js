const jwt = require('jsonwebtoken')
const crypto = require('crypto')

// JWT 密钥必须来自环境变量，不接受硬编码兜底值
// 生产环境未设置时直接终止启动，避免使用可预测的密钥
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] 生产环境必须设置 JWT_SECRET 环境变量，服务拒绝启动')
    process.exit(1)
  }
  // 开发环境生成随机临时密钥（每次重启不同，不持久化）
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('base64url')
  console.warn('[warn] 开发环境未设置 JWT_SECRET，已生成随机临时密钥')
}

const JWT_SECRET = process.env.JWT_SECRET

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
