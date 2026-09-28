<template>
  <div class="twin-page" :class="`theme-${modelTheme}`">
    <City3D ref="cityRef" :theme="modelTheme" :theme-data="themePayload" @select="onSelect" />

    <header class="hud top">
      <div class="brand">
        <div class="mark"></div>
        <div>
          <h1>{{ themeStore.settings.headerTitle }}</h1>
          <p>Kangyang Digital Twin · {{ currentTheme.label }}</p>
        </div>
      </div>

      <div class="theme-switch">
        <button
          v-for="t in themes"
          :key="t.key"
          :class="{ active: modelTheme === t.key }"
          @click="switchTheme(t.key)"
        >
          <i :style="{ background: t.color }"></i>
          {{ t.label }}
        </button>
      </div>

      <div class="nav">
        <a
          v-for="m in menus"
          :key="m.path"
          href="javascript:;"
          class="link"
          :class="{ active: m.path === '/dashboard' }"
          @click.prevent="goPage(m.path)"
        >{{ m.title }}</a>
        <button class="link danger" @click="logout">退出</button>
      </div>
    </header>

    <aside class="hud side glass-panel">
      <div class="panel-title">{{ currentTheme.label }} · 场景数据</div>
      <div class="desc">{{ currentTheme.desc }}</div>
      <div class="kpis">
        <div class="kpi" v-for="k in summary" :key="k.label">
          <div class="v">{{ k.value }}</div>
          <div class="l">{{ k.label }}</div>
        </div>
      </div>
      <div class="panel-title mt">场景设备</div>
      <ul class="comp-list">
        <li v-for="c in currentTheme.components" :key="c">
          <span class="dot"></span>{{ c }}
        </li>
      </ul>
      <div class="panel-title mt">展示效果</div>
      <ul class="comp-list soft">
        <li v-for="e in currentTheme.effects" :key="e">{{ e }}</li>
      </ul>
      <p class="tip">鼠标拖拽或方向键/WASD 旋转俯仰 · Q/E 或滚轮缩放 · 点击模型查看数据</p>
    </aside>

    <aside class="hud detail glass-panel" v-if="selected" :class="selected.status">
      <div class="detail-head">
        <div>
          <div class="panel-title">{{ selected.name }}</div>
          <div class="type-tag">{{ selected.category }} · {{ selected.type }}</div>
        </div>
        <span class="status-pill">{{ statusText(selected.status) }}</span>
      </div>

      <div class="hero-value">
        <b>{{ selected.value }}</b>
        <small>{{ selected.unit }}</small>
      </div>

      <div class="metric-grid">
        <div class="metric" v-for="m in selected.metrics || []" :key="m.label">
          <div class="mv">{{ m.value }}</div>
          <div class="ml">{{ m.label }}</div>
        </div>
      </div>

      <div class="rows">
        <div><span>所属区域</span><b>{{ selected.district || '—' }}</b></div>
        <div class="full"><span>设备说明</span><b>{{ selected.remark }}</b></div>
        <div><span>交互特效</span><b>{{ effectLabel(selected.effect) }}</b></div>
      </div>

      <div class="effect-bar">
        <div class="bar-fill" :style="{ width: barWidth }"></div>
      </div>

      <button class="close" @click="closeDetail">关闭</button>
    </aside>

    <footer class="hud bottom">
      <div class="meta">用户：{{ userStore.user?.username }} · {{ roleLabel }}</div>
      <div class="meta">当前场景：{{ currentTheme.label }} · {{ now }}</div>
    </footer>

    <button class="ai-fab" @click="showAi = !showAi" title="AI健康管家">
      <span class="ai-icon">AI</span>
    </button>

    <transition name="slide-left">
      <aside class="ai-panel glass-panel" v-if="showAi">
        <div class="ai-header">
          <span>AI 健康管家</span>
          <button class="ai-close" @click="showAi = false">×</button>
        </div>
        <div class="ai-suggestions">
          <button v-for="q in quickQuestions" :key="q" @click="askAI(q)" :disabled="aiLoading">{{ q }}</button>
        </div>
        <div class="ai-body">
          <div v-if="aiLoading" class="ai-loading">
            <span class="dots"><i></i><i></i><i></i></span> 正在分析康养数据...
          </div>
          <div v-else-if="aiResult" class="ai-result">{{ aiResult }}</div>
          <div v-else class="ai-empty">向AI管家提问，获取健康数据分析与护理建议</div>
        </div>
        <div class="ai-input-row">
          <input
            v-model="aiQuestion"
            placeholder="输入你的问题..."
            @keydown.enter="askAI()"
            :disabled="aiLoading"
          />
          <button @click="askAI()" :disabled="aiLoading || !aiQuestion.trim()">发送</button>
        </div>
        <div class="ai-footer" v-if="aiTokens">消耗 {{ aiTokens }} tokens · {{ aiModel }}</div>
      </aside>
    </transition>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import City3D from '@/components/City3D.vue'
