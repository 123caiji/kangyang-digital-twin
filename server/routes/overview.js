/**
 * 总览沙盘接口
 *
 * 只读接口，不改动任何现有数据表，供新的「总览沙盘」页面使用。
 *   GET /api/overview/layout → 空间树（园区→楼栋→楼层→房间/功能区）
 *   GET /api/overview/rooms  → 每间房的聚合状态（供三维着色）
 */
const express = require('express')
const db = require('../db')
const { auth } = require('../middleware/auth')

const router = express.Router()

/** 把扁平的 space_nodes 组装成树 */
function buildTree(rows) {
  const byCode = new Map()
  for (const r of rows) {
    byCode.set(r.code, {
      ...r,
      meta: safeParse(r.meta),
      children: []
    })
  }
  const roots = []
  for (const node of byCode.values()) {
    if (node.parent_code && byCode.has(node.parent_code)) {
      byCode.get(node.parent_code).children.push(node)
    } else {
      roots.push(node)
    }
  }
  // 同级按 sort 排序
  const sortRec = (list) => {
    list.sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.code.localeCompare(b.code))
    list.forEach((n) => sortRec(n.children))
  }
  sortRec(roots)
  return roots
}

function safeParse(text) {
  try {
    return JSON.parse(text || '{}')
  } catch {
    return {}
  }
}

/** 空间树 + 模数信息（前端按此生成三维） */
router.get('/layout', auth(), (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, code, name, node_type, parent_code, room_id,
              x, z, y, width, depth, height, rotation, sort, meta
         FROM space_nodes`
    )
    .all()

  const layout = require('../layout')

  res.json({
    code: 0,
    data: {
      tree: buildTree(rows),
      module: layout.MODULE,
      total: rows.length
    }
  })
})

/**
 * 每间房的聚合状态。
 * 这是「哪间房有告警就变红」的数据来源 —— 全部由真实外键/房号关联，
 * 不再有任何硬编码房间号。
 */
router.get('/rooms', auth(), (_req, res) => {
  const rooms = db
    .prepare(
      `SELECT r.room_no, r.floor, r.type, r.capacity, r.occupancy, r.status, r.remark,
              (SELECT COUNT(*) FROM devices d
                WHERE d.room_no = r.room_no)                              AS device_count,
              (SELECT COUNT(*) FROM devices d
                WHERE d.room_no = r.room_no AND d.status <> 'online')      AS offline_devices,
              (SELECT COUNT(*) FROM alarms a
                WHERE a.room_no = r.room_no AND a.status = 'pending')       AS pending_alarms,
              (SELECT COUNT(*) FROM alarms a
                WHERE a.room_no = r.room_no AND a.status = 'processing')    AS processing_alarms,
              (SELECT COUNT(*) FROM alarms a
                WHERE a.room_no = r.room_no AND a.status <> 'resolved')     AS open_alarms,
              -- 住户健康最差等级：critical=2 attention=1 stable=0，无住户为 NULL
              (SELECT MAX(CASE rs.health_status
                            WHEN 'critical' THEN 2
                            WHEN 'attention' THEN 1
                            ELSE 0 END)
                 FROM residents rs WHERE rs.room_no = r.room_no)           AS worst_health,
              -- 最近一次室内环境状态
              (SELECT e.status FROM room_environment e
                WHERE e.room_no = r.room_no
                ORDER BY e.measured_at DESC LIMIT 1)                       AS env_status
         FROM rooms r
        ORDER BY r.floor, r.room_no`
    )
    .all()

  const residentsByRoom = {}
  for (const p of db
    .prepare(
      `SELECT id, name, gender, age, room_no, bed_no, care_level, health_status, conditions
         FROM residents WHERE room_no IS NOT NULL ORDER BY room_no, bed_no`
    )
    .all()) {
    ;(residentsByRoom[p.room_no] ||= []).push(p)
  }

  const pendingByRoom = {}
  for (const a of db
    .prepare(
      `SELECT id, title, type, level, room_no, resident_name, status, created_at
         FROM alarms
        WHERE status <> 'resolved' AND room_no IS NOT NULL
        ORDER BY created_at DESC`
    )
    .all()) {
    ;(pendingByRoom[a.room_no] ||= []).push(a)
  }

  /**
   * 房间状态判定（优先级从高到低）：
   *   critical 有「待处理」告警，或住户健康为 critical
   *   warning  有「处理中」告警，或住户需关注，或（有人的房间）设备离线
   *   normal   有人居住且无异常
   *   empty    空房（无人时设备离线不单独判为异常，否则空房会满屏告警色）
   */
  function judgeStatus(room) {
    const health = room.worst_health ?? 0
    const occupied = room.occupancy > 0
    if (room.pending_alarms > 0 || health >= 2) return 'critical'
    if (occupied && (room.processing_alarms > 0 || health >= 1 || room.offline_devices > 0)) {
      return 'warning'
    }
    return occupied ? 'normal' : 'empty'
  }

  const list = rooms.map((room) => ({
    roomNo: room.room_no,
    floor: room.floor,
    type: room.type,
    capacity: room.capacity,
    occupancy: room.occupancy,
    status: judgeStatus(room),
    roomStatus: room.status,
    remark: room.remark,
    deviceCount: room.device_count,
    offlineDevices: room.offline_devices,
    pendingAlarms: room.pending_alarms,
    processingAlarms: room.processing_alarms,
    openAlarms: room.open_alarms,
    worstHealth: room.worst_health,
    envStatus: room.env_status,
    residents: residentsByRoom[room.room_no] || [],
    alarms: pendingByRoom[room.room_no] || []
  }))

  const summary = {
    totalRooms: list.length,
    totalBeds: list.reduce((s, r) => s + (r.capacity || 0), 0),
    occupied: list.reduce((s, r) => s + (r.occupancy || 0), 0),
    emptyRooms: list.filter((r) => r.status === 'empty').length,
    critical: list.filter((r) => r.status === 'critical').length,
    warning: list.filter((r) => r.status === 'warning').length,
    normal: list.filter((r) => r.status === 'normal').length,
    pendingAlarms: list.reduce((s, r) => s + r.pendingAlarms, 0),
    processingAlarms: list.reduce((s, r) => s + r.processingAlarms, 0),
    offlineDevices: list.reduce((s, r) => s + r.offlineDevices, 0),
    byFloor: [1, 2, 3].map((f) => {
      const rowsOfFloor = list.filter((r) => r.floor === f)
      return {
        floor: f,
        rooms: rowsOfFloor.length,
        occupied: rowsOfFloor.reduce((s, r) => s + (r.occupancy || 0), 0),
        pendingAlarms: rowsOfFloor.reduce((s, r) => s + r.pendingAlarms, 0),
        critical: rowsOfFloor.filter((r) => r.status === 'critical').length,
        warning: rowsOfFloor.filter((r) => r.status === 'warning').length
      }
    })
  }

  res.json({ code: 0, data: { list, summary } })
})

/**
 * 每位住户的最新一条健康记录（含所属房间）。
 *
 * 为什么需要它：resident_health 是流水表，每人有 7 天以上记录。
 * 三维场景需要的是「每位住户当前状态」，直接取流水列表会让同一个人在场景里
 * 出现多个节点、按房间聚合也会算错。现有的 /iot/health/latest 只是「最新 N 条」，
 * 条数不够时覆盖不全住户，所以这里单独提供一个「每人一条」的接口。
 */
router.get('/residents', auth(), (_req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.name AS resident_name, r.gender, r.age, r.room_no, r.bed_no,
              r.care_level, r.health_status, r.conditions,
              h.heart_rate, h.breathing_rate, h.spo2, h.temperature,
              h.systolic, h.diastolic, h.glucose,
              h.fall_status, h.pir_status, h.status AS status,
              h.measured_at
         FROM residents r
         LEFT JOIN resident_health h
           ON h.id = (SELECT MAX(h2.id) FROM resident_health h2 WHERE h2.resident_id = r.id)
        ORDER BY r.room_no, r.bed_no`
    )
    .all()

  res.json({ code: 0, data: rows })
})

