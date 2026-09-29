<template>
  <div ref="wrapRef" class="campus3d" :class="{ 'is-touch': isTouch }">
    <!-- 楼层过滤：全楼 / 单层高亮 -->
    <div class="campus-tools" role="group" aria-label="楼层筛选">
      <button
        type="button"
        :class="{ active: activeFloor === 0 }"
        :aria-pressed="activeFloor === 0"
        @click="setFloor(0)"
      >
        全楼
      </button>
      <button
        v-for="f in floorList"
        :key="f"
        type="button"
        :class="{ active: activeFloor === f }"
        :aria-pressed="activeFloor === f"
        @click="setFloor(f)"
      >
        {{ f }}F
      </button>
      <span class="split" aria-hidden="true"></span>
      <button type="button" :aria-pressed="showLabels" @click="showLabels = !showLabels">{{ showLabels ? '隐藏房号' : '显示房号' }}</button>
      <button type="button" :aria-pressed="motionPaused" @click="motionPaused = !motionPaused">{{ motionPaused ? '恢复提示' : '暂停提示' }}</button>
      <button type="button" aria-label="重置视角" title="重置视角" @click="resetView">⟳</button>
    </div>

    <div class="campus-hint" v-if="!selected">
      <template v-if="isTouch">单指拖拽旋转 · 双指捏合缩放 · 点房间查看</template>
      <template v-else>拖拽旋转 · 滚轮缩放 · 点击房间查看</template>
    </div>

    <div class="gl-fallback" v-if="glFailed" role="status">
      <p class="gl-title">当前设备未启用 WebGL，园区沙盘无法渲染</p>
      <p class="gl-sub">可在浏览器设置中开启硬件加速后重试；其余页面不受影响。</p>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createSceneControls } from '@/three/sceneControls'

const props = defineProps({
  /** 展平后的空间树节点（含 world 世界坐标） */
  nodes: { type: Array, default: () => [] },
  /** 建筑包围盒信息 */
  bounds: { type: Object, default: () => ({ width: 40, depth: 40, height: 12, center: { x: 0, y: 0, z: 0 } }) },
  /** roomNo → 聚合状态 */
  roomStates: { type: Map, default: () => new Map() },
  /** 当前选中的房间号 */
  selected: { type: String, default: '' },
  /** 当前选中的功能区 code */
  selectedZone: { type: String, default: '' },
  /** 取景偏移比例（0~0.3）：避开左侧概览面板 */
  panelInset: { type: Number, default: 0.11 }
})

const emit = defineEmits(['select', 'select-zone', 'ready', 'webgl-failed'])

const wrapRef = ref(null)
const glFailed = ref(false)
const activeFloor = ref(0)
const showLabels = ref(true)
const isTouch = ref(
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(pointer: coarse)').matches
    : false
)
const motionPaused = ref(typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)

// 状态色（与全局主题一致；三维里用十六进制数值）
const COLORS = {
  normal: 0x42d97a,
  warning: 0xffaa00,
  critical: 0xff4f7a,
  empty: 0x4a4258,
  primary: 0xff8c42,
  accent: 0xffb627,
  corridor: 0x4fb8d9,
  nurse: 0xff8c42,
  dining: 0xffb627,
  rehab: 0x6dd97a,
  slab: 0x5a4a6a,
  framework: 0xff8c42,
  shell: 0x9fc6d8,
  paving: 0x2a3540,
  bedOn: 0xfff1dc,
  bedOff: 0x3b3448
}

let renderer, scene, camera, clock, animationId, raycaster, rig
let alive = false
let resizeObserver = null
// View state only; orbit, pan, damping and fit live in sceneControls.
const cam = { goalTarget: new THREE.Vector3(0, 5, 0), radius: 40, goalRadius: 40, minRadius: 7 }

// 指针状态
const pointers = new Map()
let dragging = false
let dragDistance = 0
let lastX = 0
let lastY = 0
let pinchDistance = 0
let pinchRadius = 0
let pinchActive = false
let lastZoomedState = null

const floorList = computed(() => {
  const floors = props.nodes.filter((n) => n.node_type === 'floor').map((n) => Number(n.meta?.floor || 0))
  return [...new Set(floors)].filter(Boolean).sort((a, b) => a - b)
})

// ---------------------------------------------------------------- 材质
function solidMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: opts.emissiveIntensity ?? 0.28,
    metalness: 0.45,
    roughness: 0.38,
    transparent: opts.opacity !== undefined,
    opacity: opts.opacity ?? 1
  })
}

function glassMat(color, opacity = 0.16) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.2,
    metalness: 0.1,
    roughness: 0.1,
    transparent: true,
    opacity,
    depthWrite: false
  })
}

/** 装饰性几何：不参与拾取，构建结束时按材质合批以降低 draw call */
function deco(mesh) {
  mesh.userData.merge = true
  mesh.userData.pickable = false
  return mesh
}

/**
 * 每次构建共享的材质集合。
 * 家具、扶手、床铺这类装饰件数量大（18 间房 × 2 床 + 各层功能区），
 * 若每间房各建一份材质，合批就退化成上百个 draw call；共享材质后可按材质合并。
 */
let M = null

// 场景内容分组
let contentGroup = null
let roomMeshes = [] // { mesh, node }
let zoneMeshes = [] // { mesh, node }
let slabMeshes = [] // { mesh, floor }
let roomLabels = [] // 房号文字精灵
let staticLabels = [] // 楼层 / 功能区 / 楼栋标签
let pulseItems = [] // 当前参与脉冲动画的网格
let pulseRings = [] // 紧急房间顶部的脉冲环（房态刷新时重新取用）

