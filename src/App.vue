<template>
  <router-view v-slot="{ Component, route }">
    <component :is="Component" :key="routeKey(route)" />
  </router-view>
</template>

<script setup>
function routeKey(route) {
  // 顶层页面切换时强制重建，避免 3D/图表残留遮罩或监听
  if (route.meta?.fullscreen || route.path === '/login' || route.path === '/dashboard') {
    return route.fullPath
  }
  return route.matched[0]?.path || 'layout'
}
</script>
