const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const db = require('../db')
const { auth, requirePerm } = require('../middleware/auth')

const router = express.Router()
const uploadDir = path.join(__dirname, '../uploads/predict')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'])
const MAX_SIZE = 5 * 1024 * 1024

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png'
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(ext) ? ext : '.png'
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${safeExt}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('仅支持 JPG / PNG / WEBP / GIF / BMP 图片'))
    }
    cb(null, true)
  }
})

const MODEL_WEIGHTS = {
  fall_risk: {
    heartRate: 0.15,
    bloodPressure: 0.18,
    spo2: 0.12,
    temperature: 0.10,
    age: 0.20,
    careLevel: 0.15,
    image: 0.10
  },
  health_abnormal: {
    heartRate: 0.25,
    bloodPressure: 0.22,
    spo2: 0.18,
    temperature: 0.12,
    age: 0.08,
    careLevel: 0.05,
    image: 0.10
  },
  care_quality: {
    heartRate: 0.10,
    bloodPressure: 0.10,
    spo2: 0.08,
    temperature: 0.08,
    age: 0.15,
    careLevel: 0.35,
    image: 0.14
  },
  comprehensive: {
    heartRate: 0.18,
    bloodPressure: 0.16,
    spo2: 0.14,
    temperature: 0.10,
    age: 0.15,
    careLevel: 0.15,
    image: 0.12
  }
}

function clamp(n, min = 0, max = 100) {
  return Math.min(max, Math.max(min, n))
}

function normalizeHeartRate(hr) {
  const v = Number(hr)
  if (v >= 60 && v <= 90) return 15
  if (v < 60) return clamp(15 + (60 - v) * 2)
  return clamp(15 + (v - 90) * 2.2)
}

function normalizeBP(sys, dia) {
  const s = Number(sys), d = Number(dia)
  if (s >= 90 && s <= 130 && d >= 60 && d <= 85) return 20
  let risk = 20
  if (s > 130) risk += (s - 130) * 1.2
  if (s < 90) risk += (90 - s) * 1.5
  if (d > 85) risk += (d - 85) * 1.0
  if (d < 60) risk += (60 - d) * 1.3
  return clamp(risk)
}

function normalizeSpo2(spo2) {
  const v = Number(spo2)
  if (v >= 95) return 10
  if (v >= 90) return clamp(10 + (95 - v) * 4)
  return clamp(10 + 20 + (90 - v) * 6)
}

function normalizeTemp(t) {
  const comfort = 36.5
  return clamp(Math.abs(Number(t) - comfort) * 8)
}

function normalizeAge(age) {
  const v = Number(age)
  if (v <= 65) return 15
  if (v <= 75) return 25
  if (v <= 85) return 45
  if (v <= 90) return 60
  return 75
}

function normalizeCareLevel(level) {
  const map = { '特级': 85, '一级': 60, '二级': 35, '三级': 15 }
  return map[level] || 30
}

function parseImageFeatures(raw) {
  if (!raw) return null
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw
    return {
      brightness: clamp(Number(data.brightness) || 50),
      contrast: clamp(Number(data.contrast) || 40),
      warmRatio: clamp(Number(data.warmRatio) || 30),
      greenRatio: clamp(Number(data.greenRatio) || 20),
      edgeDensity: clamp(Number(data.edgeDensity) || 35),
      width: Number(data.width) || 0,
      height: Number(data.height) || 0
    }
  } catch {
    return null
  }
}

function imageRiskByModel(modelType, img) {
  if (!img) return { score: 35, detail: '未上传图片，仅使用数值参数推演' }
  let score = 30
  const notes = []

  if (modelType === 'fall_risk') {
    score = img.edgeDensity * 0.3 + (100 - img.brightness) * 0.25 + img.contrast * 0.2 + img.warmRatio * 0.15
    notes.push('边缘密度与暗区占比用于估算跌倒风险线索')
  } else if (modelType === 'health_abnormal') {
    score = img.warmRatio * 0.35 + img.contrast * 0.25 + (100 - img.brightness) * 0.2 + img.edgeDensity * 0.15
    notes.push('暖色占比与对比度用于估算面部健康状态')
  } else if (modelType === 'care_quality') {
    score = img.greenRatio * 0.15 + (100 - img.edgeDensity) * 0.3 + img.brightness * 0.25 + (100 - img.warmRatio) * 0.15
    notes.push('绿色占比与边缘稳定性用于估算护理环境质量')
  } else {
    score = img.edgeDensity * 0.22 + img.warmRatio * 0.25 + (100 - img.brightness) * 0.2 + img.contrast * 0.18 + (100 - img.greenRatio) * 0.15
    notes.push('综合纹理、色温与环境线索估算康养风险')
  }

  return { score: clamp(score), detail: notes.join('；') }
}

