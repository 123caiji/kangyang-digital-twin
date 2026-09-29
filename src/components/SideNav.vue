<template>
  <div class="side-nav" :class="{ 'is-collapsed': collapsed }">
    <div class="sider-brand">
      <div class="mark" aria-hidden="true"></div>
      <div v-if="!collapsed" class="brand-text">
        <div class="title">康养孪生</div>
        <div class="sub">Kangyang Twin</div>
      </div>
    </div>

    <nav class="nav" aria-label="主导航">
      <el-menu
        :key="route.path"
        :default-active="route.path"
        :collapse="collapsed"
        :collapse-transition="false"
        class="menu"
        @select="onSelect"
      >
        <el-menu-item v-for="item in menus" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <template #title>{{ item.title }}</template>
        </el-menu-item>
      </el-menu>
    </nav>

    <div class="sider-user">
      <template v-if="!collapsed">
        <div class="who">{{ userStore.user?.username }} · {{ roleLabel }}</div>
        <el-button link type="primary" @click="logout">退出</el-button>
      </template>
      <el-tooltip v-else content="退出登录" placement="right">
        <el-button link type="primary" class="logout-mini" aria-label="退出登录" @click="logout">
          <el-icon><SwitchButton /></el-icon>
        </el-button>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

defineProps({
  /** 图标栏模式（平板）：仅显示图标，隐藏文案 */
  collapsed: { type: Boolean, default: false }
})

const emit = defineEmits(['navigate'])

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const allMenus = [
  { path: '/overview', title: '园区总览', icon: 'OfficeBuilding', perm: 'dashboard' },
  { path: '/dashboard', title: '康养孪生大屏', icon: 'Monitor', perm: 'dashboard' },
  { path: '/charts/ops', title: '健康监测', icon: 'DataLine', perm: 'charts' },
  { path: '/charts/analysis', title: '护理分析', icon: 'PieChart', perm: 'charts' },
  { path: '/charts/advanced', title: '空间关系', icon: 'Share', perm: 'charts' },
  { path: '/data', title: '数据管理', icon: 'Grid', perm: 'data' },
  { path: '/devices', title: 'IoT设备管理', icon: 'Cpu', perm: 'users' },
  { path: '/users', title: '用户管理', icon: 'User', perm: 'users' },
  { path: '/audit', title: '安全审计日志', icon: 'Lock', perm: 'users' },
  { path: '/predict', title: '健康预测', icon: 'MagicStick', perm: 'predict' },
  { path: '/style', title: '样式设置', icon: 'Brush', perm: 'settings' },
  { path: '/db', title: '数据库设置', icon: 'Coin', perm: 'db' }
]

const menus = computed(() => allMenus.filter((m) => userStore.hasPerm(m.perm)))
const roleLabel = computed(
  () => ({ admin: '管理员', editor: '编辑员', viewer: '访客' })[userStore.role] || userStore.role
)

function onSelect(path) {
  if (!path) return
  emit('navigate')
  if (path === route.path) return
  // 先释放可能残留的焦点，再跳转，避免菜单点击被卡住
  if (document.activeElement?.blur) document.activeElement.blur()
  router.push(path).catch(() => {})
}

function logout() {
  emit('navigate')
  userStore.logout()
  router.push('/login')
}
</script>

<style scoped lang="scss">
.side-nav {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.sider-brand {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 18px 16px;
  border-bottom: 1px solid rgba(255, 140, 66, 0.2);
  flex-shrink: 0;

  .mark {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    border: 2px solid var(--sc-primary);
    background: linear-gradient(135deg, var(--sc-primary), transparent 60%);
    clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
  }

  .brand-text {
    min-width: 0;
  }

  .title {
    color: var(--sc-primary);
    font-weight: 700;
    letter-spacing: 2px;
    white-space: nowrap;
  }

  .sub {
    font-size: 11px;
    color: var(--sc-muted);
    white-space: nowrap;
  }
}

.nav {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.menu {
  padding: 8px 0;
  border-right: none;
}

.sider-user {
  flex-shrink: 0;
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 140, 66, 0.2);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--sc-muted);

  .who {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .logout-mini {
    width: 100%;
    min-height: 36px;
  }
}

/* 图标栏模式：品牌居中，可点区域撑满 */
.side-nav.is-collapsed {
  .sider-brand {
    padding: 18px 0;
    justify-content: center;
  }

  .sider-user {
    padding: 12px 0;
    justify-content: center;
  }
}
</style>