import { getOverview, getTableData, aiAnalyze } from '@/api'
import { useThemeStore } from '@/stores/theme'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const themeStore = useThemeStore()
const userStore = useUserStore()
const cityRef = ref(null)

const modelTheme = ref('room')
const selected = ref(null)
const overview = ref(null)
const residents = ref([])
const healthRows = ref([])
const alarmRows = ref([])
const envRows = ref([])
const deviceRows = ref([])
const now = ref(dayjs().format('YYYY-MM-DD HH:mm:ss'))

const showAi = ref(false)
const aiQuestion = ref('')
const aiResult = ref('')
const aiLoading = ref(false)
const aiTokens = ref(0)
const aiModel = ref('')
const quickQuestions = [
  '当前有哪些待处理告警？',
  '哪些住户健康指标需要关注？',
  '室内环境是否达标？',
  '护理记录执行情况如何？',
  '离线设备有哪些？'
]

async function askAI(question) {
  const q = (question || aiQuestion.value || '').trim()
  if (!q || aiLoading.value) return
  aiLoading.value = true
  aiResult.value = ''
  if (question) aiQuestion.value = question
  try {
    const res = await aiAnalyze(q)
    aiResult.value = res.data.content
    aiTokens.value = res.data.tokens
    aiModel.value = res.data.model
  } catch (e) {
    aiResult.value = '分析失败：' + (e.message || '请稍后重试')
  } finally {
    aiLoading.value = false
  }
}
let timer

const themes = [
  {
    key: 'room',
    label: '居室',
    color: '#ff8c42',
    components: ['智能护理床', '生命体征监护仪', '跌倒检测仪', '智能手环', '床头柜'],
    effects: ['设备高亮描边', '监护仪屏幕闪烁', '选中光柱与脉冲环'],
    desc: '展示居室环境、床位设备与住户健康监测运行态势。',
    category: '起居'
  },
  {
    key: 'corridor',
    label: '走廊',
    color: '#42d9b8',
    components: ['紧急呼叫器', '走廊摄像头', '辅助扶手', '智能照明', '管理中枢'],
    effects: ['呼叫器呼吸闪烁', '摄像头扫视', '灯具呼吸效果'],
    desc: '走廊安全监控、紧急呼叫与通行辅助的实时孪生。',
    category: '公共区域'
  },
  {
    key: 'dining',
    label: '餐厅',
    color: '#ffb627',
    components: ['适老化餐桌', '餐具消毒柜', '送餐车', '智能饮水机', '管理中枢'],
    effects: ['消毒柜脉冲发光', '选中光柱反馈', '中枢晶体旋转'],
    desc: '膳食服务、餐具消毒与营养管理的餐饮场景。',
    category: '餐饮'
  },
  {
    key: 'nursing',
    label: '护理站',
    color: '#4fb8d9',
    components: ['护理工作站', '智能药品柜', '综合监护大屏', '管理中枢'],
    effects: ['屏幕数据闪烁', '药品柜脉冲', '中枢晶体旋转'],
    desc: '全楼层护理调度、健康监测与告警管理的核心枢纽。',
    category: '护理'
  },
  {
    key: 'rehab',
    label: '康复室',
    color: '#6dd97a',
    components: ['康复平行杠', '康复跑步机', '训练阶梯', '康复训练床', '管理中枢'],
    effects: ['设备高亮描边', '跑步机摆动', '选中脉冲环'],
    desc: '康复训练计划、器材使用与进度跟踪的场景。',
    category: '康复'
  }
]

