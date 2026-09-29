const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const db = require('../db')
const { JWT_SECRET, auth, requireRole } = require('../middleware/auth')

const router = express.Router()

const captchaStore = new Map()
const loginAttempts = new Map()

const MAX_ATTEMPTS = 5
const LOCK_DURATION = 15 * 60 * 1000

function createCaptcha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz'
  let text = ''
  for (let i = 0; i < 5; i++) text += chars[Math.floor(Math.random() * chars.length)]
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  captchaStore.set(id, { text: text.toUpperCase(), expire: Date.now() + 3 * 60 * 1000 })
  setTimeout(() => captchaStore.delete(id), 3 * 60 * 1000)

  const w = 130
  const h = 44
  const noise = []
  for (let i = 0; i < 15; i++) {
    noise.push(
      `<line x1="${Math.random() * w}" y1="${Math.random() * h}" x2="${Math.random() * w}" y2="${Math.random() * h}" stroke="#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}" stroke-opacity="${0.2 + Math.random() * 0.3}" />`
    )
  }
  const dots = []
  for (let i = 0; i < 80; i++) {
    dots.push(`<circle cx="${Math.random() * w}" cy="${Math.random() * h}" r="0.5" fill="#555" opacity="${Math.random() * 0.5}"/>`)
  }
  const colors = ['#ff8c42', '#ffb627', '#42d97a', '#e85d75', '#5b9bd5']
  const letters = text
    .split('')
    .map((c, i) => {
      const x = 16 + i * 22
      const rot = Math.floor(Math.random() * 50) - 25
      const color = colors[i % colors.length]
      const size = 18 + Math.floor(Math.random() * 6)
      return `<text x="${x}" y="30" fill="${color}" font-size="${size}" font-family="Consolas, monospace" transform="rotate(${rot} ${x} 22)">${c}</text>`
    })
    .join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="#1a1a2e"/>
    ${noise.join('')}
    ${dots.join('')}
    ${letters}
  </svg>`

  return { id, svg: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` }
}

router.get('/captcha', (req, res) => {
  res.json({ code: 0, data: createCaptcha() })
})

function getAttemptKey(username, ip) {
  return `${username || ''}:${ip || ''}`
}

function getRemainingLock(key) {
  const record = loginAttempts.get(key)
  if (!record || !record.lockUntil) return 0
  const remaining = record.lockUntil - Date.now()
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0
}