// ---------------------------------------------------------------- 文字标签
/**
 * 多行文字精灵：第一行房号，第二行「在住/床位」。
 * 总览要一眼读出「哪间房、住了几个人、什么状态」，所以标签带状态色描边而不是纯文字。
 */
function makeLabel(lines, { color = '#ffe6c8', accent = '#ff8c42', scale = 0.66 } = {}) {
  const pad = 22
  const main = 64
  const sub = 40
  const lineGap = 8
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const fontOf = (size, weight) => `${weight} ${size}px "Noto Sans SC", "Microsoft YaHei", sans-serif`

  ctx.font = fontOf(main, 700)
  let textW = ctx.measureText(lines[0] || '').width
  ctx.font = fontOf(sub, 500)
  for (const line of lines.slice(1)) textW = Math.max(textW, ctx.measureText(line).width)

  const w = Math.ceil(textW) + pad * 2
  const h = main + (lines.length - 1) * (sub + lineGap) + pad * 2
  canvas.width = w
  canvas.height = h

  const c = canvas.getContext('2d')
  c.fillStyle = 'rgba(18,14,24,0.86)'
  const r = 14
  c.beginPath()
  c.moveTo(r, 0)
  c.arcTo(w, 0, w, h, r)
  c.arcTo(w, h, 0, h, r)
  c.arcTo(0, h, 0, 0, r)
  c.arcTo(0, 0, w, 0, r)
  c.closePath()
  c.fill()
  c.strokeStyle = accent
  c.lineWidth = 3
  c.stroke()

  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.font = fontOf(main, 700)
  c.fillStyle = color
  c.fillText(lines[0], w / 2, pad + main / 2)
  c.font = fontOf(sub, 500)
  c.fillStyle = accent
  lines.slice(1).forEach((line, i) => {
    c.fillText(line, w / 2, pad + main + lineGap + i * (sub + lineGap) + sub / 2)
  })

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
  )
  const aspect = w / h
  sprite.scale.set(scale * aspect, scale, 1)
  sprite.renderOrder = 999
  return sprite
}

// ---------------------------------------------------------------- 构建场景
function clearContent() {
  if (!contentGroup) return
  const dispose = (obj) => {
    obj.traverse?.((child) => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        mats.forEach((m) => { m.map?.dispose(); m.dispose() })
      }
    })
  }
  dispose(contentGroup)
  scene.remove(contentGroup)
  contentGroup = null
  roomMeshes = []
  zoneMeshes = []
  slabMeshes = []
  roomLabels = []
  staticLabels = []
  pulseItems = []
  pulseRings = []
}

function box(w, h, d, x, y, z, material, { merge = true } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  if (merge) deco(mesh)
  return mesh
}

/** 场地：铺装、无障碍坡道、入口雨棚、乔木与花池 —— 让沙盘读起来是一栋楼而不是悬浮方块 */
function createSite() {
  const { width, depth } = props.bounds
  const size = Math.max(width, depth) * 2.6
  const front = depth / 2

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color: 0x161022, metalness: 0.2, roughness: 0.95, transparent: true, opacity: 0.7 })
  )
  plane.rotation.x = -Math.PI / 2
  plane.position.y = -0.36
  deco(plane)
  contentGroup.add(plane)

  const grid = new THREE.GridHelper(size, Math.round(size / 2), COLORS.primary, 0x342a48)
  grid.position.y = -0.35
  grid.material.transparent = true
  grid.material.opacity = 0.12
  contentGroup.add(grid)

  // 入口铺装与步道
  const paving = new THREE.MeshStandardMaterial({ color: COLORS.paving, roughness: 0.9, metalness: 0.05 })
  contentGroup.add(box(9, 0.08, 7, 0, -0.32, front + 3.4, paving))
  contentGroup.add(box(3.2, 0.08, 6, 0, -0.31, front + 7.6, paving))

  // 台阶 + 无障碍坡道（康养设施的关键配置）
  for (let i = 0; i < 3; i++) {
    contentGroup.add(box(5.4 - i * 0.2, 0.16, 0.9, 0, -0.24 + i * 0.16, front + 0.85 - i * 0.6, paving))
  }
  const ramp = box(1.6, 0.12, 4.4, -3.6, -0.06, front + 2.4, paving)
  ramp.rotation.x = -Math.PI / 26
  contentGroup.add(ramp)
  contentGroup.add(box(0.1, 0.9, 4.4, -4.35, 0.2, front + 2.4, new THREE.MeshStandardMaterial({ color: COLORS.primary, emissive: COLORS.primary, emissiveIntensity: 0.3, roughness: 0.6 })))

  // 入口雨棚
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2f3d47, roughness: 0.5, metalness: 0.35, transparent: true, opacity: 0.9 })
  contentGroup.add(box(7.6, 0.18, 3.6, 0, 3.05, front + 1.6, canopyMat))
  for (const x of [-3.2, 3.2]) contentGroup.add(box(0.16, 3, 0.16, x, 1.5, front + 3.1, canopyMat))

  // 乔木与花池
  const trunk = new THREE.MeshStandardMaterial({ color: 0x6b4b34, roughness: 0.9 })
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f6b4a, roughness: 0.85, emissive: 0x1d3a26, emissiveIntensity: 0.25 })
  const planter = new THREE.MeshStandardMaterial({ color: 0x3a3242, roughness: 0.9 })
  for (const [x, z] of [[-11, 6], [11, 6], [-11, -6], [11, -6], [0, 11]]) {
    contentGroup.add(box(0.34, 1.5, 0.34, x, 0.4, z, trunk))
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 0), leafMat)
    crown.position.set(x, 2.1, z)
    crown.scale.y = 0.85
    deco(crown)
    contentGroup.add(crown)
  }
  for (const x of [-5.5, 5.5]) contentGroup.add(box(2.4, 0.55, 1.2, x, 0.02, front + 4.6, planter))
}

