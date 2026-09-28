<template>
  <div class="card-list">
    <template v-if="loading">
      <div v-for="n in skeletonCount" :key="n" class="rec-card glass-panel">
        <el-skeleton :rows="4" animated />
      </div>
    </template>

    <el-empty v-else-if="!rows.length" :description="emptyText" />

    <template v-else>
      <article v-for="row in rows" :key="row.id" class="rec-card glass-panel">
        <header class="rec-head">
          <h3>
            <slot name="title" :row="row">{{ fallbackTitle(row) }}</slot>
          </h3>
          <span class="rec-id">#{{ row.id }}</span>
        </header>

        <dl class="rec-body">
          <div v-for="f in fields" :key="f.prop">
            <dt>{{ f.label }}</dt>
            <dd>
              <slot name="field" :row="row" :field="f">{{ displayValue(row[f.prop]) }}</slot>
            </dd>
          </div>
        </dl>

        <footer v-if="$slots.actions" class="rec-actions">
          <slot name="actions" :row="row" />
        </footer>
      </article>
    </template>
  </div>
</template>

<script setup>
import { displayValue } from '@/utils/fields'

const props = defineProps({
  /** 数据行，需含 id 字段 */
  rows: { type: Array, default: () => [] },
  /** 展示字段：[{ prop, label }]，按数组顺序渲染 */
  fields: { type: Array, default: () => [] },
  /** 标题取值字段，缺省时回退到「记录 #id」 */
  titleField: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  emptyText: { type: String, default: '暂无数据' },
  skeletonCount: { type: Number, default: 3 }
})

function fallbackTitle(row) {
  const value = props.titleField ? row[props.titleField] : null
  return value ? displayValue(value, 40) : `记录 #${row.id}`
}
</script>

<style scoped>
/* 卡片本体样式位于 global.scss 的共用套件中，此处仅负责骨架屏占位高度 */
.rec-card :deep(.el-skeleton) {
  --el-skeleton-color: rgba(255, 140, 66, 0.12);
  --el-skeleton-to-color: rgba(255, 140, 66, 0.24);
}
</style>