/** 单个房间详情（供下钻面板展开时取更细的数据） */
router.get('/rooms/:roomNo', auth(), (req, res) => {
  const roomNo = String(req.params.roomNo)
  const room = db.prepare('SELECT * FROM rooms WHERE room_no = ?').get(roomNo)
  if (!room) return res.status(404).json({ code: 404, message: '房间不存在' })

  const node = db.prepare("SELECT * FROM space_nodes WHERE node_type = 'room' AND code = ?").get(roomNo)

  res.json({
    code: 0,
    data: {
      room,
      node: node ? { ...node, meta: safeParse(node.meta) } : null,
      residents: db
        .prepare(
          `SELECT id, name, gender, age, bed_no, care_level, health_status, conditions,
                  admission_date, contact_phone, emergency_contact
             FROM residents WHERE room_no = ? ORDER BY bed_no`
        )
        .all(roomNo),
      devices: db.prepare('SELECT * FROM devices WHERE room_no = ?').all(roomNo),
      alarms: db
        .prepare(
          `SELECT id, title, type, level, resident_name, status, description, handler, created_at
             FROM alarms WHERE room_no = ? ORDER BY created_at DESC LIMIT 20`
        )
        .all(roomNo),
      health: db
        .prepare(
          `SELECT h.* FROM resident_health h
             JOIN residents r ON r.id = h.resident_id
            WHERE r.room_no = ?
            ORDER BY h.measured_at DESC LIMIT 30`
        )
        .all(roomNo),
      environment: db
        .prepare(
          `SELECT * FROM room_environment WHERE room_no = ? ORDER BY measured_at DESC LIMIT 14`
        )
        .all(roomNo)
    }
  })
})

module.exports = router
