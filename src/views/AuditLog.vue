<template>
  <div class="page page-scroll">
    <div class="toolbar glass-panel">
      <el-select
        v-model="actionFilter"
        class="filter-select"
        aria-label="按操作类型筛选"
        @change="onFilterChange"
      >
        <el-option label="全部操作" value="all" />
        <el-option v-for="a in actionOptions" :key="a" :label="actionLabel(a)" :value="a" />
      </el-select>
      <el-select
        v-model="statusFilter"
        class="filter-select status-select"
        aria-label="按状态筛选"
        @change="onFilterChange"
      >
        <el-option label="全部状态" value="all" />
        <el-option label="成功" value="success" />
        <el-option label="失败" value="failed" />
        <el-option label="拦截" value="blocked" />
      </el-select>
      <el-button :loading="loading" @click="fetchLogs">刷新</el-button>
    </div>

    <div class="stats-row">
      <div class="stat-card glass-panel">
        <div class="stat-num">{{ filtered.length }}</div>
        <div class="stat-label">日志总数</div>
      </div>
      <div class="stat-card glass-panel">
        <div class="stat-num success">{{ successCount }}</div>
        <div class="stat-label">成功操作</div>
      </div>
      <div class="stat-card glass-panel">
        <div class="stat-num danger">{{ failedCount }}</div>
        <div class="stat-label">失败/拦截</div>
      </div>
      <div class="stat-card glass-panel">
        <div class="stat-num warn">{{ lockedCount }}</div>
        <div class="stat-label">锁定事件</div>
      </div>
    </div>

    <!-- 桌面 / 平板：表格 -->
    <div v-if="!isMobile" class="table-wrap glass-panel">
      <el-skeleton v-if="loading && !logs.length" :rows="6" animated class="skeleton" />
      <el-empty v-else-if="!filtered.length" description="没有匹配的日志" />
      <el-table
        v-else
        :data="paged"
        stripe
        height="100%"
        style="width: 100%"
        :default-sort="{ prop: 'id', order: 'descending' }"
      >
        <el-table-column prop="id" label="ID" width="70" sortable />
        <el-table-column prop="username" label="操作人" min-width="100" show-overflow-tooltip />
        <el-table-column prop="action" label="操作类型" width="130">
          <template #default="{ row }">
            <el-tag :type="actionTag(row.action)" size="small">{{ actionLabel(row.action) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="method" label="方法" width="80" />
        <el-table-column prop="ip" label="来源IP" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ displayValue(row.ip) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <span :class="['status-dot', statusClass(row.status)]"></span>
            {{ statusLabel(row.status) }}
          </template>
        </el-table-column>
        <el-table-column prop="detail" label="详情" min-width="200" show-overflow-tooltip />
        <el-table-column prop="created_at" label="时间" min-width="165" sortable show-overflow-tooltip />
      </el-table>
      <div class="pager" v-if="!loading && filtered.length">
        <el-pagination
          background
          layout="total, prev, pager, next, sizes"
          :total="filtered.length"
          :page-sizes="[10, 20, 50]"
          v-model:current-page="page"
          v-model:page-size="pageSize"
        />
      </div>
    </div>

    <!-- 手机：卡片列表 -->
    <template v-else>
      <template v-if="loading && !logs.length">
        <div v-for="n in 3" :key="n" class="rec-card glass-panel">
          <el-skeleton :rows="4" animated />
        </div>
      </template>
      <el-empty v-else-if="!filtered.length" description="没有匹配的日志" />
      <template v-else>
        <article v-for="row in paged" :key="row.id" class="rec-card glass-panel">
          <header class="rec-head">
            <h3>{{ actionLabel(row.action) }}</h3>
            <span class="rec-id">#{{ row.id }}</span>
          </header>
          <dl class="rec-body">
            <div><dt>操作人</dt><dd>{{ displayValue(row.username) }}</dd></div>
            <div><dt>状态</dt><dd :class="['status-inline', statusClass(row.status)]">{{ statusLabel(row.status) }}</dd></div>
            <div><dt>方法</dt><dd>{{ displayValue(row.method) }}</dd></div>
            <div><dt>来源IP</dt><dd>{{ displayValue(row.ip) }}</dd></div>
            <div><dt>时间</dt><dd>{{ displayValue(row.created_at) }}</dd></div>
            <div v-if="row.detail"><dt>详情</dt><dd class="detail">{{ row.detail }}</dd></div>
          </dl>
        </article>
      </template>
      <div class="pager" v-if="!loading && filtered.length">
        <el-pagination
          background
          layout="prev, pager, next"
          :total="filtered.length"
          :page-sizes="[10, 20, 50]"
          v-model:current-page="page"
          v-model:page-size="pageSize"
        />
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { getAuditLogs } from '@/api'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { displayValue } from '@/utils/fields'

const { isMobile } = useBreakpoint()

const logs = ref([])
const loading = ref(false)
const actionFilter = ref('all')
const statusFilter = ref('all')
const page = ref(1)
const pageSize = ref(20)

const successCount = computed(() => logs.value.filter(l => l.status === 'success').length)
const failedCount = computed(() => logs.value.filter(l => l.status === 'failed' || l.status === 'blocked').length)
const lockedCount = computed(() => logs.value.filter(l => l.action === 'login_locked').length)

// 操作类型选项从真实数据归纳，避免接口新增动作时前端漏配
const actionOptions = computed(() => [...new Set(logs.value.map(l => l.action).filter(Boolean))])

const filtered = computed(() =>
  logs.value.filter(
    l =>
      (actionFilter.value === 'all' || l.action === actionFilter.value) &&
      (statusFilter.value === 'all' || l.status === statusFilter.value)
  )
)
const paged = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

// 筛选结果变少时，页码可能越界（如在第 3 页筛选后只剩 5 条）
watch(
  () => filtered.value.length,
  (n) => {
    if ((page.value - 1) * pageSize.value >= n) page.value = 1
  }
)

function onFilterChange() {
  page.value = 1
}

function actionLabel(a) {
  const map = {
    login: '登录',
    login_locked: '账号锁定',
    logout: '退出登录',
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
  } catch {
    logs.value = []
  } finally {
    loading.value = false
  }
}

onMounted(fetchLogs)
</script>

<style scoped lang="scss">
.page {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 12px;

  .filter-select {
    width: 168px;
  }

  .status-select {
    width: 128px;
  }
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.stat-card {
  text-align: center;
  padding: 14px 8px;

  .stat-num {
    font-size: 28px;
    font-weight: 700;
    color: var(--sc-primary);
    font-variant-numeric: tabular-nums;

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

.table-wrap {
  flex: 1;
  min-height: 320px;
  padding: 12px;
  display: flex;
  flex-direction: column;

  .skeleton {
    padding: 8px;
  }
}

.pager {
  padding-top: 12px;
  display: flex;
  justify-content: flex-end;
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

.status-inline {
  &.on { color: #42d97a; }
  &.off { color: #e85d75; }
  &.lock { color: #ffb627; }
}

/* 详情是 JSON 报文，必须允许任意位置断行，否则卡片会被撑出横向滚动 */
.detail {
  overflow-wrap: anywhere;
  text-align: left;
  font-size: 12px;
  color: var(--sc-muted);
}

@include below-desktop {
  .page {
    min-height: 100%;
  }
}

@include mobile {
  /* 4 个统计卡在 375px 下收成 2×2，数字不再被挤扁 */
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;

    .stat-num {
      font-size: 22px;
    }
  }

  .toolbar {
    :deep(.el-select),
    :deep(.el-button) {
      width: 100%;
      margin-left: 0;
    }

    .filter-select,
    .status-select {
      width: 100%;
    }
  }

  .table-wrap {
    min-height: 0;
  }

  .pager {
    justify-content: center;
  }
}
</style>
