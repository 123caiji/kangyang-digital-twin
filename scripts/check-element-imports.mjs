/**
 * Element Plus 按需注册守卫
 *
 * 检查两件事：
 *   A. 模板里用到的 <el-xxx> 是否都已注册（防止静默降级成无样式原生标签）
 *   B. 是否有文件绕过 plugins/element.js 直接 import 'element-plus'
 *      —— 只要有一处这么做，es/index.mjs 这个 barrel 就完整进图，树摇直接失效（详见插件文件头）
 *
 * 用法: node scripts/check-element-imports.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const SRC_DIR = path.resolve('src')
const PLUGIN = path.resolve('src/plugins/element.js')

const FILE_RE = /\.(vue|js|jsx|ts|tsx)$/

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (FILE_RE.test(entry.name)) out.push(p)
  }
  return out
}

/** <el-foo-bar> / <ElFooBar> → ElFooBar */
function camelize(name) {
  const parts = name.split('-').filter(Boolean)
  return 'El' + parts.map((s) => s[0].toUpperCase() + s.slice(1)).join('')
}

const rel = (s) => path.relative(process.cwd(), s).replace(/\\/g, '/')

const files = walk(SRC_DIR)
const used = new Map() // ElName -> Set<相对路径>
const barrelImporters = []

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')

  // 检查项 B：绕过插件入口的根导入
  if (rel(file) !== rel(PLUGIN) && /from\s+['"]element-plus['"]/.test(text)) {
    barrelImporters.push(rel(file))
  }
  // 模板标签：<el-foo-bar ...>
  for (const m of text.matchAll(/<el-([a-z][a-z0-9-]*)/g)) {
    const name = camelize(m[1])
    if (!used.has(name)) used.set(name, new Set())
    used.get(name).add(rel(file))
  }
  // 字符串形式引用的组件名（如 component :is="'el-tab-pane'"）
  for (const m of text.matchAll(/['"`]el-([a-z][a-z0-9-]*)['"`]/g)) {
    const name = camelize(m[1])
    if (!used.has(name)) used.set(name, new Set())
    used.get(name).add(rel(file))
  }
}

if (!fs.existsSync(PLUGIN)) {
  console.error(`✗ 找不到 ${rel(PLUGIN)}`)
  process.exit(1)
}
const pluginText = fs.readFileSync(PLUGIN, 'utf8')
// 取 COMPONENTS 数组内容
const arrayBody = pluginText.match(/const COMPONENTS\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? ''
const registered = new Set([...arrayBody.matchAll(/\b(El[A-Za-z]+)\b/g)].map((m) => m[1]))

// 这些组件不需要全局注册：它们是别的组件的内部零件，或由父组件直接 import 使用
const INTERNAL = new Set(['ElSubMenu', 'ElSkeletonItem', 'ElButtonGroup', 'ElRadioGroup'])

const missing = [...used.keys()].filter((n) => !registered.has(n) && !INTERNAL.has(n)).sort()
const unusedImport = [...registered].filter((n) => !used.has(n)).sort()

console.log(`扫描源码: ${files.length} 个文件`)
console.log(`模板中使用: ${used.size} 个 el-* 组件`)
console.log(`已按需注册: ${registered.size} 个组件\n`)

if (missing.length) {
  console.log('✗ 以下组件在模板中使用，但未在 plugins/element.js 注册：')
  for (const name of missing) {
    console.log(`   ${name.padEnd(22)} 出现于: ${[...used.get(name)].slice(0, 4).join(', ')}`)
  }
  console.log('\n→ 请加入 COMPONENTS 数组，并补一行 import "element-plus/es/components/<kebab-name>/style/css"')
}

if (barrelImporters.length) {
  console.log(`✗ 以下文件直接 import 'element-plus'（应改为 import from '@/plugins/element'）：`)
  barrelImporters.forEach((f) => console.log('   - ' + f))
  console.log(
    '\n→ es/index.mjs 是 301 行的 barrel：任何一处根导入都会让整棵组件树进图，按需引入随即失效。'
  )
}

if (unusedImport.length) {
  console.log(`\nℹ 注册了但模板里没用到（可考虑移除以继续瘦身）: ${unusedImport.join(', ')}`)
}

if (!missing.length && !barrelImporters.length) {
  console.log('✓ 按需注册清单与模板使用完全对齐，且无绕过插件入口的直接引用')
}

process.exit(missing.length || barrelImporters.length ? 1 : 0)