const allMenus = [
  { path: '/dashboard', title: '3D孪生', perm: 'dashboard' },
  { path: '/charts/ops', title: '健康监测', perm: 'charts' },
  { path: '/charts/analysis', title: '护理分析', perm: 'charts' },
  { path: '/charts/advanced', title: '空间关系', perm: 'charts' },
  { path: '/data', title: '数据管理', perm: 'data' },
  { path: '/users', title: '用户管理', perm: 'users' },
  { path: '/style', title: '样式设置', perm: 'settings' },
  { path: '/db', title: '数据库', perm: 'db' },
  { path: '/predict', title: '健康预测', perm: 'predict' }
]

const menus = computed(() => allMenus.filter((m) => userStore.hasPerm(m.perm)))
const currentTheme = computed(() => themes.find((t) => t.key === modelTheme.value) || themes[0])
const roleLabel = computed(
  () => ({ admin: '管理员', editor: '编辑员', viewer: '访客' }[userStore.role] || userStore.role)
)

const themePayload = computed(() => {
  if (modelTheme.value === 'corridor' || modelTheme.value === 'dining' || modelTheme.value === 'nursing' || modelTheme.value === 'rehab') {
    return {
      nodes: deviceRows.value.slice(0, 24).map((r) => ({
        name: r.name,
        value: r.battery ?? Math.round(60 + Math.random() * 40),
        unit: '% 电量',
        district: r.room_no || currentTheme.value.label,
        status: r.status === 'online' ? 'normal' : 'warning',
        remark: r.remark || `${currentTheme.value.label}设备`
      }))
    }
  }
  return {
    nodes: healthRows.value.slice(0, 20).map((r) => ({
      name: r.resident_name,
      value: r.heart_rate,
      unit: 'bpm',
      district: '101室',
      status: r.status === 'normal' ? 'normal' : r.status === 'attention' ? 'warning' : 'critical',
      remark: `${r.resident_name} 健康监测`
    }))
  }
})

const summary = computed(() => {
  if (modelTheme.value === 'room') {
    const nodes = themePayload.value.nodes || []
    const avgHR = nodes.length ? Math.round(nodes.reduce((s, i) => s + Number(i.value || 0), 0) / nodes.length) : '--'
    return [
      { label: '监测住户', value: nodes.length },
      { label: '平均心率', value: avgHR },
      { label: '关注', value: nodes.filter((n) => n.status === 'warning').length },
      { label: '紧急', value: nodes.filter((n) => n.status === 'critical').length }
    ]
  }
  if (modelTheme.value === 'corridor') {
    const nodes = themePayload.value.nodes || []
    return [
      { label: '在线设备', value: nodes.length },
      { label: '呼叫器', value: 6 },
      { label: '摄像头', value: 3 },
      { label: '离线', value: nodes.filter((n) => n.status !== 'normal').length }
    ]
  }
  if (modelTheme.value === 'dining') {
    const nodes = themePayload.value.nodes || []
    return [
      { label: '设备数', value: nodes.length },
      { label: '餐桌', value: 4 },
      { label: '消毒中', value: 1 },
      { label: '送餐车', value: 1 }
    ]
  }
  if (modelTheme.value === 'nursing') {
    const alarms = alarmRows.value
    return [
      { label: '在管住户', value: residents.value.length },
      { label: '待处理告警', value: alarms.filter((a) => a.status === 'pending').length },
      { label: '处理中', value: alarms.filter((a) => a.status === 'processing').length },
      { label: '已解决', value: alarms.filter((a) => a.status === 'resolved').length }
    ]
  }
  if (modelTheme.value === 'rehab') {
    return [
      { label: '器材数', value: 4 },
      { label: '本周训练', value: 12 },
      { label: '平均时长', value: '25min' },
      { label: '状态', value: '空闲' }
    ]
  }
  return []
})

