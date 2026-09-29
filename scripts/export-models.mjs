/**
 * 导出康养三维模型为 .glb 文件（可在 Blender 中打开二次编辑）
 *
 * 用法:
 *   1) 先起本地开发服务: node_modules/.bin/vite  (127.0.0.1:5173)
 *   2) node scripts/export-models.mjs
 *
 * 产出: outputs/models/*.glb + outputs/models/export-report.json
 * 注意: 只读现有场景代码，不修改任何组件；导出后立刻回读校验，确认文件有效。
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire('file:///C:/Users/xianyv/.workbuddy/binaries/node/workspace/')
const puppeteer = require('puppeteer-core')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.argv[2] || 'http://127.0.0.1:5173'
const OUT = 'outputs/models'

/** 导出清单：五个空间；居室额外导出一份「101 室两名住户」的入住版本 */
const TARGETS = [
  { file: 'care-room-empty', theme: 'room', data: {}, note: '双床居室（空房，无住户）' },
  { file: 'care-room-101', theme: 'room', data: { roomNo: '101', nodes: [
    { id: 'resident-1', bedNo: 1, name: '示例住户A', value: 78, unit: 'bpm', status: 'normal', remark: '示意数据' },
    { id: 'resident-2', bedNo: 2, name: '示例住户B', value: 82, unit: 'bpm', status: 'warning', remark: '示意数据' }
  ] }, note: '双床居室（含两名示意住户人物）' },
  { file: 'care-corridor', theme: 'corridor', data: {}, note: '走廊（扶手、轮椅、护理员）' },
  { file: 'care-nursing', theme: 'nursing', data: {}, note: '护理站' },
  { file: 'care-dining', theme: 'dining', data: {}, note: '餐厅' },
  { file: 'care-rehab', theme: 'rehab', data: {}, note: '康复室' }
]

fs.mkdirSync(OUT, { recursive: true })

const results = []
const errors = []
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
})

try {
  const page = await browser.newPage()
  page.setDefaultTimeout(120000)
  page.on('pageerror', (e) => errors.push(`[页面异常] ${String(e).split('\n')[0]}`))
  await page.goto(`${BASE}/scripts/model-export/export.html`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction('window.__ready === true', { timeout: 120000 })

  for (const t of TARGETS) {
    const started = Date.now()
    const b64 = await page.evaluate((theme, data) => window.__exportCare(theme, data), t.theme, t.data)
    const file = path.join(OUT, `${t.file}.glb`)
    fs.writeFileSync(file, Buffer.from(b64, 'base64'))
    const verify = await page.evaluate((s) => window.__verifyGlb(s), b64)
    const bytes = fs.statSync(file).size
    results.push({ file: `${t.file}.glb`, theme: t.theme, note: t.note, bytes, ms: Date.now() - started, verify })
    console.log(`✓ ${t.file}.glb  ${(bytes / 1024).toFixed(0)} KB  网格 ${verify.meshes}  三角面 ${verify.triangles}  骨骼 ${verify.bones}`)
  }
} catch (e) {
  errors.push(`[导出失败] ${String(e).split('\n')[0]}`)
} finally {
  await browser.close()
}

fs.writeFileSync(path.join(OUT, 'export-report.json'), JSON.stringify({ at: new Date().toISOString(), base: BASE, results, errors }, null, 2))
console.log(JSON.stringify({ files: results.length, errors }, null, 2))
process.exitCode = errors.length ? 1 : 0
