<template>
  <div class="charts page-scroll">
    <div class="grid">
      <div class="card glass-panel" v-for="c in cards" :key="c.title" :class="{ wide: c.wide }">
        <div class="panel-title">{{ c.title }}</div>
        <div class="chart"><ChartPanel :option="c.option" /></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import * as echarts from 'echarts'
import 'echarts-gl'
import ChartPanel from '@/components/ChartPanel.vue'
import { useBreakpoint } from '@/composables/useBreakpoint'

const { isMobile } = useBreakpoint()

/** 窄屏：坐标轴字号收小并抽稀重叠标签 */
function chartMetrics(mobile) {
  return {
    axis: {
      axisLine: { lineStyle: { color: 'rgba(255,140,66,0.3)' } },
      axisLabel: { color: '#d4a878', fontSize: mobile ? 9 : 12, hideOverlap: true },
      splitLine: { lineStyle: { color: 'rgba(255,140,66,0.08)' } }
    }
  }
}

const treeData = {
  name: '康养中心',
  children: [
    {
      name: '住户',
      children: [{ name: '健康' }, { name: '护理' }, { name: '用药' }]
    },
    {
      name: '设备',
      children: [{ name: '监护' }, { name: '呼叫' }, { name: '穿戴' }]
    },
    {
      name: '安全',
      children: [{ name: '跌倒' }, { name: '走失' }, { name: '应急' }]
    },
    {
      name: '环境',
      children: [{ name: '温湿度' }, { name: '空气' }, { name: '光照' }]
    }
  ]
}

function graphNodes(n = 40) {
  const nodes = []
  const links = []
  for (let i = 0; i < n; i++) {
    nodes.push({
      id: String(i),
      name: `N${i}`,
      symbolSize: 8 + Math.random() * 18,
      category: i % 4,
      value: Math.round(Math.random() * 100)
    })
  }
  for (let i = 0; i < n * 1.5; i++) {
    const s = Math.floor(Math.random() * n)
    let t = Math.floor(Math.random() * n)
    if (t === s) t = (t + 1) % n
    links.push({ source: String(s), target: String(t) })
  }
  return { nodes, links }
}

