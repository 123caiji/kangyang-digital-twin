/**
 * 极简 .env 加载器（零依赖）
 *
 * 为什么不用 dotenv：
 *   - 不引入新依赖、不改动 package-lock
 *   - Node 版本兼容性更好（不依赖 --env-file，该参数需 Node 20.6+）
 *
 * 行为：把 server/.env 里的键值写入 process.env，且**不覆盖**已存在的环境变量
 *（部署时通过 systemd/pm2 注入的变量优先级更高）。
 *
 * 必须在读取 process.env 的模块（routes/ai.js、middleware/auth.js）之前 require。
 */
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '.env')

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const eq = line.indexOf('=')
    if (eq <= 0) continue

    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()

    // 去掉成对的引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

module.exports = { envPath, loaded: fs.existsSync(envPath) }
