<template>
  <div class="overview">
    <!-- 三维沙盘。has-detail：右侧详情面板打开时，通知舞台把工具栏可用宽度收窄 -->
    <div class="stage" :class="{ 'has-detail': !!activeDetail }">
      <Campus3D
        ref="campusRef"
        :nodes="flatNodes"
        :bounds="bounds"
        :room-states="roomByNo"
        :selected="selectedRoom"
        :selected-zone="selectedZone"
        :panel-inset="isMobile ? 0 : 0.11"
        @select="onSelectRoom"
        @select-zone="onSelectZone"
      />
    </div>

    <!-- 左上：园区概览指标 -->
    <div class="hud hud-summary glass-panel">
      <div class="panel-title">园区总览</div>
      <div v-if="loading" class="loading">加载中…</div>
      <template v-else>
        <div class="kpis">
          <div class="kpi">
            <div class="v">{{ summary.totalRooms ?? '--' }}</div>
            <div class="l">房间</div>
          </div>
          <div class="kpi">
            <div class="v">{{ summary.occupied ?? '--' }}<small>/{{ summary.totalBeds ?? '--' }}</small></div>
            <div class="l">在住 / 床位</div>
          </div>
          <div class="kpi critical">
            <div class="v">{{ summary.critical ?? '--' }}</div>
            <div class="l">紧急</div>
          </div>
          <div class="kpi warning">
            <div class="v">{{ summary.pendingAlarms ?? '--' }}</div>
            <div class="l">待处理告警</div>
          </div>
        </div>

        <div class="floors">
          <button
            type="button"
            class="floor-row"
            v-for="f in summary.byFloor || []"
            :key="f.floor"
            :class="{ active: floorFilter === f.floor }"
            :aria-pressed="floorFilter === f.floor"
            @click="focusFloor(f.floor)"
          >
            <span class="fl">{{ f.floor }}F</span>
            <span class="fd">在住 {{ f.occupied }} 人 / {{ f.rooms }} 间</span>
            <span class="fb">
              <i class="dot critical" v-if="f.critical" :title="`紧急 ${f.critical} 间`">{{ f.critical }}</i>
              <i class="dot warning" v-if="f.warning" :title="`关注 ${f.warning} 间`">{{ f.warning }}</i>
              <i class="dot empty" v-if="!f.critical && !f.warning">正常</i>
            </span>
          </button>
        </div>

        <div class="watch" v-if="watchRooms.length">
          <div class="watch-title">重点关注（{{ watchRooms.length }}）</div>
          <button
            type="button"
            v-for="r in watchRooms"
            :key="r.roomNo"
            class="watch-row"
            @click="focusRoom(r.roomNo)"
          >
            <i :style="{ background: STATUS_COLOR[r.status] }"></i>
            <b>{{ r.roomNo }}</b>
            <span>{{ r.occupancy }}/{{ r.capacity }} 人 · {{ r.pendingAlarms ? `待处理 ${r.pendingAlarms}` : r.processingAlarms ? `处理中 ${r.processingAlarms}` : '需关注' }}</span>
          </button>
        </div>

        <div class="legend">
          <span v-for="(label, key) in STATUS_LABEL" :key="key">
            <i :style="{ background: STATUS_COLOR[key] }"></i>{{ label }}
          </span>
        </div>

        <p class="tip" v-if="!selectedRoom">点击房间或功能区查看详情 · 点击楼层可只看该层</p>
        <p class="note-line">房间颜色与人数为真实数据聚合；建筑外壳、场地与家具为示意建模。</p>
      </template>
    </div>

    <!-- 右侧：房间 / 功能区详情 -->
    <transition name="slide-left">
      <div v-if="activeDetail" class="hud hud-detail glass-panel" :class="activeDetail.tone">
        <div class="detail-head">
          <div>
            <h3>{{ activeDetail.title }}</h3>
            <div class="sub">{{ activeDetail.subtitle }}</div>
          </div>
          <button type="button" class="close" aria-label="关闭详情" @click="closeDetail">×</button>
        </div>

        <div class="badge" :style="{ borderColor: activeDetail.color, color: activeDetail.color }">
          {{ activeDetail.statusLabel }}
        </div>

        <div class="rows">
          <div v-for="row in activeDetail.rows" :key="row.label">
            <span>{{ row.label }}</span><b>{{ row.value }}</b>
          </div>
        </div>

        <ul class="people" v-if="activeDetail.people?.length">
          <li v-for="p in activeDetail.people" :key="p.id">
            <i :class="p.health_status"></i>
            <span class="nm">{{ p.name }}</span>
            <span class="meta">{{ p.bed_no }}床 · {{ p.care_level }} · 年龄{{ p.age }}</span>
          </li>
        </ul>

        <ul class="alarms" v-if="activeDetail.alarms?.length">
          <li v-for="a in activeDetail.alarms" :key="a.id">
            <span class="lv" :class="a.status">{{ a.level }}</span>
            {{ a.title }} · {{ a.status === 'pending' ? '待处理' : '处理中' }}
          </li>
        </ul>

        <button
          v-if="activeDetail.enterPath"
          type="button"
          class="enter"
          @click="enterRoom(activeDetail.enterPath)"
        >
          {{ activeDetail.enterLabel }}
        </button>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Campus3D from '@/components/Campus3D.vue'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useSpaceTree, STATUS_COLOR, STATUS_LABEL } from '@/composables/useSpaceTree'

