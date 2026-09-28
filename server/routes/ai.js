const express = require('express')
const fetch = require('node-fetch')
const db = require('../db')
const { auth } = require('../middleware/auth')

const router = express.Router()

/**
 * 大模型接入配置。
 * 密钥只能来自环境变量（server/.env 或部署时注入），**不要**把真实 key 写进源码：
 * 本仓库是公开仓库，历史提交里已经因此泄露过一次密钥（见 README 的安全说明）。
 */
const LLM_CONFIG = {
  url: process.env.LLM_API_URL || '',
  key: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || 'deepseek-flash'
}

/** 未配置密钥时给出明确提示，而不是拿空 key 去请求 */
function assertLlmConfigured() {
  if (!LLM_CONFIG.url || !LLM_CONFIG.key) {
    const err = new Error('AI 服务未配置：请在 server/.env 中设置 LLM_API_URL 与 LLM_API_KEY')
    err.statusCode = 503
    throw err
  }
}

function gatherContext() {
  const residents = db.prepare('SELECT name, gender, age, room_no, care_level, health_status, conditions FROM residents').all()
  const health = db.prepare(`
    SELECT resident_name, AVG(heart_rate) as avg_hr, AVG(systolic) as avg_sys, AVG(diastolic) as avg_dia,
           AVG(spo2) as avg_spo2, AVG(temperature) as avg_temp, status
    FROM resident_health GROUP BY resident_name ORDER BY measured_at DESC LIMIT 20
  `).all()
  const alarms = db.prepare('SELECT title, type, level, room_no, resident_name, status, description FROM alarms ORDER BY id DESC LIMIT 15').all()
  const env = db.prepare(`
    SELECT room_no, AVG(temperature) as avg_temp, AVG(humidity) as avg_hum, AVG(pm25) as avg_pm25, status
    FROM room_environment GROUP BY room_no ORDER BY measured_at DESC LIMIT 10
  `).all()
  const devices = db.prepare("SELECT name, type, room_no, status, battery FROM devices WHERE status != 'online'").all()
  const care = db.prepare("SELECT care_type, COUNT(*) as cnt FROM care_records GROUP BY care_type").all()
  const rooms = db.prepare("SELECT floor, COUNT(*) as total, SUM(occupancy) as occupied FROM rooms GROUP BY floor").all()

  return { residents, health, alarms, env, devices, care, rooms }
}

function buildPrompt(question, ctx) {
  const residentList = ctx.residents.map(r =>
    `${r.name}(${r.gender},${r.age}岁,${r.room_no},${r.care_level}护理,${r.health_status},${r.conditions})`
  ).join('; ')
  const healthSummary = ctx.health.map(h =>
    `${h.resident_name}:心率${Math.round(h.avg_hr)}血压${Math.round(h.avg_sys)}/${Math.round(h.avg_dia)}血氧${h.avg_spo2?.toFixed(1)}体温${h.avg_temp?.toFixed(1)}状态${h.status}`
  ).join('; ')
  const alarmList = ctx.alarms.map(a =>
    `${a.title}[${a.type}]${a.level}级 ${a.room_no} ${a.resident_name} ${a.status}`
  ).join('; ')
  const envSummary = ctx.env.map(e =>
    `${e.room_no}:温度${e.avg_temp?.toFixed(1)}°C湿度${e.avg_hum?.toFixed(1)}%PM2.5${e.avg_pm25?.toFixed(1)}`
  ).join('; ')
  const offlineDevices = ctx.devices.map(d => `${d.name}(${d.type},${d.room_no},电量${d.battery}%)`).join('; ')
  const careSummary = ctx.care.map(c => `${c.care_type}:${c.cnt}次`).join('; ')
  const roomSummary = ctx.rooms.map(r => `${r.floor}楼:${r.occupied}/${r.total}占用`).join('; ')

  return `你是康养中心的智能健康管家助手。根据以下康养数字孪生平台的实时数据回答用户问题。

【住户档案】${residentList || '暂无'}
【健康监测】${healthSummary || '暂无'}
【告警事件】${alarmList || '暂无'}
【室内环境】${envSummary || '暂无'}
【离线设备】${offlineDevices || '全部在线'}
【护理统计】${careSummary || '暂无'}
【房间占用】${roomSummary || '暂无'}

用户问题：${question}

请基于以上数据给出专业、简洁的分析和建议。回答控制在300字以内，用中文。`
}

async function callLLM(prompt) {
  assertLlmConfigured()
  const resp = await fetch(`${LLM_CONFIG.url}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LLM_CONFIG.key}`
    },
    body: JSON.stringify({
      model: LLM_CONFIG.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 512,
      temperature: 0.6
    })
  })
  if (!resp.ok) throw new Error(`LLM API ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  return {
    content: data.choices?.[0]?.message?.content || '无分析结果',
    model: data.model,
    tokens: data.usage?.total_tokens || 0
  }
}

router.post('/analyze', auth(), async (req, res) => {
  try {
    const question = (req.body?.question || '').trim()
    if (!question) return res.status(400).json({ code: 400, message: '请输入问题' })
    const ctx = gatherContext()
    const prompt = buildPrompt(question, ctx)
    const result = await callLLM(prompt)
    res.json({ code: 0, data: result, message: '分析完成' })
  } catch (e) {
    // 未配置密钥属于「服务端未就绪」，用 503 让前端能区分于真正的调用失败
    res.status(e.statusCode || 500).json({ code: e.statusCode || 500, message: e.message || 'AI分析失败' })
  }
})

router.get('/config', auth(), (req, res) => {
  const row = db.prepare("SELECT value FROM system_settings WHERE key='llm_config'").get()
  const config = row ? JSON.parse(row.value) : { model: LLM_CONFIG.model, url: '' }
  res.json({ code: 0, data: config })
})

router.put('/config', auth(), (req, res) => {
  try {
    const { model } = req.body
    const config = { model: model || LLM_CONFIG.model }
    db.prepare("INSERT INTO system_settings (key, value) VALUES ('llm_config', ?) ON CONFLICT(key) DO UPDATE SET value=?")
      .run(JSON.stringify(config), JSON.stringify(config))
    res.json({ code: 0, message: 'AI配置已保存' })
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message })
  }
})

module.exports = router