/** 楼体外壳：分层玻璃幕墙 + 窗带 + 屋顶女儿墙与设备，取代原来的纯线框 */
function createShell() {
  const building = props.nodes.find((n) => n.node_type === 'building')
  if (!building) return
  const floors = props.nodes.filter((n) => n.node_type === 'floor')
  const skin = glassMat(COLORS.shell, 0.12)
  const band = new THREE.MeshStandardMaterial({ color: COLORS.primary, emissive: COLORS.primary, emissiveIntensity: 0.35, transparent: true, opacity: 0.32, roughness: 0.4 })

  for (const floor of floors) {
    const y = floor.world.y
    const h = floor.height - 0.35
    const w = floor.width
    const d = floor.depth
    // 四面幕墙
    contentGroup.add(box(w, h, 0.1, 0, y + h / 2, -d / 2, skin))
    contentGroup.add(box(w, h, 0.1, 0, y + h / 2, d / 2, skin))
    contentGroup.add(box(0.1, h, d, -w / 2, y + h / 2, 0, skin))
    contentGroup.add(box(0.1, h, d, w / 2, y + h / 2, 0, skin))
    // 水平窗带 + 竖向分格
    contentGroup.add(box(w, 0.12, d + 0.12, 0, y + h * 0.62, 0, band))
    contentGroup.add(box(w, 0.1, d + 0.12, 0, y + h * 0.2, 0, band))
    for (let x = -w / 2 + 1.5; x < w / 2; x += 3) {
      contentGroup.add(box(0.08, h, 0.08, x, y + h / 2, -d / 2, band))
      contentGroup.add(box(0.08, h, 0.08, x, y + h / 2, d / 2, band))
    }
  }

  // 屋顶：实体板 + 女儿墙 + 屋顶设备
  const top = floors[floors.length - 1]
  if (top) {
    const roofY = top.world.y + top.height
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x39424b, roughness: 0.85, metalness: 0.15 })
    contentGroup.add(box(top.width * 1.02, 0.24, top.depth * 1.02, 0, roofY, 0, roofMat))
    const parapet = new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.8 })
    contentGroup.add(box(top.width * 1.02, 0.5, 0.12, 0, roofY + 0.36, -top.depth / 2, parapet))
    contentGroup.add(box(top.width * 1.02, 0.5, 0.12, 0, roofY + 0.36, top.depth / 2, parapet))
    contentGroup.add(box(0.12, 0.5, top.depth * 1.02, -top.width / 2, roofY + 0.36, 0, parapet))
    contentGroup.add(box(0.12, 0.5, top.depth * 1.02, top.width / 2, roofY + 0.36, 0, parapet))
    contentGroup.add(box(3.4, 1.3, 2.2, -3.4, roofY + 0.9, -1.2, roofMat))
    contentGroup.add(box(1.2, 0.9, 1.2, 2.6, roofY + 0.7, 1.4, roofMat))
  }

  // 垂直交通核（电梯 / 楼梯）：放在西端中部，各层贯通
  const coreH = building.height
  const core = glassMat(COLORS.shell, 0.16)
  contentGroup.add(box(2.6, coreH, 2.6, -7.5, coreH / 2, 0, core))
  const coreEdge = new THREE.MeshStandardMaterial({ color: COLORS.primary, emissive: COLORS.primary, emissiveIntensity: 0.4, transparent: true, opacity: 0.4 })
  contentGroup.add(box(2.7, 0.1, 2.7, -7.5, 1.4, 0, coreEdge))
  contentGroup.add(box(2.7, 0.1, 2.7, -7.5, 4.6, 0, coreEdge))
  contentGroup.add(box(2.7, 0.1, 2.7, -7.5, 7.8, 0, coreEdge))
}

/**
 * 楼板 + 楼层标签。
 * 楼板默认只画轮廓线，实体填充只在选中该层时出现，避免斜视角下糊住下层房间。
 */
function createFloors() {
  const floors = props.nodes.filter((n) => n.node_type === 'floor')
  const { width } = props.bounds

  for (const floor of floors) {
    const fNum = Number(floor.meta?.floor || 0)
    const geo = new THREE.BoxGeometry(floor.width * 1.01, 0.18, floor.depth * 1.01)

    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: COLORS.slab, transparent: true, opacity: 0.42 })
    )
    outline.position.set(floor.world.x, floor.world.y + 0.05, floor.world.z)
    outline.userData = { kind: 'slabOutline', floor: fNum }
    contentGroup.add(outline)

    const slab = new THREE.Mesh(geo, glassMat(COLORS.slab, 0.26))
    slab.position.copy(outline.position)
    slab.userData = { kind: 'slab', floor: fNum, baseOpacity: 0.26 }
    slab.visible = false
    contentGroup.add(slab)
    slabMeshes.push({ mesh: slab, floor: fNum })

    const label = makeLabel([`${fNum}F`], { color: '#ff8c42', accent: '#ff8c42', scale: 1.05 })
    label.position.set(
      floor.world.x - width / 2 - 2.1,
      floor.world.y + 1.5,
      floor.world.z + floor.depth / 2 + 0.8
    )
    label.userData = { kind: 'floorLabel', floor: fNum }
    contentGroup.add(label)
    staticLabels.push(label)
  }
}