function getBaseline(modelType) {
  try {
    const rows = db
      .prepare(`SELECT result FROM predict_history WHERE model_type = ? ORDER BY id DESC LIMIT 12`)
      .all(modelType)
    if (!rows.length) return null
    const scores = rows
      .map((r) => {
        try {
          return Number(JSON.parse(r.result || '{}').score)
        } catch {
          return null
        }
      })
      .filter((n) => Number.isFinite(n))
    if (!scores.length) return null
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    return +avg.toFixed(2)
  } catch {
    return null
  }
}

function buildSeries(score, modelType) {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    let seasonal = 1
    if (modelType === 'fall_risk') seasonal = 1 + Math.cos(((month - 1) / 12) * Math.PI * 2) * 0.15
    if (modelType === 'health_abnormal') seasonal = 1 + Math.sin(((month - 3) / 12) * Math.PI * 2) * 0.10
    if (modelType === 'care_quality') seasonal = 1 + Math.sin(((month - 4) / 12) * Math.PI * 2) * 0.08
    if (modelType === 'comprehensive') seasonal = 1 + Math.sin((month / 12) * Math.PI * 2) * 0.12
    const trend = 1 - i * 0.01
    const value = clamp(score * seasonal * trend + (i % 3 === 0 ? 1.2 : -0.6))
    return { month: `${month}月`, value: +value.toFixed(2) }
  })
}

