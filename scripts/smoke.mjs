/**
 * 端到端冒烟测试
 *
 * 真机式全流程校验：打开登录页 → 从接口响应里解出验证码 → 填表提交 → 遍历全部业务路由
 * → 收集控制台错误 / 页面异常 / 接口 5xx。
 *
 * 用法: node scripts/smoke.mjs [基础地址]
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire('file:///C:/Users/xianyv/.workbuddy/binaries/node/workspace/')
const puppeteer = require('puppeteer-core')

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.argv[2] || 'http://127.0.0.1:5173'

const ROUTES = [
  { path: '/overview', name: '园区总览', expect: 'canvas' },
  { path: '/dashboard', name: '康养孪生大屏', expect: 'canvas' },
  { path: '/charts/ops', name: '健康监测', expect: 'canvas' },
  { path: '/charts/analysis', name: '护理分析', expect: 'canvas' },
  { path: '/charts/advanced', name: '空间关系', expect: 'canvas' },
  { path: '/data', name: '数据管理', expect: 'table, .card-list' },
  { path: '/users', name: '用户管理', expect: 'table, .card-list' },
  { path: '/style', name: '样式设置', expect: '.preview-box' },
  { path: '/db', name: '数据库设置', expect: 'table, .card-list' },
  { path: '/predict', name: '健康预测', expect: '.layout' }
]

const errors = []
const results = []

// 组件未注册的告警必须单独抓：Vue 对 `<el-xxx>` 未解析只发 warn 不发 error，
// 页面不会崩，但渲染出的会是原生空标签（缺样式、无交互），静默降级最难发现。
// 改成 Element Plus 按需引入后，漏注册一个组件就会命中这里。
const missingComponents = new Set()

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
})

const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })

page.on('pageerror', (e) => errors.push(`[页面异常] ${String(e).split('\n')[0]}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[控制台] ${m.text().slice(0, 220)}`)
  // Vue 的组件解析失败是 warn："Failed to resolve component: el-xxx"
  if (m.type() === 'warning' && /Failed to resolve component/i.test(m.text())) {
    missingComponents.add(m.text().replace(/.*Failed to resolve components?:\s*/i, '').trim())
  }
})
page.on('response', (res) => {
  if (res.status() >= 500) errors.push(`[接口 ${res.status()}] ${res.url().replace(BASE, '')}`)
})

// ---------- 1. 登录：从验证码接口响应里解出明文 ----------
let captchaCode = ''
page.on('response', async (res) => {
  if (!res.url().includes('/api/auth/captcha')) return
  try {
    const body = await res.json()
    const svg = Buffer.from(body.data.svg.split('base64,')[1], 'base64').toString('utf8')
    captchaCode = [...svg.matchAll(/<text[^>]*>([^<])<\/text>/g)].map((m) => m[1]).join('')
  } catch {
    /* ignore */
  }
})

console.log('1) 打开登录页 …')
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.captcha-img', { timeout: 15000 })
await new Promise((r) => setTimeout(r, 400))
if (!captchaCode) {
  errors.push('未能从验证码接口解析出明文，登录流程无法自动验证')
}
console.log(`   验证码解析: ${captchaCode || '失败'}`)

// 通过 DOM 填表，模拟真实交互（不改 localStorage）
await page.evaluate(() => {
  document.querySelectorAll('.el-input__inner').forEach((el) => {
    el.value = ''
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
})
const inputs = await page.$$('.el-input__inner')
if (inputs.length >= 3) {
  await inputs[0].type('admin')
  await inputs[1].type('admin123')
  await inputs[2].type(captchaCode)
}
await page.click('.submit-btn')

console.log('2) 提交登录 …')
await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 20000 })
const loggedIn = await page.evaluate(() => !!localStorage.getItem('sc_token'))
console.log(`   已进入大屏: ${loggedIn ? '是' : '否'}`)

// ---------- 2. 遍历路由 ----------
console.log('3) 遍历路由 …')
const overlayResults = []
for (const route of ROUTES) {
  const before = errors.length
  await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded' })
  await new Promise((r) => setTimeout(r, route.path === '/dashboard' ? 2600 : 2000))

  const state = await page.evaluate((expect) => {
    const sels = expect.split(',').map((s) => s.trim())
    return {
      rendered: sels.some((s) => document.querySelector(s)),
      elCount: document.querySelectorAll('#app *').length,
      title: document.querySelector('.page-title')?.textContent?.trim() || '',
      overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      webgl: !!document.querySelector('.room3d canvas')
    }
  }, route.expect)

  const ok = state.rendered && state.elCount > 60 && errors.length === before
  results.push({ ...route, ...state, ok, newErrors: errors.slice(before) })
  console.log(`   ${ok ? '✓' : '✗'} ${route.path.padEnd(20)} 节点 ${String(state.elCount).padStart(5)}  标题「${state.title}」${state.webgl ? ' WebGL:是' : ''}`)
}

