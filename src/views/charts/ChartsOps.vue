<template>
  <div class="charts page-scroll">
    <div class="toolbar glass-panel">
      <div class="toolbar-left">
        <span class="panel-title">健康监测 · IoT实时数据</span>
        <span class="status-dot" :class="{ live: liveUpdate }"></span>
        <span class="status-text">{{ liveUpdate ? '实时同步' : '已暂停' }}</span>
      </div>
      <div class="toolbar-right">
        <button @click="toggleLive" :class="{ active: liveUpdate }">{{ liveUpdate ? '暂停' : '开启' }}实时</button>
        <button @click="simulate" :disabled="simLoading">{{ simLoading ? '推送中...' : '模拟IoT上报' }}</button>
        <button @click="refresh" :disabled="loading">{{ loading ? '刷新中...' : '刷新数据' }}</button>
      </div>
    </div>
    <div class="kpi-row glass-panel">
      <div class="kpi-card" v-for="k in kpiData" :key="k.label">
        <div class="kpi-icon" :style="{ color: k.color }">{{ k.icon }}</div>
        <div class="kpi-value" :style="{ color: k.color }">{{ k.value }}</div>
        <div class="kpi-label">{{ k.label }}</div>
      </div>
    </div>
    <div class="grid">
      <div class="card glass-panel" v-for="c in cards" :key="c.title">
        <div class="panel-title">{{ c.title }}</div>
        <div class="chart"><ChartPanel :option="c.option" /></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import ChartPanel from '@/components/ChartPanel.vue'
import { iotDashboard, iotHealthLatest, iotSimulate } from '@/api'
import { useBreakpoint } from '@/composables/useBreakpoint'

const { isMobile } = useBreakpoint()

const loading = ref(false)
const simLoading = ref(false)
const liveUpdate = ref(true)
const dashData = ref(null)
const healthLatest = ref([])
let timer

/** 按断点产出坐标轴样式与栅格：窄屏压缩留白、缩小字号、标签抽稀防重叠 */
function chartMetrics(mobile) {
  return {
    axis: {
      axisLine: { lineStyle: { color: 'rgba(255,140,66,0.3)' } },
      axisLabel: { color: '#d4a878', fontSize: mobile ? 9 : 12, hideOverlap: true },
      splitLine: { lineStyle: { color: 'rgba(255,140,66,0.08)' } }
    },
    baseGrid: mobile
      ? { left: 2, right: 8, top: 26, bottom: 2, containLabel: true }
      : { left: 45, right: 16, top: 30, bottom: 28 },
    labelRotate: mobile ? 40 : 20
  }
}

const kpiData = computed(() => {
  const d = dashData.value
  if (!d) return [
    { label: '监测住户', value: '--', icon: '♥', color: '#ff8c42' },
    { label: '跌倒事件', value: '--', icon: '!', color: '#ff4f7a' },
    { label: '健康预警', value: '--', icon: '⚠', color: '#ffaa00' },
    { label: '监测房间', value: '--', icon: '▣', color: '#42d9b8' }
  ]
  return [
    { label: '监测住户', value: d.healthLatest?.length || 0, icon: '♥', color: '#ff8c42' },
    { label: '跌倒事件(7天)', value: d.fallCount || 0, icon: '!', color: '#ff4f7a' },
    { label: '健康预警(7天)', value: d.alertCount || 0, icon: '⚠', color: '#ffaa00' },
    { label: '监测房间', value: d.envLatest?.length || 0, icon: '▣', color: '#42d9b8' }
  ]
})

