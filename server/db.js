const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const bcrypt = require('bcryptjs')
const layout = require('./layout')

const dataDir = path.join(__dirname, 'data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

const dbPath = path.join(dataDir, 'kangyang.db')
const db = new Database(dbPath)

db.pragma('journal_mode = WAL')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'viewer',
  permissions TEXT DEFAULT '["dashboard","charts"]',
  avatar TEXT,
  status INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS residents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  gender TEXT,
  age INTEGER,
  room_no TEXT,
  bed_no INTEGER DEFAULT 1,
  care_level TEXT DEFAULT '二级',
  health_status TEXT DEFAULT 'stable',
  admission_date TEXT,
  contact_phone TEXT,
  emergency_contact TEXT,
  conditions TEXT,
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_no TEXT UNIQUE NOT NULL,
  floor INTEGER DEFAULT 1,
  type TEXT DEFAULT 'standard',
  capacity INTEGER DEFAULT 1,
  occupancy INTEGER DEFAULT 0,
  status TEXT DEFAULT 'available',
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT,
  room_no TEXT,
  resident_id INTEGER,
  status TEXT DEFAULT 'online',
  battery INTEGER DEFAULT 100,
  last_active TEXT,
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS resident_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resident_id INTEGER,
  resident_name TEXT,
  heart_rate INTEGER,
  breathing_rate INTEGER,
  spo2 REAL,
  temperature REAL,
  systolic INTEGER,
  diastolic INTEGER,
  glucose REAL,
  fall_status TEXT,
  pir_status INTEGER,
  warning_level INTEGER DEFAULT 0,
  person_info TEXT,
  status TEXT DEFAULT 'normal',
  measured_at TEXT,
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS care_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resident_id INTEGER,
  resident_name TEXT,
  caregiver TEXT,
  care_type TEXT,
  content TEXT,
  shift TEXT,
  date TEXT,
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS room_environment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_no TEXT,
  temperature REAL,
  humidity REAL,
  pm25 REAL,
  pm10 REAL,
  smoke REAL,
  illumination INTEGER,
  co2 INTEGER,
  light INTEGER,
  noise REAL,
  pir_status INTEGER,
  warning_level INTEGER DEFAULT 0,
  sg90_status INTEGER DEFAULT 0,
  status TEXT DEFAULT 'normal',
  measured_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS device_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_name TEXT,
  device_type TEXT,
  room_no TEXT,
  usage_hours REAL,
  power_consumption REAL,
  alert_count INTEGER DEFAULT 0,
  date TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS alarms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  type TEXT,
  level TEXT,
  room_no TEXT,
  resident_id INTEGER,
  resident_name TEXT,
  status TEXT DEFAULT 'pending',
  description TEXT,
  handler TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS db_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  type TEXT DEFAULT 'sqlite',
  host TEXT,
  port INTEGER,
  database_name TEXT,
  username TEXT,
  password TEXT,
  is_active INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS predict_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_type TEXT,
  params TEXT,
  result TEXT,
  image_path TEXT,
  user_id INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS iot_raw_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT,
  payload TEXT,
  received_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS outdoor_weather (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  temperature REAL,
  humidity REAL,
  pressure REAL,
  wind_direction INTEGER,
  wind_speed REAL,
  pm25 REAL,
  pm10 REAL,
  illumination INTEGER,
  status TEXT DEFAULT 'normal',
  measured_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS soil_monitor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone TEXT,
  soil_temp_1 REAL,
  soil_humi_1 REAL,
  soil_temp_2 REAL,
  soil_humi_2 REAL,
  soil_temp_3 REAL,
  soil_humi_3 REAL,
  ph REAL,
  nitrogen REAL,
  phosphorus REAL,
  potassium REAL,
  measured_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS iot_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT UNIQUE NOT NULL,
  product_key TEXT,
  device_token TEXT UNIQUE NOT NULL,
  device_name TEXT,
  device_type TEXT,
  room_no TEXT,
  resident_id INTEGER,
  zone TEXT,
  status TEXT DEFAULT 'online',
  last_seen TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  action TEXT,
  target TEXT,
  method TEXT,
  ip TEXT,
  status TEXT,
  detail TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
`)

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c
  if (userCount === 0) {
    const hash = bcrypt.hashSync('admin123', 10)
    const viewerHash = bcrypt.hashSync('viewer123', 10)
    const editorHash = bcrypt.hashSync('editor123', 10)
    const insert = db.prepare(
      `INSERT INTO users (username, password, phone, role, permissions) VALUES (?, ?, ?, ?, ?)`
    )
    insert.run('admin', hash, '13800000001', 'admin',
      JSON.stringify(['dashboard', 'charts', 'data', 'users', 'settings', 'predict', 'db']))
    insert.run('editor', editorHash, '13800000002', 'editor',
      JSON.stringify(['dashboard', 'charts', 'data', 'predict']))
    insert.run('viewer', viewerHash, '13800000003', 'viewer',
      JSON.stringify(['dashboard', 'charts']))
  }

  const residentCount = db.prepare('SELECT COUNT(*) as c FROM residents').get().c
  if (residentCount === 0) {
    const names = ['张桂芳', '王建国', '李秀英', '刘德荣', '陈玉兰', '赵福生', '周桂兰', '孙明远', '吴月华', '郑国强']
    const genders = ['女', '男']
    const levels = ['特级', '一级', '二级', '三级']
    const statuses = ['stable', 'attention', 'critical']
    const conditions = ['高血压', '糖尿病', '冠心病', '脑梗后遗症', '骨质疏松', '阿尔茨海默症']
    // 房号与床位来自 layout 的归属表：3 位房号 + 床位号，保证与 rooms 表可关联
    const insert = db.prepare(
      `INSERT INTO residents (name, gender, age, room_no, bed_no, care_level, health_status, admission_date, contact_phone, emergency_contact, conditions, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (let i = 0; i < names.length; i++) {
      const seat = layout.RESIDENT_ASSIGNMENT[i % layout.RESIDENT_ASSIGNMENT.length]
      insert.run(
        names[i], genders[i % 2], 65 + Math.floor(Math.random() * 25),
        seat.room_no, seat.bed_no, levels[i % levels.length], statuses[i % statuses.length],
        new Date(Date.now() - (Math.random() * 365 * 86400000)).toISOString().slice(0, 10),
        `138${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
        `${names[i].charAt(0)}小明`,
        conditions[i % conditions.length] + (i % 3 === 0 ? '、高血压' : ''),
        `${names[i]}住户档案`
      )
    }
  }

  const roomCount = db.prepare('SELECT COUNT(*) as c FROM rooms').get().c
  if (roomCount === 0) {
    const types = ['standard', 'premium', 'suite', 'nursing']
    // 在住人数由住户归属推导，不再用随机数（随机数会让 rooms.occupancy 与住户记录打架）
    const occupancy = layout.occupancyFromAssignment()
    const insert = db.prepare(
      `INSERT INTO rooms (room_no, floor, type, capacity, occupancy, status, remark) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    for (let f = 1; f <= layout.MODULE.floors; f++) {
      for (let r = 1; r <= layout.MODULE.roomsPerFloor; r++) {
        const roomNo = `${f}0${r}`
        const occ = occupancy[roomNo] || 0
        insert.run(roomNo, f, types[r % types.length], layout.MODULE.bedsPerRoom, occ,
          occ > 0 ? 'occupied' : 'available', `${f}楼${r}号房间`)
      }
    }
  }

  const deviceCount = db.prepare('SELECT COUNT(*) as c FROM devices').get().c
  if (deviceCount === 0) {
    const deviceTypes = ['monitor', 'call_button', 'smart_bed', 'air_purifier', 'fall_detector', 'wearable']
    const deviceNames = ['生命体征监护仪', '紧急呼叫器', '智能护理床', '空气净化器', '跌倒检测仪', '智能手环']
    const insert = db.prepare(
      `INSERT INTO devices (name, type, room_no, resident_id, status, battery, last_active, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (let i = 0; i < 24; i++) {
      const idx = i % 6
      const roomNo = `${Math.floor(i / 8) + 1}0${(i % 6) + 1}`
      insert.run(
        `${deviceNames[idx]}#${i + 1}`, deviceTypes[idx], roomNo,
        i < 10 ? i + 1 : null,
        Math.random() > 0.1 ? 'online' : 'offline',
        Math.floor(Math.random() * 40 + 60),
        new Date().toISOString(),
        `${deviceNames[idx]}设备`
      )
    }
  }

  const healthCount = db.prepare('SELECT COUNT(*) as c FROM resident_health').get().c
  if (healthCount === 0) {
    const residents = db.prepare('SELECT id, name FROM residents').all()
    const insert = db.prepare(
      `INSERT INTO resident_health (resident_id, resident_name, heart_rate, breathing_rate, systolic, diastolic, spo2, temperature, glucose, fall_status, pir_status, status, measured_at, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const r of residents) {
      for (let d = 0; d < 7; d++) {
        const hr = 60 + Math.floor(Math.random() * 30)
        const br = 14 + Math.floor(Math.random() * 8)
        const sys = 110 + Math.floor(Math.random() * 40)
        const dia = 70 + Math.floor(Math.random() * 25)
        const spo2 = +(95 + Math.random() * 5).toFixed(1)
        const temp = +(36.3 + Math.random() * 1.2).toFixed(1)
        const glucose = +(4 + Math.random() * 6).toFixed(1)
        const fall = Math.random() > 0.92 ? 'detected' : 'none'
        const pir = Math.random() > 0.7 ? 1 : 0
        const status = hr > 90 || sys > 150 || dia > 100 || spo2 < 96 || fall === 'detected' ? 'attention' : 'normal'
        insert.run(r.id, r.name, hr, br, sys, dia, spo2, temp, glucose, fall, pir, status,
          new Date(Date.now() - d * 86400000).toISOString(), '日常监测')
      }
    }
  }

  const careCount = db.prepare('SELECT COUNT(*) as c FROM care_records').get().c
  if (careCount === 0) {
    const residents = db.prepare('SELECT id, name FROM residents').all()
    const caregivers = ['李护士', '王护理', '张护工', '刘护士长']
    const careTypes = ['medication', 'meal', 'activity', 'turn', 'hygiene', 'rehabilitation']
    const contents = ['口服降压药', '协助进食', '轮椅活动', '翻身拍背', '清洁护理', '康复训练']
    const shifts = ['白班', '夜班']
    const insert = db.prepare(
      `INSERT INTO care_records (resident_id, resident_name, caregiver, care_type, content, shift, date, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (let i = 0; i < 60; i++) {
      const r = residents[i % residents.length]
      const idx = i % careTypes.length
      insert.run(r.id, r.name, caregivers[i % caregivers.length],
        careTypes[idx], contents[idx], shifts[i % 2],
        new Date(Date.now() - (i % 7) * 86400000).toISOString().slice(0, 10), '按时执行')
    }
  }

  const envCount = db.prepare('SELECT COUNT(*) as c FROM room_environment').get().c
  if (envCount === 0) {
    const rooms = db.prepare("SELECT room_no FROM rooms WHERE occupancy > 0").all()
    if (rooms.length === 0) {
      rooms.push({ room_no: '101' }, { room_no: '102' }, { room_no: '201' }, { room_no: '202' })
    }
    const insert = db.prepare(
      `INSERT INTO room_environment (room_no, temperature, humidity, pm25, pm10, smoke, illumination, co2, light, noise, pir_status, status, measured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (let d = 0; d < 14; d++) {
      const date = new Date(Date.now() - d * 86400000).toISOString()
      for (const r of rooms) {
        insert.run(r.room_no,
          +(22 + Math.random() * 4).toFixed(1),
          +(45 + Math.random() * 20).toFixed(1),
          +(Math.random() * 50 + 10).toFixed(1),
          +(Math.random() * 80 + 20).toFixed(1),
          +(Math.random() * 0.3).toFixed(2),
          Math.floor(200 + Math.random() * 400),
          Math.floor(400 + Math.random() * 600),
          Math.floor(100 + Math.random() * 300),
          +(Math.random() * 40 + 20).toFixed(1),
          Math.random() > 0.7 ? 1 : 0,
          'normal', date)
      }
    }
  }

  const usageCount = db.prepare('SELECT COUNT(*) as c FROM device_usage').get().c
  if (usageCount === 0) {
    const devices = db.prepare('SELECT name, type, room_no FROM devices').all()
    const insert = db.prepare(
      `INSERT INTO device_usage (device_name, device_type, room_no, usage_hours, power_consumption, alert_count, date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    for (let d = 0; d < 7; d++) {
      const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)
      for (const dev of devices) {
        insert.run(dev.name, dev.type, dev.room_no,
          +(Math.random() * 20 + 2).toFixed(1),
          +(Math.random() * 5 + 0.5).toFixed(2),
          Math.floor(Math.random() * 3), date)
      }
    }
  }

  const alarmCount = db.prepare('SELECT COUNT(*) as c FROM alarms').get().c
  if (alarmCount === 0) {
    const types = ['fall', 'heart_rate', 'wandering', 'emergency_call', 'device_fault', 'environment']
    const titles = ['跌倒告警', '心率异常', '走失预警', '紧急呼叫', '设备故障', '环境异常']
    const levels = ['低', '中', '高', '紧急']
    const residents = db.prepare('SELECT id, name, room_no FROM residents').all()
    /**
     * 演示告警的状态分布：只保留少量未闭环，其余记为已闭环。
     * 若按 1/3 平均分配，会让每个有人住的房间都挂上待处理告警，
     * 总览沙盘就会「满屏红色」、四色状态只用上两色。
     * 这里刻意留下 1 条待处理 + 2 条处理中，分布在不同楼层，形成状态梯度。
     */
    const ALARM_PLAN = { 0: 'pending', 7: 'processing', 19: 'processing' }
    const insert = db.prepare(
      `INSERT INTO alarms (title, type, level, room_no, resident_id, resident_name, status, description, handler, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (let i = 0; i < 20; i++) {
      const r = residents[i % residents.length]
      const idx = i % types.length
      const status = ALARM_PLAN[i] || 'resolved'
      insert.run(
        `${titles[idx]}#${i + 1}`, types[idx], levels[i % levels.length],
        r.room_no, r.id, r.name,
        status,
        `${r.name}住户${titles[idx]}事件`,
        status === 'pending' ? null : '李护士',
        status === 'resolved' ? new Date().toISOString() : null
      )
    }
  }

  const weatherCount = db.prepare('SELECT COUNT(*) as c FROM outdoor_weather').get().c
  if (weatherCount === 0) {
    const insert = db.prepare(
      `INSERT INTO outdoor_weather (temperature, humidity, pressure, wind_direction, wind_speed, pm25, pm10, illumination, status, measured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (let d = 0; d < 14; d++) {
      const date = new Date(Date.now() - d * 86400000).toISOString()
      insert.run(
        +(15 + Math.random() * 15).toFixed(1),
        +(30 + Math.random() * 50).toFixed(1),
        Math.floor(990 + Math.random() * 30),
        Math.floor(Math.random() * 360),
        +(Math.random() * 8).toFixed(1),
        +(Math.random() * 80 + 10).toFixed(1),
        +(Math.random() * 120 + 20).toFixed(1),
        Math.floor(10000 + Math.random() * 40000),
        'normal', date
      )
    }
  }

  const soilCount = db.prepare('SELECT COUNT(*) as c FROM soil_monitor').get().c
  if (soilCount === 0) {
    const zones = ['花园A区', '花园B区', '菜地区', '药草区']
    const insert = db.prepare(
      `INSERT INTO soil_monitor (zone, soil_temp_1, soil_humi_1, soil_temp_2, soil_humi_2, soil_temp_3, soil_humi_3, ph, nitrogen, phosphorus, potassium, measured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const zone of zones) {
      for (let d = 0; d < 7; d++) {
        const date = new Date(Date.now() - d * 86400000).toISOString()
        insert.run(
          zone,
          +(18 + Math.random() * 8).toFixed(1),
          +(30 + Math.random() * 40).toFixed(1),
          +(18 + Math.random() * 8).toFixed(1),
          +(30 + Math.random() * 40).toFixed(1),
          +(18 + Math.random() * 8).toFixed(1),
          +(30 + Math.random() * 40).toFixed(1),
          +(6 + Math.random() * 1.5).toFixed(1),
          +(40 + Math.random() * 60).toFixed(1),
          +(15 + Math.random() * 30).toFixed(1),
          +(80 + Math.random() * 80).toFixed(1),
          date
        )
      }
    }
  }

  const settingCount = db.prepare('SELECT COUNT(*) as c FROM system_settings').get().c
  if (settingCount === 0) {
    const defaults = {
      themeName: '康养暖橙',
      primaryColor: '#ff8c42',
      accentColor: '#ffb627',
      bgColor: '#1a1a2e',
      panelBg: 'rgba(40, 30, 50, 0.55)',
      fontFamily: '"Noto Sans SC", "Microsoft YaHei", sans-serif',
      fontSize: '14',
      chartTheme: 'dark',
      modelTheme: 'room',
      headerTitle: '康养数字孪生平台'
    }
    const insert = db.prepare(`INSERT INTO system_settings (key, value) VALUES (?, ?)`)
    for (const [k, v] of Object.entries(defaults)) {
      insert.run(k, v)
    }
  }

  const dbCfgCount = db.prepare('SELECT COUNT(*) as c FROM db_config').get().c
  if (dbCfgCount === 0) {
    db.prepare(
      `INSERT INTO db_config (name, type, host, port, database_name, username, password, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('本地SQLite', 'sqlite', 'localhost', 0, dbPath, '', '', 1)
  }

  // IoT设备种子数据
  const devCount = db.prepare('SELECT COUNT(*) as c FROM iot_devices').get().c
  if (devCount === 0) {
    const crypto = require('crypto')
    const genToken = () => 'dev_' + crypto.randomBytes(24).toString('hex')
    const ins = db.prepare(
      `INSERT INTO iot_devices (device_id, product_key, device_token, device_name, device_type, room_no, resident_id, zone, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const residents = db.prepare('SELECT id, name, room_no FROM residents LIMIT 5').all()
    const rooms = db.prepare('SELECT room_no FROM rooms LIMIT 6').all()

    // 健康监测设备（绑定住户）
    for (let i = 0; i < residents.length; i++) {
      const r = residents[i]
      ins.run(
        `health-${i + 1}`, 'a1MlghnXTvu', genToken(),
        `${r.name}健康监测仪`, 'health_monitor', r.room_no, r.id, null, 'online'
      )
    }

    // 室内环境设备（绑定房间）
    for (let i = 0; i < rooms.length; i++) {
      ins.run(
        `room-env-${i + 1}`, 'a1MlghnXTvu', genToken(),
        `${rooms[i].room_no}环境监测`, 'environment', rooms[i].room_no, null, null, 'online'
      )
    }

    // 室外气象站
    ins.run(
      'weather-station-1', 'a1MlghnXTvu', genToken(),
      '室外气象站', 'weather', null, null, null, 'online'
    )

    // 土壤监测设备
    ins.run(
      'soil-monitor-a', 'a1MlghnXTvu', genToken(),
      '康养花园A区土壤监测', 'soil', null, null, '康养花园A区', 'online'
    )
  }
}

seed()

// 建立空间树（园区→楼栋→楼层→房间/功能区），并把历史遗留的 4 位房号规范化到 3 位。
// 幂等：新库直接播种，老库自动补齐，重复启动结果一致。
const layoutResult = layout.ensureLayout(db)
if (layoutResult.space.inserted > 0 || layoutResult.data.fixedResidents > 0) {
  console.log(
    `[layout] 空间树节点 ${layoutResult.space.inserted} 个；` +
      `修正住户房号 ${layoutResult.data.fixedResidents} 条；` +
      `在住合计 ${layoutResult.data.occupancyTotal}；` +
      `告警可关联房间 ${layoutResult.data.alarmsMatched}/${layoutResult.data.alarmsTotal}`
  )
}

module.exports = db