const barWidth = computed(() => {
  if (!selected.value) return '0%'
  const n = Number(selected.value.value)
  if (Number.isNaN(n)) return '66%'
  if (String(selected.value.unit).includes('%')) return `${Math.min(100, n)}%`
  return `${Math.min(100, Math.max(12, n % 100))}%`
})

function statusText(s) {
  return { normal: '正常', warning: '预警', critical: '紧急', attention: '关注' }[s] || s || '正常'
}

function effectLabel(effect) {
  return (
    {
      'device-glow': '设备高亮 + 光柱',
      'device-pulse': '设备脉冲呼吸',
      'core-pulse': '中枢脉冲 + 晶体辉光',
      'camera-scan': '摄像头扫视'
    }[effect] || '选中光效'
  )
}

function switchTheme(key) {
  modelTheme.value = key
  selected.value = null
  cityRef.value?.clearSelect?.()
}

function onSelect(item) { selected.value = item }

function closeDetail() {
  selected.value = null
  cityRef.value?.clearSelect?.()
}

async function goPage(path) {
  if (!path) return
  try { cityRef.value?.destroy?.() } catch { /* ignore */ }
  await nextTick()
  router.push(path).catch(() => {})
}

function logout() {
  try { cityRef.value?.destroy?.() } catch { /* ignore */ }
  userStore.logout()
  router.push('/login')
}

onMounted(async () => {
  await themeStore.load()
  modelTheme.value = themeStore.settings.modelTheme || 'room'
  timer = setInterval(() => {
    now.value = dayjs().format('YYYY-MM-DD HH:mm:ss')
  }, 1000)
  try {
    const [ov, resRows, hlRows, alRows, evRows, devRows] = await Promise.all([
      getOverview(),
      getTableData('residents', { page: 1, pageSize: 50 }),
      getTableData('resident_health', { page: 1, pageSize: 40 }),
      getTableData('alarms', { page: 1, pageSize: 30 }),
      getTableData('room_environment', { page: 1, pageSize: 30 }),
      getTableData('devices', { page: 1, pageSize: 40 })
    ])
    overview.value = ov.data
    residents.value = resRows.data.list || []
    healthRows.value = hlRows.data.list || []
    alarmRows.value = alRows.data.list || []
    envRows.value = evRows.data.list || []
    deviceRows.value = devRows.data.list || []
  } catch { /* empty */ }
})

onBeforeUnmount(() => {
  clearInterval(timer)
  try { cityRef.value?.destroy?.() } catch { /* ignore */ }
})
</script>

