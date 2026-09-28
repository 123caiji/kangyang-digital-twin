<template>
  <div class="page page-scroll">
    <div class="toolbar glass-panel">
      <el-button type="primary" @click="openEdit()">新增连接</el-button>
    </div>

    <!-- 桌面 / 平板：表格 -->
    <div v-if="!isMobile" class="table-wrap glass-panel">
      <el-skeleton v-if="loading" :rows="5" animated class="skeleton" />
      <el-empty v-else-if="!list.length" description="暂无连接配置" />
      <el-table v-else :data="list" stripe style="width: 100%" height="100%">
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
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link @click="onTest(row)">测试</el-button>
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
      title-field="name"
      :loading="loading"
      empty-text="暂无连接配置"
    >
      <template #field="{ row, field }">
        <el-tag v-if="field.prop === 'is_active'" :type="row.is_active ? 'success' : 'info'">
          {{ row.is_active ? '是' : '否' }}
        </el-tag>
        <template v-else>{{ displayValue(row[field.prop]) }}</template>
      </template>
      <template #actions="{ row }">
        <el-button size="small" @click="openEdit(row)">编辑</el-button>
        <el-button size="small" @click="onTest(row)">测试</el-button>
        <el-button size="small" type="danger" plain @click="onDelete(row)">删除</el-button>
      </template>
    </MobileCardList>

    <el-dialog
      v-model="visible"
      :title="form.id ? '编辑连接' : '新增连接'"
      :fullscreen="isMobile"
      :width="isMobile ? '92vw' : '560px'"
    >
      <el-form :label-width="isMobile ? '86px' : '100px'">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="请输入连接名称" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" class="full">
            <el-option label="SQLite" value="sqlite" />
            <el-option label="MySQL" value="mysql" />
            <el-option label="PostgreSQL" value="postgres" />
          </el-select>
        </el-form-item>
        <el-form-item label="主机">
          <el-input v-model="form.host" placeholder="如 localhost" />
        </el-form-item>
        <el-form-item label="端口">
          <el-input-number v-model="form.port" :min="0" :max="65535" class="full" />
        </el-form-item>
        <el-form-item label="数据库">
          <el-input v-model="form.database_name" placeholder="数据库名" />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="连接用户名" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password placeholder="连接密码" />
        </el-form-item>
        <el-form-item label="设为激活">
          <el-switch v-model="form.is_active" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :loading="testing" @click="onTest(form)">测试连接</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import MobileCardList from '@/components/MobileCardList.vue'
import { createDbConfig, deleteDbConfig, getDbConfigs, testDbConfig, updateDbConfig } from '@/api'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { displayValue } from '@/utils/fields'

const { isMobile } = useBreakpoint()

// 手机卡片展示字段（主字段 name 已作为标题）
const cardFields = [
  { prop: 'type', label: '类型' },
  { prop: 'host', label: '主机' },
  { prop: 'port', label: '端口' },
  { prop: 'database_name', label: '数据库' },
  { prop: 'username', label: '用户名' },
  { prop: 'is_active', label: '激活' }
]

const list = ref([])
const visible = ref(false)
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
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
  loading.value = true
  try {
    const res = await getDbConfigs()
    list.value = res.data
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
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
  saving.value = true
  try {
    if (form.id) await updateDbConfig(form.id, payload)
    else await createDbConfig(payload)
    ElMessage.success('保存成功')
    visible.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function onTest(row) {
  testing.value = true
  try {
    const res = await testDbConfig(row)
    ElMessage.success(res.message || '测试成功')
  } finally {
    testing.value = false
  }
}

async function onDelete(row) {
  await ElMessageBox.confirm('确认删除该连接配置？', '提示', { type: 'warning' })
  await deleteDbConfig(row.id)
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
