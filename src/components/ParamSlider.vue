<template>
  <el-form-item>
    <template #label>
      <span class="param-label">
        {{ label }}
        <!-- 窄屏隐藏 el-input-number（其加减按钮高度不足 22px，触控不友好），改在标签处显示当前值 -->
        <b v-if="compact" class="param-value">{{ display }}</b>
      </span>
    </template>
    <el-slider
      :model-value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      :show-input="!compact"
      :aria-label="label"
      @update:model-value="$emit('update:modelValue', $event)"
    />
  </el-form-item>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Number, required: true },
  label: { type: String, required: true },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  /** 窄屏模式：不显示数字输入框，值并入标签 */
  compact: { type: Boolean, default: false },
  unit: { type: String, default: '' }
})

defineEmits(['update:modelValue'])

const display = computed(() =>
  props.unit ? `${props.modelValue}${props.unit}` : String(props.modelValue)
)
</script>

<style scoped>
.param-label {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
}

.param-value {
  color: var(--sc-accent);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
