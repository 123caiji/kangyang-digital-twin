const express = require('express')
const crypto = require('crypto')
const db = require('../db')
const { auth, requireRole } = require('../middleware/auth')

const router = express.Router()
const PRODUCT_KEY = 'a1MlghnXTvu'

// ============================================================
// TSL 物模型字段映射 + 范围校验规则（来自真实物模型 specs）
// ============================================================
const TSL_MAP = {
  // ===== 健康监测（resident_health）=====
  Heartbeat: { table: 'resident_health', column: 'heart_rate', type: 'int', min: 1, max: 200 },
  BreathingRate: { table: 'resident_health', column: 'breathing_rate', type: 'int', min: 1, max: 100 },
  SPO2: { table: 'resident_health', column: 'spo2', type: 'int', min: 0, max: 100 },
  fall: { table: 'resident_health', column: 'fall_status', type: 'text' },
  Person: { table: 'resident_health', column: 'person_info', type: 'text' },

  // ===== 室内环境（room_environment）=====
  temp: { table: 'room_environment', column: 'temperature', type: 'float', min: 0, max: 100 },
  humi: { table: 'room_environment', column: 'humidity', type: 'float', min: 0, max: 100 },
  PM25_inside: { table: 'room_environment', column: 'pm25', type: 'int', min: 0, max: 300 },
  PM10_inside: { table: 'room_environment', column: 'pm10', type: 'int', min: 0, max: 300 },
  adc: { table: 'room_environment', column: 'smoke', type: 'float', min: 0, max: 1000 },
  Warning: { table: 'room_environment', column: 'warning_level', type: 'int', min: 0, max: 20 },
  SG90: { table: 'room_environment', column: 'sg90_status', type: 'bool' },
  PIR: { table: 'room_environment', column: 'pir_status', type: 'int', min: 0, max: 1 },

  // ===== 室外气象（outdoor_weather）=====
  PM25: { table: 'outdoor_weather', column: 'pm25', type: 'int', min: 0, max: 255 },
  Atmospheric_temperature: { table: 'outdoor_weather', column: 'temperature', type: 'float', min: -50, max: 50 },
  Atmospheric_humidity: { table: 'outdoor_weather', column: 'humidity', type: 'float', min: 0, max: 100 },
  Atmospheric_pressure: { table: 'outdoor_weather', column: 'pressure', type: 'float', min: 0, max: 1100 },
  Wind_direction: { table: 'outdoor_weather', column: 'wind_direction', type: 'int', min: 0, max: 360 },
  Wind_Speed: { table: 'outdoor_weather', column: 'wind_speed', type: 'float', min: 0, max: 1000 },
  PM10: { table: 'outdoor_weather', column: 'pm10', type: 'float', min: 0, max: 9999 },
  illumination: { table: 'outdoor_weather', column: 'illumination', type: 'int', min: 0, max: 65535 },

  // ===== 土壤监测（soil_monitor）=====
  tw1: { table: 'soil_monitor', column: 'soil_temp_1', type: 'float', min: -50, max: 80 },
  ts1: { table: 'soil_monitor', column: 'soil_humi_1', type: 'float', min: 0, max: 100 },
  tw2: { table: 'soil_monitor', column: 'soil_temp_2', type: 'float', min: -50, max: 80 },
  ts2: { table: 'soil_monitor', column: 'soil_humi_2', type: 'float', min: 0, max: 100 },
  tw3: { table: 'soil_monitor', column: 'soil_temp_3', type: 'float', min: -50, max: 80 },
  ts3: { table: 'soil_monitor', column: 'soil_humi_3', type: 'float', min: 0, max: 100 },
  PH2: { table: 'soil_monitor', column: 'ph', type: 'float', min: 0, max: 100 },
  N2: { table: 'soil_monitor', column: 'nitrogen', type: 'float', min: 0, max: 1999 },
  P2: { table: 'soil_monitor', column: 'phosphorus', type: 'float', min: 0, max: 1999 },
  K2: { table: 'soil_monitor', column: 'potassium', type: 'float', min: 0, max: 1999 },

  // ===== 设备标识（不入业务表，仅记录）=====
  ID: { table: 'meta', column: 'device_id' }
}