/** 房间：状态色底板 + 半透明体块 + 床位标记（住人/空床一眼可数） */
function createRooms() {
  const roomNodes = props.nodes.filter((n) => n.node_type === 'room')
  if (!roomNodes.length) return

  for (const node of roomNodes) {
    const state = props.roomStates.get(node.code)
    const status = state?.status || 'empty'
    const isCritical = status === 'critical'
    const color = isCritical ? COLORS.critical : COLORS[status] ?? COLORS.empty
    const baseOpacity = status === 'empty' ? 0.55 : 0.92
    const w = node.width
    const d = node.depth
    const x = node.world.x
    const z = node.world.z
    const y = node.world.y
    const roomH = Math.max(1.2, (node.height || 2.9) - 0.5)

    // 底板：状态色的「地面」，俯视时最易读
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.94, 0.1, d * 0.94),
      solidMat(color, { opacity: baseOpacity, emissiveIntensity: isCritical ? 0.55 : 0.34 })
    )
    plate.position.set(x, y + 0.12, z)
    contentGroup.add(plate)

    // 体块：拾取目标，半透明不遮挡内部结构
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.92, roomH * 0.62, d * 0.92),
      glassMat(color, status === 'empty' ? 0.12 : 0.24)
    )
    mesh.position.set(x, y + 0.12 + roomH * 0.31, z)
    mesh.userData = {
      kind: 'room',
      code: node.code,
      node,
      baseOpacity: status === 'empty' ? 0.12 : 0.24,
      status,
      floor: Number(node.meta?.floor || 0),
      baseColor: color
    }
    contentGroup.add(mesh)
    roomMeshes.push({ mesh, plate, node })

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 })
    )
    edge.position.copy(mesh.position)
    contentGroup.add(edge)

    // 床位：住人的床是亮色被褥，空床是暗色，直接读出「住了几人 / 还剩几床」
    const capacity = Math.max(1, Number(state?.capacity || 2))
    const occupancy = Number(state?.occupancy || 0)
    const bedMat = (on) => {
      const key = on ? `on-${status}` : 'off'
      if (!M.bed.has(key)) {
        M.bed.set(key, new THREE.MeshStandardMaterial({
          color: on ? COLORS.bedOn : COLORS.bedOff,
          emissive: on ? color : 0x1a1622,
          emissiveIntensity: on ? 0.28 : 0.1,
          roughness: 0.7,
          metalness: 0.05
        }))
      }
      return M.bed.get(key)
    }
    for (let i = 0; i < capacity; i++) {
      const on = i < occupancy
      const bx = x + (i - (capacity - 1) / 2) * (w * 0.36)
      contentGroup.add(box(0.78, 0.34, 1.7, bx, y + 0.31, z, bedMat(on)))
      contentGroup.add(box(0.62, 0.16, 0.42, bx, y + 0.5, z - 0.62, bedMat(on)))
    }

    // 门洞（朝向走廊一侧）
    const doorSide = z < 0 ? 1 : -1
    contentGroup.add(box(1.1, 0.06, 0.16, x, y + 0.16, z + doorSide * (d / 2 - 0.1), M.door))

    // 紧急房间：顶部脉冲环
    if (isCritical) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.82, 0.07, 6, 24),
        new THREE.MeshBasicMaterial({ color: COLORS.critical, transparent: true, opacity: 0.85 })
      )
      ring.rotation.x = Math.PI / 2
      ring.position.set(x, y + roomH * 0.62 + 0.5, z)
      contentGroup.add(ring)
      pulseItems.push(ring)
      pulseRings.push(ring)
    }

    const label = makeLabel(
      [node.code, occupancy ? `${occupancy}/${capacity} 人` : '空闲'],
      { accent: `#${new THREE.Color(color).getHexString()}`, scale: 0.78 }
    )
    label.position.set(x, y + roomH * 0.62 + 0.95, z)
    label.userData = {
      kind: 'roomLabel',
      floor: Number(node.meta?.floor || 0),
      room: node.code,
      occupied: occupancy > 0
    }
    contentGroup.add(label)
    roomLabels.push(label)
  }
}

