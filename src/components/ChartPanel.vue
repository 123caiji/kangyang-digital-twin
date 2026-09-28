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

onMounted(() => {
  alive = true
  chart = echarts.init(el.value, null, { renderer: 'canvas' })
  render()
  if (props.autoresize) window.addEventListener('resize', resize)
})

watch(() => props.option, render, { deep: true })

onBeforeUnmount(() => {
  alive = false
  window.removeEventListener('resize', resize)
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
