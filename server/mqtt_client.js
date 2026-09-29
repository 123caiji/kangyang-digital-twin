const mqtt = require('mqtt')
const crypto = require('crypto')
const http = require('http')

// ============================
// 配置
// ============================
const CONFIG = {
  productKey: 'a1MlghnXTvu',
  deviceName: 'longtianbiaodelaoshi',
  deviceSecret: '1317532948310ab50296b5781b7b9b65',
  apiHost: '127.0.0.1',
  apiPort: 3001,
  apiPath: '/api/iot/report',
  heartbeatInterval: 60000,
  reconnectPeriod: 5000,
  connectTimeout: 15000,
  keepalive: 60
}

// ============================
// 统计计数器
// ============================
const stats = {
  received: 0,
  forwarded: 0,
  failed: 0,
  startTime: new Date().toISOString(),
  lastMessage: null,
  byTable: {}
}

// ============================
// 生成MQTT连接参数（阿里云一机一密）
// ============================
function generateMQTTConfig() {
  const timestamp = Date.now()
  const clientId = `${CONFIG.deviceName}|securemode=3,signmethod=hmacsha256,timestamp=${timestamp}|`
  const username = `${CONFIG.deviceName}&${CONFIG.productKey}`
  const signContent = `clientId${CONFIG.deviceName}deviceName${CONFIG.deviceName}productKey${CONFIG.productKey}timestamp${timestamp}`
  const password = crypto.createHmac('sha256', CONFIG.deviceSecret).update(signContent).digest('hex')
  const host = `${CONFIG.productKey}.iot-as-mqtt.cn-shanghai.aliyuncs.com`

  return {
    host,
    port: 1883,
    clientId,
    username,
    password,
    keepalive: CONFIG.keepalive,
    clean: true,
    connectTimeout: CONFIG.connectTimeout,
    reconnectPeriod: CONFIG.reconnectPeriod,
    resubscribe: true
  }
}

// ============================
// 提取物模型属性（支持多种格式）
// ============================
function extractProperties(msg) {
  let props = {}
  let deviceName = null

  // 优先提取设备名
  if (msg.deviceName) deviceName = msg.deviceName
  if (msg.DeviceName) deviceName = msg.DeviceName
  if (msg.ID && !deviceName) deviceName = msg.ID  // 物模型ID字段作为设备标识

  // 格式1: 阿里云标准属性上报 { method, params: {...} }
  if (msg.params && typeof msg.params === 'object') {
    props = { ...msg.params }
  }
  // 格式2: 规则引擎转发 { items: { key: { value: v, time: t }, ... } }
  else if (msg.items && typeof msg.items === 'object') {
    for (const [k, v] of Object.entries(msg.items)) {
      if (v && typeof v === 'object' && 'value' in v) {
        props[k] = v.value
      } else {
        props[k] = v
      }
    }
  }
  // 格式3: properties包裹
  else if (msg.properties && typeof msg.properties === 'object') {
    props = { ...msg.properties }
  }
  // 格式4: 扁平直传，遍历所有TSL可能的key
  else {
    const tslKeys = [
      'Heartbeat', 'BreathingRate', 'SPO2', 'fall', 'Person',
      'temp', 'humi', 'PM25_inside', 'PM10_inside', 'adc',
      'SG90', 'Warning', 'PIR',
      'Atmospheric_temperature', 'Atmospheric_humidity',
      'Atmospheric_pressure', 'Wind_direction', 'Wind_Speed',
      'PM25', 'PM10', 'illumination',
      'tw1', 'ts1', 'tw2', 'ts2', 'tw3', 'ts3',
      'PH2', 'N2', 'P2', 'K2', 'ID'
    ]
    for (const key of tslKeys) {
      if (msg[key] !== undefined && msg[key] !== null) {
        props[key] = msg[key]
      }
    }
  }

  return { props, deviceName }
}

