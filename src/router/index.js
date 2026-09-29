import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { public: true }
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/Dashboard.vue'),
    meta: { title: '康养孪生大屏', perm: 'dashboard', fullscreen: true }
  },
  {
    path: '/',
    component: () => import('@/views/Layout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'overview',
        name: 'Overview',
        component: () => import('@/views/Overview.vue'),
        // 挂在现有 dashboard 权限下，不新增权限项（避免改动用户权限逻辑）
        meta: { title: '园区总览', perm: 'dashboard' }
      },
      {
        path: 'charts/ops',
        name: 'ChartsOps',
        component: () => import('@/views/charts/ChartsOps.vue'),
        meta: { title: '健康监测图表', perm: 'charts' }
      },
      {
        path: 'charts/analysis',
        name: 'ChartsAnalysis',
        component: () => import('@/views/charts/ChartsAnalysis.vue'),
        meta: { title: '护理分析图表', perm: 'charts' }
      },
      {
        path: 'charts/advanced',
        name: 'ChartsAdvanced',
        component: () => import('@/views/charts/ChartsAdvanced.vue'),
        meta: { title: '空间关系图谱', perm: 'charts' }
      },
      {
        path: 'data',
        name: 'DataManage',
        component: () => import('@/views/DataManage.vue'),
        meta: { title: '数据管理', perm: 'data' }
      },
      {
        path: 'users',
        name: 'UserManage',
        component: () => import('@/views/UserManage.vue'),
        meta: { title: '用户管理', perm: 'users' }
      },
      {
        path: 'style',
        name: 'StyleSettings',
        component: () => import('@/views/StyleSettings.vue'),
        meta: { title: '系统样式', perm: 'settings' }
      },
      {
        path: 'db',
        name: 'DbSettings',
        component: () => import('@/views/DbSettings.vue'),
        meta: { title: '数据库连接', perm: 'db' }
      },
      {
        path: 'predict',
        name: 'Predict',
        component: () => import('@/views/Predict.vue'),
        meta: { title: '健康预测', perm: 'predict' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, _from, next) => {
  const user = useUserStore()
  if (to.meta.public) return next()
  if (!user.isLogin) return next('/login')
  const perm = to.meta.perm || to.matched.find((r) => r.meta?.perm)?.meta?.perm
  if (perm && !user.hasPerm(perm)) {
    return next('/dashboard')
  }
  next()
})

router.afterEach(() => {
  // 清理可能残留的拖拽/焦点状态，避免跳转后无法点击
  if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) {
    document.activeElement.blur()
  }
})

export default router
