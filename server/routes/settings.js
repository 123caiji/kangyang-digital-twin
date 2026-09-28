const express = require('express')
const db = require('../db')
const { auth, requirePerm, requireRole } = require('../middleware/auth')

const router = express.Router()

router.get('/', auth(), (req, res) => {
  const rows = db.prepare('SELECT key, value FROM system_settings').all()
  const settings = {}
  rows.forEach((r) => {
    settings[r.key] = r.value
  })
  res.json({ code: 0, data: settings })
})

router.put('/', auth(), requirePerm('settings'), (req, res) => {
  const body = req.body || {}
  const upsert = db.prepare(
    `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now','localtime')`
  )
  const tx = db.transaction((entries) => {
    for (const [k, v] of entries) upsert.run(k, String(v))
  })
  tx(Object.entries(body))
  res.json({ code: 0, message: '样式设置已保存' })
})

router.get('/db-config', auth(), requirePerm('db'), (req, res) => {
  const rows = db.prepare('SELECT id, name, type, host, port, database_name, username, is_active, created_at FROM db_config ORDER BY id DESC').all()
  res.json({ code: 0, data: rows })
})

router.post('/db-config', auth(), requireRole('admin'), (req, res) => {
  const { name, type = 'sqlite', host, port, database_name, username, password, is_active = 0 } = req.body || {}
  if (!name) return res.status(400).json({ code: 400, message: '名称必填' })
  if (is_active) db.prepare('UPDATE db_config SET is_active = 0').run()
  const info = db
    .prepare(
      `INSERT INTO db_config (name, type, host, port, database_name, username, password, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(name, type, host || '', Number(port) || 0, database_name || '', username || '', password || '', is_active ? 1 : 0)
  res.json({ code: 0, data: { id: info.lastInsertRowid }, message: '保存成功' })
})

router.put('/db-config/:id', auth(), requireRole('admin'), (req, res) => {
  const id = Number(req.params.id)
  const row = db.prepare('SELECT * FROM db_config WHERE id=?').get(id)
  if (!row) return res.status(404).json({ code: 404, message: '配置不存在' })
  const { name, type, host, port, database_name, username, password, is_active } = req.body || {}
  if (is_active) db.prepare('UPDATE db_config SET is_active = 0').run()
  db.prepare(
    `UPDATE db_config SET name=?, type=?, host=?, port=?, database_name=?, username=?, password=?, is_active=? WHERE id=?`
  ).run(
    name ?? row.name,
    type ?? row.type,
    host ?? row.host,
    port ?? row.port,
    database_name ?? row.database_name,
    username ?? row.username,
    password ?? row.password,
    is_active != null ? (is_active ? 1 : 0) : row.is_active,
    id
  )
  res.json({ code: 0, message: '更新成功' })
})

router.delete('/db-config/:id', auth(), requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM db_config WHERE id=?').run(Number(req.params.id))
  res.json({ code: 0, message: '删除成功' })
})

router.post('/db-config/test', auth(), requirePerm('db'), (req, res) => {
  const { type = 'sqlite', database_name } = req.body || {}
  if (type === 'sqlite') {
    try {
      const Database = require('better-sqlite3')
      const testDb = new Database(database_name || db.name, { readonly: true, fileMustExist: false })
      testDb.prepare('SELECT 1').get()
      testDb.close()
      return res.json({ code: 0, message: 'SQLite 连接测试成功' })
    } catch (e) {
      return res.status(400).json({ code: 400, message: `连接失败: ${e.message}` })
    }
  }
  res.json({ code: 0, message: `${type} 配置已接收（演示环境仅校验 SQLite）` })
})

module.exports = router