const router = useRouter()
const { isMobile } = useBreakpoint()
const campusRef = ref(null)
const selectedRoom = ref('')
const selectedZone = ref('')

const { loading, flatNodes, roomNodes, zoneNodes, roomByNo, rooms, summary, bounds, load } = useSpaceTree()

/** 左侧楼层行与三维联动：点楼层 → 沙盘只显示该层并聚焦 */
const floorFilter = ref(0)
const watchRooms = computed(() =>
  rooms.value
    .filter((r) => r.status === 'critical' || r.status === 'warning')
    .sort((a, b) => (b.pendingAlarms - a.pendingAlarms) || a.roomNo.localeCompare(b.roomNo))
    .slice(0, 6)
)

function focusFloor(floor) {
  floorFilter.value = floorFilter.value === floor ? 0 : floor
  campusRef.value?.setFloor?.(floorFilter.value)
}

function focusRoom(roomNo) {
  if (!roomNo) return
  selectedRoom.value = roomNo
  selectedZone.value = ''
  campusRef.value?.focusRoom?.(roomNo)
}

/** 房间详情面板 */
const roomDetail = computed(() => {
  if (!selectedRoom.value) return null
  const state = roomByNo.value.get(selectedRoom.value)
  if (!state) return null
  const statusKey = state.status || 'empty'
  const occupied = state.occupancy > 0
  return {
    tone: statusKey,
    title: `${state.roomNo}室`,
    subtitle: `${state.floor}层 · ${ROOM_TYPE_LABEL[state.type] || state.type} · ${state.roomStatus === 'occupied' ? '已入住' : '空闲'}`,
    statusLabel: `${STATUS_LABEL[statusKey] || statusKey}${occupied ? ` · 在住 ${state.occupancy}/${state.capacity}` : ' · 无人居住'}`,
    color: STATUS_COLOR[statusKey],
    rows: [
      { label: '设备', value: `${state.deviceCount} 台${state.offlineDevices ? `（离线 ${state.offlineDevices}）` : ''}` },
      { label: '未闭环告警', value: `${state.pendingAlarms} 待处理 / ${state.processingAlarms} 处理中` }
    ],
    people: state.residents || [],
    alarms: state.alarms || [],
    enterLabel: '进入房间内部 →',
    // 复用现有「居室」主题渲染房间内部（Room3D 零改动），并把房号带过去
    enterPath: occupied ? `/dashboard?theme=room&room=${state.roomNo}` : ''
  }
})

/** 功能区详情 */
const zoneDetail = computed(() => {
  if (!selectedZone.value) return null
  const node = zoneNodes.value.find((n) => n.code === selectedZone.value)
  if (!node) return null
  const zoneType = node.meta?.zoneType || 'corridor'
  const meta = ZONE_META[zoneType] || ZONE_META.corridor
  return {
    tone: 'normal',
    title: node.name,
    subtitle: `${node.width} × ${node.depth} m`,
    statusLabel: meta.note,
    color: meta.color,
    rows: [
      { label: '类型', value: meta.label },
      { label: '楼层', value: String(Number(String(node.parent_code || '').match(/F(\d)/)?.[1] || '—')) }
    ],
    people: [],
    alarms: [],
    enterLabel: `查看${meta.label}场景 →`,
    enterPath: meta.theme ? `/dashboard?theme=${meta.theme}` : ''
  }
})

const activeDetail = computed(() => roomDetail.value || zoneDetail.value)

const ROOM_TYPE_LABEL = {
  standard: '标准间',
  premium: '高级间',
  suite: '套房',
  nursing: '护理型'
}