router.post('/login', (req, res) => {
  const { username, password, phone, captchaId, captchaCode, loginType } = req.body || {}
  const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown'
  const attemptKey = getAttemptKey(username || phone, clientIp)

  const lockRemaining = getRemainingLock(attemptKey)
  if (lockRemaining > 0) {
    return res.status(429).json({
      code: 429,
      message: `账号已锁定，请${lockRemaining}秒后重试`,
      lockUntil: lockRemaining
    })
  }

  const stored = captchaStore.get(captchaId)
  if (!stored || stored.expire < Date.now()) {
    return res.status(400).json({ code: 400, message: '验证码已过期' })
  }
  if (!captchaCode || stored.text !== String(captchaCode).toUpperCase()) {
    captchaStore.delete(captchaId)
    return res.status(400).json({ code: 400, message: '验证码错误' })
  }
  captchaStore.delete(captchaId)

  let user
  if (loginType === 'phone') {
    if (!phone || !password) return res.status(400).json({ code: 400, message: '请输入手机号和密码' })
    user = db.prepare('SELECT * FROM users WHERE phone = ? AND status = 1').get(phone)
  } else {
    if (!username || !password) return res.status(400).json({ code: 400, message: '请输入用户名和密码' })
    user = db.prepare('SELECT * FROM users WHERE username = ? AND status = 1').get(username)
  }

  if (!user || !bcrypt.compareSync(password, user.password)) {
    const record = loginAttempts.get(attemptKey) || { count: 0, lockUntil: 0 }
    record.count += 1
    if (record.count >= MAX_ATTEMPTS) {
      record.lockUntil = Date.now() + LOCK_DURATION
      loginAttempts.set(attemptKey, record)
      try {
        db.prepare(
          `INSERT INTO audit_log (user_id, username, action, target, method, ip, status, detail)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(null, username || phone || '', 'login_locked', attemptKey, 'POST', clientIp, 'blocked',
          `连续失败${record.count}次，锁定15分钟`)
      } catch (e) { /* ignore */ }
      return res.status(429).json({
        code: 429,
        message: `账号已锁定，连续失败${MAX_ATTEMPTS}次，请15分钟后重试`,
        lockUntil: 900
      })
    }
    loginAttempts.set(attemptKey, record)
    return res.status(401).json({
      code: 401,
      message: '账号或密码错误',
      remainAttempts: MAX_ATTEMPTS - record.count
    })
  }

  loginAttempts.delete(attemptKey)

  const permissions = JSON.parse(user.permissions || '[]')
  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions,
      phone: user.phone
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  )

  try {
    db.prepare(
      `INSERT INTO audit_log (user_id, username, action, target, method, ip, status, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(user.id, user.username, 'login', '-', 'POST', clientIp, 'success', '登录成功')
  } catch (e) { /* ignore */ }

  res.json({
    code: 0,
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        role: user.role,
        permissions,
        avatar: user.avatar
      }
    },
    message: '登录成功'
  })
})

router.get('/me', auth(), (req, res) => {
  const user = db.prepare('SELECT id, username, phone, role, permissions, avatar, status, created_at FROM users WHERE id = ?').get(req.user.id)
  if (!user) return res.status(404).json({ code: 404, message: '用户不存在' })
  user.permissions = JSON.parse(user.permissions || '[]')
  res.json({ code: 0, data: user })
})

router.get('/users', auth(), requireRole('admin'), (req, res) => {
  const rows = db
    .prepare('SELECT id, username, phone, role, permissions, avatar, status, created_at, updated_at FROM users ORDER BY id DESC')
    .all()
    .map((u) => ({ ...u, permissions: JSON.parse(u.permissions || '[]') }))
  res.json({ code: 0, data: rows })
})

router.post('/users', auth(), requireRole('admin'), (req, res) => {
  const { username, password, phone, role = 'viewer', permissions, status = 1 } = req.body || {}
  if (!username || !password) return res.status(400).json({ code: 400, message: '用户名和密码必填' })
  const weakRegex = /^(?=.{8,}$)(?=.*[a-zA-Z])(?=.*\d).*$/
  if (!weakRegex.test(password)) {
    return res.status(400).json({ code: 400, message: '密码至少8位，必须包含字母和数字' })
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (exists) return res.status(400).json({ code: 400, message: '用户名已存在' })
  const hash = bcrypt.hashSync(password, 10)
  const perms = JSON.stringify(permissions || ['dashboard', 'charts'])
  const info = db
    .prepare(
      `INSERT INTO users (username, password, phone, role, permissions, status) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(username, hash, phone || null, role, perms, status)
  res.json({ code: 0, data: { id: info.lastInsertRowid }, message: '创建成功' })
})

router.put('/users/:id', auth(), requireRole('admin'), (req, res) => {
  const id = Number(req.params.id)
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  if (!user) return res.status(404).json({ code: 404, message: '用户不存在' })
  const { username, password, phone, role, permissions, status } = req.body || {}
  const hash = password ? bcrypt.hashSync(password, 10) : user.password
  db.prepare(
    `UPDATE users SET username=?, password=?, phone=?, role=?, permissions=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`
  ).run(
    username || user.username,
    hash,
    phone ?? user.phone,
    role || user.role,
    JSON.stringify(permissions || JSON.parse(user.permissions || '[]')),
    status ?? user.status,
    id
  )
  res.json({ code: 0, message: '更新成功' })
})

router.delete('/users/:id', auth(), requireRole('admin'), (req, res) => {
  const id = Number(req.params.id)
  if (id === req.user.id) return res.status(400).json({ code: 400, message: '不能删除当前登录用户' })
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
  res.json({ code: 0, message: '删除成功' })
})

module.exports = router