function predict(payload, file) {
  const modelType = ['fall_risk', 'health_abnormal', 'care_quality', 'comprehensive'].includes(payload.modelType)
    ? payload.modelType
    : 'fall_risk'
  const weights = MODEL_WEIGHTS[modelType]

  const hr = clamp(Number(payload.heartRate) || 75)
  const sys = Number(payload.systolic) || 120
  const dia = Number(payload.diastolic) || 80
  const spo2 = Number(payload.spo2) || 98
  const temp = Number(payload.temperature) || 36.5
  const age = Number(payload.age) || 75
  const careLevel = payload.careLevel || '二级'
  const th = Math.min(1, Math.max(0, Number(payload.threshold)))

  const hrRisk = normalizeHeartRate(hr)
  const bpRisk = normalizeBP(sys, dia)
  const spo2Risk = normalizeSpo2(spo2)
  const tempRisk = normalizeTemp(temp)
  const ageRisk = normalizeAge(age)
  const careRisk = normalizeCareLevel(careLevel)
  const img = parseImageFeatures(payload.imageFeatures)
  const imageEval = imageRiskByModel(modelType, img)

  const weighted =
    hrRisk * weights.heartRate +
    bpRisk * weights.bloodPressure +
    spo2Risk * weights.spo2 +
    tempRisk * weights.temperature +
    ageRisk * weights.age +
    careRisk * weights.careLevel +
    imageEval.score * weights.image

  const thresholdBoost = 0.85 + th * 0.3
  const baseline = getBaseline(modelType)
  const baselineBlend = baseline == null ? weighted : weighted * 0.82 + baseline * 0.18
  const noise = ((Math.sin(hr * 12.9898 + age * 78.233 + spo2 * 37.719) * 43758.5453) % 1) * 1.6 - 0.8
  const score = +clamp(baselineBlend * thresholdBoost + noise).toFixed(2)

  let confidence = 72
  if (img) confidence += 12
  if (baseline != null) confidence += 8
  if (file) confidence += 4
  confidence = clamp(confidence + (1 - Math.abs(noise)) * 3, 60, 98)

  const level = score >= 75 ? '高风险' : score >= 50 ? '中等风险' : '低风险'
  const factors = [
    { name: '心率风险', weight: weights.heartRate, value: +hrRisk.toFixed(2), contribution: +(hrRisk * weights.heartRate).toFixed(2) },
    { name: '血压风险', weight: weights.bloodPressure, value: +bpRisk.toFixed(2), contribution: +(bpRisk * weights.bloodPressure).toFixed(2) },
    { name: '血氧风险', weight: weights.spo2, value: +spo2Risk.toFixed(2), contribution: +(spo2Risk * weights.spo2).toFixed(2) },
    { name: '体温风险', weight: weights.temperature, value: +tempRisk.toFixed(2), contribution: +(tempRisk * weights.temperature).toFixed(2) },
    { name: '年龄风险', weight: weights.age, value: +ageRisk.toFixed(2), contribution: +(ageRisk * weights.age).toFixed(2) },
    { name: '护理等级', weight: weights.careLevel, value: +careRisk.toFixed(2), contribution: +(careRisk * weights.careLevel).toFixed(2) },
    { name: '图像特征', weight: weights.image, value: +imageEval.score.toFixed(2), contribution: +(imageEval.score * weights.image).toFixed(2) }
  ].sort((a, b) => b.contribution - a.contribution)

  const adviceMap = {
    fall_risk:
      score >= 75
        ? '跌倒风险较高，建议增加夜间巡查频次，安装防滑垫和床栏，调整助行器具配置。'
        : score >= 50
          ? '存在阶段性跌倒风险，建议加强平衡训练和用药后观察。'
          : '跌倒风险较低，维持常规防护措施即可。',
    health_abnormal:
      score >= 75
        ? '健康指标异常较多，建议立即通知医生复查，加密监测频次至每小时一次。'
        : score >= 50
          ? '部分指标偏高，建议调整饮食和用药方案，持续跟踪。'
          : '健康指标稳定，维持日常监测节奏。',
    care_quality:
      score >= 75
        ? '护理质量风险偏高，建议增加护理人员配置，优化排班和交接流程。'
        : score >= 50
          ? '护理质量存在波动，建议加强培训和流程规范。'
          : '护理质量良好，可持续优化服务标准。',
    comprehensive:
      score >= 75
        ? '综合风险偏高，建议启动多部门联动：医护、护理、后勤协同保障。'
        : score >= 50
          ? '存在阶段性综合风险，建议提高重点住户巡查频次。'
          : '综合风险较低，持续优化预警阈值即可。'
  }

  return {
    score,
    level,
    confidence: +confidence.toFixed(1),
    baseline,
    modelType,
    series: buildSeries(score, modelType),
    factors,
    imageAnalysis: img
      ? { ...img, riskScore: imageEval.score, summary: imageEval.detail }
      : { summary: imageEval.detail },
    accuracy: {
      method: '加权融合 + 历史基线校准 + 图像特征修正',
      residualNoise: +Math.abs(noise).toFixed(3),
      thresholdFactor: +thresholdBoost.toFixed(3)
    },
    advice: adviceMap[modelType],
    image: file ? `/uploads/predict/${file.filename}` : null
  }
}

function runHandler(req, res) {
  try {
    const result = predict(req.body || {}, req.file)
    db.prepare(
      `INSERT INTO predict_history (model_type, params, result, image_path, user_id) VALUES (?, ?, ?, ?, ?)`
    ).run(
      result.modelType,
      JSON.stringify({
        heartRate: Number(req.body.heartRate),
        systolic: Number(req.body.systolic),
        diastolic: Number(req.body.diastolic),
        spo2: Number(req.body.spo2),
        temperature: Number(req.body.temperature),
        age: Number(req.body.age),
        careLevel: req.body.careLevel,
        threshold: Number(req.body.threshold),
        imageFeatures: parseImageFeatures(req.body.imageFeatures)
      }),
      JSON.stringify(result),
      result.image,
      req.user.id
    )
    res.json({ code: 0, data: result, message: '预测完成' })
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message || '预测失败' })
  }
}

router.post('/run', auth(), requirePerm('predict'), (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? '图片不能超过 5MB' : err.message
      return res.status(400).json({ code: 400, message: msg })
    }
    return runHandler(req, res)
  })
})

router.get('/history', auth(), requirePerm('predict'), (req, res) => {
  const rows = db
    .prepare(
      'SELECT id, model_type, params, result, image_path, created_at FROM predict_history WHERE user_id=? OR ?=? ORDER BY id DESC LIMIT 50'
    )
    .all(req.user.id, req.user.role, 'admin')
    .map((r) => ({
      ...r,
      params: JSON.parse(r.params || '{}'),
      result: JSON.parse(r.result || '{}')
    }))
  res.json({ code: 0, data: rows })
})

module.exports = router
