const express = require('express')
const ExcelJS = require('exceljs')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const db = require('../db')
const { auth, requirePerm } = require('../middleware/auth')

const router = express.Router()
const upload = multer({ dest: path.join(__dirname, '../uploads') })
const uploadDir = path.join(__dirname, '../uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const TABLES = {
  residents: {
    label: '住户档案',
    columns: ['id', 'name', 'gender', 'age', 'room_no', 'care_level', 'health_status', 'admission_date', 'contact_phone', 'emergency_contact', 'conditions', 'remark', 'created_at'],
    writable: ['name', 'gender', 'age', 'room_no', 'care_level', 'health_status', 'admission_date', 'contact_phone', 'emergency_contact', 'conditions', 'remark']
  },
  rooms: {
    label: '房间管理',
    columns: ['id', 'room_no', 'floor', 'type', 'capacity', 'occupancy', 'status', 'remark', 'created_at'],
    writable: ['room_no', 'floor', 'type', 'capacity', 'occupancy', 'status', 'remark']
  },
  devices: {
    label: '设备台账',
    columns: ['id', 'name', 'type', 'room_no', 'resident_id', 'status', 'battery', 'last_active', 'remark', 'created_at'],
    writable: ['name', 'type', 'room_no', 'resident_id', 'status', 'battery', 'last_active', 'remark']
  },
  resident_health: {
    label: '健康监测',
    columns: ['id', 'resident_id', 'resident_name', 'heart_rate', 'breathing_rate', 'spo2', 'temperature', 'systolic', 'diastolic', 'glucose', 'fall_status', 'pir_status', 'status', 'measured_at', 'remark', 'created_at'],
    writable: ['resident_id', 'resident_name', 'heart_rate', 'breathing_rate', 'spo2', 'temperature', 'systolic', 'diastolic', 'glucose', 'fall_status', 'pir_status', 'status', 'measured_at', 'remark']
  },
  care_records: {
    label: '护理记录',
    columns: ['id', 'resident_id', 'resident_name', 'caregiver', 'care_type', 'content', 'shift', 'date', 'remark', 'created_at'],
    writable: ['resident_id', 'resident_name', 'caregiver', 'care_type', 'content', 'shift', 'date', 'remark']
  },
  room_environment: {
    label: '室内环境',
    columns: ['id', 'room_no', 'temperature', 'humidity', 'pm25', 'pm10', 'smoke', 'illumination', 'co2', 'light', 'noise', 'pir_status', 'status', 'measured_at', 'created_at'],
    writable: ['room_no', 'temperature', 'humidity', 'pm25', 'pm10', 'smoke', 'illumination', 'co2', 'light', 'noise', 'pir_status', 'status', 'measured_at']
  },
  outdoor_weather: {
    label: '室外气象',
    columns: ['id', 'temperature', 'humidity', 'pressure', 'wind_direction', 'wind_speed', 'pm25', 'pm10', 'illumination', 'status', 'measured_at', 'created_at'],
    writable: ['temperature', 'humidity', 'pressure', 'wind_direction', 'wind_speed', 'pm25', 'pm10', 'illumination', 'status', 'measured_at']
  },
  soil_monitor: {
    label: '土壤监测',
    columns: ['id', 'zone', 'soil_temp_1', 'soil_humi_1', 'soil_temp_2', 'soil_humi_2', 'soil_temp_3', 'soil_humi_3', 'ph', 'nitrogen', 'phosphorus', 'potassium', 'measured_at', 'created_at'],
    writable: ['zone', 'soil_temp_1', 'soil_humi_1', 'soil_temp_2', 'soil_humi_2', 'soil_temp_3', 'soil_humi_3', 'ph', 'nitrogen', 'phosphorus', 'potassium', 'measured_at']
  },
  iot_raw_data: {
    label: 'IoT原始数据',
    columns: ['id', 'device_id', 'payload', 'received_at'],
    writable: ['device_id', 'payload']
  },
  device_usage: {
    label: '设备使用',
    columns: ['id', 'device_name', 'device_type', 'room_no', 'usage_hours', 'power_consumption', 'alert_count', 'date', 'created_at'],
    writable: ['device_name', 'device_type', 'room_no', 'usage_hours', 'power_consumption', 'alert_count', 'date']
  },
  alarms: {
    label: '告警事件',
    columns: ['id', 'title', 'type', 'level', 'room_no', 'resident_id', 'resident_name', 'status', 'description', 'handler', 'created_at', 'resolved_at'],
    writable: ['title', 'type', 'level', 'room_no', 'resident_id', 'resident_name', 'status', 'description', 'handler', 'resolved_at']
  }
}

router.get('/stats/overview', auth(), (req, res) => {
  const residents = db.prepare("SELECT care_level, health_status, COUNT(*) as cnt FROM residents GROUP BY care_level, health_status").all()
  const health = db.prepare("SELECT resident_name, AVG(heart_rate) as heart_rate, AVG(systolic) as systolic, AVG(spo2) as spo2 FROM resident_health GROUP BY resident_name").all()
  const env = db.prepare("SELECT room_no, AVG(temperature) as temperature, AVG(humidity) as humidity, AVG(pm25) as pm25 FROM room_environment GROUP BY room_no").all()
  const devices = db.prepare("SELECT type, status, COUNT(*) as cnt FROM devices GROUP BY type, status").all()
  const alarms = db.prepare("SELECT type, level, status, COUNT(*) as cnt FROM alarms GROUP BY type, level, status").all()
  const care = db.prepare("SELECT care_type, COUNT(*) as cnt FROM care_records GROUP BY care_type").all()
  const rooms = db.prepare("SELECT floor, status, COUNT(*) as cnt FROM rooms GROUP BY floor, status").all()
  res.json({ code: 0, data: { residents, health, env, devices, alarms, care, rooms } })
})

