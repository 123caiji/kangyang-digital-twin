/**
 * 响应式与交互体验实测脚手架（before / after 通用）
 *
 * 用法:
 *   node scripts/responsive-audit.mjs --tag before
 *   node scripts/responsive-audit.mjs --tag after --viewports 375,768,1440
 *
 * 产出:
 *   .audit/<tag>/report.json      结构化指标
 *   .audit/<tag>/<viewport>/<page>.png  逐页截图
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire('file:///C:/Users/xianyv/.workbuddy/binaries/node/workspace/')
const puppeteer = require('puppeteer-core')

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:5173'
const API = process.env.AUDIT_API || 'http://127.0.0.1:3001'

const argv = process.argv.slice(2)
const argOf = (n, d) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}
const TAG = argOf('tag', 'before')
const VIEWPORTS = argOf('viewports', '375,768,1024,1440')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter(Boolean)

const PAGES = [
  { path: '/overview', name: 'overview', heavy: 3000 },
  { path: '/dashboard', name: 'dashboard', heavy: 2600 },
  { path: '/charts/ops', name: 'charts-ops' },
  { path: '/charts/analysis', name: 'charts-analysis' },
  { path: '/charts/advanced', name: 'charts-advanced' },
  { path: '/data', name: 'data-manage' },
  { path: '/users', name: 'user-manage' },
  { path: '/style', name: 'style-settings' },
  { path: '/db', name: 'db-settings' },
  { path: '/predict', name: 'predict' }
]

const HEIGHTS = { 375: 812, 768: 1024, 1024: 768, 1440: 900 }

// ---------- 登录拿 token ----------
async function getToken() {
  const capRes = await fetch(`${API}/api/auth/captcha`).then((r) => r.json())
  const svg = Buffer.from(capRes.data.svg.split('base64,')[1], 'base64').toString('utf8')
  const code = [...svg.matchAll(/<text[^>]*>([^<])<\/text>/g)].map((m) => m[1]).join('')
  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123', captchaId: capRes.data.id, captchaCode: code })
  }).then((r) => r.json())
  if (!loginRes.data?.token) throw new Error('登录失败: ' + JSON.stringify(loginRes))
  return loginRes.data
}

// ---------- 页面内采集逻辑 ----------
const collector = () => {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const de = document.documentElement

  const desc = (el) => {
    const cls = (el.className && typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).slice(0, 2).join('.')
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}`
  }

  // 元素若位于「可横向滚动的祖先」内，其超出视口是可达的（如横向导航条、el-table 表体）
  // 若位于 overflow-x:hidden 的祖先内，则是被裁剪（如 el-table 表头，由 JS 同步滚动）
  const overflowAncestor = (el) => {
    let p = el.parentElement
    while (p && p !== document.body) {
      const cs = getComputedStyle(p)
      const overflowed = p.scrollWidth > p.clientWidth + 1
      if (overflowed) {
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return 'scrollable'
        if (cs.overflowX === 'hidden') return 'clipped'
      }
      p = p.parentElement
    }
    return null
  }

  const overflowers = []
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const over = Math.round(r.right - vw)
    const under = Math.round(-r.left)
    if (over > 1 || under > 1) {
      overflowers.push({
        sel: desc(el),
        over: Math.max(over, 0),
        under: Math.max(under, 0),
        w: Math.round(r.width),
        escape: overflowAncestor(el),
        text: (el.textContent || '').trim().slice(0, 24)
      })
    }
  }
  // 只有「既不可滚、也未被裁剪」的溢出才是真正无从抵达的内容
  const realOverflowers = overflowers.filter((o) => !o.escape)

  // ---------- 触控目标 ----------
  // 口径说明：组件库的内部零件（如 el-select 里的 .el-select__input，实测仅 24px 高）
  // 本身不是用户按到的东西 —— 真正的命中区域是外层 .el-select__wrapper。
  // 因此逐个候选元素向上回溯：只要任一层「交互祖先」已达标，子元素的尺寸就不计入。
  // 直接按原生元素逐个量，会把组件库内部结构全误报成问题，噪音淹没真问题。
  const TAP_SEL =
    'button, a[href], input, select, textarea, summary, [role="button"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="option"], [role="menuitem"], [tabindex]:not([tabindex="-1"]), .el-menu-item, .el-select, .el-select__wrapper, .el-input, .el-input__wrapper, .el-input-number, .el-color-picker, .el-slider, .el-slider__button-wrapper, .el-switch, .el-checkbox, .el-pagination button, .el-pager li'

  const isInteractiveLike = (el) => el.matches(TAP_SEL) || getComputedStyle(el).cursor === 'pointer'

  /** 返回该元素是否应当作为独立触控目标被计入；false 表示由祖先代偿 */
  const needsOwnTarget = (el) => {
    let p = el.parentElement
    for (let i = 0; i < 4 && p && p !== document.body; i++) {
      if (!isInteractiveLike(p)) {
        p = p.parentElement
        continue
      }
      if (p.getBoundingClientRect().height >= 44) return false // 祖先达标，子元素尺寸无所谓
      p = p.parentElement
    }
    return true
  }

  const small = []
  const seenTap = new Set()
  for (const el of document.querySelectorAll(TAP_SEL)) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue
    if (Number(cs.opacity) === 0) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.height >= 44) continue
    if (el.disabled || el.getAttribute?.('aria-disabled') === 'true') continue
    if (!needsOwnTarget(el)) continue
    const key = `${desc(el)}@${Math.round(r.top)}`
    if (seenTap.has(key)) continue
    seenTap.add(key)
    small.push({ sel: desc(el), w: Math.round(r.width), h: Math.round(r.height) })
  }

  // ---------- 遮挡检测：可交互元素的可点区域是否被别的元素盖住 ----------
  // 为什么需要：溢出/可达性指标都抓不到「元素渲染了、就在那里、但点击永远落不到它身上」。
  // 典型成因是层叠上下文 —— 子元素写了很高的 z-index，但父级创建了层叠上下文，
  // 这个 z-index 出了父级就失效，被兄弟面板整个压住（园区总览的三维工具栏就是这么被盖住的）。
  //
  // 判定方式：在元素矩形上取中心 + 四个边缘采样点，逐个问 document.elementFromPoint。
  // 一个点都没命中「元素自身或其后代」，就说明点击落不到它 —— 与用户实际能否点中完全一致。
  const CLICKABLE_SEL =
    'button, a[href], input, select, textarea, [role="button"], .el-menu-item'

  // 组件库的隐藏/内部零件：它们上面永远浮着自己的样式化 wrapper（.el-select__wrapper、
  // .el-input__wrapper、.el-switch 等），wrapper 才是用户点的东西。
  // 把它们当独立目标测会永远报"被覆盖"，全是噪音。
  const INTERNAL_PART_SEL =
    '.el-select__input, .el-input__inner, .el-checkbox__original, .el-radio__original, .el-switch__input, .el-upload__input, .el-range-input'

  /** el-table 固定列会把操作列克隆一份浮在原位之上，原位副本被克隆层盖住是正常实现，不算遮挡 */
  const isCloneTwin = (top, el) => {
    const txt = (el.textContent || '').trim()
    if (!txt) return false
    if (top.tagName === el.tagName && top.textContent.trim() === txt) return true
    // 覆盖物内部存在同标签同文案的克隆（固定列的实现就是把一份单元格浮到原位上方）
    return [...top.querySelectorAll(el.tagName)].some((t) => (t.textContent || '').trim() === txt)
  }

  /** 元素是否被某个滚动/裁剪祖先裁掉了可见区（那是"要滚动才够得到"，不是遮挡 bug）。
      注意 pointer-events:none 的面板背景不参与 elementFromPoint 命中，
      所以被裁掉的按钮会"穿透"到 canvas 上 —— 不做这个判断就会误报成被 canvas 盖住。 */
  const clippedByAncestor = (el, r) => {
    let p = el.parentElement
    while (p && p !== document.body) {
      const pcs = getComputedStyle(p)
      if (pcs.overflowX !== 'visible' || pcs.overflowY !== 'visible') {
        const pr = p.getBoundingClientRect()
        if (r.top < pr.top - 1 || r.bottom > pr.bottom + 1 || r.left < pr.left - 1 || r.right > pr.right + 1) {
          return true
        }
      }
      p = p.parentElement
    }
    return false
  }

  const covered = []
  const seenCover = new Set()
  for (const el of document.querySelectorAll(CLICKABLE_SEL)) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue
    if (Number(cs.opacity) === 0) continue
    if (el.disabled) continue
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.height < 8) continue // 1x1 的 sr-only / 视觉隐藏元素不算
    // 只测完整落在视口内的元素：超出视口的会被滚动/裁剪，elementFromPoint 会命中别处，
    // 那是「需要滚动才能点」的正常行为，不是遮挡 bug
    if (r.top < 0 || r.left < 0 || r.bottom > vh || r.right > vw) continue
    // 组件库内部零件不是用户点的东西，真正目标是外层 wrapper
    if (el.matches(INTERNAL_PART_SEL)) continue
    if (clippedByAncestor(el, r)) continue

    const cx = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1)
    const cy = Math.min(Math.max(r.top + r.height / 2, 0), vh - 1)
    const pts = [[cx, cy]]
    if (r.width >= 28) pts.push([r.left + 4, cy], [r.right - 4, cy])
    if (r.height >= 28) pts.push([cx, r.top + 4], [cx, r.bottom - 4])

    let hit = false
    let by = null
    for (const [x, y] of pts) {
      if (x < 0 || y < 0 || x >= vw || y >= vh) continue
      const top = document.elementFromPoint(x, y)
      if (!top) continue
      if (top === el || el.contains(top) || top.contains(el)) { hit = true; break }
      if (isCloneTwin(top, el)) { hit = true; break }
      if (!by) by = top
    }
    if (hit) continue

    const key = desc(el) + '@' + Math.round(r.left) + ',' + Math.round(r.top)
    if (seenCover.has(key)) continue
    seenCover.add(key)
    covered.push({ sel: desc(el), text: (el.textContent || '').trim().slice(0, 14), by: by ? desc(by) : 'out-of-viewport' })
  }

  // ---- 内容可达性：滚到底之后仍留在视口外的内容高度 ----
  // 用「同一页面内 A/B」取得可比数据：先测当前（解锁）状态，再把当前可纵向滚动的容器
  // 强制设为 overflow-y:hidden（= 旧版全局锁滚动的效果），再测一次。
  const scrollers = []
  for (const el of document.querySelectorAll('html, body, body *')) {
    const cs = getComputedStyle(el)
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2) {
      scrollers.push(el)
    }
  }

  const deepestBottom = () => {
    let max = 0
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.bottom > max) max = r.bottom
    }
    return max
  }

  // 1) 解锁状态：把所有可滚动容器滚到底
  for (const el of scrollers) el.scrollTop = el.scrollHeight
  const unreachableUnlocked = Math.max(0, Math.round(deepestBottom() - vh))

  // 2) 锁定状态：模拟「全局 overflow:hidden」
  //    注意 overflow:hidden 仍属于可编程滚动容器，不会自动重置 scrollTop，
  //    必须显式归零，否则内容仍停在底部，指标会恒为 0
  for (const el of scrollers) {
    el.style.setProperty('overflow-y', 'hidden', 'important')
    el.scrollTop = 0
  }
  const unreachableLocked = Math.max(0, Math.round(deepestBottom() - vh))

  // 复原，保证截图是页面顶部
  for (const el of scrollers) {
    el.style.removeProperty('overflow-y')
    el.scrollTop = 0
  }

  const q = (s) => !!document.querySelector(s)
  const content = document.querySelector('main, .content, #app > *')
  return {
    vp: { w: vw, h: vh },
    unreachableUnlocked,
    unreachableLocked,
    scrollerCount: scrollers.length,
    docScrollWidth: de.scrollWidth,
    hOverflow: Math.max(0, de.scrollWidth - vw),
    bodyOverflowY: getComputedStyle(document.body).overflowY,
    overflowers: realOverflowers.sort((a, b) => Math.max(b.over, b.under) - Math.max(a.over, a.under)).slice(0, 12),
    overflowCount: realOverflowers.length,
    scrollableOverflowCount: overflowers.filter((o) => o.escape === 'scrollable').length,
    clippedOverflowCount: overflowers.filter((o) => o.escape === 'clipped').length,
    smallTapTargets: small.length,
    smallTapSample: small.slice(0, 8),
    coveredCount: covered.length,
    coveredSample: covered.slice(0, 10),
    // 保留旧字段便于与历史报告对齐（注意：逗号选择器命中的是文档中最早的匹配元素，
    // 未必是真正的滚动容器，仅供粗略参考）
    contentScrollable: content ? content.scrollHeight > content.clientHeight + 2 : false,
    hasHamburger: q('.hamburger') || q('[aria-label*="菜单"]') || q('.menu-toggle'),
    sidebarVisible: (() => {
      const s = document.querySelector('aside.sider, .sider, .el-drawer')
      if (!s) return false
      const r = s.getBoundingClientRect()
      return r.width > 0 && r.left >= -1
    })(),
    sidebarWidth: (() => {
      const s = document.querySelector('.sider')
      return s ? Math.round(s.getBoundingClientRect().width) : 0
    })(),
    webglCanvas: (() => {
      const c = document.querySelector('canvas')
      if (!c) return { present: false }
      const gl = c.getContext && (c.getContext('webgl2') || c.getContext('webgl'))
      return { present: true, w: c.width, h: c.height, ctxOk: !!gl }
    })(),
    pointerCoarse: typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches,
    reducedMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    chartCount: document.querySelectorAll('canvas').length,
    elDialogWidths: [...document.querySelectorAll('.el-dialog')].map((d) => Math.round(d.getBoundingClientRect().width))
  }
}

