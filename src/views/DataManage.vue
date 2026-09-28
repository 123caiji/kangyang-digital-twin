<template>
  <div class="page page-scroll">
    <div class="toolbar glass-panel">
      <el-select v-model="table" style="width: 180px" @change="load">
        <el-option v-for="t in tables" :key="t.key" :label="t.label" :value="t.key" />
      </el-select>
      <el-input v-model="keyword" placeholder="关键词搜索" clearable style="width: 220px" @keyup.enter="load" />
      <el-button type="primary" @click="load">查询</el-button>
      <el-button type="success" @click="openEdit()">新增</el-button>
      <el-button @click="onExport">导出Excel</el-button>
      <el-upload :show-file-list="false" :http-request="onImport" accept=".xlsx,.xls">
        <el-button>导入Excel</el-button>
      </el-upload>
    </div>

    <div class="table-wrap glass-panel">
      <el-table :data="list" stripe height="100%" style="width: 100%">
        <el-table-column
          v-for="col in columns"
          :key="col"
          :prop="col"
          :label="col"
          min-width="120"
          show-overflow-tooltip
        />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          background
          layout="total, prev, pager, next, sizes"
          :total="total"
          v-model:current-page="page"
          v-model:page-size="pageSize"
          @current-change="load"
          @size-change="load"
        />
      </div>
    </div>

    <el-dialog v-model="visible" :title="form.id ? '编辑数据' : '新增数据'" width="560px">
      <el-form label-width="110px">
        <el-form-item v-for="col in writable" :key="col" :label="col">
          <el-input v-model="form[col]" />
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

const tables = ref([])
const table = ref('city_metrics')
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const visible = ref(false)
const form = reactive({})

const currentMeta = computed(() => tables.value.find((t) => t.key === table.value))
const columns = computed(() => currentMeta.value?.columns || [])
const writable = computed(() => (currentMeta.value?.columns || []).filter((c) => c !== 'id' && c !== 'created_at'))

async function loadTables() {
  const res = await getTables()
  tables.value = res.data
  if (!tables.value.find((t) => t.key === table.value) && tables.value[0]) {
    table.value = tables.value[0].key
  }
}

async function load() {
  const res = await getTableData(table.value, {
    page: page.value,
    pageSize: pageSize.value,
    keyword: keyword.value
  })
  list.value = res.data.list
  total.value = res.data.total
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
  if (form.id) await updateRow(table.value, form.id, payload)
  else await createRow(table.value, payload)
  ElMessage.success('保存成功')
  visible.value = false
  load()
}

async function onDelete(row) {
  await ElMessageBox.confirm('确认删除该记录？', '提示')
  await deleteRow(table.value, row.id)
  ElMessage.success('已删除')
  load()
}

async function onExport() {
  const res = await exportTable(table.value)
  saveAs(new Blob([res]), `${table.value}.xlsx`)
}

async function onImport({ file }) {
  await importTable(table.value, file)
  ElMessage.success('导入完成')
  load()
}

onMounted(async () => {
  await loadTables()
  await load()
})
</script>

<style scoped>
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
.table-wrap {
  flex: 1;
  min-height: 480px;
  padding: 12px;
  display: flex;
  flex-direction: column;
}
.pager {
  padding-top: 12px;
  display: flex;
  justify-content: flex-end;
}
</style>
