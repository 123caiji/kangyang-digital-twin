<template>
  <div class="layout">
    <aside class="sider glass-panel">
      <div class="sider-brand">
        <div class="mark"></div>
        <div>
          <div class="title">康养孪生</div>
          <div class="sub">Kangyang Twin</div>
        </div>
      </div>
      <el-menu :key="route.path" :default-active="route.path" class="menu" @select="onMenuSelect">
        <el-menu-item v-for="item in menus" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.title }}</span>
        </el-menu-item>
      </el-menu>
      <div class="sider-user">
        <div>{{ userStore.user?.username }} · {{ roleLabel }}</div>
        <el-button link type="primary" @click="logout">退出</el-button>
      </div>
    </aside>
    <section class="main">
      <header class="topbar glass-panel">
        <div class="page-title">{{ route.meta.title || themeStore.settings.headerTitle }}</div>
        <div class="actions">
          <span class="time">{{ now }}</span>
          <el-tag size="small" effect="dark" type="success">在线</el-tag>
        </div>
      </header>
      <main class="content">
        <router-view v-slot="{ Component, route: childRoute }">
          <component :is="Component" :key="childRoute.fullPath" />
        </router-view>
      </main>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { useUserStore } from '@/stores/user'
import { useThemeStore } from '@/stores/theme'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const themeStore = useThemeStore()
const now = ref(dayjs().format('YYYY-MM-DD HH:mm:ss'))
let timer

const allMenus = [
  { path: '/dashboard', title: '康养孪生大屏', icon: 'Monitor', perm: 'dashboard' },
  { path: '/charts/ops', title: '健康监测', icon: 'DataLine', perm: 'charts' },
  { path: '/charts/analysis', title: '护理分析', icon: 'PieChart', perm: 'charts' },
  { path: '/charts/advanced', title: '空间关系', icon: 'Share', perm: 'charts' },
  { path: '/data', title: '数据管理', icon: 'Grid', perm: 'data' },
  { path: '/users', title: '用户管理', icon: 'User', perm: 'users' },
  { path: '/style', title: '样式设置', icon: 'Brush', perm: 'settings' },
  { path: '/db', title: '数据库设置', icon: 'Coin', perm: 'db' },
  { path: '/predict', title: '健康预测', icon: 'MagicStick', perm: 'predict' }
]

const menus = computed(() => allMenus.filter((m) => userStore.hasPerm(m.perm)))
const roleLabel = computed(() => ({ admin: '管理员', editor: '编辑员', viewer: '访客' }[userStore.role] || userStore.role))

function logout() {
  userStore.logout()
  router.push('/login')
}

function onMenuSelect(path) {
  if (!path || path === route.path) return
  // 先释放可能残留的焦点/指针，再跳转，避免菜单点击被卡住
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur()
  }
  router.push(path).catch(() => {})
}

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
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--sc-border);
  border-radius: 0;
}

.sider-brand {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 18px 16px;
  border-bottom: 1px solid rgba(255, 140, 66, 0.2);

  .mark {
    width: 34px;
    height: 34px;
    border: 2px solid var(--sc-primary);
    background: linear-gradient(135deg, var(--sc-primary), transparent 60%);
    clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
  }

  .title {
    color: var(--sc-primary);
    font-weight: 700;
    letter-spacing: 2px;
  }
  .sub {
    font-size: 11px;
    color: var(--sc-muted);
  }
}

.menu {
  flex: 1;
  overflow: auto;
  padding: 8px 0;
  pointer-events: auto;
  position: relative;
  z-index: 5;
}

.sider-user {
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 140, 66, 0.2);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--sc-muted);
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.topbar {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  border-bottom: 1px solid var(--sc-border);
  border-radius: 0;
}

.page-title {
  font-size: 16px;
  letter-spacing: 2px;
  color: var(--sc-primary);
}

.actions {
  display: flex;
  gap: 12px;
  align-items: center;
  .time {
    color: var(--sc-muted);
    font-variant-numeric: tabular-nums;
  }
}

.content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