/** 功能区：走廊扶手 / 护理台 / 餐桌 / 平行杠，按类型给不同家具语言 */
function createZones() {
  const zoneMat = (type) => glassMat(COLORS[type] ?? COLORS.corridor, type === 'corridor' ? 0.16 : 0.24)

  for (const node of props.nodes.filter((n) => n.node_type === 'zone')) {
    const zoneType = node.meta?.zoneType || 'corridor'
    const color = COLORS[zoneType] ?? COLORS.corridor
    const x = node.world.x
    const z = node.world.z
    const y = node.world.y
    const w = node.width
    const d = node.depth
    const h = Math.max(0.8, node.height - 0.6)

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, h * 0.5, d * 0.96), zoneMat(zoneType))
    mesh.position.set(x, y + 0.14 + h * 0.25, z)
    mesh.userData = { kind: 'zone', code: node.code, node, baseOpacity: mesh.material.opacity }
    contentGroup.add(mesh)
    zoneMeshes.push({ mesh, node })

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.96, 0.06, d * 0.96),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.22, roughness: 0.8, transparent: true, opacity: 0.5 })
    )
    plate.position.set(x, y + 0.1, z)
    deco(plate)
    contentGroup.add(plate)

    const rail = M.rail
    const furniture = M.furniture
    const metal = M.metal

    if (zoneType === 'corridor') {
      // 双侧扶手 + 轮椅回转空间（规范要求的错车/回转直径 1.5m）
      for (const side of [-1, 1]) {
        contentGroup.add(box(w * 0.96, 0.08, 0.08, x, y + 0.9, z + side * (d / 2 - 0.18), rail))
        for (let px = -w / 2 + 1.5; px < w / 2; px += 3) {
          contentGroup.add(box(0.07, 0.9, 0.07, x + px, y + 0.45, z + side * (d / 2 - 0.18), metal))
        }
      }
      const turn = new THREE.Mesh(
        new THREE.RingGeometry(0.68, 0.78, 24),
        new THREE.MeshBasicMaterial({ color: COLORS.corridor, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
      )
      turn.rotation.x = -Math.PI / 2
      turn.position.set(x, y + 0.16, z)
      contentGroup.add(turn)
    } else if (zoneType === 'nursing') {
      contentGroup.add(box(w * 0.6, 0.9, 0.7, x, y + 0.55, z - 0.9, furniture))
      contentGroup.add(box(w * 0.66, 0.06, 0.8, x, y + 1.02, z - 0.9, metal))
      contentGroup.add(box(w * 0.3, 0.5, 0.06, x - 0.2, y + 1.5, z - 1.24, metal))
      contentGroup.add(box(0.6, 1.7, 0.6, x + w * 0.3, y + 0.95, z + 1.1, furniture))
    } else if (zoneType === 'dining') {
      for (const [dx, dz] of [[-0.7, -0.8], [0.7, -0.8], [-0.7, 0.8], [0.7, 0.8]]) {
        contentGroup.add(box(1.1, 0.08, 1.1, x + dx, y + 0.78, z + dz, furniture))
        contentGroup.add(box(0.12, 0.74, 0.12, x + dx, y + 0.39, z + dz, metal))
        contentGroup.add(box(0.5, 0.1, 0.5, x + dx, y + 1.02, z + dz - 0.7, metal))
      }
    } else if (zoneType === 'rehab') {
      for (const dx of [-0.55, 0.55]) {
        contentGroup.add(box(0.09, 0.08, d * 0.7, x + dx, y + 0.92, z, rail))
        for (const dz of [-1.1, 1.1]) contentGroup.add(box(0.08, 0.92, 0.08, x + dx, y + 0.46, z + dz, metal))
      }
      contentGroup.add(box(1.5, 0.05, d * 0.7, x, y + 0.14, z, new THREE.MeshStandardMaterial({ color: COLORS.rehab, emissive: COLORS.rehab, emissiveIntensity: 0.2, roughness: 0.9 })))
      for (let i = 0; i < 3; i++) contentGroup.add(box(1.2, (i + 1) * 0.12, 0.4, x + 1.1, y + (i + 1) * 0.06, z + 1.2 - i * 0.45, furniture))
    }

    const label = makeLabel([node.name], { accent: `#${new THREE.Color(color).getHexString()}`, scale: 0.6 })
    label.position.set(x, y + h * 0.5 + 0.7, z)
    label.userData = { kind: 'zoneLabel' }
    contentGroup.add(label)
    staticLabels.push(label)
  }
}

/** 楼栋铭牌：标出「哪一栋、多少床」，避免沙盘只是抽象体块 */
function createBuildingSign() {
  const building = props.nodes.find((n) => n.node_type === 'building')
  if (!building) return
  const beds = [...props.roomStates.values()].reduce((s, r) => s + (r.capacity || 0), 0)
  const occupied = [...props.roomStates.values()].reduce((s, r) => s + (r.occupancy || 0), 0)
  const label = makeLabel(
    [building.name, beds ? `在住 ${occupied}/${beds} 床` : '康养照料单元'],
    { accent: '#ff8c42', scale: 1.25 }
  )
  label.position.set(building.world.x, building.world.y + building.height + 1.9, building.world.z)
  contentGroup.add(label)
  staticLabels.push(label)
}