<style scoped lang="scss">
.twin-page {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: linear-gradient(180deg, #1a1428 0%, #1a1a2e 100%);
  &.theme-corridor {
    background: linear-gradient(180deg, #0e1e1a 0%, #142028 100%);
  }
  &.theme-dining {
    background: linear-gradient(180deg, #1e1810 0%, #2a2018 100%);
  }
  &.theme-nursing {
    background: linear-gradient(180deg, #0e1a22 0%, #14242e 100%);
  }
  &.theme-rehab {
    background: linear-gradient(180deg, #0a1e14 0%, #102818 100%);
  }
}

.hud {
  position: absolute;
  z-index: 5;
  pointer-events: none;
  * { pointer-events: auto; }
}

.top {
  top: 0;
  left: 0;
  right: 0;
  display: grid;
  grid-template-columns: 1.1fr 1.5fr 1.2fr;
  gap: 12px;
  align-items: start;
  padding: 14px 18px;
  background: linear-gradient(180deg, rgba(20, 15, 25, 0.78), transparent);
}

.brand {
  display: flex;
  gap: 10px;
  align-items: center;
  .mark {
    width: 36px;
    height: 36px;
    border: 2px solid var(--sc-primary);
    background: linear-gradient(135deg, var(--sc-primary), transparent 60%);
    clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
  }
  h1 {
    margin: 0;
    font-size: 18px;
    letter-spacing: 2px;
    color: var(--sc-primary);
  }
  p {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--sc-muted);
  }
}

.theme-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(40, 30, 50, 0.5);
    border: 1px solid var(--sc-border);
    color: var(--sc-muted);
    padding: 6px 12px;
    cursor: pointer;
    font-size: 12px;
    letter-spacing: 1px;
    i {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }
    &.active {
      color: #1a1428;
      background: var(--sc-primary);
      border-color: var(--sc-primary);
    }
  }
}

.nav {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
  position: relative;
  z-index: 20;
}
.link {
  text-decoration: none;
  color: var(--sc-muted);
  background: rgba(30, 25, 40, 0.55);
  border: 1px solid var(--sc-border);
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  position: relative;
  z-index: 21;
}
.link:hover,
.link.active {
  color: var(--sc-primary);
  border-color: var(--sc-primary);
}
.link.danger { color: #ff8fa3; }

.side,
.detail {
  top: 100px;
  width: 300px;
  padding: 14px;
  max-height: calc(100vh - 160px);
  overflow: auto;
  backdrop-filter: blur(10px);
}
.side { left: 18px; }
.detail {
  right: 18px;
  border-color: rgba(255, 140, 66, 0.45);
  animation: slideIn 0.28s ease;
}
.detail.warning { border-color: rgba(255, 170, 0, 0.55); }
.detail.critical { border-color: rgba(255, 79, 122, 0.6); }

@keyframes slideIn {
  from { opacity: 0; transform: translateX(12px); }
  to { opacity: 1; transform: translateX(0); }
}

.desc {
  font-size: 12px;
  line-height: 1.6;
  color: var(--sc-muted);
  margin-bottom: 12px;
}
.kpis {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.kpi {
  text-align: center;
  padding: 10px 6px;
  border: 1px solid rgba(255, 140, 66, 0.18);
  background: rgba(40, 30, 50, 0.25);
  .v {
    color: var(--sc-accent);
    font-size: 20px;
  }
  .l {
    margin-top: 4px;
    color: var(--sc-muted);
    font-size: 12px;
  }
}
.mt { margin-top: 14px; }
.comp-list {
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--sc-text);
  line-height: 1.9;
  font-size: 13px;
  li {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--sc-primary);
    box-shadow: 0 0 8px var(--sc-primary);
  }
  &.soft li {
    color: var(--sc-muted);
    font-size: 12px;
    padding-left: 2px;
  }
}
.tip {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--sc-muted);
}

.detail-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}
.type-tag {
  margin-top: 4px;
  font-size: 12px;
  color: var(--sc-muted);
}
.status-pill {
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid var(--sc-border);
  color: var(--sc-accent);
}
.detail.warning .status-pill {
  color: #ffaa00;
  border-color: rgba(255, 170, 0, 0.45);
}
.detail.critical .status-pill {
  color: #ff4f7a;
  border-color: rgba(255, 79, 122, 0.45);
}

.hero-value {
  margin: 12px 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  b {
    font-size: 34px;
    color: var(--sc-primary);
    letter-spacing: 1px;
  }
  small { color: var(--sc-muted); }
}

.metric-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
}
.metric {
  text-align: center;
  padding: 8px 4px;
  background: rgba(40, 30, 50, 0.28);
  border: 1px solid rgba(255, 140, 66, 0.15);
  .mv {
    color: var(--sc-accent);
    font-size: 13px;
  }
  .ml {
    margin-top: 4px;
    font-size: 11px;
    color: var(--sc-muted);
  }
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
  div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
    span {
      color: var(--sc-muted);
      flex-shrink: 0;
    }
    b {
      color: var(--sc-text);
      text-align: right;
      font-weight: 500;
    }
  }
  .full {
    flex-direction: column;
    b {
      text-align: left;
      margin-top: 4px;
      line-height: 1.5;
    }
  }
}

