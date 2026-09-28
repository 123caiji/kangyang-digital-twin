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