/** 把装饰性网格按材质合批：外壳、场地、家具数量多但不需要单独控制 */
function mergeDecorations() {
  contentGroup.updateMatrixWorld(true)
  const pickable = new Set([...roomMeshes.map((r) => r.mesh), ...zoneMeshes.map((z) => z.mesh)])
  const batches = new Map()
  const remove = []
  contentGroup.traverse((o) => {
    if (!o.isMesh || !o.userData.merge || pickable.has(o)) return
    if (!batches.has(o.material)) batches.set(o.material, [])
    batches.get(o.material).push(o.geometry.clone().applyMatrix4(o.matrixWorld))
    remove.push(o)
  })
  for (const [material, pieces] of batches) {
    const merged = mergeGeometries(pieces, false)
    pieces.forEach((g) => g.dispose())
    if (merged) {
      const mesh = new THREE.Mesh(merged, material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      contentGroup.add(mesh)
    }
  }
  for (const o of remove) {
    o.geometry.dispose()
    o.removeFromParent()
  }
}

function buildScene() {
  if (!scene) return
  clearContent()
  M = {
    bed: new Map(),
    door: new THREE.MeshStandardMaterial({ color: COLORS.accent, emissive: COLORS.accent, emissiveIntensity: 0.5, transparent: true, opacity: 0.7 }),
    rail: new THREE.MeshStandardMaterial({ color: 0xd9c39a, emissive: 0x3a2f1c, emissiveIntensity: 0.2, roughness: 0.6 }),
    furniture: new THREE.MeshStandardMaterial({ color: 0x8a6a4c, roughness: 0.75 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa7ad, roughness: 0.4, metalness: 0.45 })
  }
  contentGroup = new THREE.Group()
  scene.add(contentGroup)

  createSite()
  createShell()
  createFloors()
  createRooms()
  createZones()
  createBuildingSign()
  mergeDecorations()

  applyFloorFilter()
  applySelection()
  updateLabelVisibility()
  fitCamera()
}

// ---------------------------------------------------------------- 状态与过滤
/** 非当前楼层降透明度，形成「分层高亮」 */
function applyFloorFilter() {
  const f = activeFloor.value
  const dim = f > 0
  const setOp = (mesh) => {
    const base = mesh.userData?.baseOpacity ?? 0.3
    mesh.material.opacity = dim && !mesh.userData?.onActiveFloor ? base * 0.16 : base
    mesh.material.transparent = true
    mesh.material.needsUpdate = true
  }

  for (const { mesh, node } of roomMeshes) {
    const floor = Number(node.meta?.floor || 0)
    mesh.userData.onActiveFloor = floor === f
    setOp(mesh)
  }
  for (const { mesh, node } of zoneMeshes) {
    const floor = Number(String(node.parent_code || '').match(/F(\d+)/)?.[1] || 0)
    mesh.userData.onActiveFloor = floor === f
    setOp(mesh)
  }
  for (const { mesh, floor } of slabMeshes) {
    mesh.visible = dim && floor === f
    mesh.userData.onActiveFloor = floor === f
    setOp(mesh)
  }
  updateLabelVisibility()
}

/** 选中房间：换色高亮；选中功能区同理 */
function applySelection() {
  for (const { mesh, plate, node } of roomMeshes) {
    const isSel = props.selected === node.code
    const d = mesh.userData
    d.isSelected = isSel
    const target = isSel ? COLORS.accent : d.baseColor
    mesh.material.color.setHex(target)
    mesh.material.emissive.setHex(target)
    mesh.material.emissiveIntensity = isSel ? 0.95 : d.status === 'critical' ? 0.5 : 0.24
    // 底板同步换色，俯视时状态一眼可读
    plate.material.color.setHex(target)
    plate.material.emissive.setHex(target)
    plate.material.emissiveIntensity = isSel ? 0.7 : d.status === 'critical' ? 0.55 : 0.34
  }

  for (const { mesh, node } of zoneMeshes) {
    const isSel = props.selectedZone === node.code
    const zoneType = node.meta?.zoneType || 'corridor'
    const color = COLORS[zoneType] ?? COLORS.corridor
    mesh.userData.isSelected = isSel
    const target = isSel ? COLORS.accent : color
    mesh.material.color.setHex(target)
    mesh.material.emissive.setHex(target)
    mesh.material.opacity = isSel ? 0.6 : (mesh.userData.baseOpacity ?? 0.2) * (activeFloor.value && !mesh.userData.onActiveFloor ? 0.16 : 1)
  }
}

/** 房号标签：只显示「有人的房间 + 当前楼层 + 拉近后的全部」，避免 18 个标签糊成一片 */
function updateLabelVisibility() {
  const f = activeFloor.value
  const zoomedIn = cam.radius < 26
  for (const label of roomLabels) {
    const d = label.userData
    label.visible = showLabels.value && (f > 0 ? d.floor === f : d.occupied || zoomedIn)
  }
  for (const label of staticLabels) {
    const kind = label.userData.kind
    label.visible = kind === 'floorLabel' ? f === 0 || f === label.userData.floor : kind === 'zoneLabel' ? zoomedIn || f > 0 : true
  }
}

// ---------------------------------------------------------------- 相机
function fitCamera() {
  const { width, depth, height, center } = props.bounds
  const box = new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(center.x, (center.y || 0) + height / 2, center.z),
    new THREE.Vector3(width + 6, height + 4, depth + 10)
  )
  rig?.fit(box)
}

/** 聚到某个房间：目标点移到房间中心，半径收紧但保留周边上下文 */
function focusRoom(roomNo) {
  if (!roomNo) return
  const found = roomMeshes.find((r) => r.node.code === roomNo)
  if (!found) return
  const p = found.mesh.position
  cam.goalTarget.set(p.x, p.y, p.z)
  const factor = isTouch.value ? 1.15 : 0.78
  cam.goalRadius = Math.max(cam.minRadius + 3, props.bounds.width * factor)
  rig?.focus(p, cam.goalRadius)
}

function focusZone(code) {
  const found = zoneMeshes.find((z) => z.node.code === code)
  if (!found) return
  const p = found.mesh.position
  cam.goalTarget.set(p.x, p.y, p.z)
  cam.goalRadius = Math.max(cam.minRadius + 4, props.bounds.width * (isTouch.value ? 1.3 : 0.9))
  rig?.focus(p, cam.goalRadius)
}

function setFloor(f) {
  activeFloor.value = f
  emit('select', null)
  emit('select-zone', null)
  applyFloorFilter()
  if (f === 0) {
    fitCamera()
  } else {
    const slab = slabMeshes.find((s) => s.floor === f)
    if (slab) {
      cam.goalTarget.set(slab.mesh.position.x, slab.mesh.position.y + 1.6, slab.mesh.position.z)
      cam.goalRadius = Math.max(cam.minRadius, props.bounds.width * 0.85)
      rig?.focus(cam.goalTarget, cam.goalRadius)
    }
  }
}

function resetView() {
  activeFloor.value = 0
  applyFloorFilter()
  fitCamera()
  emit('select', null)
  emit('select-zone', null)
}

