<template>
  <div class="twin-page" :class="`theme-${modelTheme}`">
    <div class="stage">
      <Room3D
        ref="roomRef"
        :theme="modelTheme"
        :theme-data="themePayload"
        @select="onSelect"
        @webgl-failed="onWebglFailed"
      />

      <!-- 触控设备：键盘可控项在移动端的等价入口 -->
      <div v-if="isCoarsePointer && !webglFailed" class="stage-tools" role="group" aria-label="三维视图控制">
        <button type="button" aria-label="向左旋转" @click="viewCtrl('rotate', -1)">‹</button>
        <button type="button" aria-label="向右旋转" @click="viewCtrl('rotate', 1)">›</button>
        <button type="button" aria-label="升高视角" @click="viewCtrl('pitch', 1)">▲</button>
        <button type="button" aria-label="降低视角" @click="viewCtrl('pitch', -1)">▼</button>
        <span class="split" aria-hidden="true"></span>
        <button type="button" aria-label="拉远视角" @click="viewCtrl('zoom', 1)">−</button>
        <button type="button" aria-label="拉近视角" @click="viewCtrl('zoom', -1)">+</button>
        <button type="button" aria-label="重置视角" @click="viewCtrl('reset')">⟳</button>
      </div>
    </div>

    <header class="hud top">
      <div class="brand">
        <div class="mark"></div>
        <div>
          <h1>{{ themeStore.settings.headerTitle }}</h1>
          <p>
            Kangyang Digital Twin · {{ currentTheme.label }}
            <template v-if="activeRoom"> · <b class="room-tag">{{ activeRoom }}室</b></template>
          </p>
        </div>
      </div>

      <div class="theme-switch" role="group" aria-label="三维场景切换">
        <button
          v-for="t in themes"
          :key="t.key"
          type="button"
          :class="{ active: modelTheme === t.key }"
          :aria-pressed="modelTheme === t.key"
          @click="switchTheme(t.key)"
        >
          <i :style="{ background: t.color }" aria-hidden="true"></i>
          {{ t.label }}
        </button>
      </div>

      <nav class="nav" aria-label="主菜单">
        <button
          v-for="m in menus"
          :key="m.path"
          type="button"
          class="link"
          :class="{ active: m.path === '/dashboard' }"
          :aria-current="m.path === '/dashboard' ? 'page' : undefined"
          @click="goPage(m.path)"
        >{{ m.title }}</button>
        <button type="button" class="link danger" @click="logout">退出</button>
      </nav>
    </header>

    <aside class="hud side glass-panel">
      <div class="panel-title">{{ currentTheme.label }} · {{ activeRoom ? `${activeRoom}室数据` : modelTheme === 'room' || modelTheme === 'nursing' ? '全楼数据' : '布局示意' }}</div>
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
      <div class="panel-title mt" v-if="iotData">全楼 IoT 数据</div>
      <div class="iot-mini" v-if="iotData">
        <div class="iot-row" v-if="iotData.healthLatest?.length">
          <span>健康监测</span>
          <b>{{ iotData.healthLatest.length }}人</b>
        </div>
        <div class="iot-row" v-if="iotData.fallCount !== undefined">
          <span>跌倒检测</span>
          <b :class="{ alert: iotData.fallCount > 0 }">{{ iotData.fallCount }}次</b>
        </div>
        <div class="iot-row" v-if="iotData.envLatest?.length">
          <span>环境监测</span>
          <b>{{ iotData.envLatest.length }}间</b>
        </div>
        <div class="iot-row" v-if="iotData.outdoorLatest">
          <span>室外温度</span>
          <b>{{ iotData.outdoorLatest.temperature }}°C</b>
        </div>
        <div class="iot-row" v-if="iotData.soilLatest?.length">
          <span>土壤监测</span>
          <b>{{ iotData.soilLatest.length }}区</b>
        </div>
      </div>
      <button class="iot-sim-btn" @click="simulateIoT" :disabled="simLoading">
        {{ simLoading ? '推送中...' : '模拟IoT数据上报' }}
      </button>
      <p class="tip">拖拽旋转 · 右键平移 · 滚轮缩放 · 点选后方向键/QE 控制 · 双击聚焦</p>
    </aside>

    <aside class="hud detail glass-panel" v-if="selected" :class="selected.status">
      <div class="sheet-handle" aria-hidden="true"></div>
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

    <button
      class="ai-fab"
      type="button"
      title="AI健康管家"
      aria-label="AI 健康管家"
      aria-controls="ai-panel"
      :aria-expanded="showAi"
      @click="showAi = !showAi"
    >
      <span class="ai-icon">AI</span>
    </button>

    <transition name="slide-left">
      <aside id="ai-panel" class="ai-panel glass-panel" v-if="showAi" aria-label="AI 健康管家">
        <div class="sheet-handle" aria-hidden="true"></div>
        <div class="ai-header">
          <span>AI 健康管家</span>
          <button class="ai-close" type="button" aria-label="关闭 AI 面板" @click="showAi = false">×</button>
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
            aria-label="向 AI 健康管家提问"
            @keydown.enter="askAI()"
            :disabled="aiLoading"
          />
          <button type="button" @click="askAI()" :disabled="aiLoading || !aiQuestion.trim()">发送</button>
        </div>
        <div class="ai-footer" v-if="aiTokens">消耗 {{ aiTokens }} tokens · {{ aiModel }}</div>
      </aside>
    </transition>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import Room3D from '@/components/CareRoom3D.vue'
