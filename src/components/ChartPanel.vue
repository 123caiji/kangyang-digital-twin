<template>
  <div ref="el" class="chart-box"></div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  option: { type: Object, required: true },
  autoresize: { type: Boolean, default: true }
})

const el = ref(null)
let chart = null
let alive = true
let observer = null
let resizeFrame = 0

function render() {
  if (!alive || !chart) return
  try {
    chart.setOption(props.option, true)
  } catch {
    /* ignore disposed chart */
  }
}

function resize() {
  if (!alive || !chart) return
  try {
    chart.resize()
  } catch {
    /* ignore */
  }
}

/**
 * 容器尺寸变化 → 重绘。
 * 仅在 requestAnimationFrame 内执行一次，避免侧栏折叠等连续变化时抖动。
 */
function scheduleResize() {
  if (resizeFrame) return
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0
    resize()
  })
}

onMounted(() => {
  alive = true
  chart = echarts.init(el.value, null, { renderer: 'canvas' })
  render()

  if (!props.autoresize) return
  // ResizeObserver 覆盖 window.resize 抓不到的容器级变化（侧栏折叠、抽屉开合、断点切换）
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(scheduleResize)
    observer.observe(el.value)
  }
  window.addEventListener('resize', scheduleResize)
})

watch(() => props.option, render, { deep: true })

onBeforeUnmount(() => {
  alive = false
  if (resizeFrame) {
    cancelAnimationFrame(resizeFrame)
    resizeFrame = 0
  }
  observer?.disconnect()
  observer = null
  window.removeEventListener('resize', scheduleResize)
  try {
    chart?.dispose()
  } catch {
    /* ignore */
  }
  chart = null
})

defineExpose({ getInstance: () => chart, resize })
</script>

<style scoped>
.chart-box {
  width: 100%;
  height: 100%;
  min-height: 120px;
}
</style>
