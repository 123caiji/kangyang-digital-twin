/**
 * 建筑空间布局与房间归属 · 单一事实来源
 *
 * 为什么单独成模块：
 *   三维总览、按房间聚合接口、数据播种三处都必须读同一份布局定义，
 *   任何一处自己写一套坐标，就会重演「Dashboard.vue 硬编码 101室」那类错位。
 *
 * 模数依据：《老年人照料设施建筑设计标准》JGJ 450-2018
 *   双人间居室使用面积 ≥ 16.00 ㎡   → 取 4.0 × 4.0 = 16 ㎡
 *   走廊通行净宽     ≥ 1.80 m      → 取 2.4 m
 *   护理型床位居室门 ≥ 1.10 m      → 记在 meta.doorWidth
 *   照料单元         ≤ 60 床       → 3 层 × 6 间 × 2 床 = 36 床 ✓
 *   居室应设在阳面                 → 记在 meta.orientation
 *
 * 坐标约定：单位 = 米；X 为楼层长边，Z 为短边，Y 为高度偏移。
 *   节点坐标是**相对父节点**的（树状累加），这样新增楼栋时每栋可有各自原点。
 */

// ---------------------------------------------------------------- 模数
const MODULE = {
  roomWidth: 4.0, // 房间沿 X 的尺寸（双人间 16㎡，合规）
  roomDepth: 4.0, // 房间沿 Z 的尺寸
  corridorWidth: 2.4, // 走廊通行净宽（规范 ≥1.8m）
  floorHeight: 3.2, // 层高
  slabThickness: 0.3, // 楼板厚
  zoneDepth: 4.0, // 公共功能区进深（与房间同深，便于对齐）
  zoneWidth: 3.0, // 公共功能区面宽
  roomsPerFloor: 6, // 每层 6 间（南北各 3）
  floors: 3, // 楼层数：改这个常量即可扩展新楼层
  bedsPerRoom: 2, // 每间床位数（与 rooms.capacity 一致）
  nurseRoom: '护士站',
  wardWidth: 12 // 3 间 × 4m，房间区总长
}

// 房间在 X 上的三个位置（-4 / 0 / 4），沿走廊依次排布
const X_SLOTS = Array.from({ length: MODULE.roomsPerFloor / 2 }, (_, i) =>
  (i - (MODULE.roomsPerFloor / 2 - 1) / 2) * MODULE.roomWidth
)
// 南侧 / 北侧在 Z 上的位置（走廊宽 2.4，房间深 4）
const Z_SOUTH = -(MODULE.corridorWidth / 2 + MODULE.roomDepth / 2)
const Z_NORTH = MODULE.corridorWidth / 2 + MODULE.roomDepth / 2
// 公共功能区所在的两端
const X_EAST = MODULE.wardWidth / 2 + MODULE.zoneWidth / 2
const X_WEST = -X_EAST

/**
 * 生成空间树节点定义。
 * 全部由 MODULE 参数推导 —— 想加楼层只改 MODULE.floors，想加楼栋在这里补一段即可。
 */
