<template>
  <div class="audit-page">
    <div class="page-header">
      <h2>安全审计日志</h2>
      <el-button @click="fetchLogs" :loading="loading">刷新</el-button>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-num">{{ logs.length }}</div>
        <div class="stat-label">日志总数</div>
      </div>
      <div class="stat-card">
        <div class="stat-num success">{{ successCount }}</div>
        <div class="stat-label">成功操作</div>
      </div>
      <div class="stat-card">
        <div class="stat-num danger">{{ failedCount }}</div>
        <div class="stat-label">失败/拦截</div>
      </div>
      <div class="stat-card">
        <div class="stat-num warn">{{ lockedCount }}</div>
        <div class="stat-label">锁定事件</div>
      </div>
    </div>

    <el-table :data="logs" stripe class="audit-table" v-loading="loading" default-sort="{ prop: 'id', order: 'descending' }">
      <el-table-column prop="id" label="ID" width="70" sortable />
      <el-table-column prop="username" label="操作人" width="120" />
      <el-table-column prop="action" label="操作类型" width="180">
        <template #default="{ row }">
          <el-tag :type="actionTag(row.action)" size="small">{{ actionLabel(row.action) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="method" label="方法" width="80" />
      <el-table-column prop="ip" label="来源IP" width="140" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <span :class="['status-dot', statusClass(row.status)]"></span>
          {{ statusLabel(row.status) }}
        </template>
      </el-table-column>
      <el-table-column prop="detail" label="详情" min-width="200" show-overflow-tooltip />
      <el-table-column prop="created_at" label="时间" width="180" sortable />
    </el-table>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { getAuditLogs } from '@/api'

const logs = ref([])
const loading = ref(false)

const successCount = computed(() => logs.value.filter(l => l.status === 'success').length)
const failedCount = computed(() => logs.value.filter(l => l.status === 'failed' || l.status === 'blocked').length)
const lockedCount = computed(() => logs.value.filter(l => l.action === 'login_locked').length)

function actionLabel(a) {
  const map = {
    login: '登录',
    login_locked: '账号锁定',
    post_data_table: '新增数据',
    put_data_table_id: '更新数据',
    delete_data_table_id: '删除数据',
    post_auth_users: '创建用户',
    put_auth_users_id: '更新用户',
    delete_auth_users_id: '删除用户',
    post_iot_devices: '注册设备',
    put_iot_devices_id: '更新设备',
    delete_iot_devices_id: '删除设备'
  }
  return map[a] || a
}

function actionTag(a) {
  if (a === 'login_locked') return 'danger'
  if (a?.startsWith('delete')) return 'warning'
  if (a?.startsWith('post')) return 'success'
  return 'info'
}

function statusClass(s) {
  if (s === 'success') return 'on'
  if (s === 'blocked') return 'lock'
  return 'off'
}

function statusLabel(s) {
  const map = { success: '成功', failed: '失败', blocked: '拦截' }
  return map[s] || s
}

async function fetchLogs() {
  loading.value = true
  try {
    const res = await getAuditLogs(100)
    logs.value = res.data || []
  } finally {
    loading.value = false
  }
}

fetchLogs()
</script>

<style scoped lang="scss">
.audit-page {
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;

  h2 {
    margin: 0;
    font-size: 20px;
    color: var(--sc-primary);
  }
}

.stats-row {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card {
  flex: 1;
  text-align: center;
  padding: 16px 0;
  background: rgba(40, 30, 50, 0.55);
  border: 1px solid var(--sc-border);
  border-radius: 4px;

  .stat-num {
    font-size: 28px;
    font-weight: 700;
    color: var(--sc-primary);

    &.success { color: #42d97a; }
    &.danger { color: #e85d75; }
    &.warn { color: #ffb627; }
  }

  .stat-label {
    font-size: 12px;
    color: var(--sc-muted);
    margin-top: 4px;
  }
}

.audit-table {
  background: rgba(40, 30, 50, 0.55);
}

.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;

  &.on { background: #42d97a; box-shadow: 0 0 6px #42d97a; }
  &.off { background: #e85d75; }
  &.lock { background: #ffb627; box-shadow: 0 0 6px #ffb627; }
}
</style>
