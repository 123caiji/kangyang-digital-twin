<template>
  <div class="page page-scroll">
    <div class="layout">
      <div class="left glass-panel">
        <div class="panel-title">预测参数调试</div>
        <el-form label-width="100px">
          <el-form-item label="模型类型">
            <el-select v-model="params.modelType" style="width: 100%">
              <el-option label="交通拥堵预测" value="traffic" />
              <el-option label="能源负荷预测" value="energy" />
              <el-option label="环境质量预测" value="environment" />
              <el-option label="综合风险预测" value="risk" />
            </el-select>
          </el-form-item>
          <el-form-item label="温度">
            <el-slider v-model="params.temperature" :min="-10" :max="45" show-input />
          </el-form-item>
          <el-form-item label="湿度">
            <el-slider v-model="params.humidity" :min="0" :max="100" show-input />
          </el-form-item>
          <el-form-item label="人口密度">
            <el-slider v-model="params.population" :min="0" :max="200" show-input />
          </el-form-item>
          <el-form-item label="交通流量">
            <el-slider v-model="params.trafficFlow" :min="0" :max="100" show-input />
          </el-form-item>
          <el-form-item label="能源负荷">
            <el-slider v-model="params.energyLoad" :min="0" :max="100" show-input />
          </el-form-item>
          <el-form-item label="阈值">
            <el-slider v-model="params.threshold" :min="0" :max="1" :step="0.01" show-input />
          </el-form-item>

          <el-form-item label="场景图片">
            <div
              class="upload-zone"
              :class="{ dragover: dragover, hasFile: !!preview }"
              @dragover.prevent="dragover = true"
              @dragleave.prevent="dragover = false"
              @drop.prevent="onDrop"
            >
              <input
                ref="fileInput"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
                hidden
                @change="onInputChange"
              />
              <template v-if="!preview">
                <p>拖拽图片到此处，或</p>
                <el-button type="primary" plain @click="fileInput?.click()">选择图片</el-button>
                <p class="hint">支持 JPG/PNG/WEBP，最大 5MB，自动压缩并提取特征</p>
              </template>
              <template v-else>
                <div class="preview-wrap">
                  <img :src="preview" alt="preview" />
                  <div class="preview-meta">
                    <div>{{ fileMeta.name }}</div>
                    <div>{{ fileMeta.sizeText }} · {{ fileMeta.width }}×{{ fileMeta.height }}</div>
                    <div v-if="imageFeatures" class="feats">
                      亮度 {{ imageFeatures.brightness }} · 对比 {{ imageFeatures.contrast }} ·
                      暖色 {{ imageFeatures.warmRatio }}% · 绿占比 {{ imageFeatures.greenRatio }}%
                    </div>
                  </div>
                </div>
                <div class="upload-actions">
                  <el-button @click="fileInput?.click()">更换</el-button>
                  <el-button type="danger" plain @click="clearFile">移除</el-button>
                </div>
              </template>
            </div>
          </el-form-item>

          <el-form-item>
            <el-button type="primary" :loading="loading" @click="run">开始预测</el-button>
            <el-button @click="resetParams">重置参数</el-button>
          </el-form-item>
        </el-form>
      </div>

      <div class="right">
        <div class="result glass-panel" v-if="result">
          <div class="panel-title">预测结果</div>
          <div class="score-row">
            <div class="score">{{ result.score }}</div>
            <div class="score-main">
              <div class="level">{{ result.level }}</div>
              <div class="advice">{{ result.advice }}</div>
              <div class="acc-row">
                <span>置信度 {{ result.confidence }}%</span>
                <span v-if="result.baseline != null">历史基线 {{ result.baseline }}</span>
                <span>{{ result.accuracy?.method }}</span>
              </div>
            </div>
            <img v-if="result.image" :src="result.image" class="result-img" alt="result" />
          </div>

          <div class="factor-list" v-if="result.factors?.length">
            <div class="factor" v-for="f in result.factors" :key="f.name">
              <div class="fname">{{ f.name }}</div>
              <div class="fbar"><i :style="{ width: `${Math.min(100, f.contribution)}%` }"></i></div>
              <div class="fval">{{ f.contribution }}</div>
            </div>
          </div>

          <div class="img-analysis" v-if="result.imageAnalysis">
            <div class="panel-title">图像分析</div>
            <p>{{ result.imageAnalysis.summary }}</p>
          </div>

          <div class="chart"><ChartPanel :option="chartOption" /></div>
        </div>

        <div class="history glass-panel">
          <div class="panel-title">历史记录</div>
          <el-table :data="history" stripe height="280" style="width: 100%">
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="model_type" label="模型" width="110" />
            <el-table-column label="得分" width="80">
              <template #default="{ row }">{{ row.result?.score }}</template>
            </el-table-column>
            <el-table-column label="置信度" width="90">
              <template #default="{ row }">{{ row.result?.confidence ?? '-' }}</template>
            </el-table-column>
            <el-table-column label="等级" width="110">
              <template #default="{ row }">{{ row.result?.level }}</template>
            </el-table-column>
            <el-table-column prop="created_at" label="时间" min-width="160" />
          </el-table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import ChartPanel from '@/components/ChartPanel.vue'