// ---------------------------------------------------------------- 交互
function pickAt(clientX, clientY) {
  if (!renderer || !camera) return
  const rect = renderer.domElement.getBoundingClientRect()
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  )
  raycaster.setFromCamera(ndc, camera)

  const candidates = [...roomMeshes, ...zoneMeshes]
    .filter(({ mesh }) => !activeFloor.value || mesh.userData.onActiveFloor)
    .map(({ mesh }) => mesh)
  const hit = raycaster.intersectObjects(candidates, false)[0]
  if (hit) {
    const { kind, code } = hit.object.userData
    emit(kind === 'room' ? 'select-zone' : 'select', null)
    emit(kind === 'room' ? 'select' : 'select-zone', code)
    return
  }
  emit('select', null)
  emit('select-zone', null)
}

function onPointerDown(e) {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    pinchDistance = Math.hypot(a.x - b.x, a.y - b.y)
    pinchRadius = cam.goalRadius
    pinchActive = true
    dragging = false
    return
  }
  dragging = true
  dragDistance = 0
  lastX = e.clientX
  lastY = e.clientY
}

function onPointerMove(e) {
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (pinchActive && pointers.size >= 2) {
    dragDistance = 100 // Multi-touch never becomes a click.
    return
  }
  if (!dragging) return
  const dx = e.clientX - lastX
  const dy = e.clientY - lastY
  lastX = e.clientX
  lastY = e.clientY
  dragDistance += Math.abs(dx) + Math.abs(dy)
  // OrbitControls owns camera movement; these events only distinguish click from drag.
}

function onPointerUp(e) {
  const wasDragging = dragging
  const travelled = dragDistance

  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinchActive = false

  // 从双指退回单指：重置拖拽基准，避免视角跳变
  if (pointers.size === 1) {
    const [p] = [...pointers.values()]
    lastX = p.x
    lastY = p.y
    dragging = true
    dragDistance = travelled + 100 // 视为已拖拽，抬手不触发拾取
    return
  }
  if (pointers.size > 1) return

  dragging = false
  // 只有「几乎没移动」才当作点击，避免旋转视角时误选房间
  if (e.type === 'pointerup' && e.button === 0 && wasDragging && travelled < 6) pickAt(e.clientX, e.clientY)
}

// ---------------------------------------------------------------- 生命周期
function hasWebGL() {
  try {
    if (typeof window === 'undefined' || !window.WebGLRenderingContext) return false
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

function onResize() {
  if (!wrapRef.value || !renderer || !camera) return
  const w = wrapRef.value.clientWidth
  const h = wrapRef.value.clientHeight
  if (!w || !h) return
  camera.aspect = w / h
  camera.setViewOffset(w, h, -w * props.panelInset, 0, w, h)
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

function init() {
  const el = wrapRef.value
  if (!el) return
  if (!hasWebGL()) {
    glFailed.value = true
    emit('webgl-failed')
    return
  }
  alive = true
  clock = new THREE.Clock()

  const w = el.clientWidth || 800
  const h = el.clientHeight || 600

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 400)
  raycaster = new THREE.Raycaster()

  try {
    renderer = new THREE.WebGLRenderer({ antialias: !isTouch.value, alpha: true })
  } catch {
    alive = false
    glFailed.value = true
    emit('webgl-failed')
    return
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch.value ? 1.5 : 2))
  renderer.setSize(w, h)
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  el.appendChild(renderer.domElement)
  renderer.domElement.style.touchAction = 'none'

  const hemi = new THREE.HemisphereLight(0xffd8aa, 0x1a1428, 0.75)
  const dir = new THREE.DirectionalLight(0xfff0d0, 1)
  dir.position.set(18, 34, 12)
  const fill = new THREE.PointLight(0xff8c42, 0.85, 120)
  fill.position.set(-14, 20, -12)
  const rim = new THREE.PointLight(0xffffff, 0.4, 90)
  rim.position.set(12, 14, 18)
  ;[hemi, dir, fill, rim].forEach((l) => scene.add(l))

  camera.position.set(24, 34, 28)
  rig = createSceneControls(camera, renderer.domElement, { minDistance: 7, maxDistance: 140, direction: new THREE.Vector3(0.7, 1.8, 1) })
  onResize()

  const dom = renderer.domElement
  dom.addEventListener('pointerdown', onPointerDown)
  dom.addEventListener('pointermove', onPointerMove)
  dom.addEventListener('pointerup', onPointerUp)
  dom.addEventListener('pointercancel', onPointerUp)

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(el)
  }
  window.addEventListener('resize', onResize)

  buildScene()
  animate()
  emit('ready')
}

function animate() {
  if (!alive || !renderer || !scene || !camera) return
  animationId = requestAnimationFrame(animate)

  const t = clock ? clock.getElapsedTime() : 0

  if (document.hidden) return
  rig?.update()
  cam.radius = camera.position.distanceTo(rig.controls.target)

  const zoomed = cam.radius < 26
  if (zoomed !== lastZoomedState) {
    lastZoomedState = zoomed
    updateLabelVisibility()
  }

  // 紧急房间脉冲（呼吸感）；暂停提示时保持静态，避免干扰阅读
  const pulse = motionPaused.value ? 0.7 : 0.5 + Math.sin(t * 2.6) * 0.32
  for (const ring of pulseItems) {
    ring.material.opacity = pulse
    ring.scale.setScalar(motionPaused.value ? 1 : 1 + Math.sin(t * 2.6) * 0.08)
  }

  renderer.render(scene, camera)
}

