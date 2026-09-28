/**
 * 样式块语言检查
 *
 * 背景：Vue SFC 的 <style scoped> 默认按纯 CSS 处理。若在其中写 SCSS 语法
 * （@include / @mixin / $变量 / 嵌套 &），浏览器会把整条规则当作无法解析的内容
 * 静默丢弃 —— 构建不报错、页面不报错，但样式完全失效（本项目已踩过一次）。
 *
 * 用法: node scripts/check-styles.mjs        # 有问题时退出码 1
 */
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve('src')
const SCSS_ONLY = [/@include\s/, /@mixin\s/, /@extend\s/, /@forward\s/, /@use\s+["']/, /\$[a-z-]+\s*:/i, /:global\(/]

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.vue')) out.push(full)
  }
  return out
}

const problems = []

for (const file of walk(SRC)) {
  const source = fs.readFileSync(file, 'utf8')
  // 拆出所有 <style ...> ... </style> 块
  const blocks = [...source.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)]
  blocks.forEach(([, attrs, body], i) => {
    const isScss = /lang\s*=\s*["']scss["']/.test(attrs)
    if (isScss) return
    const hits = SCSS_ONLY.filter((re) => re.test(body))
    if (hits.length) {
      problems.push({
        file: path.relative(process.cwd(), file),
        block: i + 1,
        attrs: attrs.trim() || '(无属性)',
        hints: hits.map((r) => r.source).join(', ')
      })
    }
  })
}

if (problems.length) {
  console.error('发现样式块语言不匹配（这些规则会被浏览器静默丢弃）：\n')
  for (const p of problems) {
    console.error(`  ${p.file}  第 ${p.block} 个 style 块  <style ${p.attrs}>`)
    console.error(`    含 SCSS 语法: ${p.hints}`)
    console.error(`    修复: 改为 <style ${p.attrs ? p.attrs + ' ' : ''}lang="scss">\n`)
  }
  process.exit(1)
}

console.log('样式块语言检查通过：未发现纯 CSS 块中使用 SCSS 语法。')
