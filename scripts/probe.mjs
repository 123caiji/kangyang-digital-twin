/**
 * 单点探针：检查指定页面在指定视口下的具体元素状态
 *   node scripts/probe.mjs <path> <width> [selector]
 */
import { createRequire } from 'node:module'
const require = createRequire('file:///C:/Users/xianyv/.workbuddy/binaries/node/workspace/')
const puppeteer = require('puppeteer-core')

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = 'http://127.0.0.1:5173'
const API = 'http://127.0.0.1:3001'

const target = process.argv[2] || '/charts/ops'
const width = Number(process.argv[3] || 375)
const sel = process.argv[4] || '.hamburger'

async function getToken() {
  const cap = await fetch(`${API}/api/auth/captcha`).then((r) => r.json())
  const svg = Buffer.from(cap.data.svg.split('base64,')[1], 'base64').toString('utf8')
  const code = [...svg.matchAll(/<text[^>]*>([^<])<\/text>/g)].map((m) => m[1]).join('')
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123', captchaId: cap.data.id, captchaCode: code })
  }).then((r) => r.json())
  if (!res.data?.token) throw new Error('登录失败: ' + JSON.stringify(res))
  return res.data
}

const { token, user } = await getToken()
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
})
const page = await browser.newPage()
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log('[console.' + m.type() + ']', m.text().slice(0, 300))
})
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
await page.setViewport({ width, height: 900, isMobile: width < 768, hasTouch: width < 1024 })
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate((t, u) => {
  localStorage.setItem('sc_token', t)
  localStorage.setItem('sc_user', JSON.stringify(u))
}, token, user)
await page.goto(`${BASE}${target}`, { waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 2500))

const info = await page.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) return { found: false }
  const cs = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  return {
    found: true,
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    display: cs.display,
    visibility: cs.visibility,
    color: cs.color,
    fontSize: cs.fontSize,
    width: cs.width,
    tapMin: cs.getPropertyValue('--tap-min'),
    innerHTML: el.innerHTML.slice(0, 200),
    svgCount: el.querySelectorAll('svg').length,
    ariaLabel: el.getAttribute('aria-label')
  }
}, sel)

console.log(target, '@', width, '→', JSON.stringify(info, null, 2))
await page.screenshot({ path: `.audit/probe-${width}-${target.replace(/\//g, '_')}.png` })
await browser.close()
