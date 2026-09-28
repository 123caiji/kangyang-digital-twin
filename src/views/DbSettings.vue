<template>
  <div class="page page-scroll">
    <div class="toolbar glass-panel">
      <el-button type="primary" @click="openEdit()">新增连接</el-button>
    </div>
    <div class="table-wrap glass-panel">
      <el-table :data="list" stripe style="width: 100%" height="100%">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column prop="host" label="主机" min-width="120" />
        <el-table-column prop="port" label="端口" width="90" />
        <el-table-column prop="database_name" label="数据库" min-width="180" show-overflow-tooltip />
        <el-table-column prop="username" label="用户名" width="120" />
        <el-table-column label="激活" width="90">
          <template #default="{ row }">
            <el-tag :type="row.is_active ? 'success' : 'info'">{{ row.is_active ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link @click="onTest(row)">测试</el-button>
            <el-button link type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="visible" :title="form.id ? '编辑连接' : '新增连接'" width="560px">
      <el-form label-width="100px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" style="width: 100%">
            <el-option label="SQLite" value="sqlite" />
            <el-option label="MySQL" value="mysql" />
            <el-option label="PostgreSQL" value="postgres" />
          </el-select>
        </el-form-item>
        <el-form-item label="主机"><el-input v-model="form.host" /></el-form-item>
        <el-form-item label="端口"><el-input-number v-model="form.port" :min="0" :max="65535" /></el-form-item>
        <el-form-item label="数据库"><el-input v-model="form.database_name" /></el-form-item>
        <el-form-item label="用户名"><el-input v-model="form.username" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="form.password" type="password" show-password /></el-form-item>
        <el-form-item label="设为激活">
          <el-switch v-model="form.is_active" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="onTest(form)">测试连接</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createDbConfig, deleteDbConfig, getDbConfigs, testDbConfig, updateDbConfig } from '@/api'

const list = ref([])
const visible = ref(false)
const form = reactive({
  id: null,
  name: '',
  type: 'sqlite',
  host: 'localhost',
  port: 0,
  database_name: '',
  username: '',
  password: '',
  is_active: 0
})

async function load() {
  const res = await getDbConfigs()
  list.value = res.data
}

function openEdit(row) {
  if (row) Object.assign(form, { ...row, password: '' })
  else
    Object.assign(form, {
      id: null,
      name: '',
      type: 'sqlite',
      host: 'localhost',
      port: 0,
      database_name: '',
      username: '',
      password: '',
      is_active: 0
    })
  visible.value = true
}

async function save() {
  const payload = { ...form }
  if (form.id) await updateDbConfig(form.id, payload)
  else await createDbConfig(payload)
  ElMessage.success('保存成功')
  visible.value = false
  load()
}

async function onTest(row) {
  const res = await testDbConfig(row)
  ElMessage.success(res.message || '测试成功')
}

async function onDelete(row) {
  await ElMessageBox.confirm('确认删除该连接配置？', '提示')
  await deleteDbConfig(row.id)
  ElMessage.success('已删除')
  load()
}

onMounted(load)
</script>

<style scoped>
.page {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.toolbar { padding: 12px; }
.table-wrap {
  flex: 1;
  min-height: 480px;
  padding: 12px;
}
</style>