router.get('/tables', auth(), requirePerm('data'), (req, res) => {
  res.json({
    code: 0,
    data: Object.entries(TABLES).map(([key, meta]) => ({ key, label: meta.label, columns: meta.columns }))
  })
})

router.get('/:table', auth(), (req, res) => {
  const meta = TABLES[req.params.table]
  if (!meta) return res.status(400).json({ code: 400, message: '无效数据表' })
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
  const keyword = (req.query.keyword || '').trim()
  let where = ''
  const params = []
  if (keyword) {
    const likeCols = meta.writable.filter((c) => typeof c === 'string')
    where = `WHERE ${likeCols.map((c) => `${c} LIKE ?`).join(' OR ')}`
    likeCols.forEach(() => params.push(`%${keyword}%`))
  }
  const total = db.prepare(`SELECT COUNT(*) as c FROM ${req.params.table} ${where}`).get(...params).c
  const rows = db
    .prepare(`SELECT * FROM ${req.params.table} ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize)
  res.json({ code: 0, data: { list: rows, total, page, pageSize } })
})

router.post('/:table', auth(), requirePerm('data'), (req, res) => {
  const meta = TABLES[req.params.table]
  if (!meta) return res.status(400).json({ code: 400, message: '无效数据表' })
  const body = req.body || {}
  const cols = meta.writable.filter((c) => body[c] !== undefined)
  if (!cols.length) return res.status(400).json({ code: 400, message: '无有效字段' })
  const placeholders = cols.map(() => '?').join(',')
  const info = db
    .prepare(`INSERT INTO ${req.params.table} (${cols.join(',')}) VALUES (${placeholders})`)
    .run(...cols.map((c) => body[c]))
  res.json({ code: 0, data: { id: info.lastInsertRowid }, message: '新增成功' })
})

router.put('/:table/:id', auth(), requirePerm('data'), (req, res) => {
  const meta = TABLES[req.params.table]
  if (!meta) return res.status(400).json({ code: 400, message: '无效数据表' })
  const body = req.body || {}
  const cols = meta.writable.filter((c) => body[c] !== undefined)
  if (!cols.length) return res.status(400).json({ code: 400, message: '无有效字段' })
  const sets = cols.map((c) => `${c}=?`).join(',')
  db.prepare(`UPDATE ${req.params.table} SET ${sets} WHERE id=?`).run(...cols.map((c) => body[c]), Number(req.params.id))
  res.json({ code: 0, message: '更新成功' })
})

router.delete('/:table/:id', auth(), requirePerm('data'), (req, res) => {
  const meta = TABLES[req.params.table]
  if (!meta) return res.status(400).json({ code: 400, message: '无效数据表' })
  db.prepare(`DELETE FROM ${req.params.table} WHERE id=?`).run(Number(req.params.id))
  res.json({ code: 0, message: '删除成功' })
})

router.get('/:table/export', auth(), requirePerm('data'), async (req, res) => {
  const meta = TABLES[req.params.table]
  if (!meta) return res.status(400).json({ code: 400, message: '无效数据表' })
  const rows = db.prepare(`SELECT * FROM ${req.params.table} ORDER BY id DESC`).all()
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(meta.label)
  sheet.columns = meta.columns.map((c) => ({ header: c, key: c, width: 16 }))
  rows.forEach((r) => sheet.addRow(r))
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename=${req.params.table}.xlsx`)
  await workbook.xlsx.write(res)
  res.end()
})

router.post('/:table/import', auth(), requirePerm('data'), upload.single('file'), async (req, res) => {
  const meta = TABLES[req.params.table]
  if (!meta) return res.status(400).json({ code: 400, message: '无效数据表' })
  if (!req.file) return res.status(400).json({ code: 400, message: '请上传文件' })
  try {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(req.file.path)
    const sheet = workbook.worksheets[0]
    const headers = []
    sheet.getRow(1).eachCell((cell, col) => {
      headers[col] = String(cell.value)
    })
    const insertCols = meta.writable.filter((c) => headers.includes(c))
    if (!insertCols.length) return res.status(400).json({ code: 400, message: 'Excel列不匹配' })
    const stmt = db.prepare(
      `INSERT INTO ${req.params.table} (${insertCols.join(',')}) VALUES (${insertCols.map(() => '?').join(',')})`
    )
    const tx = db.transaction((items) => {
      for (const item of items) stmt.run(...item)
    })
    const items = []
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return
      const values = insertCols.map((c) => {
        const idx = headers.indexOf(c)
        return row.getCell(idx).value
      })
      items.push(values)
    })
    tx(items)
    fs.unlinkSync(req.file.path)
    res.json({ code: 0, message: `成功导入 ${items.length} 条` })
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path)
    res.status(500).json({ code: 500, message: e.message })
  }
})

module.exports = router
