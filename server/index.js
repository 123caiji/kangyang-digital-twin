require('./env') // 必须最先执行：后续模块在加载时就会读取 process.env

const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
const authRoutes = require('./routes/auth')
const dataRoutes = require('./routes/data')
const settingsRoutes = require('./routes/settings')
const predictRoutes = require('./routes/predict')
const aiRoutes = require('./routes/ai')
const iotRoutes = require('./routes/iot')
const overviewRoutes = require('./routes/overview')
const { auditMiddleware } = require('./middleware/audit')
const { desensitizeMiddleware } = require('./middleware/desensitize')

require('./db')

const app = express()
const PORT = process.env.PORT || 3001

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://152.136.36.198',
  'http://localhost:3001'
]

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(null, false)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.use(desensitizeMiddleware)

app.use('/api/auth', authRoutes)
app.use('/api/data', dataRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/predict', predictRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/iot', iotRoutes)
app.use('/api/overview', overviewRoutes)

app.use(auditMiddleware)

app.get('/api/health', (_req, res) => {
  res.json({ code: 0, message: 'kangyang server ok', time: new Date().toISOString() })
})

// 审计日志查询接口
const { auth, requireRole } = require('./middleware/auth')
app.get('/api/audit/logs', auth(), requireRole('admin'), (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50))
  const rows = require('./db').prepare(
    'SELECT * FROM audit_log ORDER BY id DESC LIMIT ?'
  ).all(limit)
  res.json({ code: 0, data: rows })
})

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ code: 500, message: err.message || '服务器错误' })
})

app.listen(PORT, () => {
  console.log(`康养数字孪生 API running at http://localhost:${PORT}`)
})
