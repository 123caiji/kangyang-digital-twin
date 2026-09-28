const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const bcrypt = require('bcryptjs')

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
  systolic INTEGER,
  diastolic INTEGER,
  spo2 REAL,
  temperature REAL,
  glucose REAL,
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
  co2 INTEGER,
  light INTEGER,
  noise REAL,
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
    const insert = db.prepare(
      `INSERT INTO residents (name, gender, age, room_no, care_level, health_status, admission_date, contact_phone, emergency_contact, conditions, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (let i = 0; i < names.length; i++) {
      const roomNo = `${100 + Math.floor(i / 2) + 1}${i % 2 + 1}`
      insert.run(
        names[i], genders[i % 2], 65 + Math.floor(Math.random() * 25),
        roomNo, levels[i % levels.length], statuses[i % statuses.length],
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
    const insert = db.prepare(
      `INSERT INTO rooms (room_no, floor, type, capacity, occupancy, status, remark) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    for (let f = 1; f <= 3; f++) {
      for (let r = 1; r <= 6; r++) {
        const roomNo = `${f}0${r}`
        const occ = Math.floor(Math.random() * 2)
        insert.run(roomNo, f, types[r % types.length], 2, occ,
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
      `INSERT INTO resident_health (resident_id, resident_name, heart_rate, systolic, diastolic, spo2, temperature, glucose, status, measured_at, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const r of residents) {
      for (let d = 0; d < 7; d++) {
        const hr = 60 + Math.floor(Math.random() * 30)
        const sys = 110 + Math.floor(Math.random() * 40)
        const dia = 70 + Math.floor(Math.random() * 25)
        const spo2 = +(95 + Math.random() * 5).toFixed(1)
        const temp = +(36.3 + Math.random() * 1.2).toFixed(1)
        const glucose = +(4 + Math.random() * 6).toFixed(1)
        const status = hr > 90 || sys > 150 || dia > 100 || spo2 < 96 ? 'attention' : 'normal'
        insert.run(r.id, r.name, hr, sys, dia, spo2, temp, glucose, status,
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
      `INSERT INTO room_environment (room_no, temperature, humidity, pm25, co2, light, noise, status, measured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (let d = 0; d < 14; d++) {
      const date = new Date(Date.now() - d * 86400000).toISOString()
      for (const r of rooms) {
        insert.run(r.room_no,
          +(22 + Math.random() * 4).toFixed(1),
          +(45 + Math.random() * 20).toFixed(1),
          +(Math.random() * 50 + 10).toFixed(1),
          Math.floor(400 + Math.random() * 600),
          Math.floor(100 + Math.random() * 300),
          +(Math.random() * 40 + 20).toFixed(1),
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
    const statuses = ['pending', 'processing', 'resolved']
    const residents = db.prepare('SELECT id, name, room_no FROM residents').all()
    const insert = db.prepare(
      `INSERT INTO alarms (title, type, level, room_no, resident_id, resident_name, status, description, handler, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (let i = 0; i < 20; i++) {
      const r = residents[i % residents.length]
      const idx = i % types.length
      insert.run(
        `${titles[idx]}#${i + 1}`, types[idx], levels[i % levels.length],
        r.room_no, r.id, r.name,
        statuses[i % 3],
        `${r.name}住户${titles[idx]}事件`,
        statuses[i % 3] === 'resolved' ? '李护士' : null,
        statuses[i % 3] === 'resolved' ? new Date().toISOString() : null
      )
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
}

seed()

module.exports = db
