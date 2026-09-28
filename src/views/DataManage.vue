<template>
  <div class="page page-scroll">
    <div class="toolbar glass-panel">
      <el-select v-model="table" class="filter-select" aria-label="选择数据表" @change="onTableChange">
        <el-option v-for="t in tables" :key="t.key" :label="t.label" :value="t.key" />
      </el-select>
      <el-input
        v-model="keyword"
        class="filter-input"
        placeholder="关键词搜索"
        aria-label="关键词搜索"
        clearable
        @keyup.enter="search"
      />
      <el-button type="primary" @click="search">查询</el-button>
      <el-button type="success" @click="openEdit()">新增</el-button>
      <el-button :loading="exporting" @click="onExport">导出Excel</el-button>
      <el-upload :show-file-list="false" :http-request="onImport" accept=".xlsx,.xls">
        <el-button :loading="importing">导入Excel</el-button>
      </el-upload>
    </div>

    <!-- 桌面 / 平板：表格 -->
    <div v-if="!isMobile" class="table-wrap glass-panel">
      <el-skeleton v-if="loading" :rows="6" animated class="skeleton" />
      <el-empty v-else-if="!list.length" description="没有匹配的数据" />
      <el-table v-else :data="list" stripe height="100%" style="width: 100%">
        <el-table-column
          v-for="col in columns"
          :key="col"
          :prop="col"
          :label="fieldLabel(col)"
          min-width="120"
          show-overflow-tooltip
        />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager" v-if="!loading && list.length">
        <el-pagination
          background
          :layout="paginationLayout"
          :total="total"
          v-model:current-page="page"
          v-model:page-size="pageSize"
          @current-change="load"
          @size-change="load"
        />
      </div>
    </div>

    <!-- 手机：卡片列表，避免宽表横向溢出 -->
    <div v-else class="card-list">
      <template v-if="loading">
        <div v-for="n in 3" :key="n" class="rec-card glass-panel">
          <el-skeleton :rows="4" animated />
        </div>
      </template>
      <el-empty v-else-if="!list.length" description="没有匹配的数据" />
      <template v-else>
        <article v-for="row in list" :key="row.id" class="rec-card glass-panel">
          <header class="rec-head">
            <h3>{{ primaryTitle(row) }}</h3>
            <span class="rec-id">#{{ row.id }}</span>
          </header>
          <dl class="rec-body">
            <div v-for="col in cardColumns" :key="col">
              <dt>{{ fieldLabel(col) }}</dt>
              <dd>{{ displayValue(row[col]) }}</dd>
            </div>
          </dl>
          <footer class="rec-actions">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" plain @click="onDelete(row)">删除</el-button>
          </footer>
        </article>
      </template>
      <div class="pager" v-if="!loading && list.length">
        <el-pagination
          background
          :layout="paginationLayout"
          :total="total"
          v-model:current-page="page"
          v-model:page-size="pageSize"
          @current-change="load"
          @size-change="load"
        />
      </div>
    </div>

    <el-dialog
      v-model="visible"
      :title="form.id ? '编辑数据' : '新增数据'"
      :fullscreen="isMobile"
      :width="isMobile ? '92vw' : '560px'"
    >
      <el-form :label-width="isMobile ? '86px' : '110px'">
        <el-form-item v-for="col in writable" :key="col" :label="fieldLabel(col)">
          <el-input v-model="form[col]" :placeholder="`请输入${fieldLabel(col)}`" />
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
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { saveAs } from 'file-saver'
import {
  createRow,
  deleteRow,
  exportTable,
  getTableData,
  getTables,
  importTable,
  updateRow
} from '@/api'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { displayValue, fieldLabel, primaryField } from '@/utils/fields'

const { isMobile } = useBreakpoint()

const tables = ref([])
const table = ref('residents')
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const visible = ref(false)
const form = reactive({})
const loading = ref(false)
const saving = ref(false)
const exporting = ref(false)
const importing = ref(false)

const currentMeta = computed(() => tables.value.find((t) => t.key === table.value))
const columns = computed(() => currentMeta.value?.columns || [])
const writable = computed(() => (currentMeta.value?.columns || []).filter((c) => c !== 'id' && c !== 'created_at'))
const primaryKey = computed(() => primaryField(columns.value))
// 卡片里主字段已作为标题，其余字段按列顺序展示（不裁剪任何数据）
const cardColumns = computed(() => columns.value.filter((c) => c !== 'id' && c !== primaryKey.value))
// 窄屏分页去掉每页条数下拉，减少拥挤
const paginationLayout = computed(() => (isMobile.value ? 'prev, pager, next' : 'total, prev, pager, next, sizes'))

function primaryTitle(row) {
  const key = primaryKey.value
  const value = key ? row[key] : null
  return value ? displayValue(value, 40) : `记录 #${row.id}`
}

async function loadTables() {
  const res = await getTables()
  tables.value = res.data
  if (!tables.value.find((t) => t.key === table.value) && tables.value[0]) {
    table.value = tables.value[0].key
  }
}

async function load() {
  loading.value = true
  try {
    const res = await getTableData(table.value, {
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value
    })
    list.value = res.data.list
    total.value = res.data.total
  } catch {
    list.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  load()
}

function onTableChange() {
  keyword.value = ''
  search()
}

function openEdit(row) {
  Object.keys(form).forEach((k) => delete form[k])
  if (row) Object.assign(form, { ...row })
  else writable.value.forEach((c) => (form[c] = ''))
  visible.value = true
}

async function save() {
  const payload = {}
  writable.value.forEach((c) => {
    if (form[c] !== undefined) payload[c] = form[c]
  })
  saving.value = true
  try {
    if (form.id) await updateRow(table.value, form.id, payload)
    else await createRow(table.value, payload)
    ElMessage.success('保存成功')
    visible.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function onDelete(row) {
  await ElMessageBox.confirm('确认删除该记录？', '提示', { type: 'warning' })
  await deleteRow(table.value, row.id)
  ElMessage.success('已删除')
  load()
}

async function onExport() {
  exporting.value = true
  try {
    const res = await exportTable(table.value)
    saveAs(new Blob([res]), `${table.value}.xlsx`)
  } finally {
    exporting.value = false
  }
}

async function onImport({ file }) {
  importing.value = true
  try {
    await importTable(table.value, file)
    ElMessage.success('导入完成')
    load()
  } finally {
    importing.value = false
  }
}

onMounted(async () => {
  await loadTables()
  await load()
})
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
    width: 180px;
  }

  .filter-input {
    width: 220px;
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

/* ---------- 手机卡片列表 ----------
   卡片视觉与按钮尺寸来自 global.scss 共用套件
   （.card-list / .rec-card / .rec-head / .rec-body / .rec-actions） */

/* ---------- 断点适配 ---------- */
@include below-desktop {
  .page {
    min-height: 100%;
  }
}

@include mobile {
  .toolbar {
    flex-direction: column;
    align-items: stretch;

    .filter-select,
    .filter-input {
      width: 100%;
    }

    :deep(.el-button) {
      width: 100%;
      margin-left: 0;
    }

    :deep(.el-upload) {
      width: 100%;
      display: block;
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
