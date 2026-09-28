<template>
  <div class="layout">
    <!-- 桌面 / 平板：常驻侧栏（平板收成 64px 图标栏） -->
    <aside v-if="!isMobile" class="sider glass-panel" :class="{ 'is-rail': isTablet }">
      <SideNav :collapsed="isTablet" @navigate="onNavigate" />
    </aside>

    <!-- 手机：侧栏转为抽屉，遮罩点击 / Esc 关闭（均由 el-drawer 内建） -->
    <el-drawer
      v-if="isMobile"
      v-model="drawerOpen"
      direction="ltr"
      size="268px"
      :with-header="false"
      :z-index="1999"
      class="nav-drawer"
      aria-label="导航菜单"
    >
      <SideNav @navigate="onNavigate" />
    </el-drawer>

    <section class="main">
      <header class="topbar glass-panel">
        <div class="topbar-left">
          <button
            v-if="isMobile"
            type="button"
            class="hamburger"
            aria-label="打开导航菜单"
            :aria-expanded="drawerOpen"
            @click="drawerOpen = true"
          >
            <el-icon><Menu /></el-icon>
          </button>
          <div class="page-title">{{ route.meta.title || themeStore.settings.headerTitle }}</div>
        </div>
        <div class="actions">
          <span class="time">{{ now }}</span>
          <el-tag size="small" effect="dark" type="success">在线</el-tag>
        </div>
      </header>

      <main class="content" :class="{ 'is-scroll': !isDesktop }">
        <router-view v-slot="{ Component, route: childRoute }">
          <component :is="Component" :key="childRoute.fullPath" />
        </router-view>
      </main>
    </section>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import SideNav from '@/components/SideNav.vue'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useThemeStore } from '@/stores/theme'

const route = useRoute()
const themeStore = useThemeStore()
const { isMobile, isTablet, isDesktop } = useBreakpoint()

const drawerOpen = ref(false)
const now = ref(dayjs().format('YYYY-MM-DD HH:mm:ss'))
let timer

function onNavigate() {
  drawerOpen.value = false
}

// 从手机宽度切回桌面时，确保抽屉状态不残留
watch(isMobile, (v) => {
  if (!v) drawerOpen.value = false
})

onMounted(async () => {
  await themeStore.load()
  timer = setInterval(() => {
    now.value = dayjs().format('YYYY-MM-DD HH:mm:ss')
  }, 1000)
})

onUnmounted(() => clearInterval(timer))
</script>

<style scoped lang="scss">
.layout {
  display: flex;
  width: 100%;
  height: 100%;
  background: var(--sc-bg);
}

.sider {
  width: #{$sider-width};
  flex-shrink: 0;
  border-right: 1px solid var(--sc-border);
  border-radius: 0;
  transition: width var(--dur-base) var(--ease-standard);
  overflow: hidden;

  &.is-rail {
    width: #{$sider-rail};
  }
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.topbar {
  height: #{$topbar-height};
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 18px;
  border-bottom: 1px solid var(--sc-border);
  border-radius: 0;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.hamburger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--tap-min);
  height: var(--tap-min);
  flex-shrink: 0;
  margin-left: -8px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--sc-primary);
  font-size: 20px;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-standard);

  &:hover,
  &:active {
    background: rgba(255, 140, 66, 0.14);
  }
}

.page-title {
  font-size: 16px;
  letter-spacing: 2px;
  color: var(--sc-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-shrink: 0;

  .time {
    color: var(--sc-muted);
    font-variant-numeric: tabular-nums;
  }
}

.content {
  flex: 1;
  min-height: 0;
  overflow: hidden;

  /* 窄屏：内容区接管纵向滚动，避免长页面被直接裁掉 */
  &.is-scroll {
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
  }
}

@include mobile {
  .topbar {
    padding: 0 10px;
  }

  .page-title {
    font-size: 15px;
    letter-spacing: 1px;
  }

  /* 时间在中窄屏让位给标题 */
  .time {
    display: none;
  }
}
</style>

<!-- 抽屉内容渲染在 body 上（teleport），需非 scoped 样式 -->
<style lang="scss">
/* 抽屉层级由 :z-index="1999" 控制，此处只负责视觉皮肤 */
.nav-drawer {
  background: var(--sc-bg) !important;
  border-right: 1px solid var(--sc-border);

  .el-drawer__body {
    padding: 0;
    overflow: hidden;
  }

  .el-drawer__header {
    display: none;
  }

  .side-nav {
    height: 100%;
    background: var(--sc-panel);
  }
}
</style>
