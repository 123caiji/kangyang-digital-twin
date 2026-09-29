<template>
  <transition name="rp">
    <div v-if="active" class="route-progress" role="progressbar" aria-label="页面加载中">
      <span class="bar"></span>
    </div>
  </transition>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'

/**
 * 路由懒加载进度条。
 *
 * 为什么需要：路由全部是 `() => import(...)`，首次进入某页要先下载 chunk；
 * 慢网或公网首屏这段时间是纯白屏，用户无法判断是卡死还是在加载。
 *
 * 为什么不用假进度算法：真实下载进度拿不到，用 CSS 无限动画表达「进行中」比
 * 伪造 0→90% 更诚实。关键是延迟 120ms 再出现 —— chunk 命中缓存时不应该闪一下。
 */
const router = useRouter()
const active = ref(false)
let timer = 0

const show = () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    active.value = true
  }, 120)
}

const hide = () => {
  clearTimeout(timer)
  active.value = false
}

const offBefore = router.beforeEach((to, from) => {
  // 仅切换不同页面时才提示；同一路由刷新参数不算换页
  if (to.path !== from.path) show()
  return true
})
const offAfter = router.afterEach(hide)
// 守卫里 next(false) 或路由报错时，afterEach 不会跑，这里兜底关掉
const offError = router.onError(hide)

onBeforeUnmount(() => {
  clearTimeout(timer)
  offBefore()
  offAfter()
  offError()
})
</script>

<style scoped>
.route-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  /* 顶栏各级'=2000，这里必须更高才压得住 */
  z-index: 2100;
  overflow: hidden;
  pointer-events: none;

  .bar {
    display: block;
    width: 40%;
    height: 100%;
    border-radius: 0 2px 2px 0;
    background: linear-gradient(90deg, var(--sc-primary), var(--sc-accent));
    box-shadow: 0 0 8px rgba(255, 140, 66, 0.8);
    animation: rp-slide 0.9s ease-in-out infinite;
  }
}

@keyframes rp-slide {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(350%);
  }
}

.rp-enter-active,
.rp-leave-active {
  transition: opacity 0.15s linear;
}

.rp-enter-from,
.rp-leave-to {
  opacity: 0;
}

/* 尊重系统减弱动效：进度条本体保留（它是状态反馈而非装饰），只停住滑动动画 */
@media (prefers-reduced-motion: reduce) {
  .route-progress .bar {
    animation: none;
    width: 100%;
  }
}
</style>
