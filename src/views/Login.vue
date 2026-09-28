<template>
  <div class="login-page">
    <div class="grid-bg"></div>
    <div class="login-card glass-panel">
      <div class="brand">
        <div class="logo"></div>
        <h1>康养数字孪生</h1>
        <p>Kangyang Digital Twin Platform</p>
      </div>

      <el-tabs v-model="loginType" class="login-tabs">
        <el-tab-pane label="账号登录" name="account" />
        <el-tab-pane label="手机号登录" name="phone" />
      </el-tabs>

      <el-form :model="form" @keyup.enter="onSubmit">
        <el-form-item v-if="loginType === 'account'">
          <el-input v-model="form.username" placeholder="用户名" prefix-icon="User" size="large" />
        </el-form-item>
        <el-form-item v-else>
          <el-input v-model="form.phone" placeholder="手机号" prefix-icon="Iphone" size="large" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="form.password" type="password" show-password placeholder="密码" prefix-icon="Lock" size="large" />
        </el-form-item>
        <el-form-item>
          <div class="captcha-row">
            <el-input v-model="form.captchaCode" placeholder="验证码" prefix-icon="Key" size="large" />
            <img :src="captchaSvg" class="captcha-img" alt="captcha" title="点击刷新" @click="refreshCaptcha" />
          </div>
        </el-form-item>
        <el-button type="primary" class="submit-btn" size="large" :loading="loading" @click="onSubmit">
          进入康养孪生大屏
        </el-button>
      </el-form>

      <div class="tips">
        <div>演示账号：admin / admin123（全部权限）</div>
        <div>editor / editor123 · viewer / viewer123</div>
        <div>手机号示例：13800000001</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getCaptcha } from '@/api'
import { useUserStore } from '@/stores/user'
import { useThemeStore } from '@/stores/theme'

const router = useRouter()
const userStore = useUserStore()
const themeStore = useThemeStore()

const loginType = ref('account')
const loading = ref(false)
const captchaId = ref('')
const captchaSvg = ref('')
const form = reactive({
  username: 'admin',
  phone: '13800000001',
  password: 'admin123',
  captchaCode: ''
})

async function refreshCaptcha() {
  const res = await getCaptcha()
  captchaId.value = res.data.id
  captchaSvg.value = res.data.svg
  form.captchaCode = ''
}

async function onSubmit() {
  if (!form.captchaCode) return ElMessage.warning('请输入验证码')
  loading.value = true
  try {
    await userStore.login({
      loginType: loginType.value,
      username: form.username,
      phone: form.phone,
      password: form.password,
      captchaId: captchaId.value,
      captchaCode: form.captchaCode
    })
    await themeStore.load()
    ElMessage.success('登录成功')
    router.push('/dashboard')
  } catch {
    await refreshCaptcha()
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await refreshCaptcha()
  themeStore.applyCss()
})
</script>

<style scoped lang="scss">
.login-page {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  background:
    radial-gradient(ellipse at 20% 20%, rgba(255, 140, 66, 0.18), transparent 45%),
    radial-gradient(ellipse at 80% 70%, rgba(255, 182, 39, 0.12), transparent 40%),
    linear-gradient(160deg, #1a1428 0%, #2a1f35 45%, #1a1a2e 100%);
}

.grid-bg {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 140, 66, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 140, 66, 0.06) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(circle at center, black 30%, transparent 75%);
  pointer-events: none;
}

.login-card {
  position: relative;
  width: min(440px, 92vw);
  padding: 36px 32px 28px;
  border-radius: 4px;
  z-index: 1;
}

.brand {
  text-align: center;
  margin-bottom: 12px;

  .logo {
    width: 56px;
    height: 56px;
    margin: 0 auto 12px;
    background:
      linear-gradient(135deg, transparent 45%, var(--sc-primary) 45%, var(--sc-primary) 55%, transparent 55%),
      linear-gradient(45deg, transparent 40%, var(--sc-accent) 40%, var(--sc-accent) 48%, transparent 48%);
    border: 2px solid var(--sc-primary);
    clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
    box-shadow: 0 0 24px rgba(255, 140, 66, 0.35);
  }

  h1 {
    margin: 0;
    font-size: 24px;
    letter-spacing: 3px;
    color: var(--sc-primary);
  }

  p {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--sc-muted);
    letter-spacing: 1px;
  }
}

.login-tabs {
  margin-bottom: 8px;
}

.captcha-row {
  display: flex;
  gap: 10px;
  width: 100%;

  .el-input {
    flex: 1;
  }
}

.captcha-img {
  width: 120px;
  height: 40px;
  border: 1px solid var(--sc-border);
  cursor: pointer;
  border-radius: 2px;
}

.submit-btn {
  width: 100%;
  letter-spacing: 2px;
  background: linear-gradient(90deg, #cc6622, #ff8c42) !important;
  border: 1px solid var(--sc-primary) !important;
}

.tips {
  margin-top: 18px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--sc-muted);
  border-top: 1px dashed rgba(255, 140, 66, 0.25);
  padding-top: 12px;
}

:deep(.el-tabs__item) {
  color: var(--sc-muted);
}
:deep(.el-tabs__item.is-active) {
  color: var(--sc-primary);
}
:deep(.el-tabs__active-bar) {
  background: var(--sc-primary);
}
:deep(.el-tabs__nav-wrap::after) {
  background: rgba(255, 140, 66, 0.2);
}
</style>
