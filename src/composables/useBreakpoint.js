import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const QUERIES = {
  mobile: '(max-width: 767.98px)',
  tablet: '(min-width: 768px) and (max-width: 1023.98px)',
  coarsePointer: '(pointer: coarse)',
  reducedMotion: '(prefers-reduced-motion: reduce)'
}

function createMediaQuery(query) {
  const mql = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : null
  const matches = ref(mql ? mql.matches : false)
  const handler = (e) => {
    matches.value = e.matches
  }

  onMounted(() => {
    if (!mql) return
    matches.value = mql.matches
    mql.addEventListener('change', handler)
  })

  onBeforeUnmount(() => {
    mql?.removeEventListener('change', handler)
  })

  return matches
}

/**
 * 断点感知。
 * 纯样式问题优先用 CSS 断点解决；只有在「必须切换 DOM 结构」时才用本 composable，
 * 例如：数据表 ↔ 卡片列表、弹窗是否全屏、画布像素比档位。
 */
export function useBreakpoint() {
  const isMobile = createMediaQuery(QUERIES.mobile)
  const isTablet = createMediaQuery(QUERIES.tablet)
  const isCoarsePointer = createMediaQuery(QUERIES.coarsePointer)
  const prefersReducedMotion = createMediaQuery(QUERIES.reducedMotion)

  const isDesktop = computed(() => !isMobile.value && !isTablet.value)

  return {
    isMobile,
    isTablet,
    isDesktop,
    isCoarsePointer,
    prefersReducedMotion
  }
}
