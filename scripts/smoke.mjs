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

await page.screenshot({ path: '.audit/smoke-last.png' })
await browser.close()

// ---------- 3. 汇总 ----------
const failed = results.filter((r) => !r.ok)
console.log('\n================ 冒烟结果 ================')
console.log(`路由通过: ${results.length - failed.length}/${results.length}`)
console.log(`控制台/页面错误: ${errors.length}`)
if (errors.length) {
  console.log('\n错误明细:')
  ;[...new Set(errors)].forEach((e) => console.log('  - ' + e))
}
if (failed.length) {
  console.log('\n失败路由:')
  failed.forEach((f) => console.log(`  - ${f.path}  ${f.newErrors.join(' | ') || '未渲染出预期元素'}`))
}

fs.mkdirSync('.audit', { recursive: true })
fs.writeFileSync(
  path.join('.audit', 'smoke-report.json'),
  JSON.stringify({ at: new Date().toISOString(), base: BASE, results, errors }, null, 2)
)

process.exit(failed.length || errors.length ? 1 : 0)
