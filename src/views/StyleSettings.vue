<template>
  <div class="page page-scroll">
    <div class="layout">
      <div class="form glass-panel">
        <div class="panel-title">系统样式设置</div>
        <el-form label-width="110px">
          <el-form-item label="系统标题">
            <el-input v-model="form.headerTitle" />
          </el-form-item>
          <el-form-item label="主题名称">
            <el-input v-model="form.themeName" />
          </el-form-item>
          <el-form-item label="主色">
            <el-color-picker v-model="form.primaryColor" @change="preview" />
            <span class="val">{{ form.primaryColor }}</span>
          </el-form-item>
          <el-form-item label="强调色">
            <el-color-picker v-model="form.accentColor" @change="preview" />
            <span class="val">{{ form.accentColor }}</span>
          </el-form-item>
          <el-form-item label="背景色">
            <el-color-picker v-model="form.bgColor" @change="preview" />
            <span class="val">{{ form.bgColor }}</span>
          </el-form-item>
          <el-form-item label="面板背景">
            <el-input v-model="form.panelBg" @change="preview" placeholder="支持 rgba()" />
          </el-form-item>
          <el-form-item label="字体">
            <el-select v-model="form.fontFamily" class="full" aria-label="字体" @change="preview">
              <el-option label="Orbitron + 思源黑体" value='"Orbitron", "Noto Sans SC", "Microsoft YaHei", sans-serif' />
              <el-option label="DIN + 微软雅黑" value='"DIN Alternate", "Microsoft YaHei", sans-serif' />
              <el-option label="思源黑体" value='"Noto Sans SC", "Microsoft YaHei", sans-serif' />
              <el-option label="等宽终端风" value='Consolas, "Courier New", monospace' />
            </el-select>
          </el-form-item>
          <ParamSlider v-model="fontSize" label="字号(px)" :min="12" :max="20" :step="1" :compact="isMobile" />
          <el-form-item label="默认3D主题">
            <el-select v-model="form.modelTheme" class="full" aria-label="默认三维主题" @change="preview">
              <el-option label="居室" value="room" />
              <el-option label="走廊" value="corridor" />
              <el-option label="餐厅" value="dining" />
              <el-option label="护理站" value="nursing" />
              <el-option label="康复室" value="rehab" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="save">保存样式</el-button>
            <el-button @click="reset">恢复默认</el-button>
          </el-form-item>
        </el-form>
      </div>

      <div class="preview glass-panel">
        <div class="panel-title">实时预览</div>
        <div class="preview-box" :style="previewStyle">
          <h2>{{ form.headerTitle }}</h2>
          <p>主题：{{ form.themeName }}</p>
          <div class="chips">
            <span>主色块</span>
            <span class="accent">强调色块</span>
          </div>
          <div class="panel-demo">透明面板示意 · Digital Twin</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from '@/plugins/element'
import ParamSlider from '@/components/ParamSlider.vue'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useThemeStore } from '@/stores/theme'

const { isMobile } = useBreakpoint()
const themeStore = useThemeStore()
const form = reactive({ ...themeStore.settings })
const fontSize = ref(Number(themeStore.settings.fontSize || 14))
const saving = ref(false)

const previewStyle = computed(() => ({
  background: form.bgColor,
  color: '#e8d4c8',
  fontFamily: form.fontFamily,
  fontSize: `${fontSize.value}px`,
  '--p': form.primaryColor,
  '--a': form.accentColor,
  '--panel': form.panelBg
}))

function onFont() {
  form.fontSize = String(fontSize.value)
  preview()
}

// 用 watch 而非事件回调，避免与 v-model 的更新顺序产生歧义
watch(fontSize, onFont)

function preview() {
  themeStore.setLocal({ ...form, fontSize: String(fontSize.value) })
}

async function save() {
  saving.value = true
  try {
    await themeStore.save({ ...form, fontSize: String(fontSize.value) })
    ElMessage.success('样式已保存')
  } finally {
    saving.value = false
  }
}

function reset() {
  Object.assign(form, {
    themeName: '康养暖橙',
    primaryColor: '#ff8c42',
    accentColor: '#ffb627',
    bgColor: '#1a1a2e',
    panelBg: 'rgba(45, 35, 55, 0.58)',
    fontFamily: '"Noto Sans SC", "Microsoft YaHei", sans-serif',
    fontSize: '14',
    chartTheme: 'dark',
    modelTheme: 'room',
    headerTitle: '康养数字孪生平台'
  })
  fontSize.value = 14
  preview()
}

onMounted(() => {
  Object.assign(form, themeStore.settings)
  fontSize.value = Number(themeStore.settings.fontSize || 14)
})
</script>

<style scoped lang="scss">
.page {
  height: 100%;
}
.layout {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 14px;
  min-height: 100%;
}
.form,
.preview {
  padding: 16px;
}
.val {
  margin-left: 10px;
  color: var(--sc-muted);
  overflow-wrap: anywhere;
}
.preview-box {
  min-height: 420px;
  padding: 24px;
  border: 1px solid rgba(255, 140, 66, 0.25);
}
.preview-box h2 {
  margin: 0 0 8px;
  color: var(--p, #ff8c42);
  letter-spacing: 2px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 18px 0;
}
.chips span {
  padding: 8px 14px;
  background: var(--p, #ff8c42);
  color: #1a1428;
}
.chips .accent {
  background: var(--a, #ffb627);
}
.panel-demo {
  margin-top: 20px;
  padding: 18px;
  background: var(--panel, rgba(40, 30, 50, 0.55));
  border: 1px solid rgba(255, 140, 66, 0.35);
}
.full {
  width: 100%;
}

@include below-desktop {
  .page {
    min-height: 100%;
  }

  /* 预览面板下沉到表单下方，窄屏不再左右挤 */
  .layout {
    grid-template-columns: 1fr;
  }
}

@include mobile {
  .form,
  .preview {
    padding: 12px;
  }

  .preview-box {
    min-height: 240px;
    padding: 16px;
  }

  .preview-box h2 {
    font-size: 18px;
    letter-spacing: 1px;
  }

  /* 颜色选择器默认 32×32，触控偏小 */
  :deep(.el-color-picker__trigger) {
    width: var(--tap-min);
    height: var(--tap-min);
    padding: 6px;
  }

  .val {
    display: block;
    margin: 4px 0 0;
    font-size: 12px;
  }
}
</style>