// ============================================================
// 数据范围校验
// ============================================================
function validateTSL(identifier, value) {
  const map = TSL_MAP[identifier]
  if (!map) return { valid: true, value }
  if (map.table === 'meta') return { valid: true, value }

  let numValue = value
  if (map.type === 'int') {
    numValue = Number.parseInt(value, 10)
    if (Number.isNaN(numValue)) return { valid: false, reason: '类型错误，期望int' }
  } else if (map.type === 'float') {
    numValue = Number.parseFloat(value)
    if (Number.isNaN(numValue)) return { valid: false, reason: '类型错误，期望float' }
  } else if (map.type === 'bool') {
    numValue = value ? 1 : 0
  }

  if (map.min !== undefined && map.max !== undefined) {
    if (numValue < map.min || numValue > map.max) {
      return { valid: false, reason: `超出范围 [${map.min}, ${map.max}]`, value: numValue }
    }
  }
  return { valid: true, value: numValue }
}

// ============================================================
// 设备Token认证中间件
// ============================================================
function deviceAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ code: 401, message: '设备未认证：缺少Token' })

  const device = db.prepare('SELECT * FROM iot_devices WHERE device_token = ?').get(token)
  if (!device || device.status !== 'online') {
    return res.status(401).json({ code: 401, message: '设备未认证：Token无效或设备已禁用' })
  }

  // 更新最后在线时间
  db.prepare('UPDATE iot_devices SET last_seen = datetime(\'now\',\'localtime\') WHERE id = ?').run(device.id)

  req.device = device
  next()
}

// ============================================================
// 健康状态评估
// ============================================================
function assessHealthStatus(d) {
  if (d.fall_status === 'detected' || d.fall_status === 'fall') return 'critical'
  if ((d.heart_rate && (d.heart_rate > 180 || d.heart_rate < 40)) ||
      (d.spo2 && d.spo2 < 90) ||
      (d.warning_level && d.warning_level >= 5)) return 'critical'
  if ((d.heart_rate && (d.heart_rate > 100 || d.heart_rate < 50)) ||
      (d.spo2 && d.spo2 < 95) ||
      (d.breathing_rate && (d.breathing_rate > 24 || d.breathing_rate < 10)) ||
      (d.warning_level && d.warning_level >= 2)) return 'attention'
  return 'normal'
}

// ============================================================
// 环境状态评估
// ============================================================
function assessEnvStatus(d) {
  if ((d.smoke && d.smoke > 500) || (d.warning_level && d.warning_level >= 5)) return 'critical'
  if ((d.pm25 && d.pm25 > 150) || (d.smoke && d.smoke > 200) ||
      (d.humidity && (d.humidity > 80 || d.humidity < 20)) ||
      (d.temperature && (d.temperature > 32 || d.temperature < 10))) return 'attention'
  return 'normal'
}

// ============================================================
// 生成告警
// ============================================================
function createAlarm(device, level, type, title, description) {
  try {
    db.prepare(
      `INSERT INTO alarms (title, type, level, room_no, resident_id, description, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`
    ).run(title, type, level, device.room_no || null, device.resident_id || null, description)
  } catch (e) {
    console.error('告警生成失败:', e.message)
  }
}

