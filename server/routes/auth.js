const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const db = require('../db')
const { JWT_SECRET, auth, requireRole } = require('../middleware/auth')

const router = express.Router()

const captchaStore = new Map()

function createCaptcha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let text = ''
  for (let i = 0; i < 4; i++) text += chars[Math.floor(Math.random() * chars.length)]
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  captchaStore.set(id, { text: text.toUpperCase(), expire: Date.now() + 5 * 60 * 1000 })
  setTimeout(() => captchaStore.delete(id), 5 * 60 * 1000)

  const w = 120
  const h = 40
  const noise = []
  for (let i = 0; i < 6; i++) {
    noise.push(
      `<line x1="${Math.random() * w}" y1="${Math.random() * h}" x2="${Math.random() * w}" y2="${Math.random() * h}" stroke="#0ea5e9" stroke-opacity="0.35" />`
    )
  }
  const letters = text
    .split('')
    .map((c, i) => {
      const x = 18 + i * 24
      const rot = Math.floor(Math.random() * 30) - 15
      const color = ['#67e8f9', '#38bdf8', '#22d3ee', '#a5f3fc'][i]
      return `<text x="${x}" y="28" fill="${color}" font-size="22" font-family="Consolas, monospace" transform="rotate(${rot} ${x} 20)">${c}</text>`
    })
    .join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="#0b1220"/>
    ${noise.join('')}
    ${letters}
  </svg>`

  return { id, svg: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` }
}

router.get('/captcha', (req, res) => {
  res.json({ code: 0, data: createCaptcha() })
})

router.post('/login', (req, res) => {
  const { username, password, phone, captchaId, captchaCode, loginType } = req.body || {}
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
    return res.status(401).json({ code: 401, message: '账号或密码错误' })
  }

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
    { expiresIn: '12h' }
  )

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