function buildLayoutNodes() {
  const campus = {
    code: 'CAMPUS-1',
    name: '康养园区',
    node_type: 'campus',
    parent_code: null,
    x: 0, z: 0, y: 0, width: 0, depth: 0, height: 0,
    sort: 0,
    meta: { description: '园区根节点，后续多栋建筑/室外环境都挂在这一层下' }
  }

  const building = {
    code: 'B1',
    name: '1号楼',
    node_type: 'building',
    parent_code: campus.code,
    x: 0, z: 0, y: 0,
    width: MODULE.wardWidth + MODULE.zoneWidth * 2,
    depth: (Math.abs(Z_NORTH) + MODULE.roomDepth / 2) * 2,
    height: MODULE.floors * MODULE.floorHeight,
    sort: 1,
    meta: { floors: MODULE.floors, roomsPerFloor: MODULE.roomsPerFloor }
  }

  const nodes = [campus, building]

  for (let f = 1; f <= MODULE.floors; f++) {
    const floorCode = `B1-F${f}`
    const baseY = (f - 1) * MODULE.floorHeight

    nodes.push({
      code: floorCode,
      name: `${f}层`,
      node_type: 'floor',
      parent_code: building.code,
      x: 0, z: 0, y: baseY,
      width: building.width, depth: building.depth, height: MODULE.floorHeight,
      sort: f,
      // floor 显式写进 meta：前端做楼层筛选与标签时不必再从 code 里猜
      meta: { floor: f }
    })

    // 每层 6 间房：南侧 3 间（房号 1-3）+ 北侧 3 间（房号 4-6）
    for (let r = 1; r <= MODULE.roomsPerFloor; r++) {
      const isSouth = r <= MODULE.roomsPerFloor / 2
      const slotIndex = isSouth ? r - 1 : r - 1 - MODULE.roomsPerFloor / 2
      const roomNo = `${f}0${r}`
      nodes.push({
        code: roomNo,
        name: `${roomNo}室`,
        node_type: 'room',
        parent_code: floorCode,
        x: X_SLOTS[slotIndex],
        z: isSouth ? Z_SOUTH : Z_NORTH,
        y: 0,
        width: MODULE.roomWidth,
        depth: MODULE.roomDepth,
        height: MODULE.floorHeight - MODULE.slabThickness,
        sort: r,
        meta: {
          roomNo,
          floor: f,
          orientation: isSouth ? 'south' : 'north',
          doorWidth: 0.9 // 普通居室门 ≥0.8m
        }
      })
    }

    // 走廊（每层一条，贯穿房间区）
    nodes.push({
      code: `${floorCode}-CORRIDOR`,
      name: '走廊',
      node_type: 'zone',
      parent_code: floorCode,
      x: 0, z: 0, y: 0,
      width: MODULE.wardWidth,
      depth: MODULE.corridorWidth,
      height: MODULE.floorHeight - MODULE.slabThickness,
      sort: 90,
      meta: { zoneType: 'corridor', clearWidth: MODULE.corridorWidth, guideline: '通行净宽 ≥1.80m' }
    })

    // 护理站（每层东端，便于服务本层住户）
    nodes.push({
      code: `${floorCode}-NURSE`,
      name: '护理站',
      node_type: 'zone',
      parent_code: floorCode,
      x: X_EAST, z: 0, y: 0,
      width: MODULE.zoneWidth,
      depth: MODULE.zoneDepth,
      height: MODULE.floorHeight - MODULE.slabThickness,
      sort: 91,
      meta: { zoneType: 'nursing', theme: 'nursing', label: '护理站' }
    })
  }

  // 一号楼一层的公共功能区（西端）：餐厅 + 康复室
  // 放在一层是依据「老年人公共活动用房、康复与医疗用房应布置在地下一层及以上楼层」
  const publicZones = [
    { code: 'B1-DINING', name: '餐厅', z: Z_SOUTH, meta: { zoneType: 'dining', theme: 'dining', label: '餐厅' } },
    { code: 'B1-REHAB', name: '康复室', z: Z_NORTH, meta: { zoneType: 'rehab', theme: 'rehab', label: '康复室' } }
  ]
  publicZones.forEach((z, i) => {
    nodes.push({
      code: z.code,
      name: z.name,
      node_type: 'zone',
      parent_code: 'B1-F1',
      x: X_WEST, z: z.z, y: 0,
      width: MODULE.zoneWidth,
      depth: MODULE.zoneDepth,
      height: MODULE.floorHeight - MODULE.slabThickness,
      sort: 92 + i,
      meta: z.meta
    })
  })

  return nodes
}

/**
 * 住户的房间归属表（演示数据，10 位住户）。
 *
 * 三个刻意的设计（都是踩过坑才加上的）：
 *   1. 分布在 3 个楼层，让沙盘每层都有内容（否则 2、3 楼是空的）
 *   2. 南向(1-3 号房)与北向(4-6 号房)都要有人，否则近侧整排空房会挡住后面有人住的房间
 *   3. 左(x=-4)、中(x=0)、右(x=+4)三列都要覆盖，否则沙盘会明显偏向一侧
 */