function destroy() {
  alive = false
  if (animationId) cancelAnimationFrame(animationId)
  animationId = null
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  window.removeEventListener('resize', onResize)
  const dom = renderer?.domElement
  if (dom) {
    dom.removeEventListener('pointerdown', onPointerDown)
    dom.removeEventListener('pointermove', onPointerMove)
    dom.removeEventListener('pointerup', onPointerUp)
    dom.removeEventListener('pointercancel', onPointerUp)
  }
  rig?.dispose()
  clearContent()
  try {
    renderer?.dispose()
  } catch {
    /* ignore */
  }
  if (dom?.parentNode) dom.parentNode.removeChild(dom)
  renderer = null
  scene = null
  camera = null
}

watch(() => props.nodes, () => { if (alive && scene) buildScene() })
watch(() => props.panelInset, onResize)
watch(showLabels, updateLabelVisibility)
watch(() => props.roomStates, () => {
  pulseItems = [...pulseRings]
  for (const { mesh, plate, node } of roomMeshes) {
    const state = props.roomStates.get(node.code)
    const status = state?.status || 'empty'
    Object.assign(mesh.userData, { status, baseColor: COLORS[status] ?? COLORS.empty })
    plate.material.color.setHex(COLORS[status] ?? COLORS.empty)
    plate.material.emissive.setHex(COLORS[status] ?? COLORS.empty)
    const label = roomLabels.find((l) => l.userData.room === node.code)
    if (label) label.userData.occupied = (state?.occupancy || 0) > 0
  }
  applyFloorFilter()
  applySelection()
})

watch(
  () => props.selected,
  (v) => {
    applySelection()
    if (v) focusRoom(v)
  }
)

watch(
  () => props.selectedZone,
  (v) => {
    applySelection()
    if (v) focusZone(v)
  }
)

onMounted(() => init())
onBeforeUnmount(() => destroy())

function diagnostics() {
  return {
    camera: camera?.position.toArray(),
    target: rig?.controls.target.toArray(),
    activeFloor: activeFloor.value,
    calls: renderer?.info.render.calls,
    selectable: [...roomMeshes, ...zoneMeshes]
      .filter(({ mesh }) => !activeFloor.value || mesh.userData.onActiveFloor)
      .map(({ mesh }) => {
        const p = mesh.position.clone().project(camera)
        return { code: mesh.userData.code, kind: mesh.userData.kind, x: (p.x + 1) / 2, y: (1 - p.y) / 2 }
      })
  }
}
defineExpose({ resetView, setFloor, destroy, focusRoom, diagnostics })
</script>

<style scoped lang="scss">
.campus3d {
  position: absolute;
  inset: 0;
  z-index: 0;
  cursor: grab;
  touch-action: none;
  --glow: #241a2e;
  background:
    radial-gradient(ellipse at 50% 12%, color-mix(in srgb, var(--glow) 72%, transparent), transparent 58%),
    radial-gradient(ellipse at 50% 100%, rgba(40, 30, 50, 0.4), transparent 52%);
}
.campus3d:active {
  cursor: grabbing;
}
.campus3d.is-touch {
  cursor: default;
}

/* 楼层筛选与重置。
   left / max-width 走 CSS 变量：宿主页面若有左侧悬浮面板（如 Overview 的概览面板），
   必须通过 --tools-left 把工具栏让到面板右侧，否则前半排按钮会被面板盖住。
   变量由宿主在 .stage 上定义，本组件只给默认值（贴左），保持组件可独立复用。 */
.campus-tools {
  position: absolute;
  top: 12px;
  left: var(--tools-left, 12px);
  z-index: 12;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--sc-border);
  background: rgba(20, 15, 25, 0.74);
  backdrop-filter: blur(8px);
  max-width: var(--tools-max, calc(100% - 24px));

  button {
    min-width: 44px;
    height: 32px;
    padding: 0 10px;
    border: 1px solid rgba(255, 140, 66, 0.28);
    border-radius: 4px;
    background: rgba(40, 30, 50, 0.6);
    color: var(--sc-muted);
    font-size: 12px;
    letter-spacing: 0.5px;
    cursor: pointer;
    transition: all var(--dur-fast) var(--ease-standard);

    &:hover {
      color: var(--sc-primary);
      border-color: var(--sc-primary);
    }

    &.active {
      background: var(--sc-primary);
      border-color: var(--sc-primary);
      color: #1a1428;
      font-weight: 600;
    }
  }

  .split {
    width: 1px;
    height: 20px;
    margin: 0 2px;
    background: rgba(255, 140, 66, 0.25);
  }
}

.campus-hint {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  z-index: 11;
  max-width: calc(100% - 32px);
  padding: 6px 14px;
  border: 1px solid var(--sc-border);
  background: rgba(20, 15, 25, 0.62);
  color: var(--sc-muted);
  font-size: 12px;
  letter-spacing: 0.5px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  backdrop-filter: blur(6px);
}

.gl-fallback {
  position: absolute;
  inset: 0;
  z-index: 13;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
  background: rgba(20, 15, 25, 0.75);
}
.gl-title {
  margin: 0;
  font-size: 14px;
  color: var(--sc-primary);
}
.gl-sub {
  margin: 0;
  max-width: 380px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--sc-muted);
}

@include mobile {
  .campus-tools {
    top: 8px;
    left: 8px;
    padding: 5px;

    button {
      height: 34px;
      min-width: 40px;
      padding: 0 8px;
      font-size: 11px;
    }
  }

  .campus-hint {
    font-size: 11px;
    padding: 5px 10px;
    bottom: 8px;
  }
}
</style>