.effect-bar {
  margin-top: 14px;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
  .bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--sc-primary), var(--sc-accent));
    transition: width 0.35s ease;
  }
}

.close {
  margin-top: 14px;
  width: 100%;
  background: transparent;
  border: 1px solid var(--sc-border);
  color: var(--sc-muted);
  padding: 8px;
  cursor: pointer;
}
.bottom {
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-between;
  padding: 10px 18px;
  background: linear-gradient(0deg, rgba(20, 15, 25, 0.75), transparent);
  .meta {
    color: var(--sc-muted);
    font-size: 12px;
  }
}

@media (max-width: 1100px) {
  .top { grid-template-columns: 1fr; }
  .side,
  .detail { width: min(300px, calc(100vw - 24px)); }
}

.ai-fab {
  position: absolute;
  right: 24px;
  bottom: 60px;
  z-index: 10;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 2px solid var(--sc-primary);
  background: linear-gradient(135deg, var(--sc-primary), #cc6622);
  cursor: pointer;
  box-shadow: 0 0 16px rgba(255, 140, 66, 0.4);
  transition: transform 0.2s;
  &:hover { transform: scale(1.1); }
  .ai-icon {
    color: #fff;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 1px;
  }
}

.ai-panel {
  position: absolute;
  right: 24px;
  bottom: 120px;
  z-index: 10;
  width: 360px;
  max-height: 480px;
  display: flex;
  flex-direction: column;
  border-color: rgba(255, 140, 66, 0.35);
}
.ai-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--sc-border);
  font-size: 14px;
  color: var(--sc-primary);
  font-weight: 600;
}
.ai-close {
  background: none;
  border: none;
  color: var(--sc-muted);
  font-size: 20px;
  cursor: pointer;
  &:hover { color: var(--sc-primary); }
}
.ai-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px;
  button {
    font-size: 11px;
    padding: 4px 8px;
    background: rgba(255, 140, 66, 0.1);
    border: 1px solid rgba(255, 140, 66, 0.25);
    color: var(--sc-muted);
    cursor: pointer;
    border-radius: 2px;
    &:hover {
      color: var(--sc-primary);
      border-color: var(--sc-primary);
    }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }
}
.ai-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--sc-text);
  min-height: 80px;
}
.ai-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--sc-muted);
}
.dots {
  display: inline-flex;
  gap: 4px;
  i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--sc-primary);
    animation: dotPulse 1.2s infinite;
    &:nth-child(2) { animation-delay: 0.2s; }
    &:nth-child(3) { animation-delay: 0.4s; }
  }
}
@keyframes dotPulse {
  0%, 60%, 100% { opacity: 0.3; }
  30% { opacity: 1; }
}
.ai-empty {
  color: var(--sc-muted);
  text-align: center;
  padding: 20px;
  font-size: 12px;
}
.ai-input-row {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--sc-border);
  input {
    flex: 1;
    background: rgba(20, 15, 25, 0.6);
    border: 1px solid var(--sc-border);
    color: var(--sc-text);
    padding: 8px 10px;
    font-size: 13px;
    outline: none;
    &:focus { border-color: var(--sc-primary); }
  }
  button {
    background: var(--sc-primary);
    border: none;
    color: #fff;
    padding: 0 14px;
    cursor: pointer;
    font-size: 12px;
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }
}
.ai-footer {
  padding: 6px 10px;
  font-size: 11px;
  color: var(--sc-muted);
  border-top: 1px solid rgba(255, 140, 66, 0.1);
}

.slide-left-enter-active,
.slide-left-leave-active {
  transition: all 0.25s ease;
}
.slide-left-enter-from,
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(40px);
}
</style>
