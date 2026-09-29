<template>
  <div class="login-page">
    <div class="grid-bg"></div>
    <div class="login-card glass-panel">
      <div class="brand">
        <div class="logo" aria-hidden="true"></div>
        <h1>康养数字孪生</h1>
        <p>Kangyang Digital Twin Platform</p>
      </div>

      <div class="security-badge">
        <span class="lock-icon">&#128274;</span>
        <span>已启用安全防护 · 验证码保护 · 登录锁定</span>
      </div>

      <el-tabs v-model="loginType" class="login-tabs">
        <el-tab-pane label="账号登录" name="account" />
        <el-tab-pane label="手机号登录" name="phone" />
      </el-tabs>

      <el-form :model="form" @keyup.enter="onSubmit">
        <el-form-item v-if="loginType === 'account'">
          <el-input
            v-model="form.username"
            placeholder="用户名"
            aria-label="用户名"
            autocomplete="username"
            prefix-icon="User"
            size="large"
            :disabled="lockCountdown > 0"
          />
        </el-form-item>
        <el-form-item v-else>
          <el-input
            v-model="form.phone"
            placeholder="手机号"
            aria-label="手机号"
            autocomplete="tel"
            prefix-icon="Iphone"
            size="large"
            :disabled="lockCountdown > 0"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="密码"
            aria-label="密码"
            autocomplete="current-password"
            prefix-icon="Lock"
            size="large"
            :disabled="lockCountdown > 0"
          />
        </el-form-item>
        <el-form-item>
          <div class="captcha-row">
            <el-input
              v-model="form.captchaCode"
              placeholder="验证码"
              aria-label="验证码"
              autocomplete="off"
              prefix-icon="Key"
              size="large"
              :disabled="lockCountdown > 0"
            />
            <button type="button" class="captcha-btn" aria-label="刷新验证码" @click="refreshCaptcha" :disabled="lockCountdown > 0">
              <img v-if="captchaSvg" :src="captchaSvg" class="captcha-img" alt="图形验证码" />
              <span v-else class="captcha-loading">加载中</span>
            </button>
          </div>
        </el-form-item>

        <transition name="fade">
          <div v-if="remainAttempts !== null && remainAttempts > 0" class="warn-tip">
            &#9888; 账号或密码错误，剩余 {{ remainAttempts }} 次尝试机会
          </div>
        </transition>
        <transition name="fade">
          <div v-if="lockCountdown > 0" class="lock-tip">
            &#128274; 账号已锁定，请等待 {{ lockCountdown }} 秒后重试
          </div>
        </transition>

        <el-button
          type="primary"
          class="submit-btn"
          size="large"
          :loading="loading"
          :disabled="lockCountdown > 0"
          @click="onSubmit"
        >
          {{ lockCountdown > 0 ? `锁定中 (${lockCountdown}s)` : '进入康养孪生大屏' }}
        </el-button>
      </el-form>

      <div class="tips">
        <div>如需账号请联系管理员</div>
        <div class="security-note">本系统已启用安全防护，所有操作均被审计记录</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from '@/plugins/element'
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
const remainAttempts = ref(null)
const lockCountdown = ref(0)
let lockTimer = null

const form = reactive({
  username: '',
  phone: '',
  password: '',
  captchaCode: ''
})

async function refreshCaptcha() {
  const res = await getCaptcha()
  captchaId.value = res.data.id
  captchaSvg.value = res.data.svg
  form.captchaCode = ''
}

function startCountdown(seconds) {
  lockCountdown.value = seconds
  if (lockTimer) clearInterval(lockTimer)
  lockTimer = setInterval(() => {
    lockCountdown.value--
    if (lockCountdown.value <= 0) {
      clearInterval(lockTimer)
      lockTimer = null
      remainAttempts.value = null
      refreshCaptcha()
    }
  }, 1000)
}

async function onSubmit() {
  if (!form.captchaCode) return ElMessage.warning('请输入验证码')
  if (lockCountdown.value > 0) return
  loading.value = true
  remainAttempts.value = null
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
  } catch (err) {
    const data = err?.response?.data || err
    if (data?.remainAttempts !== undefined) {
      remainAttempts.value = data.remainAttempts
    }
    if (data?.lockUntil && data.lockUntil > 0) {
      startCountdown(data.lockUntil)
    }
    await refreshCaptcha()
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await refreshCaptcha()
  themeStore.applyCss()
})

onUnmounted(() => {
  if (lockTimer) clearInterval(lockTimer)
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

.security-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 0;
  margin-bottom: 8px;
  font-size: 11px;
  color: var(--sc-muted);
  border-bottom: 1px dashed rgba(255, 140, 66, 0.2);

  .lock-icon {
    font-size: 13px;
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
    min-width: 0;
  }
}

.captcha-btn {
  flex-shrink: 0;
  width: 130px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--sc-border);
  border-radius: 2px;
  background: rgba(20, 15, 25, 0.6);
  cursor: pointer;
  overflow: hidden;
  transition: border-color var(--dur-fast) var(--ease-standard);

  &:hover:not(:disabled) {
    border-color: var(--sc-primary);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.captcha-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.captcha-loading {
  font-size: 12px;
  color: var(--sc-muted);
}

.warn-tip {
  text-align: center;
  font-size: 12px;
  color: #ffb627;
  padding: 6px 0;
  background: rgba(255, 182, 39, 0.08);
  border-radius: 2px;
  margin-bottom: 8px;
}

.lock-tip {
  text-align: center;
  font-size: 12px;
  color: #e85d75;
  padding: 6px 0;
  background: rgba(232, 93, 117, 0.08);
  border-radius: 2px;
  margin-bottom: 8px;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
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
  text-align: center;

  .security-note {
    font-size: 11px;
    opacity: 0.7;
    margin-top: 4px;
  }
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

@include mobile {
  .login-card {
    width: 92vw;
    padding: 24px 18px 20px;
  }

  .brand {
    h1 {
      font-size: 20px;
      letter-spacing: 2px;
    }

    .logo {
      width: 46px;
      height: 46px;
    }
  }

  .captcha-btn {
    height: var(--tap-min);
    width: 118px;
  }

  .tips {
    font-size: 11px;
  }
}
</style>
