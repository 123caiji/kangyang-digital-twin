/**
 * 数据库字段 → 中文展示名
 * 后端 /api/data/tables 返回的是原始列名，直接作为表头/表单标签可读性差。
 * 未收录的字段原样回退，不会丢信息。
 */
const LABELS = {
  id: 'ID',
  created_at: '创建时间',
  updated_at: '更新时间',

  // 住户档案 / 通用
  name: '姓名',
  gender: '性别',
  age: '年龄',
  room_no: '房间号',
  care_level: '护理等级',
  health_status: '健康状况',
  admission_date: '入住日期',
  contact_phone: '联系电话',
  emergency_contact: '紧急联系人',
  conditions: '既往病史',
  remark: '备注',

  // 房间管理
  floor: '楼层',
  type: '类型',
  capacity: '床位数',
  occupancy: '在住人数',
  status: '状态',

  // 设备台账
  resident_id: '住户ID',
  battery: '电量(%)',
  last_active: '最近活跃',

  // 健康监测
  resident_name: '住户姓名',
  heart_rate: '心率',
  breathing_rate: '呼吸',
  spo2: '血氧',
  temperature: '体温',
  systolic: '收缩压',
  diastolic: '舒张压',
  glucose: '血糖',
  fall_status: '跌倒状态',
  pir_status: '人体感应',
  measured_at: '测量时间',

  // 护理记录
  caregiver: '护理员',
  care_type: '护理类型',
  content: '护理内容',
  shift: '班次',
  date: '日期',

  // 室内环境
  humidity: '湿度',
  pm25: 'PM2.5',
  pm10: 'PM10',
  smoke: '烟雾',
  illumination: '光照',
  co2: 'CO₂',
  light: '灯光',
  noise: '噪音',

  // 室外气象
  pressure: '气压',
  wind_direction: '风向',
  wind_speed: '风速',

  // 土壤监测
  zone: '区域',
  soil_temp_1: '土壤温度1',
  soil_humi_1: '土壤湿度1',
  soil_temp_2: '土壤温度2',
  soil_humi_2: '土壤湿度2',
  soil_temp_3: '土壤温度3',
  soil_humi_3: '土壤湿度3',
  ph: 'pH 值',
  nitrogen: '氮含量',
  phosphorus: '磷含量',
  potassium: '钾含量',

  // IoT 原始数据
  device_id: '设备ID',
  payload: '原始报文',
  received_at: '接收时间',

  // 设备使用
  device_name: '设备名称',
  device_type: '设备类型',
  usage_hours: '使用时长(h)',
  power_consumption: '耗电量(kWh)',
  alert_count: '告警次数',

  // 告警事件
  title: '标题',
  level: '级别',
  description: '描述',
  handler: '处理人',
  resolved_at: '解决时间',

  // 用户
  username: '用户名',
  phone: '手机号',
  role: '角色',
  permissions: '权限'
}

export function fieldLabel(column) {
  return LABELS[column] || column
}

/** 表格/卡片里统一的值渲染：空值给中划线，超长文本截断 */
export function displayValue(value, maxLength = 120) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? '是' : '否'
  const text = String(value)
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

/** 卡片标题优先取业务主字段，取不到再退回 ID */
export function primaryField(columns = []) {
  const preferred = ['name', 'title', 'room_no', 'zone', 'device_name', 'resident_name', 'username']
  return preferred.find((c) => columns.includes(c)) || columns.find((c) => c !== 'id') || null
}
