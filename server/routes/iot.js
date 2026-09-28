const express = require('express')
const db = require('../db')
const { auth } = require('../middleware/auth')

const router = express.Router()

const TSL_MAP = {
  HeartRate: { table: 'resident_health', column: 'heart_rate' },
  BreathingRate: { table: 'resident_health', column: 'breathing_rate' },
  SpO2: { table: 'resident_health', column: 'spo2' },
  BodyTemperature: { table: 'resident_health', column: 'temperature' },
  Systolic: { table: 'resident_health', column: 'systolic' },
  Diastolic: { table: 'resident_health', column: 'diastolic' },
  Glucose: { table: 'resident_health', column: 'glucose' },
  FallStatus: { table: 'resident_health', column: 'fall_status' },
  HumanPresence: { table: 'resident_health', column: 'pir_status' },

  RoomTemperature: { table: 'room_environment', column: 'temperature' },
  RoomHumidity: { table: 'room_environment', column: 'humidity' },
  PM25: { table: 'room_environment', column: 'pm25' },
  PM10: { table: 'room_environment', column: 'pm10' },
  Smoke: { table: 'room_environment', column: 'smoke' },
  Illumination: { table: 'room_environment', column: 'illumination' },
  CO2: { table: 'room_environment', column: 'co2' },
  Noise: { table: 'room_environment', column: 'noise' },
  RoomPIR: { table: 'room_environment', column: 'pir_status' },

  Atmospheric_temperature: { table: 'outdoor_weather', column: 'temperature' },
  Atmospheric_humidity: { table: 'outdoor_weather', column: 'humidity' },
  Atmospheric_pressure: { table: 'outdoor_weather', column: 'pressure' },
  Wind_direction: { table: 'outdoor_weather', column: 'wind_direction' },
  Wind_Speed: { table: 'outdoor_weather', column: 'wind_speed' },
  illumination: { table: 'outdoor_weather', column: 'illumination' },

  tw1: { table: 'soil_monitor', column: 'soil_temp_1' },
  ts1: { table: 'soil_monitor', column: 'soil_humi_1' },
  tw2: { table: 'soil_monitor', column: 'soil_temp_2' },
  ts2: { table: 'soil_monitor', column: 'soil_humi_2' },
  tw3: { table: 'soil_monitor', column: 'soil_temp_3' },
  ts3: { table: 'soil_monitor', column: 'soil_humi_3' },
  pH: { table: 'soil_monitor', column: 'ph' },
  N: { table: 'soil_monitor', column: 'nitrogen' },
  P: { table: 'soil_monitor', column: 'phosphorus' },
  K: { table: 'soil_monitor', column: 'potassium' }
}