import { getPredictHistory, runPredict } from '@/api'

const loading = ref(false)
const file = ref(null)
const preview = ref('')
const previewUrl = ref('')
const dragover = ref(false)
const fileInput = ref(null)
const imageFeatures = ref(null)
const fileMeta = reactive({ name: '', sizeText: '', width: 0, height: 0 })
const result = ref(null)
const history = ref([])

const params = reactive({
  modelType: 'traffic',
  temperature: 22,
  humidity: 55,
  population: 80,
  trafficFlow: 65,
  energyLoad: 48,
  threshold: 0.7
})

const chartOption = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'axis' },
  legend: { textStyle: { color: '#9ec9e8' } },
  grid: { left: 40, right: 20, top: 40, bottom: 28 },
  xAxis: {
    type: 'category',
    data: (result.value?.series || []).map((i) => i.month),
    axisLabel: { color: '#9ec9e8' },
    axisLine: { lineStyle: { color: 'rgba(0,212,255,0.3)' } }
  },
  yAxis: {
    type: 'value',
    axisLabel: { color: '#9ec9e8' },
    splitLine: { lineStyle: { color: 'rgba(0,212,255,0.08)' } }
  },
  series: [
    {
      name: '预测曲线',
      type: 'line',
      smooth: true,
      areaStyle: { opacity: 0.25 },
      data: (result.value?.series || []).map((i) => i.value),
      color: '#00d4ff'
    },
    {
      name: '因子贡献',
      type: 'bar',
      data: (result.value?.factors || []).map((i) => i.contribution),
      itemStyle: { color: '#00ffa3' }
    }
  ]
}))

function formatSize(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function revokePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  preview.value = ''
}

function clearFile() {
  file.value = null
  imageFeatures.value = null
  fileMeta.name = ''
  fileMeta.sizeText = ''
  fileMeta.width = 0
  fileMeta.height = 0
  revokePreview()
  if (fileInput.value) fileInput.value.value = ''
}

function resetParams() {
  Object.assign(params, {
    modelType: 'traffic',
    temperature: 22,
    humidity: 55,
    population: 80,
    trafficFlow: 65,
    energyLoad: 48,
    threshold: 0.7
  })
  clearFile()
}

function loadImage(fileObj) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fileObj)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片读取失败'))
    }
    img.src = url
  })
}

async function extractFeatures(img) {
  const canvas = document.createElement('canvas')
  const size = 96
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)

  let brightnessSum = 0
  let warm = 0
  let green = 0
  let edge = 0
  const gray = new Float32Array(size * size)

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const y = 0.299 * r + 0.587 * g + 0.114 * b
    gray[p] = y
    brightnessSum += y
    if (r > g + 12 && r > b + 8) warm++
    if (g > r + 8 && g > b + 5) green++
  }

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x
      const gx = gray[i + 1] - gray[i - 1]
      const gy = gray[i + size] - gray[i - size]
      if (Math.hypot(gx, gy) > 28) edge++
    }
  }

  const brightness = +(brightnessSum / (size * size) / 2.55).toFixed(1)
  // contrast approx via mean absolute deviation
  const mean = brightnessSum / (size * size)
  let mad = 0
  for (let i = 0; i < gray.length; i++) mad += Math.abs(gray[i] - mean)
  const contrast = +((mad / gray.length / 2.55) * 2.2).toFixed(1)
  const total = size * size

  return {
    brightness: Math.min(100, Math.max(0, brightness)),
    contrast: Math.min(100, Math.max(0, contrast)),
    warmRatio: +((warm / total) * 100).toFixed(1),
    greenRatio: +((green / total) * 100).toFixed(1),
    edgeDensity: +((edge / total) * 100 * 3).toFixed(1),
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height
  }
}

