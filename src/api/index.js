import http from './http'

export const getCaptcha = () => http.get('/auth/captcha')
export const login = (data) => http.post('/auth/login', data)
export const getMe = () => http.get('/auth/me')
export const getUsers = () => http.get('/auth/users')
export const createUser = (data) => http.post('/auth/users', data)
export const updateUser = (id, data) => http.put(`/auth/users/${id}`, data)
export const deleteUser = (id) => http.delete(`/auth/users/${id}`)

export const getTables = () => http.get('/data/tables')
export const getTableData = (table, params) => http.get(`/data/${table}`, { params })
export const createRow = (table, data) => http.post(`/data/${table}`, data)
export const updateRow = (table, id, data) => http.put(`/data/${table}/${id}`, data)
export const deleteRow = (table, id) => http.delete(`/data/${table}/${id}`)
export const exportTable = (table) =>
  http.get(`/data/${table}/export`, { responseType: 'blob' })
export const importTable = (table, file) => {
  const form = new FormData()
  form.append('file', file)
  return http.post(`/data/${table}/import`, form)
}
export const getOverview = () => http.get('/data/stats/overview')

export const getSettings = () => http.get('/settings')
export const saveSettings = (data) => http.put('/settings', data)
export const getDbConfigs = () => http.get('/settings/db-config')
export const createDbConfig = (data) => http.post('/settings/db-config', data)
export const updateDbConfig = (id, data) => http.put(`/settings/db-config/${id}`, data)
export const deleteDbConfig = (id) => http.delete(`/settings/db-config/${id}`)
export const testDbConfig = (data) => http.post('/settings/db-config/test', data)

export const runPredict = (formData) =>
  http.post('/predict/run', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const getPredictHistory = () => http.get('/predict/history')

export const aiAnalyze = (question) => http.post('/ai/analyze', { question })
export const getAiConfig = () => http.get('/ai/config')
export const saveAiConfig = (data) => http.put('/ai/config', data)

export const iotReport = (data) => http.post('/iot/report', data)
export const iotSimulate = () => http.post('/iot/simulate')
export const iotHealthLatest = (limit) => http.get('/iot/health/latest', { params: { limit } })
export const iotHealthByResident = (id, limit) => http.get(`/iot/health/${id}`, { params: { limit } })
export const iotEnvLatest = (limit) => http.get('/iot/environment/latest', { params: { limit } })
export const iotEnvByRoom = (roomNo, limit) => http.get(`/iot/environment/${roomNo}`, { params: { limit } })
export const iotOutdoor = (limit) => http.get('/iot/outdoor', { params: { limit } })
export const iotSoil = (limit) => http.get('/iot/soil', { params: { limit } })
export const iotDashboard = () => http.get('/iot/dashboard')

export const getDevices = () => http.get('/iot/devices')
export const createDevice = (data) => http.post('/iot/devices', data)
export const updateDevice = (id, data) => http.put(`/iot/devices/${id}`, data)
export const deleteDevice = (id) => http.delete(`/iot/devices/${id}`)
export const resetDeviceToken = (id) => http.post(`/iot/devices/${id}/reset-token`)
export const controlSG90 = (id, status) => http.post(`/iot/devices/${id}/sg90`, { status })

export const getAuditLogs = (limit) => http.get('/audit/logs', { params: { limit } })

// 总览沙盘：空间树 + 按房间聚合的实时状态（新增，只读）
export const getSpaceLayout = () => http.get('/overview/layout')
export const getRoomOverview = () => http.get('/overview/rooms')
export const getRoomDetail = (roomNo) => http.get(`/overview/rooms/${roomNo}`)
/** 每位住户的最新一条健康记录（含房间号），供三维场景与按房间聚合使用 */
export const getResidentsLatest = () => http.get('/overview/residents')
