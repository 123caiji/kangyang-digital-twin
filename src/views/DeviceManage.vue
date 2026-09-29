<template>
  <div class="page page-scroll">
    <div class="toolbar glass-panel">
      <el-button type="primary" @click="openDialog()" v-if="userStore.hasPerm('users')">
        + 注册设备
      </el-button>
      <el-button :loading="loading" @click="fetchDevices">刷新</el-button>
    </div>

    <div class="stats-row">
      <div class="stat-card glass-panel">
        <div class="stat-num">{{ devices.length }}</div>
        <div class="stat-label">设备总数</div>
      </div>
      <div class="stat-card glass-panel">
        <div class="stat-num online">{{ onlineCount }}</div>
        <div class="stat-label">在线设备</div>
      </div>
      <div class="stat-card glass-panel">
        <div class="stat-num">{{ typeCount }}</div>
        <div class="stat-label">设备类型</div>
      </div>
    </div>

    <!-- 桌面 / 平板：表格 -->
    <div v-if="!isMobile" class="table-wrap glass-panel">
      <el-skeleton v-if="loading && !devices.length" :rows="6" animated class="skeleton" />
      <el-empty v-else-if="!devices.length" description="暂无设备，点击「注册设备」添加" />
      <el-table v-else :data="devices" stripe height="100%" style="width: 100%">
        <el-table-column prop="device_id" label="设备ID" width="130" show-overflow-tooltip />
        <el-table-column prop="device_name" label="设备名称" min-width="130" show-overflow-tooltip />
        <el-table-column prop="device_type" label="类型" width="105">
          <template #default="{ row }">
            <el-tag :type="typeTag(row.device_type)" size="small">{{ typeLabel(row.device_type) }}</el-tag>
          </template>
        </el-table-column>
        <!-- 状态是巡检时最关心的信息，排在关联信息之前，窄桌面下不进横向滚动区 -->
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <span :class="['status-dot', row.status === 'online' ? 'on' : 'off']"></span>
            {{ row.status === 'online' ? '在线' : '离线' }}
          </template>
        </el-table-column>
        <el-table-column prop="room_no" label="关联房间" min-width="90">
          <template #default="{ row }">{{ displayValue(row.room_no) }}</template>
        </el-table-column>
        <el-table-column prop="resident_name" label="关联住户" min-width="90">
          <template #default="{ row }">{{ displayValue(row.resident_name) }}</template>
        </el-table-column>
        <el-table-column prop="zone" label="区域" min-width="110" show-overflow-tooltip>
          <template #default="{ row }">{{ displayValue(row.zone) }}</template>
        </el-table-column>
        <el-table-column prop="last_seen" label="最后在线" min-width="155">
          <template #default="{ row }">{{ displayValue(row.last_seen) }}</template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="186"
          fixed="right"
          v-if="userStore.hasPerm('users')"
        >
          <template #default="{ row }">
            <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
            <el-button link type="warning" @click="onResetToken(row)">重置Token</el-button>
            <el-button link type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 手机：卡片列表，避免宽表横向溢出 -->
    <MobileCardList
      v-else
      :rows="devices"
      :fields="cardFields"
      title-field="device_name"
      :loading="loading"
      empty-text="暂无设备"
    >
      <template #field="{ row, field }">
        <el-tag
          v-if="field.prop === 'device_type'"
          :type="typeTag(row.device_type)"
          size="small"
        >
          {{ typeLabel(row.device_type) }}
        </el-tag>
        <span v-else-if="field.prop === 'status'" :class="['status-inline', row.status === 'online' ? 'on' : 'off']">
          {{ row.status === 'online' ? '在线' : '离线' }}
        </span>
        <template v-else>{{ displayValue(row[field.prop]) }}</template>
      </template>
      <template #actions="{ row }" v-if="userStore.hasPerm('users')">
        <el-button size="small" @click="openDialog(row)">编辑</el-button>
        <el-button size="small" type="warning" plain @click="onResetToken(row)">重置Token</el-button>
        <el-button size="small" type="danger" plain @click="onDelete(row)">删除</el-button>
      </template>
    </MobileCardList>

    <el-dialog
      v-model="dialogVisible"
      :title="editing ? '编辑设备' : '注册设备'"
      :fullscreen="isMobile"
      :width="isMobile ? '92vw' : '520px'"
    >
      <el-form :model="deviceForm" :label-width="isMobile ? '86px' : '96px'">
        <el-form-item label="设备ID" v-if="!editing" required>
          <el-input v-model="deviceForm.device_id" placeholder="如：health-6" />
        </el-form-item>
        <el-form-item label="设备名称" required>
          <el-input v-model="deviceForm.device_name" placeholder="如：张三健康监测仪" />
        </el-form-item>
        <el-form-item label="设备类型">
          <el-select v-model="deviceForm.device_type" placeholder="选择类型" class="full">
            <el-option label="健康监测仪" value="health_monitor" />
            <el-option label="环境监测" value="environment" />
            <el-option label="室外气象站" value="weather" />
            <el-option label="土壤监测" value="soil" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联房间">
          <el-input v-model="deviceForm.room_no" placeholder="如：101" />
        </el-form-item>
        <el-form-item label="关联住户ID">
          <el-input v-model="deviceForm.resident_id" placeholder="数字" type="number" />
        </el-form-item>
        <el-form-item label="区域">
          <el-input v-model="deviceForm.zone" placeholder="如：康养花园A区" />
        </el-form-item>
        <el-form-item label="状态" v-if="editing">
          <el-select v-model="deviceForm.status" class="full">
            <el-option label="在线" value="online" />
            <el-option label="离线" value="offline" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="onSave" :loading="saving">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="tokenDialogVisible"
      title="设备Token"
      :fullscreen="isMobile"
      :width="isMobile ? '92vw' : '520px'"
    >
      <el-alert type="warning" :closable="false" class="token-alert">
        请妥善保存Token，关闭后不再显示。设备上报数据时需在请求头携带此Token。
      </el-alert>
      <el-input v-model="newToken" readonly type="textarea" :rows="3" />
      <template #footer>
        <el-button @click="tokenDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from '@/plugins/element'
