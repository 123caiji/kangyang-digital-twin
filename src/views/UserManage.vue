<template>
  <div class="page page-scroll">
    <div class="toolbar glass-panel">
      <el-button type="primary" @click="openEdit()">新增用户</el-button>
    </div>

    <!-- 桌面 / 平板：表格 -->
    <div v-if="!isMobile" class="table-wrap glass-panel">
      <el-skeleton v-if="loading" :rows="6" animated class="skeleton" />
      <el-empty v-else-if="!list.length" description="暂无用户" />
      <el-table v-else :data="list" stripe height="100%" style="width: 100%">
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
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 手机：卡片列表 -->
    <MobileCardList
      v-else
      :rows="list"
      :fields="cardFields"
      title-field="username"
      :loading="loading"
      empty-text="暂无用户"
    >
      <template #field="{ row, field }">
        <template v-if="field.prop === 'permissions'">
          <el-tag v-for="p in row.permissions" :key="p" size="small" class="tag">{{ p }}</el-tag>
        </template>
        <el-tag v-else-if="field.prop === 'status'" :type="row.status ? 'success' : 'info'">
          {{ row.status ? '启用' : '停用' }}
        </el-tag>
        <template v-else>{{ displayValue(row[field.prop]) }}</template>
      </template>
      <template #actions="{ row }">
        <el-button size="small" @click="openEdit(row)">编辑</el-button>
        <el-button size="small" type="danger" plain @click="onDelete(row)">删除</el-button>
      </template>
    </MobileCardList>

    <el-dialog
      v-model="visible"
      :title="form.id ? '编辑用户' : '新增用户'"
      :fullscreen="isMobile"
      :width="isMobile ? '92vw' : '560px'"
    >
      <el-form :label-width="isMobile ? '86px' : '90px'">
        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            :placeholder="form.id ? '不修改请留空' : '必填'"
          />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="form.phone" placeholder="请输入手机号" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" class="full">
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
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import MobileCardList from '@/components/MobileCardList.vue'
import { createUser, deleteUser, getUsers, updateUser } from '@/api'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { displayValue } from '@/utils/fields'

const { isMobile } = useBreakpoint()

const allPerms = ['dashboard', 'charts', 'data', 'users', 'settings', 'predict', 'db']
// 手机卡片展示字段（主字段 username 已作为标题）
const cardFields = [
  { prop: 'phone', label: '手机号' },
  { prop: 'role', label: '角色' },
  { prop: 'permissions', label: '权限' },
  { prop: 'status', label: '状态' },
  { prop: 'created_at', label: '创建时间' }
]

const list = ref([])
const visible = ref(false)
const loading = ref(false)
const saving = ref(false)
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
  loading.value = true
  try {
    const res = await getUsers()
    list.value = res.data
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
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
  saving.value = true
  try {
    if (form.id) {
      await updateUser(form.id, payload)
    } else {
      if (!form.password) {
        ElMessage.warning('请填写密码')
        return
      }
      payload.password = form.password
      await createUser(payload)
    }
    ElMessage.success('保存成功')
    visible.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function onDelete(row) {
  await ElMessageBox.confirm(`确认删除用户 ${row.username}？`, '提示', { type: 'warning' })
  await deleteUser(row.id)
  ElMessage.success('已删除')
  load()
}

onMounted(load)
</script>

<style scoped lang="scss">
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
  min-height: 320px;
  padding: 12px;

  .skeleton {
    padding: 8px;
  }
}

.tag {
  margin-right: 4px;
  margin-bottom: 4px;
}

.full {
  width: 100%;
}

@include below-desktop {
  .page {
    min-height: 100%;
  }
}

@include mobile {
  .toolbar {
    :deep(.el-button) {
      width: 100%;
      margin-left: 0;
    }
  }

  .table-wrap {
    min-height: 0;
  }
}
</style>