// ============================
// 判断数据类型（健康/环境/气象/土壤）
// ============================
function classifyData(props) {
  const types = []
  const healthKeys = ['Heartbeat', 'BreathingRate', 'SPO2', 'fall', 'Person']
  const envKeys = ['temp', 'humi', 'PM25_inside', 'PM10_inside', 'adc', 'Warning', 'PIR', 'SG90']
  const weatherKeys = ['Atmospheric_temperature', 'Atmospheric_humidity', 'Atmospheric_pressure', 'Wind_direction', 'Wind_Speed', 'PM25', 'PM10', 'illumination']
  const soilKeys = ['tw1', 'ts1', 'tw2', 'ts2', 'tw3', 'ts3', 'PH2', 'N2', 'P2', 'K2']

  if (healthKeys.some(k => props[k] !== undefined)) types.push('健康监测')
  if (envKeys.some(k => props[k] !== undefined)) types.push('室内环境')
  if (weatherKeys.some(k => props[k] !== undefined)) types.push('室外气象')
  if (soilKeys.some(k => props[k] !== undefined)) types.push('土壤监测')

  return types
}

// ============================
// 转发数据到本地API
// ============================
function forwardToApi(payload, topic) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload)
    const options = {
      hostname: CONFIG.apiHost,
      port: CONFIG.apiPort,
      path: CONFIG.apiPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 10000
    }

    const req = http.request(options, (res) => {
      let body = ''
      res.on('data', (chunk) => body += chunk)
      res.on('end', () => {
        try {
          const result = JSON.parse(body)
          if (result.code === 0) {
            stats.forwarded++
            const results = result.data?.results || []
            for (const r of results) {
              stats.byTable[r.table] = (stats.byTable[r.table] || 0) + 1
            }
            const types = classifyData(payload)
            console.log(`✅ [入库成功] ${types.join('+')} | ${results.map(r => `${r.table}:${r.id}`).join(', ')}`)
            resolve(result)
          } else {
            stats.failed++
            console.error(`❌ [入库失败] code=${result.code} msg=${result.message}`)
            reject(new Error(result.message || '入库失败'))
          }
        } catch (e) {
          stats.failed++
          console.error(`❌ [响应解析失败] ${e.message}`)
          reject(e)
        }
      })
    })

    req.on('error', (e) => {
      stats.failed++
      console.error(`❌ [HTTP错误] ${e.message}`)
      reject(e)
    })

    req.on('timeout', () => {
      stats.failed++
      req.destroy()
      console.error('❌ [请求超时]')
      reject(new Error('timeout'))
    })

    req.write(data)
    req.end()
  })
}

// ============================
// 处理MQTT消息
// ============================
async function handleMessage(topic, message) {
  try {
    const msg = JSON.parse(message.toString())
    stats.received++
    stats.lastMessage = new Date().toISOString()

    const { props, deviceName } = extractProperties(msg)

    if (Object.keys(props).length === 0) {
      console.log(`⚠️  [跳过] 未识别到物模型属性 | topic: ${topic}`)
      return
    }

    const types = classifyData(props)
    const idStr = props.ID ? `设备:${props.ID}` : ''
    console.log(`\n📩 [收到] topic: ${topic}`)
    console.log(`   类型: ${types.join(' + ')} ${idStr}`)
    console.log(`   属性数: ${Object.keys(props).length}`)

    // 构建上报payload
    const payload = {
      deviceName: deviceName || props.ID || 'unknown',
      ...props
    }

    await forwardToApi(payload, topic)

  } catch (e) {
    stats.failed++
    console.error(`❌ [消息处理失败] ${e.message}`)
    console.error(`   原始消息: ${message.toString().slice(0, 200)}`)
  }
}