const RESIDENT_ASSIGNMENT = [
  { room_no: '101', bed_no: 1 }, // 1F 南·左
  { room_no: '101', bed_no: 2 },
  { room_no: '103', bed_no: 1 }, // 1F 南·右
  { room_no: '105', bed_no: 1 }, // 1F 北·中
  { room_no: '201', bed_no: 1 }, // 2F 南·左
  { room_no: '201', bed_no: 2 },
  { room_no: '205', bed_no: 1 }, // 2F 北·中
  { room_no: '302', bed_no: 1 }, // 3F 南·中
  { room_no: '302', bed_no: 2 },
  { room_no: '306', bed_no: 1 } // 3F 北·右
]

/**
 * 由归属表推导每间房的在住人数（rooms.occupancy 的唯一来源，避免与住户记录打架）。
 */
function occupancyFromAssignment() {
  const map = {}
  for (const a of RESIDENT_ASSIGNMENT) {
    map[a.room_no] = (map[a.room_no] || 0) + 1
  }
  return map
}

// ---------------------------------------------------------------- 播种（幂等）

/** 建 space_nodes 表并写入布局节点（已存在则跳过，可重复调用） */
function seedSpaceNodes(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS space_nodes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL,
      node_type   TEXT NOT NULL,
      parent_code TEXT,
      room_id     INTEGER,
      x           REAL DEFAULT 0,
      z           REAL DEFAULT 0,
      y           REAL DEFAULT 0,
      width       REAL DEFAULT 0,
      depth       REAL DEFAULT 0,
      height      REAL DEFAULT 3.2,
      rotation    REAL DEFAULT 0,
      sort        INTEGER DEFAULT 0,
      meta        TEXT DEFAULT '{}',
      created_at  TEXT DEFAULT (datetime('now','localtime'))
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_space_parent ON space_nodes(parent_code)')

  const exists = db.prepare('SELECT COUNT(*) c FROM space_nodes').get().c
  if (exists > 0) return { inserted: 0, skipped: true }

  const insert = db.prepare(`
    INSERT INTO space_nodes (code, name, node_type, parent_code, x, z, y, width, depth, height, sort, meta)
    VALUES (@code, @name, @node_type, @parent_code, @x, @z, @y, @width, @depth, @height, @sort, @meta)
  `)
  const roomIdOf = new Map(
    db.prepare('SELECT id, room_no FROM rooms').all().map((r) => [r.room_no, r.id])
  )

  const run = db.transaction((nodes) => {
    for (const n of nodes) {
      insert.run({ ...n, meta: JSON.stringify(n.meta || {}) })
      // room 节点回填关联的 rooms.id，方便直接 join 房态数据
      if (n.node_type === 'room' && roomIdOf.has(n.code)) {
        db.prepare('UPDATE space_nodes SET room_id = ? WHERE code = ?').run(roomIdOf.get(n.code), n.code)
      }
    }
  })
  run(buildLayoutNodes())

  return { inserted: buildLayoutNodes().length, skipped: false }
}

/**
 * 把历史数据里 4 位的「房号+床位」编码规范成 3 位房号，
 * 并让 rooms.occupancy 与 alarms.room_no 都从住户实际归属推导。
 *
 * 幂等：重复执行结果一致；对后续手工新增的住户也安全
 *（只修正房号非法的记录，occupancy 始终按真实住户数统计）。
 */
