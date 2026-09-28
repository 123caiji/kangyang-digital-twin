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
import { computed } from 'vue'
import dayjs from 'dayjs'
import ChartPanel from '@/components/ChartPanel.vue'

const axis = {
  axisLine: { lineStyle: { color: 'rgba(0,212,255,0.3)' } },
  axisLabel: { color: '#9ec9e8' },
  splitLine: { lineStyle: { color: 'rgba(0,212,255,0.08)' } }
}

function anscombe() {
  return {
    I: [
      [10, 8.04], [8, 6.95], [13, 7.58], [9, 8.81], [11, 8.33], [14, 9.96], [6, 7.24], [4, 4.26], [12, 10.84], [7, 4.82], [5, 5.68]
    ],
    II: [
      [10, 9.14], [8, 8.14], [13, 8.74], [9, 8.77], [11, 9.26], [14, 8.1], [6, 6.13], [4, 3.1], [12, 9.13], [7, 7.26], [5, 4.74]
    ],
    III: [
      [10, 7.46], [8, 6.77], [13, 12.74], [9, 7.11], [11, 7.81], [14, 8.84], [6, 6.08], [4, 5.39], [12, 8.15], [7, 6.42], [5, 5.73]
    ],
    IV: [
      [8, 6.58], [8, 5.76], [8, 7.71], [8, 8.84], [8, 8.47], [8, 7.04], [8, 5.25], [19, 12.5], [8, 5.56], [8, 7.91], [8, 6.89]
    ]
  }
}

const markLineOpt = {
  animation: false,
  label: { formatter: 'y = 0.5x + 3', align: 'right', color: '#9ec9e8' },
  lineStyle: { type: 'solid', color: '#ffaa00' },
  tooltip: { formatter: 'y = 0.5x + 3' },
  data: [[{ coord: [0, 3], symbol: 'none' }, { coord: [20, 13], symbol: 'none' }]]
}

