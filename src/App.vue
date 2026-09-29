<template>
  <el-config-provider :locale="zhCn">
    <!-- 路由级加载反馈：懒加载 chunk 到达前给一条顶部进度条，替代无声等待 -->
    <RouteProgress />
    <router-view v-slot="{ Component, route }">
      <transition name="page-fade" mode="out-in">
        <component :is="Component" :key="routeKey(route)" />
      </transition>
    </router-view>
  </el-config-provider>
</template>

<script setup>
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import RouteProgress from '@/components/RouteProgress.vue'

function routeKey(route) {
  // 顶层页面切换时强制重建，避免 3D/图表残留遮罩或监听
  if (route.meta?.fullscreen || route.path === '/login' || route.path === '/dashboard') {
    return route.fullPath
  }
  return route.matched[0]?.path || 'layout'
}
</script>

<style lang="scss">
/*
  页面切换过渡。
  只做透明度淡入淡出，不做位移：3D/图表页面里有 canvas 与绝对定位图层，
  transform 会促成额外合成层，还会让 ECharts 的容器尺寸测量出现亚像素抖动。
  prefers-reduced-motion 由 global.scss 统一把 transition-duration 压到接近 0，此处无需重复处理。
*/
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.18s ease;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}
</style>