// ---------- 主流程 ----------
const { token, user } = await getToken()
const outDir = path.resolve('.audit', TAG)
fs.mkdirSync(outDir, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--hide-scrollbars'
  ]
})

const report = { tag: TAG, base: BASE, at: new Date().toISOString(), results: [] }

for (const width of VIEWPORTS) {
  const height = HEIGHTS[width] || 900
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 1024 })
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    (t, u) => {
      localStorage.setItem('sc_token', t)
      localStorage.setItem('sc_user', JSON.stringify(u))
    },
    token,
    user
  )

  const shotDir = path.join(outDir, String(width))
  fs.mkdirSync(shotDir, { recursive: true })

  for (const p of PAGES) {
    const entry = { viewport: width, page: p.path, name: p.name }
    try {
      await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await new Promise((r) => setTimeout(r, p.heavy || 2200))
      Object.assign(entry, await page.evaluate(collector))
      await page.screenshot({ path: path.join(shotDir, `${p.name}.png`), fullPage: false })
      entry.ok = true
    } catch (e) {
      entry.ok = false
      entry.error = String(e.message || e)
    }
    report.results.push(entry)
    const flag = entry.ok
      ? `溢出${entry.hOverflow}px 溢出元素${entry.overflowCount} 小触点${entry.smallTapTargets} 被盖${entry.coveredCount}` +
        `${entry.pointerCoarse ? ' [触屏]' : ' [鼠标]'}` +
        `${
          entry.coveredCount
            ? ' ← ' + entry.coveredSample.slice(0, 3).map((c) => `${c.text || c.sel}⇢${c.by}`).join(' | ')
            : ''
        }`
      : 'ERR ' + entry.error
    if (entry.ok && entry.smallTapTargets) {
      console.log(`         ↳ ${JSON.stringify(entry.smallTapSample)}`)
    }
    console.log(`[${width}] ${p.path.padEnd(20)} ${flag}`)
  }
  await page.close()
}

await browser.close()
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
console.log(`\n报告: ${path.join(outDir, 'report.json')}`)