const cards = computed(() => {
  const mobile = isMobile.value
  const { axis, baseGrid, labelRotate } = chartMetrics(mobile)
  const d = dashData.value
  const healthRows = healthLatest.value.length ? healthLatest.value : (d?.healthLatest || [])

  const residents = healthRows.slice(0, 10)
  const hrData = residents.map((r) => r.heart_rate || 0)
  const brData = residents.map((r) => r.breathing_rate || 0)
  const spo2Data = residents.map((r) => r.spo2 || 0)
  const tempData = residents.map((r) => r.temperature || 0)
  const sysData = residents.map((r, i) => [r.resident_name || `住户${i+1}`, r.systolic || 0, r.diastolic || 0])
  const nameLabels = residents.map((r, i) => r.resident_name || `住户${i+1}`)

  const fallCount = healthRows.filter((r) => r.fall_status === 'detected').length
  const normalCount = healthRows.filter((r) => r.status === 'normal').length
  const attentionCount = healthRows.filter((r) => r.status === 'attention').length
  const criticalCount = healthRows.filter((r) => r.status === 'critical').length

  const envRows = d?.envLatest || []
  const envRooms = envRows.map((r) => r.room_no || '')
  const pm25Data = envRows.map((r) => r.pm25 || 0)
  const pm10Data = envRows.map((r) => r.pm10 || 0)
  const illumData = envRows.map((r) => r.illumination || 0)

  const trendRows = d?.healthTrend || []

  const outdoor = d?.outdoorLatest
  const soilRows = d?.soilLatest || []

  return [
    {
      title: '心率趋势 · 住户实时心率',
      option: {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', formatter: '{b}<br/>心率: {c} bpm' },
        grid: { ...baseGrid, top: 30 },
        xAxis: { type: 'category', data: nameLabels, ...axis, axisLabel: { ...axis.axisLabel, rotate: labelRotate } },
        yAxis: { type: 'value', min: 40, max: 120, ...axis },
        series: [{
          name: '心率', type: 'line', data: hrData, smooth: true,
          lineStyle: { color: '#ff4f7a', width: 2 },
          itemStyle: { color: '#ff4f7a' },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [
            { offset: 0, color: 'rgba(255,79,122,0.35)' }, { offset: 1, color: 'rgba(255,79,122,0.02)' }
          ]}},
          markLine: { silent: true, data: [
            { yAxis: 60, lineStyle: { color: '#42d97a' }, label: { formatter: '正常下限' }},
            { yAxis: 100, lineStyle: { color: '#ffaa00' }, label: { formatter: '正常上限' }}
          ]}
        }]
      }
    },
    {
      title: '呼吸频率 · 住户呼吸监测',
      option: {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        grid: { ...baseGrid, top: 30 },
        xAxis: { type: 'category', data: nameLabels, ...axis, axisLabel: { ...axis.axisLabel, rotate: labelRotate } },
        yAxis: { type: 'value', min: 8, max: 30, ...axis },
        series: [{
          name: '呼吸率', type: 'bar', data: brData,
          itemStyle: { color: (p) => brData[p.dataIndex] > 20 || brData[p.dataIndex] < 12 ? '#ff4f7a' : '#42d9b8' },
          barWidth: '40%',
          markLine: { silent: true, data: [
            { yAxis: 12, lineStyle: { color: '#42d97a' } },
            { yAxis: 20, lineStyle: { color: '#ffaa00' } }
          ]}
        }]
      }
    },
    {
      title: '血氧饱和度 · SpO2仪表',
      option: {
        backgroundColor: 'transparent',
        tooltip: { formatter: '{b}: {c}%' },
        series: [{
          name: 'SpO2', type: 'gauge', min: 80, max: 100, splitNumber: 4,
          radius: '85%', center: ['50%', '55%'],
          axisLine: { lineStyle: { width: 12, color: [
            [0.85, '#ff4f7a'], [0.92, '#ffaa00'], [1, '#42d97a']
          ]}},
          pointer: { width: 4, length: '60%' },
          axisTick: { length: 8, lineStyle: { color: '#d4a878' } },
          splitLine: { length: 12, lineStyle: { color: '#d4a878' } },
          axisLabel: { color: '#d4a878', fontSize: 9, distance: 4 },
          detail: { formatter: '{value}%', color: '#ff8c42', fontSize: 16, offsetCenter: [0, '65%'] },
          data: [{ value: spo2Data.length ? Math.min(...spo2Data) : 0, name: '最低SpO2' }]
        }]
      }
    },
    {
      title: '血压分布 · 收缩压/舒张压',
      option: {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        legend: { textStyle: { color: '#d4a878' }, top: 0 },
        grid: { ...baseGrid, top: 36 },
        xAxis: { type: 'category', data: nameLabels, ...axis, axisLabel: { ...axis.axisLabel, rotate: labelRotate } },
        yAxis: { type: 'value', min: 50, max: 180, ...axis },
        series: [
          { name: '收缩压', type: 'bar', data: residents.map((r) => r.systolic || 0), itemStyle: { color: '#ff8c42' }, barWidth: '30%' },
          { name: '舒张压', type: 'bar', data: residents.map((r) => r.diastolic || 0), itemStyle: { color: '#ffb627' }, barWidth: '30%' }
        ]
      }
    },
    {
      title: '体温监测 · 住户体温分布',
      option: {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        grid: { ...baseGrid, top: 30 },
        xAxis: { type: 'category', data: nameLabels, ...axis, axisLabel: { ...axis.axisLabel, rotate: labelRotate } },
        yAxis: { type: 'value', min: 35, max: 39, ...axis },
        series: [{
          name: '体温', type: 'line', data: tempData, smooth: true,
          lineStyle: { color: '#ff8c42', width: 2 },
          itemStyle: { color: (p) => tempData[p.dataIndex] > 37.5 ? '#ff4f7a' : '#ff8c42' },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [
            { offset: 0, color: 'rgba(255,140,66,0.3)' }, { offset: 1, color: 'rgba(255,140,66,0.02)' }
          ]}},
          markLine: { silent: true, data: [
            { yAxis: 37.3, lineStyle: { color: '#42d97a' }, label: { formatter: '正常' }},
            { yAxis: 37.8, lineStyle: { color: '#ff4f7a' }, label: { formatter: '发热' }}
          ]}
        }]
      }
    },
    {
      title: '健康状态分布 · 监测等级统计',
      option: {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item' },
        legend: { textStyle: { color: '#d4a878' }, bottom: 0 },
        series: [{
          type: 'pie', radius: ['35%', '65%'], center: ['50%', '45%'],
          label: { color: '#e8d4c8', formatter: '{b}: {c}人' },
          data: [
            { name: '正常', value: normalCount, itemStyle: { color: '#42d97a' }},
            { name: '关注', value: attentionCount, itemStyle: { color: '#ffaa00' }},
            { name: '紧急', value: criticalCount, itemStyle: { color: '#ff4f7a' }},
            { name: '跌倒', value: fallCount, itemStyle: { color: '#ff6b6b' }}
          ]
        }]
      }
    },
    {
      title: '室内环境 · PM2.5 / PM10对比',
      option: {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        legend: { textStyle: { color: '#d4a878' }, top: 0 },
        grid: { ...baseGrid, top: 36 },
        xAxis: { type: 'category', data: envRooms, ...axis, axisLabel: { ...axis.axisLabel, rotate: labelRotate } },
        yAxis: { type: 'value', ...axis },
        series: [
          { name: 'PM2.5', type: 'bar', data: pm25Data, itemStyle: { color: '#ff8c42' }, barWidth: '30%' },
          { name: 'PM10', type: 'bar', data: pm10Data, itemStyle: { color: '#ffb627' }, barWidth: '30%' }
        ]
      }
    },
    {
      title: '室内光照度 · 各房间照度',
      option: {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        grid: { ...baseGrid, top: 30 },
        xAxis: { type: 'category', data: envRooms, ...axis, axisLabel: { ...axis.axisLabel, rotate: labelRotate } },
        yAxis: { type: 'value', ...axis },
        series: [{
          name: '光照度', type: 'pictorialBar',
          symbol: 'path://M0,10 L10,10 C5.5,10 5.5,5 5,5 C4.5,5 4.5,10 0,10 z',
          data: illumData, itemStyle: { color: '#ffb627' }, barCategoryGap: '40%'
        }]
      }
    },
    {
      title: 'PIR人体感应 · 活动检测',
      option: {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        legend: { textStyle: { color: '#d4a878' }, top: 0 },
        grid: { ...baseGrid, top: 36 },
        xAxis: { type: 'category', data: nameLabels, ...axis, axisLabel: { ...axis.axisLabel, rotate: labelRotate } },
        yAxis: { type: 'value', max: 1, ...axis, axisLabel: { ...axis.axisLabel, formatter: (v) => v ? '有人' : '无人' } },
        series: [{
          name: '人体感应', type: 'bar', data: residents.map((r) => r.pir_status || 0),
          itemStyle: { color: (p) => p.value ? '#42d9b8' : 'rgba(100,100,100,0.3)' },
          barWidth: '50%'
        }]
      }
    },
    {
      title: '跌倒检测 · 事件时间线',
      option: {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        grid: { ...baseGrid, top: 30 },
        xAxis: { type: 'category', data: nameLabels, ...axis, axisLabel: { ...axis.axisLabel, rotate: labelRotate } },
        yAxis: { type: 'value', max: 1, ...axis, axisLabel: { ...axis.axisLabel, formatter: (v) => v ? '跌倒' : '正常' } },
        series: [{
          name: '跌倒事件', type: 'scatter',
          data: residents.map((r, i) => [i, r.fall_status === 'detected' ? 1 : 0]),
          symbolSize: (val) => val[1] ? 18 : 8,
          itemStyle: { color: (p) => p.data[1] ? '#ff4f7a' : '#42d97a' }
        }]
      }
    },
    {
      title: '室外气象 · 实时环境',
      option: outdoor ? {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item' },
        series: [{
          type: 'gauge', min: -20, max: 50, splitNumber: 7,
          radius: '85%', center: ['50%', '55%'],
          axisLine: { lineStyle: { width: 10, color: [
            [0.43, '#4fb8d9'], [0.57, '#42d97a'], [0.71, '#ffb627'], [1, '#ff4f7a']
          ]}},
          pointer: { width: 4, length: '55%' },
          detail: { formatter: '{value}°C', color: '#ff8c42', fontSize: 14, offsetCenter: [0, '65%'] },
          data: [{ value: outdoor.temperature || 0, name: '室外温度' }]
        }]
      } : { backgroundColor: 'transparent', title: { text: '暂无室外气象数据', textStyle: { color: '#d4a878' }, left: 'center', top: 'center' } }
    },
    {
      title: '健康趋势 · 7天平均指标',
      option: {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        legend: { textStyle: { color: '#d4a878' }, top: 0 },
        grid: { ...baseGrid, top: 36, right: mobile ? 16 : 30 },
        xAxis: { type: 'category', data: trendRows.map((r) => r.resident_name), ...axis, axisLabel: { ...axis.axisLabel, rotate: labelRotate } },
        yAxis: [
          { type: 'value', name: '心率/呼吸', ...axis },
          { type: 'value', name: 'SpO2/体温', min: 30, max: 100, ...axis, axisLabel: { ...axis.axisLabel, color: '#d4a878' } }
        ],
        series: [
          { name: '平均心率', type: 'line', data: trendRows.map((r) => Math.round(r.avg_hr || 0)), itemStyle: { color: '#ff4f7a' } },
          { name: '平均呼吸', type: 'line', data: trendRows.map((r) => Math.round(r.avg_br || 0)), itemStyle: { color: '#42d9b8' } },
          { name: '平均血氧', type: 'line', yAxisIndex: 1, data: trendRows.map((r) => +(r.avg_spo2 || 0).toFixed(1)), itemStyle: { color: '#ff8c42' } },
          { name: '平均体温', type: 'line', yAxisIndex: 1, data: trendRows.map((r) => +(r.avg_temp || 0).toFixed(1)), itemStyle: { color: '#ffb627' } }
        ]
      }
    }
  ]
})