// ============================================================
// IoT 数据上报接口（设备调用）
// ============================================================
router.post('/report', deviceAuth, (req, res) => {
  try {
    const { properties, items } = req.body || {}
    const props = properties || items || {}
    if (!props || typeof props !== 'object') {
      return res.status(400).json({ code: 400, message: '缺少 properties/items 字段' })
    }

    const device = req.device
    const now = new Date().toISOString()
    const validationErrors = []

    // 记录原始数据
    db.prepare(
      `INSERT INTO iot_raw_data (device_id, payload) VALUES (?, ?)`
    ).run(device.device_id, JSON.stringify(req.body))

    // 字段映射分组（按设备类型过滤目标表）
    const grouped = {}
    const devType = device.device_type || ''
    for (const [key, rawVal] of Object.entries(props)) {
      const map = TSL_MAP[key]
      if (!map) continue
      if (map.table === 'meta') continue

      // 设备类型与目标表的匹配规则
      // health_monitor → resident_health（不产生环境记录）
      // environment → room_environment（不产生健康记录）
      // weather → outdoor_weather
      // soil → soil_monitor
      if (devType === 'health_monitor' && map.table === 'room_environment') continue
      if (devType === 'environment' && map.table === 'resident_health') continue

      // 处理阿里云物模型格式：{ value: xxx, time: xxx }
      let value = rawVal
      if (rawVal && typeof rawVal === 'object' && 'value' in rawVal) {
        value = rawVal.value
      }

      const { valid, value: validated, reason } = validateTSL(key, value)
      if (!valid) {
        validationErrors.push({ field: key, value, reason })
        continue
      }

      if (!grouped[map.table]) grouped[map.table] = {}
      grouped[map.table][map.column] = validated
    }

    const results = []
    let alarmTriggered = false

    // 健康数据入库
    if (grouped.resident_health) {
      const d = grouped.resident_health
      d.resident_id = device.resident_id || null
      d.resident_name = ''
      d.measured_at = now
      d.status = assessHealthStatus(d)
      d.remark = 'IoT自动上报'
      const cols = Object.keys(d)
      const vals = cols.map((c) => d[c])
      const info = db.prepare(
        `INSERT INTO resident_health (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
      ).run(...vals)
      results.push({ table: 'resident_health', id: info.lastInsertRowid })

      // 健康告警判定
      if (d.status === 'critical') {
        alarmTriggered = true
        if (d.fall_status === 'detected' || d.fall_status === 'fall') {
          createAlarm(device, 'critical', 'fall', '跌倒告警', `检测到住户跌倒，心率${d.heart_rate || '-'}bpm`)
        } else if (d.spo2 && d.spo2 < 90) {
          createAlarm(device, 'critical', 'health', '血氧过低', `血氧饱和度 ${d.spo2}%，低于安全阈值`)
        } else if (d.heart_rate > 180 || d.heart_rate < 40) {
          createAlarm(device, 'critical', 'health', '心率异常', `心率 ${d.heart_rate} bpm，超出正常范围`)
        } else {
          createAlarm(device, 'critical', 'health', '健康状态紧急', `设备告警级别达到紧急`)
        }
      } else if (d.status === 'attention') {
        createAlarm(device, 'warning', 'health', '健康状态关注', `心率${d.heart_rate || '-'}, 血氧${d.spo2 || '-'}`)
      }
    }

    // 环境数据入库
    if (grouped.room_environment) {
      const d = grouped.room_environment
      d.room_no = device.room_no || ''
      d.measured_at = now
      d.status = assessEnvStatus(d)
      const cols = Object.keys(d)
      const vals = cols.map((c) => d[c])
      const info = db.prepare(
        `INSERT INTO room_environment (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
      ).run(...vals)
      results.push({ table: 'room_environment', id: info.lastInsertRowid })

      // 环境告警判定
      if (d.status === 'critical') {
        alarmTriggered = true
        if (d.smoke && d.smoke > 500) {
          createAlarm(device, 'critical', 'fire', '烟雾浓度过高', `烟雾值 ${d.smoke}，可能有火灾隐患`)
        } else {
          createAlarm(device, 'critical', 'environment', '环境异常紧急', `设备告警级别达到紧急`)
        }
      }
    }

    // 室外气象入库
    if (grouped.outdoor_weather) {
      const d = grouped.outdoor_weather
      d.measured_at = now
      d.status = 'normal'
      const cols = Object.keys(d)
      const vals = cols.map((c) => d[c])
      const info = db.prepare(
        `INSERT INTO outdoor_weather (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
      ).run(...vals)
      results.push({ table: 'outdoor_weather', id: info.lastInsertRowid })
    }

    // 土壤监测入库
    if (grouped.soil_monitor) {
      const d = grouped.soil_monitor
      d.zone = device.zone || '默认区域'
      d.measured_at = now
      const cols = Object.keys(d)
      const vals = cols.map((c) => d[c])
      const info = db.prepare(
        `INSERT INTO soil_monitor (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
      ).run(...vals)
      results.push({ table: 'soil_monitor', id: info.lastInsertRowid })
    }

    res.json({
      code: 0,
      data: {
        device_id: device.device_id,
        results,
        received: Object.keys(props).length,
        mapped: results.length,
        validation_errors: validationErrors,
        alarm_triggered: alarmTriggered
      },
      message: '数据上报成功'
    })
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message || '数据上报失败' })
  }
})