router.post('/report', (req, res) => {
  try {
    const { device_id, device_type, resident_id, resident_name, room_no, zone, properties } = req.body || {}
    if (!properties || typeof properties !== 'object') {
      return res.status(400).json({ code: 400, message: '缺少 properties 字段' })
    }

    db.prepare(
      `INSERT INTO iot_raw_data (device_id, payload) VALUES (?, ?)`
    ).run(device_id || 'unknown', JSON.stringify(req.body))

    const grouped = {}
    for (const [key, value] of Object.entries(properties)) {
      const map = TSL_MAP[key]
      if (!map) continue
      if (!grouped[map.table]) grouped[map.table] = {}
      grouped[map.table][map.column] = value
    }

    const now = new Date().toISOString()
    const results = []

    if (grouped.resident_health) {
      const d = grouped.resident_health
      d.resident_id = resident_id || null
      d.resident_name = resident_name || ''
      d.measured_at = now
      d.status = assessHealthStatus(d)
      d.remark = 'IoT自动上报'
      const cols = Object.keys(d)
      const vals = cols.map((c) => d[c])
      const info = db.prepare(
        `INSERT INTO resident_health (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
      ).run(...vals)
      results.push({ table: 'resident_health', id: info.lastInsertRowid })
    }

    if (grouped.room_environment) {
      const d = grouped.room_environment
      d.room_no = room_no || ''
      d.measured_at = now
      d.status = assessEnvStatus(d)
      const cols = Object.keys(d)
      const vals = cols.map((c) => d[c])
      const info = db.prepare(
        `INSERT INTO room_environment (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
      ).run(...vals)
      results.push({ table: 'room_environment', id: info.lastInsertRowid })
    }

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

    if (grouped.soil_monitor) {
      const d = grouped.soil_monitor
      d.zone = zone || '默认区域'
      d.measured_at = now
      const cols = Object.keys(d)
      const vals = cols.map((c) => d[c])
      const info = db.prepare(
        `INSERT INTO soil_monitor (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
      ).run(...vals)
      results.push({ table: 'soil_monitor', id: info.lastInsertRowid })
    }

    res.json({ code: 0, data: { results, received: Object.keys(properties).length, mapped: results.length }, message: '数据上报成功' })
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message || '数据上报失败' })
  }
})

function assessHealthStatus(d) {
  if (d.fall_status === 'detected') return 'critical'
  if ((d.heart_rate && (d.heart_rate > 100 || d.heart_rate < 50)) ||
      (d.spo2 && d.spo2 < 92) ||
      (d.systolic && d.systolic > 160) ||
      (d.temperature && d.temperature > 37.5)) return 'attention'
  return 'normal'
}

function assessEnvStatus(d) {
  if ((d.pm25 && d.pm25 > 75) || (d.smoke && d.smoke > 0.5) || (d.co2 && d.co2 > 1000)) return 'attention'
  return 'normal'
}

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
           AVG(spo2) as avg_spo2,
           AVG(temperature) as avg_temp
    FROM resident_health
    WHERE measured_at >= datetime('now', '-7 days')
    GROUP BY resident_name
  `).all()

  const envTrend = db.prepare(`
    SELECT room_no,
           AVG(temperature) as avg_temp,
           AVG(humidity) as avg_humi,
           AVG(pm25) as avg_pm25,
           AVG(pm10) as avg_pm10,
           AVG(illumination) as avg_illum
    FROM room_environment
    WHERE measured_at >= datetime('now', '-7 days')
    GROUP BY room_no
  `).all()

  const fallCount = db.prepare(`
    SELECT COUNT(*) as c FROM resident_health WHERE fall_status = 'detected' AND measured_at >= datetime('now', '-7 days')
  `).get().c

  const alertCount = db.prepare(`
    SELECT COUNT(*) as c FROM resident_health WHERE status != 'normal' AND measured_at >= datetime('now', '-7 days')
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
      alertCount
    }
  })
})

router.post('/simulate', auth(), (req, res) => {
  try {
    const residents = db.prepare('SELECT id, name, room_no FROM residents').all()
    const rooms = db.prepare('SELECT room_no FROM rooms').all()
    const now = new Date().toISOString()
    const results = []

    for (const r of residents.slice(0, 5)) {
      const hr = 55 + Math.floor(Math.random() * 45)
      const br = 12 + Math.floor(Math.random() * 12)
      const spo2 = +(93 + Math.random() * 7).toFixed(1)
      const temp = +(36.2 + Math.random() * 1.5).toFixed(1)
      const sys = 105 + Math.floor(Math.random() * 50)
      const dia = 65 + Math.floor(Math.random() * 30)
      const fall = Math.random() > 0.9 ? 'detected' : 'none'
      const pir = Math.random() > 0.6 ? 1 : 0
      const status = hr > 100 || hr < 50 || spo2 < 92 || fall === 'detected' ? (fall === 'detected' ? 'critical' : 'attention') : 'normal'
      const info = db.prepare(
        `INSERT INTO resident_health (resident_id, resident_name, heart_rate, breathing_rate, spo2, temperature, systolic, diastolic, fall_status, pir_status, status, measured_at, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(r.id, r.name, hr, br, spo2, temp, sys, dia, fall, pir, status, now, 'IoT模拟上报')
      results.push({ type: 'health', id: info.lastInsertRowid, resident: r.name })
    }

    for (const room of rooms.slice(0, 6)) {
      const info = db.prepare(
        `INSERT INTO room_environment (room_no, temperature, humidity, pm25, pm10, smoke, illumination, co2, noise, pir_status, status, measured_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        room.room_no,
        +(22 + Math.random() * 4).toFixed(1),
        +(45 + Math.random() * 20).toFixed(1),
        +(Math.random() * 50 + 10).toFixed(1),
        +(Math.random() * 80 + 20).toFixed(1),
        +(Math.random() * 0.3).toFixed(2),
        Math.floor(200 + Math.random() * 400),
        Math.floor(400 + Math.random() * 600),
        +(Math.random() * 40 + 20).toFixed(1),
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

    res.json({ code: 0, data: results, message: `模拟上报 ${results.length} 条IoT数据` })
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message })
  }
})

module.exports = router