const cards = computed(() => {
  const { axis } = chartMetrics(isMobile.value)
  const g = graphNodes(36)
  const npm = graphNodes(80)
  const parallel = Array.from({ length: 40 }, () => [
    Math.round(Math.random() * 150 + 20),
    +(Math.random() * 80 + 5).toFixed(1),
    +(Math.random() * 120 + 10).toFixed(1),
    +(Math.random() * 2).toFixed(2),
    +(Math.random() * 80 + 10).toFixed(1),
    +(Math.random() * 30 + 2).toFixed(1)
  ])
  const scatter3d = Array.from({ length: 120 }, () => [
    Math.random() * 40,
    Math.random() * 40,
    Math.random() * 40,
    Math.random() * 20
  ])
  const bar3d = []
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      bar3d.push([i, j, Math.round(Math.random() * 20 + 2)])
    }
  }

  return [
    {
      title: '径向树状图 · 康养体系',
      option: {
        backgroundColor: 'transparent',
        series: [
          {
            type: 'tree',
            data: [treeData],
            layout: 'radial',
            symbol: 'emptyCircle',
            symbolSize: 8,
            initialTreeDepth: 3,
            animationDurationUpdate: 750,
            emphasis: { focus: 'descendant' },
            lineStyle: { color: 'rgba(255,140,66,0.45)', width: 1.2, curveness: 0.5 },
            label: { color: '#e8d4c8', fontSize: 11 },
            leaves: { label: { color: '#d4a878' } }
          }
        ]
      }
    },
    {
      title: '康养关系图 · 住户设备关联',
      option: {
        backgroundColor: 'transparent',
        legend: [{ data: ['住户', '设备', '安全', '环境'], textStyle: { color: '#d4a878' } }],
        series: [
          {
            type: 'graph',
            layout: 'force',
            data: g.nodes,
            links: g.links,
            categories: [{ name: '住户' }, { name: '设备' }, { name: '安全' }, { name: '环境' }],
            roam: true,
            label: { show: true, position: 'right', color: '#e8d4c8', fontSize: 10 },
            labelLayout: { hideOverlap: true },
            lineStyle: { color: 'source', curveness: 0.2, opacity: 0.45 },
            force: { repulsion: 120, edgeLength: 60 },
            emphasis: { focus: 'adjacency' }
          }
        ]
      }
    },
    {
      title: '康养系统模块依赖图（示意）',
      wide: true,
      option: {
        backgroundColor: 'transparent',
        series: [
          {
            type: 'graph',
            layout: 'circular',
            circular: { rotateLabel: true },
            data: npm.nodes.map((n) => ({ ...n, name: `mod-${n.name}` })),
            links: npm.links,
            categories: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
            roam: true,
            label: { show: true, color: '#d4a878', fontSize: 9 },
            labelLayout: { hideOverlap: true },
            lineStyle: { color: 'source', curveness: 0.3, opacity: 0.35 },
            emphasis: { focus: 'adjacency', lineStyle: { width: 3 } }
          }
        ]
      }
    },
    {
      title: '健康指标分布（平行坐标）',
      option: {
        backgroundColor: 'transparent',
        parallelAxis: [
          { dim: 0, name: '心率', nameTextStyle: { color: '#d4a878' }, axisLabel: { color: '#d4a878' } },
          { dim: 1, name: '血压', nameTextStyle: { color: '#d4a878' }, axisLabel: { color: '#d4a878' } },
          { dim: 2, name: '血氧', nameTextStyle: { color: '#d4a878' }, axisLabel: { color: '#d4a878' } },
          { dim: 3, name: '体温', nameTextStyle: { color: '#d4a878' }, axisLabel: { color: '#d4a878' } },
          { dim: 4, name: '呼吸', nameTextStyle: { color: '#d4a878' }, axisLabel: { color: '#d4a878' } },
          { dim: 5, name: '血糖', nameTextStyle: { color: '#d4a878' }, axisLabel: { color: '#d4a878' } }
        ],
        parallel: { left: 40, right: 40, top: 40, bottom: 30, parallelAxisDefault: { axisLine: { lineStyle: { color: 'rgba(255,140,66,0.35)' } } } },
        series: [{ type: 'parallel', lineStyle: { width: 1.2, opacity: 0.45, color: '#ff8c42' }, data: parallel }]
      }
    },
    {
      title: '三维堆叠柱状图',
      option: {
        backgroundColor: 'transparent',
        tooltip: {},
        visualMap: {
          max: 25,
          inRange: { color: ['#1a1428', '#ff8c42', '#42d97a'] },
          textStyle: { color: '#d4a878' }
        },
        xAxis3D: { type: 'category', data: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] },
        yAxis3D: { type: 'category', data: ['东', '南', '西', '北', '中', '外', '远'] },
        zAxis3D: { type: 'value' },
        grid3D: {
          boxWidth: 160,
          boxDepth: 80,
          light: { main: { intensity: 1.1 }, ambient: { intensity: 0.35 } },
          viewControl: { projection: 'perspective', autoRotate: true }
        },
        series: [{ type: 'bar3D', data: bar3d, shading: 'lambert', label: { show: false } }]
      }
    },
    {
      title: '三维散点图',
      option: {
        backgroundColor: 'transparent',
        grid3D: { viewControl: { autoRotate: true }, light: { main: { intensity: 1.1 } } },
        xAxis3D: { type: 'value' },
        yAxis3D: { type: 'value' },
        zAxis3D: { type: 'value' },
        series: [
          {
            type: 'scatter3D',
            data: scatter3d,
            symbolSize: (d) => d[3] / 2 + 4,
            itemStyle: { color: '#ff8c42', opacity: 0.85 }
          }
        ]
      }
    },
    {
      title: '三维柱状图 · 楼层健康负荷',
      option: {
        backgroundColor: 'transparent',
        visualMap: { max: 20, inRange: { color: ['#123', '#ff8c42', '#ffaa00'] }, textStyle: { color: '#d4a878' } },
        xAxis3D: { type: 'category', data: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] },
        yAxis3D: { type: 'category', data: ['1', '2', '3', '4', '5', '6', '7'] },
        zAxis3D: { type: 'value' },
        grid3D: { boxWidth: 140, boxDepth: 80, viewControl: { autoRotate: true, autoRotateSpeed: 8 } },
        series: [{ type: 'bar3D', data: bar3d.map((d) => [d[0], d[1], d[2] * 0.8]), shading: 'color' }]
      }
    },
    {
      title: 'Bar3D · 巡房打卡统计',
      option: {
        backgroundColor: 'transparent',
        tooltip: {},
        visualMap: { max: 20, inRange: { color: ['#1a1428', '#ff8c42', '#ffb627'] }, textStyle: { color: '#d4a878' } },
        xAxis3D: { type: 'category', data: ['1楼东', '1楼西', '2楼东', '2楼西', '3楼东', '3楼西', '花园'] },
        yAxis3D: { type: 'category', data: ['00', '04', '08', '12', '16', '20', '23'] },
        zAxis3D: { type: 'value' },
        grid3D: { boxWidth: 150, boxDepth: 80, viewControl: { distance: 180 } },
        series: [
          {
            type: 'bar3D',
            data: bar3d,
            shading: 'lambert',
            bevelSize: 0.15,
            label: { show: false }
          }
        ]
      }
    },
    {
      title: '三维散点 + 散点矩阵',
      wide: true,
      option: {
        backgroundColor: 'transparent',
        tooltip: {},
        grid: [
          { left: '55%', top: '10%', width: '40%', height: '35%' },
          { left: '55%', top: '55%', width: '40%', height: '35%' }
        ],
        xAxis: [
          { gridIndex: 0, ...axis },
          { gridIndex: 1, ...axis }
        ],
        yAxis: [
          { gridIndex: 0, ...axis },
          { gridIndex: 1, ...axis }
        ],
        grid3D: { left: '2%', width: '48%', viewControl: { autoRotate: true } },
        xAxis3D: {},
        yAxis3D: {},
        zAxis3D: {},
        series: [
          {
            type: 'scatter3D',
            data: scatter3d,
            symbolSize: 6,
            itemStyle: { color: '#42d97a' }
          },
          {
            type: 'scatter',
            xAxisIndex: 0,
            yAxisIndex: 0,
            data: scatter3d.map((d) => [d[0], d[1]]),
            itemStyle: { color: '#ff8c42' }
          },
          {
            type: 'scatter',
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: scatter3d.map((d) => [d[1], d[2]]),
            itemStyle: { color: '#ffaa00' }
          }
        ]
      }
    },
    {
      title: '设备物联网络关系图（大规模示意）',
      wide: true,
      option: {
        backgroundColor: 'transparent',
        series: [
          {
            type: 'graph',
            layout: 'force',
            data: Array.from({ length: 120 }, (_, i) => ({
              id: String(i),
              name: `pkg-${i}`,
              symbolSize: 4 + (i % 10),
              category: i % 5
            })),
            links: Array.from({ length: 220 }, () => {
              const s = Math.floor(Math.random() * 120)
              let t = Math.floor(Math.random() * 120)
              if (t === s) t = (t + 1) % 120
              return { source: String(s), target: String(t) }
            }),
            categories: [{ name: 'core' }, { name: 'ui' }, { name: 'data' }, { name: 'util' }, { name: 'net' }],
            roam: true,
            label: { show: false },
            lineStyle: { opacity: 0.25, width: 1, curveness: 0.15, color: '#ff8c42' },
            force: { repulsion: 40, edgeLength: [20, 60] },
            emphasis: { focus: 'adjacency' }
          }
        ]
      }
    }
  ]
})

onMounted(() => {
  // ensure gl registered
  echarts.env
})
</script>

<style scoped lang="scss">
.charts { height: 100%; }
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.card {
  height: 380px;
  padding: 10px 12px;
}
.card.wide {
  grid-column: 1 / -1;
  height: 420px;
}
.chart { height: calc(100% - 26px); }

@include below-narrow-desktop {
  .grid { grid-template-columns: 1fr; }
  .card.wide { grid-column: auto; }
}

@include mobile {
  .grid { gap: 12px; }

  /* 3D/关系图在窄屏需要更多纵向空间才看得清，适度加高 */
  .card {
    height: 340px;
    padding: 10px;
  }

  .card.wide {
    height: 380px;
  }
}
</style>