// ============================
// 打印统计信息
// ============================
function printStats() {
  const now = new Date().toISOString()
  console.log(`\n═══════ MQTT数据统计 ═══════`)
  console.log(`  启动时间: ${stats.startTime}`)
  console.log(`  当前时间: ${now}`)
  console.log(`  连接状态: ${client.connected ? '✅ 在线' : '❌ 离线'}`)
  console.log(`  收到消息: ${stats.received}`)
  console.log(`  成功入库: ${stats.forwarded}`)
  console.log(`  失败次数: ${stats.failed}`)
  console.log(`  最后消息: ${stats.lastMessage || '无'}`)
  if (Object.keys(stats.byTable).length > 0) {
    console.log(`  各表入库:`)
    for (const [table, count] of Object.entries(stats.byTable)) {
      console.log(`    - ${table}: ${count}条`)
    }
  }
  console.log(`═══════════════════════════════\n`)
}

// ============================
// MQTT客户端初始化
// ============================
const config = generateMQTTConfig()
console.log('╔══════════════════════════════════════════╗')
console.log('║     康养数字孪生 - MQTT数据接入服务      ║')
console.log('╚══════════════════════════════════════════╝')
console.log(`[配置] 设备: ${config.username}`)
console.log(`[配置] 服务端: ${config.host}:${config.port}`)
console.log(`[配置] API地址: http://${CONFIG.apiHost}:${CONFIG.apiPort}${CONFIG.apiPath}`)
console.log('')

const client = mqtt.connect(config)

// 订阅topics
const subscribeTopics = [
  // 自定义topic（规则引擎转发目标）
  `/${CONFIG.productKey}/${CONFIG.deviceName}/user/post`,
  `/${CONFIG.productKey}/${CONFIG.deviceName}/user/set`,
  `/${CONFIG.productKey}/${CONFIG.deviceName}/user/set2`,
  `/${CONFIG.productKey}/${CONFIG.deviceName}/user/data`,
  `/${CONFIG.productKey}/${CONFIG.deviceName}/user/forward`,
  // 系统topic
  `/sys/${CONFIG.productKey}/${CONFIG.deviceName}/thing/service/property/set`,
  `/sys/${CONFIG.productKey}/${CONFIG.deviceName}/thing/event/property/post_reply`,
  `/sys/${CONFIG.productKey}/${CONFIG.deviceName}/thing/event/property/post/post_reply`
]

client.on('connect', () => {
  console.log('\n✅ [MQTT] 连接阿里云IoT成功！')
  console.log('📡 开始订阅Topics...')

  let subscribed = 0
  for (const topic of subscribeTopics) {
    client.subscribe(topic, { qos: 0 }, (err) => {
      if (err) {
        console.error(`  ❌ 订阅失败: ${topic} - ${err.message}`)
      } else {
        subscribed++
        console.log(`  ✅ 订阅成功: ${topic}`)
      }
    })
  }

  setTimeout(() => {
    console.log(`\n📊 共订阅 ${subscribed}/${subscribeTopics.length} 个topic`)
    console.log('🚀 数据接入服务就绪，等待设备上报...\n')
  }, 2000)
})

client.on('message', (topic, message) => {
  handleMessage(topic, message)
})

client.on('error', (err) => {
  console.error(`❌ [MQTT错误] ${err.message}`)
})

client.on('close', () => {
  console.log('⚠️  [MQTT] 连接关闭，自动重连中...')
})

client.on('offline', () => {
  console.log('⚠️  [MQTT] 客户端离线')
})

client.on('reconnect', () => {
  console.log('🔄 [MQTT] 正在重连阿里云...')
})

// 定时心跳 + 统计
setInterval(() => {
  if (client.connected) {
    console.log(`💓 [心跳] ${new Date().toLocaleString('zh-CN')} | 收${stats.received}/成${stats.forwarded}/败${stats.failed}`)
  }
}, CONFIG.heartbeatInterval)

// 每10分钟打印完整统计
setInterval(() => {
  printStats()
}, 10 * 60 * 1000)

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n收到退出信号，正在关闭MQTT连接...')
  printStats()
  client.end(true, () => {
    console.log('MQTT连接已关闭，退出程序')
    process.exit(0)
  })
})

process.on('SIGTERM', () => {
  console.log('\n\n收到终止信号，正在关闭MQTT连接...')
  client.end(true, () => {
    process.exit(0)
  })
})

module.exports = { client, stats }
