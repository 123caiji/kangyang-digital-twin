function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}

function maskName(name) {
  if (!name || name.length < 1) return name
  if (name.length === 1) return name
  if (name.length === 2) return name[0] + '*'
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1]
}

function desensitize(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const sensitiveMap = {
    phone: maskPhone,
    contact_phone: maskPhone,
    emergency_contact: maskName,
    name: maskName,
    resident_name: maskName
  }
  const result = Array.isArray(obj) ? obj.map(item => desensitize(item)) : { ...obj }
  for (const [key, fn] of Object.entries(sensitiveMap)) {
    if (result[key] !== undefined && typeof result[key] === 'string') {
      result[key] = fn(result[key])
    }
  }
  return result
}

function desensitizeMiddleware(req, res, next) {
  const originalJson = res.json.bind(res)
  res.json = function (data) {
    if (data && data.data && req.user && req.user.role !== 'admin') {
      data.data = desensitize(data.data)
    }
    return originalJson(data)
  }
  next()
}

module.exports = { desensitizeMiddleware, desensitize, maskPhone, maskName }