async function refresh() {
  loading.value = true
  try {
    const [dash, hl] = await Promise.all([iotDashboard(), iotHealthLatest(20)])
    dashData.value = dash.data
    healthLatest.value = hl.data
  } catch (e) {
    console.error('加载IoT数据失败', e)
  } finally {
    loading.value = false
  }
}

async function simulate() {
  simLoading.value = true
  try {
    await iotSimulate()
    await refresh()
  } catch (e) {
    console.error('模拟数据推送失败', e)
  } finally {
    simLoading.value = false
  }
}

function toggleLive() {
  liveUpdate.value = !liveUpdate.value
  if (liveUpdate.value) {
    timer = setInterval(refresh, 5000)
  } else {
    clearInterval(timer)
  }
}

onMounted(async () => {
  await refresh()
  if (liveUpdate.value) {
    timer = setInterval(refresh, 5000)
  }
})

onUnmounted(() => {
  clearInterval(timer)
})
</script>

<style scoped lang="scss">
.charts { height: 100%; }
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  margin-bottom: 12px;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #666;
}
.status-dot.live {
  background: #42d97a;
  box-shadow: 0 0 8px #42d97a;
  animation: pulse 1.5s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.status-text {
  font-size: 12px;
  color: #d4a878;
}
.toolbar-right {
  display: flex;
  gap: 8px;
}
.toolbar-right button {
  padding: 6px 12px;
  background: rgba(255, 140, 66, 0.1);
  border: 1px solid rgba(255, 140, 66, 0.25);
  color: #d4a878;
  cursor: pointer;
  font-size: 12px;
}
.toolbar-right button:hover {
  color: #ff8c42;
  border-color: #ff8c42;
}
.toolbar-right button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.toolbar-right button.active {
  color: #42d97a;
  border-color: #42d97a;
}
.kpi-row {
  display: flex;
  gap: 12px;
  padding: 14px;
  margin-bottom: 12px;
}
.kpi-card {
  flex: 1;
  text-align: center;
  padding: 10px 6px;
  border: 1px solid rgba(255, 140, 66, 0.15);
  background: rgba(40, 30, 50, 0.25);
}
.kpi-icon {
  font-size: 20px;
  margin-bottom: 4px;
}
.kpi-value {
  font-size: 24px;
  font-weight: 700;
}
.kpi-label {
  margin-top: 4px;
  font-size: 12px;
  color: #9e8b78;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.card {
  height: 320px;
  padding: 10px 12px;
}
.chart { height: calc(100% - 26px); }

@include below-narrow-desktop {
  .grid { grid-template-columns: 1fr; }
  .kpi-row { flex-wrap: wrap; }
  .kpi-card { min-width: 45%; }
}

@include mobile {
  /* 工具栏纵向堆叠，按钮铺满并满足触控尺寸 */
  .toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 12px;
  }

  .toolbar-left {
    flex-wrap: wrap;
    gap: 6px;
  }

  .toolbar-right {
    flex-wrap: wrap;

    button {
      flex: 1 1 calc(50% - 4px);
      min-height: var(--tap-min);
      padding: 8px 10px;
    }
  }

  /* KPI 固定两列，避免 flex 换行后宽度参差 */
  .kpi-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 12px;
  }

  .kpi-card {
    min-width: 0;
    padding: 10px 8px;
  }

  .kpi-value {
    font-size: 20px;
  }

  .card {
    height: 280px;
    padding: 10px;
  }
}
</style>