async function compressImage(fileObj, maxSide = 1280, quality = 0.82) {
  const img = await loadImage(fileObj)
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('图片压缩失败')
  const compressed = new File([blob], fileObj.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
  const features = await extractFeatures(img)
  features.width = img.width
  features.height = img.height
  return { file: compressed, features, width: img.width, height: img.height }
}

async function handleFile(fileObj) {
  if (!fileObj) return
  if (!fileObj.type.startsWith('image/')) {
    ElMessage.warning('请上传图片文件')
    return
  }
  if (fileObj.size > 5 * 1024 * 1024) {
    ElMessage.warning('图片不能超过 5MB')
    return
  }

  try {
    const { file: compressed, features, width, height } = await compressImage(fileObj)
    clearFile()
    file.value = compressed
    imageFeatures.value = {
      ...features,
      edgeDensity: Math.min(100, features.edgeDensity)
    }
    fileMeta.name = fileObj.name
    fileMeta.sizeText = `${formatSize(fileObj.size)} → ${formatSize(compressed.size)}`
    fileMeta.width = width
    fileMeta.height = height
    previewUrl.value = URL.createObjectURL(compressed)
    preview.value = previewUrl.value
    ElMessage.success('图片已优化并完成特征提取')
  } catch (e) {
    ElMessage.error(e.message || '图片处理失败')
  }
}

function onInputChange(e) {
  const f = e.target.files?.[0]
  handleFile(f)
}

function onDrop(e) {
  dragover.value = false
  const f = e.dataTransfer?.files?.[0]
  handleFile(f)
}

async function run() {
  loading.value = true
  try {
    const fd = new FormData()
    Object.entries(params).forEach(([k, v]) => fd.append(k, v))
    if (imageFeatures.value) fd.append('imageFeatures', JSON.stringify(imageFeatures.value))
    if (file.value) fd.append('image', file.value)
    const res = await runPredict(fd)
    result.value = res.data
    ElMessage.success(`预测完成（置信度 ${res.data.confidence}%）`)
    await loadHistory()
  } finally {
    loading.value = false
  }
}

async function loadHistory() {
  const res = await getPredictHistory()
  history.value = res.data
}

onMounted(loadHistory)
onBeforeUnmount(() => revokePreview())
</script>

<style scoped>
.page {
  height: 100%;
}
.layout {
  display: grid;
  grid-template-columns: 440px 1fr;
  gap: 14px;
  min-height: 100%;
}
.left,
.result,
.history {
  padding: 14px;
}
.right {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.upload-zone {
  width: 100%;
  min-height: 150px;
  border: 1px dashed rgba(0, 212, 255, 0.35);
  background: rgba(0, 40, 80, 0.2);
  padding: 14px;
  text-align: center;
  color: var(--sc-muted);
}
.upload-zone.dragover {
  border-color: var(--sc-primary);
  background: rgba(0, 212, 255, 0.08);
}
.upload-zone.hasFile {
  text-align: left;
}
.upload-zone .hint {
  font-size: 12px;
  margin-top: 8px;
}
.preview-wrap {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.preview-wrap img {
  width: 120px;
  height: 90px;
  object-fit: cover;
  border: 1px solid var(--sc-border);
}
.preview-meta {
  font-size: 12px;
  line-height: 1.7;
  color: var(--sc-muted);
}
.feats {
  color: var(--sc-accent);
}
.upload-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}
.score-row {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 12px;
}
.score {
  font-size: 42px;
  color: var(--sc-accent);
  font-weight: 700;
}
.level {
  color: var(--sc-primary);
  font-size: 18px;
}
.advice {
  color: var(--sc-muted);
  margin-top: 6px;
  line-height: 1.5;
}
.acc-row {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
  color: var(--sc-muted);
}
.result-img {
  max-width: 120px;
  max-height: 90px;
  border: 1px solid var(--sc-border);
  object-fit: cover;
}
.factor-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.factor {
  display: grid;
  grid-template-columns: 88px 1fr 56px;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}
.fname {
  color: var(--sc-muted);
}
.fbar {
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.fbar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--sc-primary), var(--sc-accent));
}
.fval {
  text-align: right;
  color: var(--sc-accent);
}
.img-analysis {
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--sc-muted);
}
.chart {
  height: 280px;
}
@media (max-width: 1100px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
