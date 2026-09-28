<template>
  <div class="charts page-scroll">
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
import { getOverview } from '@/api'

const overview = ref(null)
const race = ref([
  { name: '东城', value: 42 },
  { name: '西城', value: 38 },
  { name: '朝阳', value: 55 },
  { name: '海淀', value: 61 },
  { name: '丰台', value: 33 },
  { name: '通州', value: 29 }
])
let timer

const axis = {
  axisLine: { lineStyle: { color: 'rgba(0,212,255,0.3)' } },
  axisLabel: { color: '#9ec9e8' },
  splitLine: { lineStyle: { color: 'rgba(0,212,255,0.08)' } }
}

const cards = computed(() => {
  const traffic = overview.value?.traffic || Array.from({ length: 12 }, (_, i) => ({ hour: i * 2, congestion: Math.random(), volume: Math.random() * 1000, speed: 30 + Math.random() * 40 }))
  const env = overview.value?.env || []
  const sorted = [...race.value].sort((a, b) => a.value - b.value)

  return [
    {
      title: '堆叠面积图 · 昼夜交通',
      option: {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        legend: { textStyle: { color: '#9ec9e8' } },
        grid: { left: 40, right: 16, top: 40, bottom: 28 },
        xAxis: { type: 'category', data: traffic.map((i) => `${i.hour}h`), ...axis },
        yAxis: { type: 'value', ...axis },
        series: [
          { name: '拥堵', type: 'line', stack: 'Total', areaStyle: {}, emphasis: { focus: 'series' }, data: traffic.map((i) => +(i.congestion * 100).toFixed(1)), color: '#00d4ff' },
          { name: '流量', type: 'line', stack: 'Total', areaStyle: {}, emphasis: { focus: 'series' }, data: traffic.map((i) => Math.round(i.volume / 20)), color: '#00ffa3' },
          { name: '速度', type: 'line', stack: 'Total', areaStyle: {}, emphasis: { focus: 'series' }, data: traffic.map((i) => +Number(i.speed || 40).toFixed(1)), color: '#ffaa00' }
        ]
      }
    },
    {
      title: '断轴柱状图 · 分区指标对比',
      option: {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        grid: [{ left: 50, right: 20, top: 30, height: '35%' }, { left: 50, right: 20, top: '60%', height: '28%' }],
        xAxis: [
          { type: 'category', data: ['人口', '交通', '能源', '安防', '环境', '经济'], gridIndex: 0, ...axis },
          { type: 'category', data: ['人口', '交通', '能源', '安防', '环境', '经济'], gridIndex: 1, ...axis }
        ],
        yAxis: [
          { type: 'value', max: 1200, gridIndex: 0, ...axis },
          { type: 'value', max: 200, gridIndex: 1, ...axis }
        ],
        series: [
          { type: 'bar', data: [980, 860, 920, 760, 810, 1050], xAxisIndex: 0, yAxisIndex: 0, itemStyle: { color: '#00d4ff' } },
          { type: 'bar', data: [120, 90, 150, 80, 110, 160], xAxisIndex: 1, yAxisIndex: 1, itemStyle: { color: '#00ffa3' } }
        ]
      }
    },
    {
      title: '堆叠柱状图 · 能源结构',
      option: {
        backgroundColor: 'transparent',
        legend: { textStyle: { color: '#9ec9e8' } },
        grid: { left: 40, right: 16, top: 40, bottom: 28 },
        xAxis: { type: 'category', data: (overview.value?.energy || []).map((i) => i.building) || ['A', 'B', 'C', 'D'], ...axis, axisLabel: { ...axis.axisLabel, rotate: 20 } },
        yAxis: { type: 'value', ...axis },
        series: [
          { name: '电', type: 'bar', stack: 'e', data: (overview.value?.energy || []).map((i) => +Number(i.electricity).toFixed(0)), itemStyle: { color: '#00d4ff' } },
          { name: '水', type: 'bar', stack: 'e', data: (overview.value?.energy || []).map((i) => +Number(i.water).toFixed(0)), itemStyle: { color: '#38bdf8' } },
          { name: '气', type: 'bar', stack: 'e', data: (overview.value?.energy || []).map((i) => +Number(i.gas).toFixed(0)), itemStyle: { color: '#00ffa3' } }
        ]
      }
    },
    {
      title: '阶梯瀑布图 · 指标拆解',
      option: (() => {
        const data = [300, 120, -80, 60, -40, 90, -50]
        const helper = []
        let acc = 0
        data.forEach((v) => {
          if (v >= 0) {
            helper.push(acc)
            acc += v
          } else {
            acc += v
            helper.push(acc)
          }
        })
        return {
          backgroundColor: 'transparent',
          grid: { left: 40, right: 16, top: 30, bottom: 28 },
          xAxis: { type: 'category', data: ['起始', '增量A', '减量B', '增量C', '减量D', '增量E', '结余'], ...axis },
          yAxis: { type: 'value', ...axis },
          series: [
            { type: 'bar', stack: 'all', data: helper, itemStyle: { borderColor: 'transparent', color: 'transparent' } },
            { type: 'bar', stack: 'all', data: data.map(Math.abs), itemStyle: { color: (p) => (data[p.dataIndex] >= 0 ? '#00ffa3' : '#ff4d6d') } }
          ]
        }
      })()
    },
    {
      title: '动态排序柱状图 · 区域活跃度',
      option: {
        backgroundColor: 'transparent',
        grid: { left: 60, right: 40, top: 20, bottom: 24 },
        xAxis: { type: 'value', ...axis },
        yAxis: { type: 'category', data: sorted.map((i) => i.name), ...axis },
        series: [{ type: 'bar', data: sorted.map((i) => i.value), label: { show: true, position: 'right', color: '#e8f4ff' }, itemStyle: { color: '#00d4ff' } }]
      }
    },
    {
      title: '可滚动图例柱状图 · 站点AQI',
      option: {
        backgroundColor: 'transparent',
        legend: { type: 'scroll', textStyle: { color: '#9ec9e8' } },
        grid: { left: 40, right: 16, top: 50, bottom: 28 },
        xAxis: { type: 'category', data: env.map((i) => i.station), ...axis, axisLabel: { ...axis.axisLabel, rotate: 25 } },
        yAxis: { type: 'value', ...axis },
        series: [
          { name: 'AQI', type: 'bar', data: env.map((i) => Math.round(i.aqi)), itemStyle: { color: '#67e8f9' } },
          { name: 'PM2.5', type: 'bar', data: env.map((i) => Math.round(i.pm25)), itemStyle: { color: '#00ffa3' } }
        ]
      }
    },
    {
      title: '虚线柱状图 · 夜间负荷',
      option: {
        backgroundColor: 'transparent',
        grid: { left: 40, right: 16, top: 30, bottom: 28 },
        xAxis: { type: 'category', data: ['22', '23', '0', '1', '2', '3', '4', '5'], ...axis },
        yAxis: { type: 'value', ...axis },
        series: [
          {
            type: 'pictorialBar',
            symbol: 'path://M0,10 L10,10 C5.5,10 5.5,5 5,5 C4.5,5 4.5,10 0,10 z',
            data: [40, 35, 28, 22, 18, 16, 20, 30],
            itemStyle: { color: '#00d4ff' },
            barCategoryGap: '40%'
          },
          {
            type: 'bar',
            data: [40, 35, 28, 22, 18, 16, 20, 30],
            itemStyle: {
              color: 'transparent',
              borderWidth: 1,
              borderType: 'dashed',
              borderColor: '#00ffa3'
            }
          }
        ]
      }
    },
    {
      title: '嵌套环形图 · 事件构成',
      option: {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'item' },
        series: [
          {
            type: 'pie',
            radius: [0, '35%'],
            label: { color: '#e8f4ff' },
            data: [
              { name: '交通', value: 35 },
              { name: '安防', value: 25 },
              { name: '环境', value: 20 },
              { name: '能源', value: 20 }
            ]
          },
          {
            type: 'pie',
            radius: ['50%', '70%'],
            label: { color: '#9ec9e8' },
            data: [
              { name: '已完成', value: 40 },
              { name: '处理中', value: 35 },
              { name: '待处理', value: 25 }
            ]
          }
        ]
      }
    }
  ]
})

onMounted(async () => {
  try {
    const res = await getOverview()
    overview.value = res.data
  } catch {}
  timer = setInterval(() => {
    race.value = race.value.map((i) => ({ ...i, value: Math.max(10, i.value + Math.round((Math.random() - 0.4) * 8)) }))
  }, 1800)
})
onUnmounted(() => clearInterval(timer))
</script>

<style scoped>
.charts { height: 100%; }
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.card {
  height: 340px;
  padding: 10px 12px;
}
.chart { height: calc(100% - 26px); }
@media (max-width: 1100px) {
  .grid { grid-template-columns: 1fr; }
}
</style>
