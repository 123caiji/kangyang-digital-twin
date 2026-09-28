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
            <el-select v-model="form.fontFamily" style="width: 100%" @change="preview">
              <el-option label="Orbitron + 思源黑体" value='"Orbitron", "Noto Sans SC", "Microsoft YaHei", sans-serif' />
              <el-option label="DIN + 微软雅黑" value='"DIN Alternate", "Microsoft YaHei", sans-serif' />
              <el-option label="思源黑体" value='"Noto Sans SC", "Microsoft YaHei", sans-serif' />
              <el-option label="等宽终端风" value='Consolas, "Courier New", monospace' />
            </el-select>
          </el-form-item>
          <el-form-item label="字号">
            <el-slider v-model="fontSize" :min="12" :max="20" :step="1" show-input @change="onFont" />
          </el-form-item>
          <el-form-item label="默认3D主题">
            <el-select v-model="form.modelTheme" style="width: 100%" @change="preview">
              <el-option label="居室" value="room" />
              <el-option label="走廊" value="corridor" />
              <el-option label="餐厅" value="dining" />
              <el-option label="护理站" value="nursing" />
              <el-option label="康复室" value="rehab" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="save">保存样式</el-button>
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
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()
const form = reactive({ ...themeStore.settings })
const fontSize = ref(Number(themeStore.settings.fontSize || 14))

const previewStyle = computed(() => ({
  background: form.bgColor,
  color: '#e8f4ff',
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

function preview() {
  themeStore.setLocal({ ...form, fontSize: String(fontSize.value) })
}

async function save() {
  await themeStore.save({ ...form, fontSize: String(fontSize.value) })
  ElMessage.success('样式已保存')
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

<style scoped>
.page { height: 100%; }
.layout {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 14px;
  min-height: 100%;
}
.form, .preview {
  padding: 16px;
}
.val {
  margin-left: 10px;
  color: var(--sc-muted);
}
.preview-box {
  min-height: 420px;
  padding: 24px;
  border: 1px solid rgba(0, 212, 255, 0.25);
}
.preview-box h2 {
  margin: 0 0 8px;
  color: var(--p, #00d4ff);
  letter-spacing: 2px;
}
.chips {
  display: flex;
  gap: 10px;
  margin: 18px 0;
}
.chips span {
  padding: 8px 14px;
  background: var(--p, #00d4ff);
  color: #041018;
}
.chips .accent {
  background: var(--a, #00ffa3);
}
.panel-demo {
  margin-top: 20px;
  padding: 18px;
  background: var(--panel, rgba(6, 30, 60, 0.55));
  border: 1px solid rgba(0, 212, 255, 0.35);
}
@media (max-width: 1000px) {
  .layout { grid-template-columns: 1fr; }
}
</style>
