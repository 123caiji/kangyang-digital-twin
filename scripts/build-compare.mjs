/**
 * 把实测报告注入对比页模板，产出可直接打开的静态对比页
 *
 *   node scripts/build-compare.mjs                       # before vs p1
 *   node scripts/build-compare.mjs before after           # 自定义对比基线
 *
 * 输入: .audit/<tag>/report.json
 * 输出: 响应式改造对比.html（项目根目录，相对引用 .audit 截图）
 */
import fs from 'node:fs'
import path from 'node:path'

const tags = process.argv.slice(2)
const BEFORE = tags[0] || 'before'
const AFTER = tags[1] || 'after'

const root = process.cwd()
const templatePath = path.join(root, 'scripts', 'compare-template.html')
const outPath = path.join(root, '响应式改造对比.html')

/** 兼容两版字段：早期 viewport 为 {w,h}，后期为数字 */
const widthOf = (e) => (typeof e.viewport === 'number' ? e.viewport : e.viewport.w)

function normalize(tag) {
  const file = path.join(root, '.audit', tag, 'report.json')
  if (!fs.existsSync(file)) throw new Error(`缺少实测报告: ${file}`)
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  return raw.results
    .filter((r) => r.ok !== false)
    .map((r) => ({
      w: widthOf(r),
      page: r.page,
      sidebar: r.sidebarWidth,
      tap: r.smallTapTargets,
      overflow: r.overflowCount,
      // 旧基线报告没有这一项，缺失时留 undefined，由前端跳过显示
      unreachable: r.unreachableUnlocked
    }))
}

const results = { [BEFORE]: normalize(BEFORE), [AFTER]: normalize(AFTER) }

// 模板固定用 before / after 两个键，同时把实际 tag 一起注入（用于定位截图目录）
const payload = {
  before: { tag: BEFORE, rows: results[BEFORE] },
  after: { tag: AFTER, rows: results[AFTER] }
}

let html = fs.readFileSync(templatePath, 'utf8')
if (!html.includes('__RESULTS__')) throw new Error('模板缺少 __RESULTS__ 占位符')
html = html.replace('__RESULTS__', JSON.stringify(payload))

// 标注实际对比的 tag，避免看错基线
html = html.replace(
  '数据源：.audit/before + .audit/p1',
  `数据源：.audit/${BEFORE} + .audit/${AFTER}`
)

fs.writeFileSync(outPath, html)
console.log(`对比页已生成: ${outPath}`)
console.log(`  基线: ${BEFORE} (${payload.before.rows.length} 条)  vs  ${AFTER} (${payload.after.rows.length} 条)`)