function normalizeRoomRefs(db) {
  const cols = db.prepare('PRAGMA table_info(residents)').all().map((c) => c.name)
  if (!cols.includes('bed_no')) {
    db.exec('ALTER TABLE residents ADD COLUMN bed_no INTEGER DEFAULT 1')
  }

  const apply = db.transaction(() => {
    // 1) 修正非法房号：不在 rooms 表里的（含 4 位编码）按归属表回填
    const valid = new Set(db.prepare('SELECT room_no FROM rooms').all().map((r) => r.room_no))
    const residents = db.prepare('SELECT id, room_no FROM residents ORDER BY id').all()
    const setRoom = db.prepare('UPDATE residents SET room_no = ? WHERE id = ?')
    let fixed = 0
    residents.forEach((r, i) => {
      if (valid.has(r.room_no)) return
      const a = RESIDENT_ASSIGNMENT[i % RESIDENT_ASSIGNMENT.length]
      setRoom.run(a.room_no, r.id)
      fixed++
    })

    // 2) 床位号：按同一房间内的顺序编号（1、2…），不依赖固定表
    const seat = {}
    const ordered = db
      .prepare('SELECT id, room_no FROM residents WHERE room_no IS NOT NULL ORDER BY room_no, id')
      .all()
    const setBed = db.prepare('UPDATE residents SET bed_no = ? WHERE id = ?')
    for (const r of ordered) {
      seat[r.room_no] = (seat[r.room_no] || 0) + 1
      setBed.run(seat[r.room_no], r.id)
    }

    // 3) rooms.occupancy 由住户实际分布推导 —— 保证与住户记录永不打架
    const occ = {}
    for (const row of db
      .prepare('SELECT room_no, COUNT(*) c FROM residents WHERE room_no IS NOT NULL GROUP BY room_no')
      .all()) {
      occ[row.room_no] = row.c
    }
    const updateRoom = db.prepare('UPDATE rooms SET occupancy = ?, status = ? WHERE room_no = ?')
    for (const room of db.prepare('SELECT room_no FROM rooms').all()) {
      const n = occ[room.room_no] || 0
      updateRoom.run(n, n > 0 ? 'occupied' : 'available', room.room_no)
    }

    // 4) 告警房号跟随住户所在房间（原来直接抄了住户的 4 位编码）
    db.exec(`
      UPDATE alarms
         SET room_no = (SELECT r.room_no FROM residents r WHERE r.id = alarms.resident_id)
       WHERE resident_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM residents r WHERE r.id = alarms.resident_id)
    `)
    // 兜底：无关联住户的告警，把残留的 4 位编码截断为 3 位（仅当截断后是合法房号）
    db.exec(`
      UPDATE alarms SET room_no = substr(room_no, 1, 3)
       WHERE room_no IS NOT NULL AND length(room_no) = 4
         AND substr(room_no, 1, 3) IN (SELECT room_no FROM rooms)
    `)

    return { fixedResidents: fixed }
  })

  const stat = apply()

  return {
    ...stat,
    residents: db.prepare('SELECT COUNT(*) c FROM residents').get().c,
    occupancyTotal: db.prepare('SELECT COALESCE(SUM(occupancy),0) c FROM rooms').get().c,
    alarmsMatched: db
      .prepare('SELECT COUNT(*) c FROM alarms WHERE room_no IN (SELECT room_no FROM rooms)')
      .get().c,
    alarmsTotal: db.prepare('SELECT COUNT(*) c FROM alarms').get().c
  }
}

/**
 * 把已存在的空间节点的 meta 与 layout.js 对齐。
 *
 * 用途：layout.js 是布局的单一事实来源，当它新增了 meta 字段（例如给楼层补上 floor 编号）时，
 * 老库里的节点需要跟着刷新，否则前端会取不到新字段。
 * 只同步 meta，不覆盖坐标尺寸 —— 手工在库里调过坐标的情况不会被冲掉。
 */
function syncSpaceNodesMeta(db) {
  const exists = db.prepare('SELECT COUNT(*) c FROM space_nodes').get().c
  if (!exists) return 0

  const defs = new Map(buildLayoutNodes().map((n) => [n.code, n]))
  const current = db.prepare('SELECT code, meta FROM space_nodes').all()
  const update = db.prepare('UPDATE space_nodes SET meta = ? WHERE code = ?')

  let changed = 0
  const tx = db.transaction(() => {
    for (const row of current) {
      const def = defs.get(row.code)
      if (!def) continue
      const want = JSON.stringify(def.meta || {})
      if (row.meta !== want) {
        update.run(want, row.code)
        changed++
      }
    }
  })
  tx()
  return changed
}

/** 一次到位：建空间树 + 同步 meta + 规范化数据 */
function ensureLayout(db) {
  const space = seedSpaceNodes(db)
  const synced = syncSpaceNodesMeta(db)
  const data = normalizeRoomRefs(db)
  return { space, synced, data }
}

module.exports = {
  MODULE,
  buildLayoutNodes,
  RESIDENT_ASSIGNMENT,
  occupancyFromAssignment,
  seedSpaceNodes,
  syncSpaceNodesMeta,
  normalizeRoomRefs,
  ensureLayout
}