const cards = computed(() => {
  const data = anscombe()
  const days = Array.from({ length: 30 }, (_, i) => dayjs().subtract(29 - i, 'day').format('YYYY-MM-DD'))
  const calendarData = days.map((d) => [d, Math.round(Math.random() * 100)])
  const matrix = ['交通', '能源', '环境', '安防', '人口']
  const heat = []
  matrix.forEach((a, i) => {
    matrix.forEach((b, j) => {
      heat.push([i, j, +(Math.random()).toFixed(2)])
    })
  })
  const scatterSingle = Array.from({ length: 80 }, () => [Math.random() * 100, Math.random() * 100])
  const nebula = Array.from({ length: 2000 }, () => [
    Math.random() * 100 + Math.sin(Math.random() * 10) * 8,
    Math.random() * 100 + Math.cos(Math.random() * 10) * 8
  ])

  return [
    {
      title: '安斯库姆四重奏散点图',
      option: {
        backgroundColor: 'transparent',
        title: [
          { text: 'I', left: '22%', top: '2%', textStyle: { color: '#9ec9e8', fontSize: 12 } },
          { text: 'II', left: '72%', top: '2%', textStyle: { color: '#9ec9e8', fontSize: 12 } },
          { text: 'III', left: '22%', top: '48%', textStyle: { color: '#9ec9e8', fontSize: 12 } },
          { text: 'IV', left: '72%', top: '48%', textStyle: { color: '#9ec9e8', fontSize: 12 } }
        ],
        grid: [
          { left: '7%', top: '10%', width: '38%', height: '35%' },
          { right: '7%', top: '10%', width: '38%', height: '35%' },
          { left: '7%', bottom: '8%', width: '38%', height: '35%' },
          { right: '7%', bottom: '8%', width: '38%', height: '35%' }
        ],
        xAxis: [
          { gridIndex: 0, min: 0, max: 20, ...axis },
          { gridIndex: 1, min: 0, max: 20, ...axis },
          { gridIndex: 2, min: 0, max: 20, ...axis },
          { gridIndex: 3, min: 0, max: 20, ...axis }
        ],
        yAxis: [
          { gridIndex: 0, min: 0, max: 15, ...axis },
          { gridIndex: 1, min: 0, max: 15, ...axis },
          { gridIndex: 2, min: 0, max: 15, ...axis },
          { gridIndex: 3, min: 0, max: 15, ...axis }
        ],
        series: [
          { type: 'scatter', xAxisIndex: 0, yAxisIndex: 0, data: data.I, markLine: markLineOpt, itemStyle: { color: '#00d4ff' } },
          { type: 'scatter', xAxisIndex: 1, yAxisIndex: 1, data: data.II, markLine: markLineOpt, itemStyle: { color: '#00ffa3' } },
          { type: 'scatter', xAxisIndex: 2, yAxisIndex: 2, data: data.III, markLine: markLineOpt, itemStyle: { color: '#ffaa00' } },
          { type: 'scatter', xAxisIndex: 3, yAxisIndex: 3, data: data.IV, markLine: markLineOpt, itemStyle: { color: '#ff4d6d' } }
        ]
      }
    },
    {
      title: '主题河流图 · 城市主题流量',
      option: {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        singleAxis: {
          type: 'time',
          top: 40,
          bottom: 30,
          axisLabel: { color: '#9ec9e8' },
          axisLine: { lineStyle: { color: 'rgba(0,212,255,0.3)' } }
        },
        series: [
          {
            type: 'themeRiver',
            emphasis: { itemStyle: { shadowBlur: 12 } },
            data: (() => {
              const types = ['交通', '能源', '安防', '环境']
              const arr = []
              for (let i = 0; i < 20; i++) {
                const d = new Date(2026, 0, i + 1)
                types.forEach((t) => arr.push([d, Math.round(Math.random() * 40 + 10), t]))
              }
              return arr
            })(),
            label: { show: false }
          }
        ]
      }
    },
    {
      title: '象形柱图 · 设施保有量',
      option: {
        backgroundColor: 'transparent',
        grid: { left: 50, right: 20, top: 30, bottom: 30 },
        xAxis: { type: 'category', data: ['摄像头', '传感器', '信号灯', '充电桩', '井盖'], ...axis },
        yAxis: { type: 'value', ...axis },
        series: [
          {
            type: 'pictorialBar',
            symbol: 'diamond',
            data: [820, 960, 540, 430, 1200],
            itemStyle: { color: '#00d4ff' },
            label: { show: true, position: 'top', color: '#e8f4ff' }
          }
        ]
      }
    },
    {
      title: '农历日历图 · 运维热力',
      option: {
        backgroundColor: 'transparent',
        visualMap: {
          min: 0,
          max: 100,
          calculable: true,
          orient: 'horizontal',
          left: 'center',
          bottom: 8,
          textStyle: { color: '#9ec9e8' },
          inRange: { color: ['#0a2a4a', '#00d4ff', '#00ffa3'] }
        },
        calendar: {
          top: 40,
          left: 40,
          right: 20,
          cellSize: ['auto', 16],
          range: [days[0], days[29]],
          itemStyle: { borderWidth: 0.5, borderColor: 'rgba(0,212,255,0.2)' },
          yearLabel: { show: false },
          dayLabel: { color: '#9ec9e8' },
          monthLabel: { color: '#9ec9e8' }
        },
        series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: calendarData }]
      }
    },
    {
      title: '相关矩阵（热力图）',
      option: {
        backgroundColor: 'transparent',
        tooltip: { position: 'top' },
        grid: { left: 60, right: 30, top: 30, bottom: 50 },
        xAxis: { type: 'category', data: matrix, splitArea: { show: true }, ...axis },
        yAxis: { type: 'category', data: matrix, splitArea: { show: true }, ...axis },
        visualMap: {
          min: 0,
          max: 1,
          calculable: true,
          orient: 'horizontal',
          left: 'center',
          bottom: 0,
          textStyle: { color: '#9ec9e8' },
          inRange: { color: ['#0b1c2e', '#0077aa', '#00ffa3'] }
        },
        series: [{ type: 'heatmap', data: heat, label: { show: true, color: '#e8f4ff', fontSize: 10 } }]
      }
    },
    {
      title: '单轴散点图 · 指标分布',
      option: {
        backgroundColor: 'transparent',
        singleAxis: {
          type: 'value',
          top: '40%',
          height: 0,
          axisLabel: { color: '#9ec9e8' },
          axisLine: { lineStyle: { color: 'rgba(0,212,255,0.4)' } }
        },
        series: [
          {
            type: 'scatter',
            coordinateSystem: 'singleAxis',
            data: Array.from({ length: 60 }, () => Math.random() * 100),
            symbolSize: (v) => v / 6 + 4,
            itemStyle: { color: '#00d4ff', opacity: 0.75 }
          }
        ]
      }
    },
    {
      title: '大规模星云散点图',
      option: {
        backgroundColor: 'transparent',
        grid: { left: 40, right: 16, top: 24, bottom: 28 },
        xAxis: { ...axis },
        yAxis: { ...axis },
        series: [
          {
            type: 'scatter',
            data: nebula,
            symbolSize: 3,
            large: true,
            itemStyle: { color: '#67e8f9', opacity: 0.55 }
          }
        ]
      }
    },
    {
      title: '相关矩阵（散点图）',
      option: {
        backgroundColor: 'transparent',
        grid: { left: 40, right: 16, top: 24, bottom: 28 },
        xAxis: { ...axis },
        yAxis: { ...axis },
        series: [
          {
            type: 'scatter',
            data: scatterSingle,
            symbolSize: 10,
            itemStyle: { color: '#00ffa3' }
          },
          {
            type: 'scatter',
            data: scatterSingle.map(([x, y]) => [y, x * 0.8 + Math.random() * 10]),
            symbolSize: 8,
            itemStyle: { color: '#ffaa00' }
          }
        ]
      }
    },
    {
      title: '矩阵坐标系微型条形图',
      option: {
        backgroundColor: 'transparent',
        grid: { left: 60, right: 20, top: 20, bottom: 30 },
        xAxis: { type: 'category', data: ['一季度', '二季度', '三季度', '四季度'], ...axis },
        yAxis: { type: 'category', data: ['交通', '能源', '安防', '环境'], ...axis },
        series: [
          {
            type: 'bar',
            data: [
              [0, 0, 40], [1, 0, 55], [2, 0, 48], [3, 0, 62],
              [0, 1, 30], [1, 1, 44], [2, 1, 52], [3, 1, 38],
              [0, 2, 25], [1, 2, 33], [2, 2, 41], [3, 2, 36],
              [0, 3, 50], [1, 3, 46], [2, 3, 58], [3, 3, 64]
            ].map((d) => ({ value: [d[0], d[1], d[2]] })),
            encode: { x: 0, y: 1, tooltip: 2 },
            itemStyle: { color: '#00d4ff' }
          }
        ]
      }
    },
    {
      title: '城市运行热力地图（示意）',
      option: {
        backgroundColor: 'transparent',
        geo: {
          map: 'none',
          silent: true,
          itemStyle: { areaColor: '#0a2238', borderColor: '#00d4ff' }
        },
        grid: { left: 20, right: 20, top: 20, bottom: 20 },
        xAxis: { show: false, min: 0, max: 100 },
        yAxis: { show: false, min: 0, max: 100 },
        series: [
          {
            type: 'effectScatter',
            data: Array.from({ length: 25 }, () => ({
              value: [Math.random() * 100, Math.random() * 100, Math.random() * 100],
              name: '节点'
            })),
            symbolSize: (v) => v[2] / 8 + 6,
            rippleEffect: { scale: 3 },
            itemStyle: { color: '#00ffa3' },
            label: { show: false }
          },
          {
            type: 'lines',
            coordinateSystem: 'cartesian2d',
            data: Array.from({ length: 12 }, () => ({
              coords: [
                [Math.random() * 100, Math.random() * 100],
                [Math.random() * 100, Math.random() * 100]
              ]
            })),
            lineStyle: { color: '#00d4ff', width: 1, opacity: 0.45, curveness: 0.25 },
            effect: { show: true, symbol: 'arrow', symbolSize: 5, trailLength: 0.3 }
          }
        ]
      }
    }
  ]
})
</script>

<style scoped>
.charts { height: 100%; }
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.card {
  height: 360px;
  padding: 10px 12px;
}
.chart { height: calc(100% - 26px); }
@media (max-width: 1100px) {
  .grid { grid-template-columns: 1fr; }
}
</style>