// ============================================================
// 设备管理接口（管理员操作）
// ============================================================

// 设备列表
router.get('/devices', auth(), requireRole('admin'), (req, res) => {
  const rows = db.prepare(
    `SELECT d.*, r.name as resident_name
     FROM iot_devices d
     LEFT JOIN residents r ON d.resident_id = r.id
     ORDER BY d.id DESC`
  ).all()
  res.json({ code: 0, data: rows })
})

// 注册设备
router.post('/devices', auth(), requireRole('admin'), (req, res) => {
  const { device_id, device_name, device_type, room_no, resident_id, zone } = req.body || {}
  if (!device_id) return res.status(400).json({ code: 400, message: '设备ID必填' })

  const exists = db.prepare('SELECT id FROM iot_devices WHERE device_id = ?').get(device_id)
  if (exists) return res.status(400).json({ code: 400, message: '设备ID已存在' })

  // 生成设备Token
  const device_token = 'dev_' + crypto.randomBytes(24).toString('hex')

  const info = db.prepare(
    `INSERT INTO iot_devices (device_id, product_key, device_token, device_name, device_type, room_no, resident_id, zone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(device_id, PRODUCT_KEY, device_token, device_name || device_id, device_type || 'sensor',
        room_no || null, resident_id || null, zone || null)

  res.json({ code: 0, data: { id: info.lastInsertRowid, device_token }, message: '设备注册成功' })
})

// 更新设备
router.put('/devices/:id', auth(), requireRole('admin'), (req, res) => {
  const id = Number(req.params.id)
  const device = db.prepare('SELECT * FROM iot_devices WHERE id = ?').get(id)
  if (!device) return res.status(404).json({ code: 404, message: '设备不存在' })

  const { device_name, device_type, room_no, resident_id, zone, status } = req.body || {}
  db.prepare(
    `UPDATE iot_devices SET device_name=?, device_type=?, room_no=?, resident_id=?, zone=?, status=? WHERE id=?`
  ).run(
    device_name || device.device_name,
    device_type || device.device_type,
    room_no ?? device.room_no,
    resident_id ?? device.resident_id,
    zone ?? device.zone,
    status || device.status,
    id
  )
  res.json({ code: 0, message: '更新成功' })
})

// 删除设备
router.delete('/devices/:id', auth(), requireRole('admin'), (req, res) => {
  const id = Number(req.params.id)
  db.prepare('DELETE FROM iot_devices WHERE id = ?').run(id)
  res.json({ code: 0, message: '删除成功' })
})

// 重置设备Token
router.post('/devices/:id/reset-token', auth(), requireRole('admin'), (req, res) => {
  const id = Number(req.params.id)
  const device = db.prepare('SELECT * FROM iot_devices WHERE id = ?').get(id)
  if (!device) return res.status(404).json({ code: 404, message: '设备不存在' })

  const newToken = 'dev_' + crypto.randomBytes(24).toString('hex')
  db.prepare('UPDATE iot_devices SET device_token = ? WHERE id = ?').run(newToken, id)
  res.json({ code: 0, data: { device_token: newToken }, message: 'Token已重置' })
})

// SG90舵机控制（下发指令）
router.post('/devices/:id/sg90', auth(), requireRole('admin'), (req, res) => {
  const id = Number(req.params.id)
  const { status } = req.body || {}
  const device = db.prepare('SELECT * FROM iot_devices WHERE id = ?').get(id)
  if (!device) return res.status(404).json({ code: 404, message: '设备不存在' })

  // 记录控制指令（实际场景通过MQTT下发到设备）
  db.prepare(
    `INSERT INTO iot_raw_data (device_id, payload) VALUES (?, ?)`
  ).run(device.device_id, JSON.stringify({ command: 'SG90', status: status ? 1 : 0, from: 'admin' }))

  res.json({ code: 0, data: { status: status ? 1 : 0 }, message: '舵机控制指令已下发' })
})

// ============================================================
// 数据查询接口（需要登录认证）
// ============================================================

router.get('/health/latest', auth(), (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10))
  const rows = db.prepare(
    `SELECT * FROM resident_health ORDER BY id DESC LIMIT ?`
  ).all(limit)
  res.json({ code: 0, data: rows })
})

router.get('/health/:residentId', auth(), (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30))
  const rows = db.prepare(
    `SELECT * FROM resident_health WHERE resident_id = ? ORDER BY id DESC LIMIT ?`
  ).all(Number(req.params.residentId), limit)
  res.json({ code: 0, data: rows })
})

router.get('/environment/latest', auth(), (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10))
  const rows = db.prepare(
    `SELECT * FROM room_environment ORDER BY id DESC LIMIT ?`
  ).all(limit)
  res.json({ code: 0, data: rows })
})

router.get('/environment/:roomNo', auth(), (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30))
  const rows = db.prepare(
    `SELECT * FROM room_environment WHERE room_no = ? ORDER BY id DESC LIMIT ?`
  ).all(req.params.roomNo, limit)
  res.json({ code: 0, data: rows })
})

router.get('/outdoor', auth(), (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 14))
  const rows = db.prepare(
    `SELECT * FROM outdoor_weather ORDER BY id DESC LIMIT ?`
  ).all(limit)
  res.json({ code: 0, data: rows })
})

router.get('/soil', auth(), (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 14))
  const rows = db.prepare(
    `SELECT * FROM soil_monitor ORDER BY id DESC LIMIT ?`
  ).all(limit)
  res.json({ code: 0, data: rows })
})

router.get('/dashboard', auth(), (req, res) => {
  const healthLatest = db.prepare(`
    SELECT h.* FROM resident_health h
    INNER JOIN (SELECT resident_id, MAX(id) as max_id FROM resident_health GROUP BY resident_id) latest
    ON h.id = latest.max_id
  `).all()

  const envLatest = db.prepare(`
    SELECT e.* FROM room_environment e
    INNER JOIN (SELECT room_no, MAX(id) as max_id FROM room_environment GROUP BY room_no) latest
    ON e.id = latest.max_id
  `).all()

  const outdoorLatest = db.prepare(`
    SELECT * FROM outdoor_weather ORDER BY id DESC LIMIT 1
  `).get() || null

  const soilLatest = db.prepare(`
    SELECT * FROM soil_monitor ORDER BY id DESC LIMIT 4
  `).all()

  const healthTrend = db.prepare(`
    SELECT resident_name,
           AVG(heart_rate) as avg_hr,
           AVG(breathing_rate) as avg_br,
           AVG(spo2) as avg_spo2
    FROM resident_health
    WHERE measured_at >= datetime('now', '-7 days')
    GROUP BY resident_name
  `).all()

  const envTrend = db.prepare(`
    SELECT room_no,
           AVG(temperature) as avg_temp,
           AVG(humidity) as avg_humi,
           AVG(pm25) as avg_pm25,
           AVG(pm10) as avg_pm10
    FROM room_environment
    WHERE measured_at >= datetime('now', '-7 days')
    GROUP BY room_no
  `).all()

  const fallCount = db.prepare(`
    SELECT COUNT(*) as c FROM resident_health WHERE fall_status = 'detected' AND measured_at >= datetime('now', '-7 days')
  `).get().c

  const alertCount = db.prepare(`
    SELECT COUNT(*) as c FROM alarms WHERE status = 'pending'
  `).get().c

  const deviceCount = db.prepare(`
    SELECT COUNT(*) as c FROM iot_devices WHERE status = 'online'
  `).get().c

  res.json({
    code: 0,
    data: {
      healthLatest,
      envLatest,
      outdoorLatest,
      soilLatest,
      healthTrend,
      envTrend,
      fallCount,
      alertCount,
      deviceCount
    }
  })
})

// ============================================================
// 模拟IoT数据上报（前端调试用，需要登录）
// ============================================================
router.post('/simulate', auth(), (req, res) => {
  try {
    const residents = db.prepare('SELECT id, name, room_no FROM residents').all()
    const rooms = db.prepare('SELECT room_no FROM rooms').all()
    const now = new Date().toISOString()
    const results = []

    for (const r of residents.slice(0, 5)) {
      const hr = 55 + Math.floor(Math.random() * 45)
      const br = 12 + Math.floor(Math.random() * 12)
      const spo2 = 93 + Math.floor(Math.random() * 7)
      const fall = Math.random() > 0.9 ? 'detected' : 'none'
      const pir = Math.random() > 0.6 ? 1 : 0
      const warning = Math.floor(Math.random() * 4)
      const status = hr > 100 || hr < 50 || spo2 < 92 || fall === 'detected' ? (fall === 'detected' ? 'critical' : 'attention') : 'normal'
      const info = db.prepare(
        `INSERT INTO resident_health (resident_id, resident_name, heart_rate, breathing_rate, spo2, fall_status, pir_status, warning_level, status, measured_at, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(r.id, r.name, hr, br, spo2, fall, pir, warning, status, now, 'IoT模拟上报')
      results.push({ type: 'health', id: info.lastInsertRowid, resident: r.name })
    }

    for (const room of rooms.slice(0, 6)) {
      const info = db.prepare(
        `INSERT INTO room_environment (room_no, temperature, humidity, pm25, pm10, smoke, warning_level, pir_status, status, measured_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        room.room_no,
        +(22 + Math.random() * 4).toFixed(1),
        +(45 + Math.random() * 20).toFixed(1),
        Math.floor(Math.random() * 150 + 10),
        Math.floor(Math.random() * 200 + 20),
        +(Math.random() * 100).toFixed(1),
        Math.floor(Math.random() * 3),
        Math.random() > 0.6 ? 1 : 0,
        'normal', now
      )
      results.push({ type: 'environment', id: info.lastInsertRowid, room: room.room_no })
    }

    const weatherInfo = db.prepare(
      `INSERT INTO outdoor_weather (temperature, humidity, pressure, wind_direction, wind_speed, pm25, pm10, illumination, status, measured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      +(15 + Math.random() * 15).toFixed(1),
      +(30 + Math.random() * 50).toFixed(1),
      Math.floor(990 + Math.random() * 30),
      Math.floor(Math.random() * 360),
      +(Math.random() * 8).toFixed(1),
      +(Math.random() * 80 + 10).toFixed(1),
      +(Math.random() * 120 + 20).toFixed(1),
      Math.floor(10000 + Math.random() * 40000),
      'normal', now
    )
    results.push({ type: 'outdoor', id: weatherInfo.lastInsertRowid })

    const soilInfo = db.prepare(
      `INSERT INTO soil_monitor (zone, soil_temp_1, soil_humi_1, soil_temp_2, soil_humi_2, soil_temp_3, soil_humi_3, ph, nitrogen, phosphorus, potassium, measured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      '康养花园A区',
      +(15 + Math.random() * 10).toFixed(1),
      +(40 + Math.random() * 30).toFixed(1),
      +(16 + Math.random() * 9).toFixed(1),
      +(38 + Math.random() * 28).toFixed(1),
      +(14 + Math.random() * 11).toFixed(1),
      +(42 + Math.random() * 26).toFixed(1),
      +(5.5 + Math.random() * 2).toFixed(1),
      +(Math.random() * 200 + 50).toFixed(1),
      +(Math.random() * 100 + 20).toFixed(1),
      +(Math.random() * 150 + 30).toFixed(1),
      now
    )
    results.push({ type: 'soil', id: soilInfo.lastInsertRowid })

    res.json({ code: 0, data: results, message: `模拟上报 ${results.length} 条IoT数据` })
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message })
  }
})

module.exports = router
