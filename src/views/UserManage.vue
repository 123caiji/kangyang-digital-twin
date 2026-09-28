<template>
  <div class="page page-scroll">
    <div class="toolbar glass-panel">
      <el-button type="primary" @click="openEdit()">新增用户</el-button>
    </div>
    <div class="table-wrap glass-panel">
      <el-table :data="list" stripe height="100%" style="width: 100%">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="username" label="用户名" min-width="120" />
        <el-table-column prop="phone" label="手机号" min-width="130" />
        <el-table-column prop="role" label="角色" width="100" />
        <el-table-column label="权限" min-width="220">
          <template #default="{ row }">
            <el-tag v-for="p in row.permissions" :key="p" size="small" class="tag">{{ p }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status ? 'success' : 'info'">{{ row.status ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" min-width="160" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="visible" :title="form.id ? '编辑用户' : '新增用户'" width="560px">
      <el-form label-width="90px">
        <el-form-item label="用户名"><el-input v-model="form.username" /></el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password :placeholder="form.id ? '不修改请留空' : '必填'" />
        </el-form-item>
        <el-form-item label="手机号"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width: 100%">
            <el-option label="管理员" value="admin" />
            <el-option label="编辑员" value="editor" />
            <el-option label="访客" value="viewer" />
          </el-select>
        </el-form-item>
        <el-form-item label="权限">
          <el-checkbox-group v-model="form.permissions">
            <el-checkbox v-for="p in allPerms" :key="p" :label="p" :value="p">{{ p }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createUser, deleteUser, getUsers, updateUser } from '@/api'

const allPerms = ['dashboard', 'charts', 'data', 'users', 'settings', 'predict', 'db']
const list = ref([])
const visible = ref(false)
const form = reactive({
  id: null,
  username: '',
  password: '',
  phone: '',
  role: 'viewer',
  permissions: ['dashboard', 'charts'],
  status: 1
})

async function load() {
  const res = await getUsers()
  list.value = res.data
}

function openEdit(row) {
  if (row) {
    Object.assign(form, {
      id: row.id,
      username: row.username,
      password: '',
      phone: row.phone,
      role: row.role,
      permissions: [...(row.permissions || [])],
      status: row.status
    })
  } else {
    Object.assign(form, {
      id: null,
      username: '',
      password: '',
      phone: '',
      role: 'viewer',
      permissions: ['dashboard', 'charts'],
      status: 1
    })
  }
  visible.value = true
}

async function save() {
  const payload = {
    username: form.username,
    phone: form.phone,
    role: form.role,
    permissions: form.permissions,
    status: form.status
  }
  if (form.password) payload.password = form.password
  if (form.id) await updateUser(form.id, payload)
  else {
    if (!form.password) return ElMessage.warning('请填写密码')
    payload.password = form.password
    await createUser(payload)
  }
  ElMessage.success('保存成功')
  visible.value = false
  load()
}

async function onDelete(row) {
  await ElMessageBox.confirm(`确认删除用户 ${row.username}？`, '提示')
  await deleteUser(row.id)
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
.toolbar {
  padding: 12px;
}
.table-wrap {
  flex: 1;
  min-height: 480px;
  padding: 12px;
}
.tag {
  margin-right: 4px;
  margin-bottom: 4px;
}
</style>