import { getOverview, getTableData, getResidentsLatest, aiAnalyze, iotDashboard, iotSimulate } from '@/api'
import { useThemeStore } from '@/stores/theme'
import { useUserStore } from '@/stores/user'
import { useBreakpoint } from '@/composables/useBreakpoint'

const router = useRouter()
const route = useRoute()
const themeStore = useThemeStore()
const userStore = useUserStore()
const { isCoarsePointer } = useBreakpoint()
const roomRef = ref(null)
const webglFailed = ref(false)
/**
 * 从园区总览下钻时带的房号（/dashboard?theme=room&room=101）。
 * 有值时场景数据只显示该房间的住户，头部也会标出房号。
 */
const activeRoom = ref('')

const modelTheme = ref('room')
const selected = ref(null)
const overview = ref(null)
const residents = ref([])
const healthRows = ref([])
const alarmRows = ref([])
const envRows = ref([])
const deviceRows = ref([])
const iotData = ref(null)
const simLoading = ref(false)
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
let dataTimer

const themes = [
  {
    key: 'room',
    label: '居室',
    color: '#ff8c42',
    components: ['双床护理床', '床头呼叫按钮', '扶手座椅', '床头储物柜', '剖面墙窗'],
    effects: ['双床居室剖面', '关节人物与骨架查看', '人物姿态仅为示意'],
    desc: '展示居室环境、床位设备与住户健康监测运行态势。',
    category: '起居'
  },
  {
    key: 'corridor',
    label: '走廊',
    color: '#42d9b8',
    components: ['居室通道门', '连续辅助扶手', '轮椅模型', '护理员示意人物'],
    effects: ['连续扶手与通道门', '轮椅通行示意', '护理员关节动作'],
    desc: '展示适老通行空间，人物与设施为布局示意，尚未接入实时定位。',
    category: '公共区域'
  },
  {
    key: 'dining',
    label: '餐厅',
    color: '#ffb627',
    components: ['适老化餐桌', '扶手座椅', '餐具储存柜', '示意餐具'],
    effects: ['扶手座椅与餐桌', '用餐人物示意', '选中描边与双击聚焦'],
    desc: '膳食服务、餐具消毒与营养管理的餐饮场景。',
    category: '餐饮'
  },
  {
    key: 'nursing',
    label: '护理站',
    color: '#4fb8d9',
    components: ['护理接待台', '药品收纳柜', '护理档案柜', '工作显示器'],
    effects: ['护理接待台与档案柜', '护理员与轮椅人物', '左侧指标为全楼业务数据'],
    desc: '全楼层护理调度、健康监测与告警管理的核心枢纽。',
    category: '护理'
  },
  {
    key: 'rehab',
    label: '康复室',
    color: '#6dd97a',
    components: ['康复平行杠', '训练阶梯', '训练垫', '康复器具柜'],
    effects: ['平行杠与训练阶梯', '康复活动示意', '可暂停动作与查看骨架'],
    desc: '康复训练计划、器材使用与进度跟踪的场景。',
    category: '康复'
  }
]

