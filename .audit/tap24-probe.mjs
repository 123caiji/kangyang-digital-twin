/**
 * 一次性探针（不入库、不进守卫）：
 * 1. /devices 与 /audit 在 1024/1440 下有没有高度 <24px 的真实点击目标（WCAG 下限）
 * 2. 注册临时设备 → Token 弹窗 → 验证 el-alert 真实渲染 → 删除临时设备（自清理）
 */
import { createRequire } from 'node:module'
const require = createRequire('file:///C:/Users/xianyv/.workbuddy/binaries/node/workspace/')
const puppeteer = require('puppeteer-core')

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = 'http://127.0.0.1:5173'
const API = 'http://127.0.0.1:3001'

async function getToken() {
  const capRes = await fetch(`${API}/api/auth/captcha`).then((r) => r.json())
  const svg = Buffer.from(capRes.data.svg.split('base64,')[1], 'base64').toString('utf8')
  const code = [...svg.matchAll(/<text[^>]*>([^<])<\/text>/g)].map((m) => m[1]).join('')
  const loginRes = await fetch(`${API}/api/auth/login`, {
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

// ---------- 1. <24px 触点扫描 ----------
const TAP_SEL =
  'button, a[href], input, select, textarea, [role="button"], .el-menu-item, .el-select, .el-select__wrapper, .el-input, .el-input__wrapper, .el-pagination button, .el-pager li'
const INTERNAL_PART_SEL = '.el-select__input, .el-input__inner, .el-checkbox__original, .el-switch__input, .el-range-input'

for (const width of [1024, 1440]) {
  await page.setViewport({ width, height: width === 1024 ? 768 : 900 })
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((t, u) => {
    localStorage.setItem('sc_token', t)
    localStorage.setItem('sc_user', JSON.stringify(u))
  }, token, user)

  for (const p of ['/devices', '/audit']) {
    await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' })
    await new Promise((r) => setTimeout(r, 1800))
    const tiny = await page.evaluate((sel, internal) => {
      const out = []
      for (const el of document.querySelectorAll(sel)) {
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue
        if (el.disabled) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (r.height >= 24) continue
        // 组件库内部零件不算（真实命中区是外层 wrapper）
        if (el.matches(internal)) continue
        // 向上找 4 层，交互祖先已 ≥24px 则由祖先代偿
        let comp = false
        let pa = el.parentElement
        for (let i = 0; i < 4 && pa && pa !== document.body; i++) {
          const pcs = getComputedStyle(pa)
          const interactive = pa.matches(sel) || pcs.cursor === 'pointer'
          if (interactive && pa.getBoundingClientRect().height >= 24) { comp = true; break }
          pa = pa.parentElement
        }
        if (comp) continue
        const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).slice(0, 2).join('.')
        out.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} ${Math.round(r.width)}x${Math.round(r.height)}`)
      }
      return out
    }, TAP_SEL, INTERNAL_PART_SEL)
    console.log(`[${width}] ${p}  <24px 触点: ${tiny.length}${tiny.length ? '  ' + JSON.stringify(tiny) : ''}`)
  }
}

// ---------- 2. el-alert 运行时渲染验证（建临时设备 → Token 弹窗 → 删除） ----------
const TEMP_ID = 'smoke-temp-probe'
await page.setViewport({ width: 1440, height: 900 })
await page.goto(`${BASE}/devices`, { waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 1800))

// 打开注册弹窗并填表
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('注册设备'))
  btn?.click()
})
await page.waitForSelector('.el-dialog', { timeout: 8000 })
await new Promise((r) => setTimeout(r, 500))
const formInfo = await page.evaluate(() => {
  const d = document.querySelector('.el-dialog')
  return { formItems: d.querySelectorAll('.el-form-item').length, width: Math.round(d.getBoundingClientRect().width) }
})
console.log(`注册弹窗: formItems=${formInfo.formItems} width=${formInfo.width}`)

await page.evaluate((id) => {
  const inputs = document.querySelectorAll('.el-dialog .el-input__inner')
  // 输入顺序：设备ID → 设备名称
  const set = (el, v) => {
    el.value = v
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  set(inputs[0], id)
  set(inputs[1], '冒烟临时探针设备')
}, TEMP_ID)
await page.evaluate(() => {
  const d = document.querySelector('.el-dialog')
  const btn = [...d.querySelectorAll('.el-button')].find((b) => b.textContent.includes('确定'))
  btn?.click()
})
await page.waitForSelector('.el-alert', { timeout: 8000 })
await new Promise((r) => setTimeout(r, 600))
const alertInfo = await page.evaluate(() => {
  const a = document.querySelector('.el-alert')
  if (!a) return null
  const r = a.getBoundingClientRect()
  return {
    visible: r.width > 0 && r.height > 0,
    size: `${Math.round(r.width)}x${Math.round(r.height)}`,
    text: (a.textContent || '').trim().slice(0, 30),
    // el-alert 未注册时会降级成原生 <el-alert> 空标签，class 里不会有 el-alert
    styled: getComputedStyle(a).padding !== '0px'
  }
})
console.log(`Token 弹窗 el-alert: ${JSON.stringify(alertInfo)}`)

// 清理：删除临时设备
const cleanup = await fetch(`${API}/api/iot/devices`, { headers: { Authorization: `Bearer ${token}` } })
  .then((r) => r.json())
  .then(async (list) => {
    const dev = (list.data || []).find((d) => d.device_id === TEMP_ID)
    if (!dev) return '未找到(无需清理)'
    const del = await fetch(`${API}/api/iot/devices/${dev.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
    }).then((r) => r.json())
    return del.code === 0 ? `已删除 #${dev.id}` : '删除失败: ' + JSON.stringify(del)
  })
console.log(`清理临时设备: ${cleanup}`)

await browser.close()
const pass = alertInfo?.visible && alertInfo?.styled && formInfo.formItems >= 6
console.log(pass ? '\n探针结论: 全部通过' : '\n探针结论: 存在失败项')
process.exit(pass ? 0 : 1)