const ZONE_META = {
  corridor: { label: '走廊', color: '#4fb8d9', note: '通行净宽 2.4m（规范 ≥1.80m）', theme: '' },
  nursing: { label: '护理站', color: '#ff8c42', note: '本层护理调度与监护中枢', theme: 'nursing' },
  dining: { label: '餐厅', color: '#ffb627', note: '一层膳食服务区', theme: 'dining' },
  rehab: { label: '康复室', color: '#6dd97a', note: '一层康复训练区', theme: 'rehab' }
}

function onSelectRoom(code) {
  selectedRoom.value = code || ''
  if (code) selectedZone.value = ''
}

function onSelectZone(code) {
  selectedZone.value = code || ''
  if (code) selectedRoom.value = ''
}

function closeDetail() {
  selectedRoom.value = ''
  selectedZone.value = ''
}

function enterRoom(path) {
  if (!path) return
  campusRef.value?.destroy?.()
  router.push(path).catch(() => {})
}

onMounted(load)
</script>

<style scoped lang="scss">
.overview {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 520px;
  overflow: hidden;
}

.stage {
  position: absolute;
  inset: 0;
  z-index: 0;

  /* ⚠️ 这里曾经藏了一个层级 bug：
     .campus-tools 定位在本舞台左上角（top:12 left:12），但 .stage 的 z-index:0
     会创建独立层叠上下文，工具栏自己的 z-index:12 只在舞台内部生效；
     而左侧概览面板是舞台的兄弟节点（z-index:10），于是整块面板压在工具栏上，
     「全楼 / 1F / 2F / 3F / 显示房号」被埋住，楼层筛选完全点不到。
     修复方式：由宿主页面通过 CSS 变量把工具栏的起点让到面板右侧。 */
  --tools-left: 296px; /* 14(左留白) + 268(面板宽) + 14(间距) */
  --tools-max: calc(100% - 296px - 12px);

  /* 右侧详情面板打开时（14 + 300 + 14 = 328px），同步收窄工具栏可用宽度，
     否则平板宽度下工具栏右端会钻进详情面板底下 */
  &.has-detail {
    --tools-max: calc(100% - 296px - 328px - 12px);
  }
}

.hud {
  position: absolute;
  z-index: 10;
}

.hud-summary {
  top: 14px;
  left: 14px;
  width: 268px;
  max-height: calc(100% - 28px);
  overflow-y: auto;
  padding: 14px;
}

.loading {
  padding: 16px 0;
  color: var(--sc-muted);
  font-size: 13px;
  text-align: center;
}

.kpis {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 10px 0 12px;
}

.kpi {
  padding: 9px 6px;
  text-align: center;
  border: 1px solid rgba(255, 140, 66, 0.18);
  background: rgba(40, 30, 50, 0.3);

  .v {
    font-size: 20px;
    font-weight: 700;
    color: var(--sc-accent);
    font-variant-numeric: tabular-nums;

    small {
      font-size: 12px;
      color: var(--sc-muted);
    }
  }

  .l {
    margin-top: 3px;
    font-size: 11px;
    color: var(--sc-muted);
  }

  &.critical .v {
    color: #ff4f7a;
  }

  &.warning .v {
    color: #ffaa00;
  }
}

.floors {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.floor-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  font-size: 12px;
  padding: 6px 8px;
  border: 1px solid rgba(255, 140, 66, 0.12);
  background: rgba(255, 140, 66, 0.05);
  color: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    border-color: rgba(255, 140, 66, 0.45);
  }

  &.active {
    background: rgba(255, 140, 66, 0.2);
    border-color: var(--sc-primary);
  }

  .fl {
    color: var(--sc-primary);
    font-weight: 600;
    width: 26px;
  }

  .fd {
    flex: 1;
    color: var(--sc-muted);
  }

  .fb {
    display: flex;
    gap: 4px;
  }

  .dot {
    font-style: normal;
    font-size: 11px;
    line-height: 1;
    padding: 2px 6px;
    border-radius: 2px;

    &.critical {
      background: rgba(255, 79, 122, 0.2);
      color: #ff4f7a;
    }

    &.warning {
      background: rgba(255, 170, 0, 0.18);
      color: #ffaa00;
    }

    &.empty {
      background: rgba(66, 217, 122, 0.16);
      color: #42d97a;
    }
  }
}