import MobileCardList from '@/components/MobileCardList.vue'
import { getDevices, createDevice, updateDevice, deleteDevice, resetDeviceToken } from '@/api'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useUserStore } from '@/stores/user'
import { displayValue } from '@/utils/fields'

const { isMobile } = useBreakpoint()
const userStore = useUserStore()

// 手机卡片展示字段（主字段 device_name 已作为标题）
const cardFields = [
  { prop: 'device_id', label: '设备ID' },
  { prop: 'device_type', label: '类型' },
  { prop: 'room_no', label: '关联房间' },
  { prop: 'resident_name', label: '关联住户' },
  { prop: 'zone', label: '区域' },
  { prop: 'status', label: '状态' },
  { prop: 'last_seen', label: '最后在线' }
]

const devices = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const tokenDialogVisible = ref(false)
const saving = ref(false)
const editing = ref(false)
const newToken = ref('')
const deviceForm = reactive({
  id: null,
  device_id: '',
  device_name: '',
  device_type: 'health_monitor',
  room_no: '',
  resident_id: '',
  zone: '',
  status: 'online'
})

const onlineCount = computed(() => devices.value.filter(d => d.status === 'online').length)
const typeCount = computed(() => new Set(devices.value.map(d => d.device_type)).size)

function typeLabel(t) {
  const map = { health_monitor: '健康监测', environment: '环境监测', weather: '气象站', soil: '土壤监测' }
  return map[t] || t
}

function typeTag(t) {
  const map = { health_monitor: 'danger', environment: 'success', weather: 'warning', soil: 'info' }
  return map[t] || ''
}

async function fetchDevices() {
  loading.value = true
  try {
    const res = await getDevices()
    devices.value = res.data || []
  } catch {
    devices.value = []
  } finally {
    loading.value = false
  }
}

function openDialog(row) {
  if (row) {
    editing.value = true
    Object.assign(deviceForm, row)
  } else {
    editing.value = false
    Object.assign(deviceForm, {
      id: null, device_id: '', device_name: '', device_type: 'health_monitor',
      room_no: '', resident_id: '', zone: '', status: 'online'
    })
  }
  dialogVisible.value = true
}

async function onSave() {
  if (!editing.value && !deviceForm.device_id.trim()) {
    ElMessage.warning('请填写设备ID')
    return
  }
  if (!deviceForm.device_name.trim()) {
    ElMessage.warning('请填写设备名称')
    return
  }
  saving.value = true
  try {
    if (editing.value) {
      await updateDevice(deviceForm.id, deviceForm)
      ElMessage.success('更新成功')
    } else {
      const res = await createDevice(deviceForm)
      ElMessage.success('设备注册成功')
      if (res.data?.device_token) {
        newToken.value = res.data.device_token
        tokenDialogVisible.value = true
      }
    }
    dialogVisible.value = false
    await fetchDevices()
  } finally {
    saving.value = false
  }
}

async function onResetToken(row) {
  try {
    await ElMessageBox.confirm(`确认重置设备 ${row.device_name} 的Token？`, '提示', { type: 'warning' })
    const res = await resetDeviceToken(row.id)
    newToken.value = res.data.device_token
    tokenDialogVisible.value = true
    ElMessage.success('Token已重置')
  } catch (e) {
    if (e !== 'cancel' && e?.message) ElMessage.error(String(e.message).slice(0, 80))
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(`确认删除设备 ${row.device_name}？`, '提示', { type: 'warning' })
    await deleteDevice(row.id)
    ElMessage.success('删除成功')
    await fetchDevices()
  } catch (e) {
    if (e !== 'cancel' && e?.message) ElMessage.error(String(e.message).slice(0, 80))
  }
}

onMounted(fetchDevices)
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
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
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

    &.online {
      color: #42d97a;
    }
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

.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;

  &.on {
    background: #42d97a;
    box-shadow: 0 0 6px #42d97a;
  }

  &.off {
    background: #888;
  }
}

/* 卡片里的状态：与表格圆点同色系，但不依赖绝对定位 */
.status-inline {
  &.on { color: #42d97a; }
  &.off { color: var(--sc-muted); }
}

.full {
  width: 100%;
}

.token-alert {
  margin-bottom: 12px;
}

@include below-desktop {
  .page {
    min-height: 100%;
  }
}

@include mobile {
  /* 3 个统计卡在 375px 下改为两行布局，避免数字被压扁 */
  .stats-row {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;

    .stat-num {
      font-size: 22px;
    }
  }

  .table-wrap {
    min-height: 0;
  }
}
</style>
