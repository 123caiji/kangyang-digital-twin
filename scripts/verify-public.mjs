/**
 * 公网验收：在真实浏览器里登录线上站点，检查总览沙盘与房间特写是否正常渲染。
 *
 * 用法: node scripts/verify-public.mjs [基础地址]
 * 关注点：入口资源是否为新构建、控制台错误、WebGL 是否出图、楼层/下钻联动、关键截图。
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
const require = createRequire('file:///C:/Users/xianyv/.workbuddy/binaries/node/workspace/')
const puppeteer = require('puppeteer-core')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.argv[2] || 'http://152.136.36.198'
const OUT = 'outputs'
fs.mkdirSync(OUT, { recursive: true })

const errors = []
const results = []
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
})

try {
  const page = await browser.newPage()
  // 公网首屏首次加载大体积依赖（element-plus / three）可能超过 30s，统一放宽等待
  page.setDefaultTimeout(120000)
  page.on('pageerror', (e) => errors.push(`[页面异常] ${String(e).split('\n')[0]}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[控制台] ${m.text().slice(0, 200)}`) })
  page.on('response', (r) => { if (r.status() >= 500) errors.push(`[接口 ${r.status()}] ${r.url().replace(BASE, '')}`) })

  await page.setViewport({ width: 1440, height: 900 })
  const t0 = Date.now()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  try {
    await page.waitForSelector('.captcha-img', { timeout: 120000 })
  } catch {
    // 冷启动首屏偶发超时：重载一次再等，仍失败才算验收不通过
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.captcha-img', { timeout: 120000 })
  }
  const entry = await page.evaluate(() => [...document.scripts].map((s) => s.src).filter((s) => s.includes('/assets/')))
  results.push({ test: 'entry-assets', files: entry.map((u) => u.split('/assets/')[1]), ms: Date.now() - t0 })

  await page.evaluate(async () => {
    const c = (await (await fetch('/api/auth/captcha')).json()).data
    const code = [...atob(c.svg.split('base64,')[1]).matchAll(/<text[^>]*>([^<])<\/text>/g)].map((m) => m[1]).join('')
    const r = await (await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123', captchaId: c.id, captchaCode: code, captcha: code })
    })).json()
    if (!r.data?.token) throw new Error('线上登录失败: ' + JSON.stringify(r).slice(0, 160))
    localStorage.setItem('sc_token', r.data.token)
    localStorage.setItem('sc_user', JSON.stringify(r.data.user))
  })

  // 总览沙盘
  const t1 = Date.now()
  await page.goto(`${BASE}/overview`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.campus3d canvas')
  await page.waitForFunction(() => document.querySelector('.campus3d')?.__vueParentComponent?.exposed?.diagnostics().calls > 0)
  await new Promise((r) => setTimeout(r, 1200))
  const campus = await page.evaluate(() => document.querySelector('.campus3d').__vueParentComponent.exposed.diagnostics())
  const kpis = await page.$$eval('.kpi', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()))
  const floors = await page.$$eval('.floor-row', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()))
  await page.screenshot({ path: `${OUT}/public-overview.png` })
  results.push({ test: 'overview', ms: Date.now() - t1, calls: campus.calls, selectable: campus.selectable.length, kpis, floors })
  if (!campus.calls) throw new Error('线上总览未渲染')

  // 面板联动：点 2F 只看该层
  await page.evaluate(() => [...document.querySelectorAll('.floor-row')].find((b) => b.textContent.includes('2F'))?.click())
  await new Promise((r) => setTimeout(r, 900))
  const floor2 = await page.evaluate(() => document.querySelector('.campus3d').__vueParentComponent.exposed.diagnostics())
  if (floor2.activeFloor !== 2) throw new Error('线上楼层筛选未生效')
  await page.evaluate(() => [...document.querySelectorAll('.floor-row')].find((b) => b.textContent.includes('2F'))?.click())
  await new Promise((r) => setTimeout(r, 700))

  // 重点关注 → 聚焦房间
  if (await page.$('.watch-row')) {
    const code = await page.$eval('.watch-row b', (e) => e.textContent.trim())
    await page.click('.watch-row')
    await page.waitForSelector('.hud-detail')
    const title = await page.$eval('.hud-detail h3', (e) => e.textContent.trim())
    if (title !== `${code}室`) throw new Error('重点关注房间与详情不一致')
    await page.screenshot({ path: `${OUT}/public-overview-focus.png` })
    results.push({ test: 'watch-focus', room: code })
  }

  // 房间下钻（101 室特写）
  const t2 = Date.now()
  await page.goto(`${BASE}/dashboard?theme=room&room=101`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.care-room canvas')
  await page.waitForFunction(() => document.querySelector('.care-room')?.__vueParentComponent?.exposed?.diagnostics().actors === 2)
  await new Promise((r) => setTimeout(r, 900))
  const room = await page.evaluate(() => document.querySelector('.care-room').__vueParentComponent.exposed.diagnostics())
  await page.screenshot({ path: `${OUT}/public-room-101.png` })
  results.push({ test: 'room-101', ms: Date.now() - t2, actors: room.actors, bones: room.bones, particles: room.particles, calls: room.calls })

  // 公共区主题
  await page.goto(`${BASE}/dashboard?theme=nursing`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelector('.care-room')?.__vueParentComponent?.exposed?.diagnostics().calls > 0)
  await new Promise((r) => setTimeout(r, 800))
  await page.screenshot({ path: `${OUT}/public-nursing.png` })
  results.push({ test: 'nursing', ok: true })

  // 移动端
  await page.setViewport({ width: 375, height: 812, hasTouch: true, isMobile: true })
  await page.goto(`${BASE}/overview`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.campus3d canvas')
  await new Promise((r) => setTimeout(r, 1500))
  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth))
  await page.screenshot({ path: `${OUT}/public-overview-375.png` })
  results.push({ test: 'overview-375', overflow })
} catch (e) {
  errors.push(`[验收失败] ${String(e).split('\n')[0]}`)
} finally {
  await browser.close()
}

fs.writeFileSync(`${OUT}/public-verify.json`, JSON.stringify({ at: new Date().toISOString(), base: BASE, results, errors }, null, 2))
console.log(JSON.stringify({ results, errors }, null, 2))
process.exitCode = errors.length ? 1 : 0