const allMenus = [
  { path: '/overview', title: '园区总览', perm: 'dashboard' },
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

/**
 * 住户姓名 → 真实房间号。
 * resident_health 表没有 room_no（只有 resident_id/name），而住户档案里房间号才是权威，
 * 这里按姓名建立映射，取代原先写死的「101室」。
 */
const roomByName = computed(() => {
  const map = new Map()
  for (const r of residents.value) {
    if (r.name) map.set(r.name, r.room_no)
  }
  return map
})
const roomOf = (residentName) => {
  const room = roomByName.value.get(residentName)
  return room ? `${room}室` : '—'
}

/**
 * 每位住户只取最新一条健康记录。
 *
 * resident_health 里每人有 7 天以上的历史记录，直接拿列表渲染会让同一个人
 * 在三维场景里出现多个节点（「监测住户」也会虚高成几十）。这里按住户去重取最新。
 */
const latestHealthRows = computed(() => {
  const byResident = new Map()
  for (const row of healthRows.value) {
    const key = row.resident_name || `#${row.resident_id}`
    const prev = byResident.get(key)
    if (!prev || String(row.measured_at || '') > String(prev.measured_at || '')) {
      byResident.set(key, row)
    }
  }
  return [...byResident.values()]
})

/**
 * 从园区总览下钻到某个房间时，场景里只保留该房间住户的健康记录。
 * 空房保留空态，不能用其他房间住户填补，避免虚构入住信息。
 */
const scopedHealthRows = computed(() => {
  const base = latestHealthRows.value
  if (!activeRoom.value) return base
  const names = new Set(
    residents.value.filter((r) => r.room_no === activeRoom.value).map((r) => r.name)
  )
  return base.filter((r) => String(r.room_no || '') === activeRoom.value || (!r.room_no && names.has(r.resident_name)))
})

const themePayload = computed(() => {
  if (modelTheme.value === 'corridor' || modelTheme.value === 'dining' || modelTheme.value === 'nursing' || modelTheme.value === 'rehab') {
    // 设备档案尚无公共区域空间关联，不能将全楼设备冒充当前场景设施。
    return { nodes: [] }
  }
  return {
    roomNo: activeRoom.value,
    nodes: scopedHealthRows.value.map((r) => ({
      id: `resident-${r.id || r.resident_id}`,
      bedNo: r.bed_no,
      name: r.resident_name,
      value: r.heart_rate ?? '—',
      unit: 'bpm',
      district: roomOf(r.resident_name),
      status: r.status === 'normal' ? 'normal' : r.status === 'attention' ? 'warning' : r.status === 'critical' ? 'critical' : 'unknown',
      remark: `${r.resident_name} 心率${r.heart_rate} 呼吸${r.breathing_rate || '--'} SpO2 ${r.spo2 || '--'}% ${r.fall_status === 'detected' ? '·跌倒告警' : ''}`
    }))
  }
})

const summary = computed(() => {
  if (modelTheme.value === 'room') {
    const nodes = themePayload.value.nodes || []
    const average = (key) => {
      const values = scopedHealthRows.value.map(r => r[key]).filter(v => v != null && Number.isFinite(Number(v)))
      return values.length ? Math.round(values.reduce((sum, v) => sum + Number(v), 0) / values.length * 10) / 10 : '—'
    }
    const avgHR = average('heart_rate')
    const fallCount = scopedHealthRows.value.filter(r => r.fall_status === 'detected').length
    const avgSpO2 = average('spo2')
    return [
      { label: '监测住户', value: nodes.length },
      { label: '平均心率', value: avgHR },
      { label: '平均血氧', value: avgSpO2 },
      { label: '跌倒事件', value: fallCount }
    ]
  }
  if (['corridor', 'dining', 'rehab'].includes(modelTheme.value)) {
    return [
      { label: '空间模型', value: '示意' },
      { label: '人物动作', value: '演示' },
      { label: '区域设备关联', value: '待接入' },
      { label: '实时定位', value: '未接入' }
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
  return { normal: '正常', warning: '预警', critical: '紧急', attention: '关注', unknown: '暂无数据', demo: '示意模型' }[s] || s || '暂无数据'
}

function effectLabel() { return '轮廓选中 · 双击聚焦' }

function switchTheme(key) {
  modelTheme.value = key
  if (key !== 'room') activeRoom.value = ''
  selected.value = null
  roomRef.value?.clearSelect?.()
  router.replace({ query: { theme: key, ...(activeRoom.value ? { room: activeRoom.value } : {}) } })
}

watch(() => [route.query.theme, route.query.room], ([theme, room]) => {
  if (themes.some(t => t.key === theme)) modelTheme.value = theme
  activeRoom.value = modelTheme.value === 'room' && /^\d{3}$/.test(String(room || '')) ? String(room) : ''
  selected.value = null
})

function onSelect(item) { selected.value = item }

function closeDetail() {
  selected.value = null
  roomRef.value?.clearSelect?.()
}

function onWebglFailed() {
  webglFailed.value = true
}

/** 触控设备虚拟控制条：等价于桌面的方向键 / QE 键 */
function viewCtrl(kind, direction = 1) {
  const api = roomRef.value
  if (!api) return
  if (kind === 'rotate') api.rotateBy?.(direction)
  else if (kind === 'pitch') api.pitchBy?.(direction)
  else if (kind === 'zoom') api.zoomBy?.(direction)
  else if (kind === 'reset') api.resetView?.()
}

async function goPage(path) {
  if (!path) return
  try { roomRef.value?.destroy?.() } catch { /* ignore */ }
  await nextTick()
  router.push(path).catch(() => {})
}

function logout() {
  try { roomRef.value?.destroy?.() } catch { /* ignore */ }
  userStore.logout()
  router.push('/login')
}

async function simulateIoT() {
  if (simLoading.value) return
  simLoading.value = true
  try {
    await iotSimulate()
    const [hlLatest, evRows, dash] = await Promise.all([
      getResidentsLatest(),
      getTableData('room_environment', { page: 1, pageSize: 30 }),
      iotDashboard()
    ])
    healthRows.value = hlLatest.data || []
    envRows.value = evRows.data.list || []
    iotData.value = dash.data
  } catch { /* ignore */ }
  finally { simLoading.value = false }
}

onMounted(async () => {
  await themeStore.load()
  // 支持从园区总览下钻：/dashboard?theme=room&room=101
  const validThemes = themes.map((t) => t.key)
  const qTheme = String(route.query.theme || '')
  const qRoom = String(route.query.room || '')
  modelTheme.value = validThemes.includes(qTheme)
    ? qTheme
    : themeStore.settings.modelTheme || 'room'
  activeRoom.value = modelTheme.value === 'room' && /^\d{3}$/.test(qRoom) ? qRoom : ''
  timer = setInterval(() => {
    now.value = dayjs().format('YYYY-MM-DD HH:mm:ss')
  }, 1000)
  // IoT数据每10秒自动刷新
  dataTimer = setInterval(async () => {
    try {
      const [hlLatest, alRows, evRows, dash] = await Promise.all([
        getResidentsLatest(),
        getTableData('alarms', { page: 1, pageSize: 30 }),
        getTableData('room_environment', { page: 1, pageSize: 30 }),
        iotDashboard()
      ])
      healthRows.value = hlLatest.data || []
      alarmRows.value = alRows.data.list || []
      envRows.value = evRows.data.list || []
      iotData.value = dash.data
    } catch { /* ignore */ }
  }, 10000)
  try {
    // 健康数据用「每位住户最新一条」的专用接口，而不是流水表分页 ——
    // 流水表按分页取会覆盖不全住户，导致场景里少人、KPI 失真
    const [ov, resRows, hlLatest, alRows, evRows, devRows, dash] = await Promise.all([
      getOverview(),
      getTableData('residents', { page: 1, pageSize: 50 }),
      getResidentsLatest(),
      getTableData('alarms', { page: 1, pageSize: 30 }),
      getTableData('room_environment', { page: 1, pageSize: 30 }),
      getTableData('devices', { page: 1, pageSize: 40 }),
      iotDashboard()
    ])
    overview.value = ov.data
    residents.value = resRows.data.list || []
    healthRows.value = hlLatest.data || []
    alarmRows.value = alRows.data.list || []
    envRows.value = evRows.data.list || []
    deviceRows.value = devRows.data.list || []
    iotData.value = dash.data
  } catch { /* empty */ }
})

onBeforeUnmount(() => {
  clearInterval(timer)
  clearInterval(dataTimer)
  try { roomRef.value?.destroy?.() } catch { /* ignore */ }
})
</script>

<style scoped lang="scss">
.twin-page {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100vh;
  height: 100dvh; /* 规避移动端地址栏收放导致的视口跳动 */
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

/* 3D 舞台：桌面铺满视口，窄屏退化为文档流中的固定高度区 */
.stage {
  position: absolute;
  inset: 0;
  z-index: 0;
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
  /* 从总览下钻时标出当前房号 */
  .room-tag {
    color: var(--sc-accent);
    font-weight: 600;
    letter-spacing: 1px;
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

.iot-mini {
  margin: 8px 0 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.iot-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 4px 8px;
  background: rgba(255, 140, 66, 0.06);
  border: 1px solid rgba(255, 140, 66, 0.12);
  span { color: var(--sc-muted); }
  b { color: var(--sc-accent); }
  b.alert { color: #ff4f7a; }
}
.iot-sim-btn {
  width: 100%;
  margin-top: 8px;
  padding: 8px;
  background: rgba(255, 140, 66, 0.15);
  border: 1px solid rgba(255, 140, 66, 0.3);
  color: var(--sc-primary);
  cursor: pointer;
  font-size: 12px;
  letter-spacing: 1px;
  &:hover { background: rgba(255, 140, 66, 0.25); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
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

/* 抽屉/底部面板的抓取条，仅在面板形态下显示 */
.sheet-handle {
  display: none;
}

@keyframes sheetUp {
  from { transform: translateY(100%); opacity: 0.6; }
  to { transform: translateY(0); opacity: 1; }
}

/* 触摸端虚拟控制条：键盘方向键/QE 的移动端等价入口 */
.stage-tools {
  position: absolute;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--sc-border);
  background: rgba(20, 15, 25, 0.74);
  backdrop-filter: blur(8px);

  button {
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 140, 66, 0.28);
    border-radius: 6px;
    background: rgba(40, 30, 50, 0.6);
    color: var(--sc-primary);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease-standard);

    &:hover,
    &:active {
      background: rgba(255, 140, 66, 0.24);
    }
  }

  .split {
    width: 1px;
    height: 22px;
    background: rgba(255, 140, 66, 0.25);
  }
}

/* ============================================================
   响应式：< 1100px 由「绝对定位叠加」改为「文档流纵向堆叠」
   ≥ 1100px 的桌面大屏观感完全不变
   ============================================================ */
@include below-narrow-desktop {
  .twin-page {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
  }

  .hud {
    position: static;
    pointer-events: auto;
  }

  /* 顶部：品牌 / 场景 / 导航 收成纵向三行 */
  .top {
    order: 1;
    position: static;
    z-index: 30;
    grid-template-columns: 1fr;
    gap: 8px;
    padding: 10px 12px;
    background: rgba(20, 15, 25, 0.94);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--sc-border);
  }

  .theme-switch,
  .nav {
    flex-wrap: nowrap;
    overflow-x: auto;
    justify-content: flex-start;
    scrollbar-width: none;
    overscroll-behavior-x: contain;

    &::-webkit-scrollbar {
      display: none;
    }

    button {
      flex-shrink: 0;
    }
  }

  .nav .link {
    display: inline-flex;
    align-items: center;
    min-height: 36px;
  }

  /* 3D 舞台：固定高度区，数据面板下沉到文档流 */
  .stage {
    order: 2;
    position: relative;
    inset: auto;
    height: 46dvh;
    min-height: 240px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--sc-border);
  }

  .side {
    order: 3;
    position: static;
    width: auto;
    max-height: none;
    overflow: visible;
    margin: 12px;
    backdrop-filter: none;
  }

  .bottom {
    order: 4;
    position: static;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px calc(64px + env(safe-area-inset-bottom));
    background: rgba(20, 15, 25, 0.6);
  }

  /* 模型详情改底部抽屉：点选后立刻可见，无需滚动寻找 */
  .detail {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    width: auto;
    max-height: 66dvh;
    overflow-y: auto;
    border-radius: 12px 12px 0 0;
    z-index: 45;
    padding-bottom: calc(14px + env(safe-area-inset-bottom));
    animation: sheetUp 0.24s var(--ease-standard);
  }

  .detail .sheet-handle,
  .ai-panel .sheet-handle {
    display: block;
    width: 36px;
    height: 4px;
    margin: -6px auto 8px;
    border-radius: 2px;
    background: rgba(255, 140, 66, 0.45);
  }

  /* AI 面板与入口改为固定定位，避免随内容滚走 */
  .ai-panel {
    position: fixed;
    right: 16px;
    bottom: calc(84px + env(safe-area-inset-bottom));
    max-height: 60dvh;
    z-index: 55;
  }

  .ai-fab {
    position: fixed;
    right: 16px;
    bottom: calc(20px + env(safe-area-inset-bottom));
    z-index: 60;
  }
}

@include tablet {
  /* 平板空间较充裕：顶栏吸顶，方便随时切场景/跳页 */
  .top {
    position: sticky;
    top: 0;
  }
}

@include mobile {
  .brand {
    .mark {
      width: 30px;
      height: 30px;
    }

    h1 {
      font-size: 15px;
      letter-spacing: 1px;
    }

    p {
      display: none; /* 窄屏让位给场景与导航 */
    }
  }

  .theme-switch button {
    min-height: 36px;
    padding: 6px 10px;
  }

  .stage {
    height: 44dvh;
    min-height: 220px;
  }

  .kpis {
    grid-template-columns: 1fr 1fr;
  }

  .detail {
    max-height: 72dvh;
  }

  /* AI 面板铺满底部，输入区留出安全区 */
  .ai-panel {
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    max-height: 76dvh;
    border-radius: 12px 12px 0 0;
    z-index: 55;
  }

  .ai-input-row {
    padding-bottom: calc(10px + env(safe-area-inset-bottom));

    button {
      min-width: 64px;
    }
  }
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
