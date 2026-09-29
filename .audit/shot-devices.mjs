// 一次性截图探针：确认 /devices 状态列在窄桌面可见（不入守卫）
import { createRequire } from 'node:module'
const require = createRequire('file:///C:/Users/xianyv/.workbuddy/binaries/node/workspace/')
const puppeteer = require('puppeteer-core')

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = 'http://127.0.0.1:5173'

async function getToken() {
  const capRes = await fetch('http://127.0.0.1:3001/api/auth/captcha').then((r) => r.json())
  const svg = Buffer.from(capRes.data.svg.split('base64,')[1], 'base64').toString('utf8')
  const code = [...svg.matchAll(/<text[^>]*>([^<])<\/text>/g)].map((m) => m[1]).join('')
  const loginRes = await fetch('http://127.0.0.1:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123', captchaId: capRes.data.id, captchaCode: code })
  }).then((r) => r.json())
  return loginRes.data
}

const { token, user } = await getToken()
const browser = await puppeteer.launch({
  executablePath: EDGE, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--hide-scrollbars']
})
const page = await browser.newPage()
await page.setViewport({ width: 1024, height: 768 })
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate((t, u) => {
  localStorage.setItem('sc_token', t)
  localStorage.setItem('sc_user', JSON.stringify(u))
}, token, user)
await page.goto(`${BASE}/devices`, { waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 2000))
const check = await page.evaluate(() => {
  const headers = [...document.querySelectorAll('.el-table th .cell')].map((th) => th.textContent.trim())
  return { headers, overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth) }
})
console.log('表头顺序:', JSON.stringify(check.headers), ' 页面横向溢出:', check.overflow)
await page.screenshot({ path: '.audit/r4-after/1024/device-manage-v2.png' })
await browser.close()
console.log(check.headers.includes('状态') && check.headers.indexOf('状态') < check.headers.indexOf('关联房间') ? '状态列已前移 ✓' : '状态列位置异常 ✗')