// ---------- 3. 弹层交互 ----------
// 为什么要单独测：el-dialog / el-drawer 内部的内容默认是 Teleport 出去且不挂载的，
// 遍历路由时它们压根没渲染 —— 按需引入漏注册这类组件，上面的路由检查一个都抓不到。
// 这正是"静态清单对得上、运行时却静默降级"的唯一盲区。
console.log('4) 打开弹层 …')
const OVERLAYS = [
  { path: '/users', clickText: '新增用户', wait: '.el-dialog', name: '用户管理 · 新增弹窗' },
  { path: '/db', clickText: '新增连接', wait: '.el-dialog', name: '数据库设置 · 新增弹窗' },
  { path: '/data', clickText: '新增', wait: '.el-dialog', name: '数据管理 · 新增弹窗' },
  { path: '/users', viewport: 375, tap: '.hamburger', wait: '.el-drawer', name: '移动端导航抽屉' }
]

for (const o of OVERLAYS) {
  const before = errors.length
  const beforeMissing = missingComponents.size
  let status = '未渲染'
  try {
    // 必须先按文本定位按钮：组件类选择器会命中侧栏的「退出」等无关按钮，
    // 点错会直接跳走，看起来像"弹窗打不开"，实则是测试脚本的问题
    if (o.viewport) await page.setViewport({ width: o.viewport, height: 812, hasTouch: true, isMobile: true })
    await page.goto(`${BASE}${o.path}`, { waitUntil: 'domcontentloaded' })
    await new Promise((r) => setTimeout(r, o.viewport ? 1600 : 1200))

    if (o.clickText) {
      const hit = await page.evaluate((txt) => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().includes(txt))
        if (!btn) return false
        btn.click()
        return true
      }, o.clickText)
      if (!hit) throw new Error(`未找到文案含「${o.clickText}」的按钮`)
    } else {
      await page.waitForSelector(o.tap, { timeout: 6000 })
      await page.click(o.tap)
    }

    await page.waitForSelector(o.wait, { timeout: 8000 })
    await new Promise((r) => setTimeout(r, 600))
    // 弹窗真的渲染出内容才算通过：只有一层空壳说明内部子组件没注册上
    const inner = await page.evaluate((sel) => {
      const d = document.querySelector(sel)
      if (!d) return null
      const r = d.getBoundingClientRect()
      return {
        width: Math.round(r.width),
        height: Math.round(r.height),
        inputs: d.querySelectorAll('.el-input__wrapper, .el-input__inner').length,
        formItems: d.querySelectorAll('.el-form-item').length,
        menuItems: d.querySelectorAll('.el-menu-item').length,
        buttons: d.querySelectorAll('.el-button').length
      }
    }, o.wait)
    const unsatisfied = [...missingComponents].slice(beforeMissing)
    // 抽屉里应当有菜单项，弹窗里应当有表单项和按钮；height 排除"渲染了但塌成一团"
    const substantive = o.tap ? inner?.menuItems > 0 : inner?.formItems > 0 && inner?.buttons > 0
    const ok = substantive && inner.height > 80 && errors.length === before && !unsatisfied.length
    status = `${ok ? '✓' : '✗'} ${o.name} (${inner.width}×${inner.height})`
    if (!substantive) status += ' 内容为空，疑似子组件未注册'
    if (unsatisfied.length) status += ` 未注册: ${unsatisfied.join(',')}`
    overlayResults.push({ ...o, ok, inner, unsatisfied })
    if (o.viewport) await page.setViewport({ width: 1440, height: 900 })
  } catch (e) {
    overlayResults.push({ ...o, ok: false, error: String(e.message || e).slice(0, 120) })
    status = `✗ ${o.name} — ${String(e.message || e).split('\n')[0].slice(0, 90)}`
    if (o.viewport) await page.setViewport({ width: 1440, height: 900 }).catch(() => {})
  }
  console.log(`   ${status}`)
}

await page.screenshot({ path: '.audit/smoke-last.png' })
await browser.close()

// ---------- 3. 汇总 ----------
const failed = results.filter((r) => !r.ok)
const failedOverlays = overlayResults.filter((r) => !r.ok)
console.log('\n================ 冒烟结果 ================')
console.log(`路由通过: ${results.length - failed.length}/${results.length}`)
console.log(`弹层通过: ${overlayResults.length - failedOverlays.length}/${overlayResults.length}`)
console.log(`控制台/页面错误: ${errors.length}`)
console.log(`未注册组件: ${missingComponents.size ? [...missingComponents].join(', ') : '无'}`)
if (errors.length) {
  console.log('\n错误明细:')
  ;[...new Set(errors)].forEach((e) => console.log('  - ' + e))
}
if (failedOverlays.length) {
  console.log('\n失败弹层:')
  failedOverlays.forEach((f) => console.log(`  - ${f.name}  ${f.error || JSON.stringify(f.inner)}`))
}
if (failed.length) {
  console.log('\n失败路由:')
  failed.forEach((f) => console.log(`  - ${f.path}  ${f.newErrors.join(' | ') || '未渲染出预期元素'}`))
}

fs.mkdirSync('.audit', { recursive: true })
fs.writeFileSync(
  path.join('.audit', 'smoke-report.json'),
  JSON.stringify({ at: new Date().toISOString(), base: BASE, results, overlays: overlayResults, errors, missingComponents: [...missingComponents] }, null, 2)
)

process.exit(failed.length || failedOverlays.length || errors.length || missingComponents.size ? 1 : 0)