.watch {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.watch-title {
  font-size: 12px;
  color: var(--sc-primary);
  letter-spacing: 1px;
}

.watch-row {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 5px 7px;
  border: 1px solid rgba(255, 140, 66, 0.14);
  background: rgba(40, 30, 50, 0.3);
  color: var(--sc-muted);
  font-size: 11px;
  text-align: left;
  cursor: pointer;

  &:hover {
    border-color: var(--sc-primary);
    background: rgba(255, 140, 66, 0.12);
  }

  i {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  b {
    color: var(--sc-text);
    font-weight: 600;
  }

  span {
    margin-left: auto;
    text-align: right;
  }
}

.note-line {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--sc-muted);
  text-align: center;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--sc-border);
  font-size: 11px;
  color: var(--sc-muted);

  span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  i {
    width: 9px;
    height: 9px;
    border-radius: 2px;
  }
}

.tip {
  margin: 10px 0 0;
  font-size: 11px;
  color: var(--sc-muted);
  text-align: center;
}

/* 右侧详情 */
.hud-detail {
  top: 14px;
  right: 14px;
  width: 300px;
  max-height: calc(100% - 28px);
  overflow-y: auto;
  padding: 14px;
  border-color: rgba(255, 140, 66, 0.45);

  &.critical {
    border-color: rgba(255, 79, 122, 0.6);
  }

  &.warning {
    border-color: rgba(255, 170, 0, 0.55);
  }
}

.detail-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;

  h3 {
    margin: 0;
    font-size: 17px;
    color: var(--sc-primary);
    letter-spacing: 1px;
  }

  .sub {
    margin-top: 4px;
    font-size: 12px;
    color: var(--sc-muted);
  }
}

.close {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: 1px solid var(--sc-border);
  background: transparent;
  color: var(--sc-muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    color: var(--sc-primary);
    border-color: var(--sc-primary);
  }
}

.badge {
  display: inline-block;
  margin: 12px 0;
  padding: 4px 10px;
  border: 1px solid;
  font-size: 12px;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;

  div {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }

  span {
    color: var(--sc-muted);
    flex-shrink: 0;
  }

  b {
    color: var(--sc-text);
    font-weight: 500;
    text-align: right;
  }
}

.people,
.alarms {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 12px;
}

.people li {
  display: flex;
  align-items: center;
  gap: 8px;

  i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;

    &.stable {
      background: #42d97a;
    }

    &.attention {
      background: #ffaa00;
    }

    &.critical {
      background: #ff4f7a;
    }
  }

  .nm {
    color: var(--sc-text);
  }

  .meta {
    color: var(--sc-muted);
    margin-left: auto;
    text-align: right;
  }
}

.alarms li {
  color: var(--sc-muted);
  line-height: 1.5;

  .lv {
    display: inline-block;
    min-width: 26px;
    margin-right: 6px;
    padding: 1px 5px;
    text-align: center;
    font-size: 11px;
    background: rgba(255, 140, 66, 0.15);
    color: var(--sc-primary);

    &.pending {
      background: rgba(255, 79, 122, 0.2);
      color: #ff4f7a;
    }
  }
}

.enter {
  width: 100%;
  margin-top: 14px;
  padding: 10px;
  border: 1px solid var(--sc-primary);
  background: rgba(255, 140, 66, 0.16);
  color: var(--sc-primary);
  font-size: 13px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-standard);

  &:hover {
    background: rgba(255, 140, 66, 0.3);
  }
}

.slide-left-enter-active,
.slide-left-leave-active {
  transition: all 0.24s ease;
}

.slide-left-enter-from,
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(24px);
}

@include below-narrow-desktop {
  .hud-summary {
    width: min(268px, calc(100% - 28px));
  }

  .hud-detail {
    width: min(300px, calc(100% - 28px));
  }
}

@include mobile {
  /* 窄屏：三维铺满上半屏，指标与详情下沉为底部抽屉，避免遮挡场景 */
  .overview {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
  }

  .stage {
    position: relative;
    inset: auto;
    flex: 0 0 auto;
    height: 52dvh;
    min-height: 260px;

    /* 窄屏面板已下沉到文档流，舞台是全宽的，工具栏回到贴左 */
    --tools-left: 12px;
    --tools-max: calc(100% - 24px);
  }

  .hud {
    position: static;
  }

  .hud-summary {
    order: 2;
    width: auto;
    margin: 12px;
    max-height: none;
    overflow: visible;
  }

  .hud-detail {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    width: auto;
    max-height: 62dvh;
    z-index: 45;
    border-radius: 12px 12px 0 0;
    padding-bottom: calc(14px + env(safe-area-inset-bottom));
  }
}
</style>
