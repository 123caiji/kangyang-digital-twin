<template>
  <div class="device-page">
    <div class="page-header">
      <h2>IoT 设备管理</h2>
      <el-button type="primary" @click="openDialog()" v-if="userStore.hasPerm('users')">
        + 注册设备
      </el-button>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-num">{{ devices.length }}</div>
        <div class="stat-label">设备总数</div>
      </div>
      <div class="stat-card">
        <div class="stat-num online">{{ onlineCount }}</div>
        <div class="stat-label">在线设备</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ typeCount }}</div>
        <div class="stat-label">设备类型</div>
      </div>
    </div>

    <el-table :data="devices" stripe class="device-table" v-loading="loading">
      <el-table-column prop="device_id" label="设备ID" width="140" />
      <el-table-column prop="device_name" label="设备名称" min-width="120" />
      <el-table-column prop="device_type" label="类型" width="130">
        <template #default="{ row }">
          <el-tag :type="typeTag(row.device_type)" size="small">{{ typeLabel(row.device_type) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="room_no" label="关联房间" width="100" />
      <el-table-column prop="resident_name" label="关联住户" width="100" />
      <el-table-column prop="zone" label="区域" width="120" />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <span :class="['status-dot', row.status === 'online' ? 'on' : 'off']"></span>
          {{ row.status === 'online' ? '在线' : '离线' }}
        </template>
      </el-table-column>
      <el-table-column prop="last_seen" label="最后在线" width="160" />
      <el-table-column label="操作" width="280" v-if="userStore.hasPerm('users')">
        <template #default="{ row }">
          <el-button size="small" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="warning" @click="onResetToken(row)">重置Token</el-button>
          <el-button size="small" type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑设备' : '注册设备'" width="500px">
      <el-form :model="deviceForm" label-width="90px">
        <el-form-item label="设备ID" v-if="!editing">
          <el-input v-model="deviceForm.device_id" placeholder="如：health-6" />
        </el-form-item>
        <el-form-item label="设备名称">
          <el-input v-model="deviceForm.device_name" placeholder="如：张三健康监测仪" />
        </el-form-item>
        <el-form-item label="设备类型">
          <el-select v-model="deviceForm.device_type" placeholder="选择类型">
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
          <el-select v-model="deviceForm.status">
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

    <el-dialog v-model="tokenDialogVisible" title="设备Token" width="500px">
      <el-alert type="warning" :closable="false" style="margin-bottom: 12px">
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
import { ref, computed, reactive } from 'vue'
import { ElMessage, ElMessageBox } from '@/plugins/element'
import { getDevices, createDevice, updateDevice, deleteDevice, resetDeviceToken } from '@/api'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
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
  } catch { /* cancel */ }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(`确认删除设备 ${row.device_name}？`, '提示', { type: 'warning' })
    await deleteDevice(row.id)
    ElMessage.success('删除成功')
    await fetchDevices()
  } catch { /* cancel */ }
}

fetchDevices()
</script>

<style scoped lang="scss">
.device-page {
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

.device-table {
  background: rgba(40, 30, 50, 0.55);
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
</style>
