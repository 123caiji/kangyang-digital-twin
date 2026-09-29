<template>
  <span class="time">{{ now }}</span>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import dayjs from 'dayjs'

/**
 * 独立时钟组件。
 *
 * 为什么要把 1 秒一次的刷新拆出来：顶栏时钟原先直接写在 Layout.vue 里，
 * `now` 是 Layout 自己的响应式状态 —— 每过 1 秒，Layout 的渲染函数就要重跑一遍，
 * 模板里的 SideNav（10 个菜单项）、抽屉、以及 `<component :is>` 都要跟着创建 vnode 并参与 diff。
 * 页面挂着不动也会持续产生这部分开销，属于纯粹浪费。
 *
 * 拆成子组件后，每秒只有这个小组件的模板重渲染，Layout 及其余子树完全不动。
 * <=768px 时它由 CSS 隐藏，但定时器仍在跑 —— 保留的目的是切回宽屏能立刻显示正确时间。
 */
const now = ref(dayjs().format('YYYY-MM-DD HH:mm:ss'))
let timer

onMounted(() => {
  timer = setInterval(() => {
    now.value = dayjs().format('YYYY-MM-DD HH:mm:ss')
  }, 1000)
})

onBeforeUnmount(() => clearInterval(timer))
</script>

<style scoped lang="scss">
/* 样式一并收在本组件里，不再依赖 Layout 的作用域样式对「子组件根元素」的隐式穿透 */
.time {
  color: var(--sc-muted);
  font-variant-numeric: tabular-nums;
}

/* 中窄屏：时间让位给标题 */
@include mobile {
  .time {
    display: none;
  }
}
</style>
