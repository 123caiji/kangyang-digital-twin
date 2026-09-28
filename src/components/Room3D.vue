<template>
  <div ref="wrapRef" class="room3d" :class="{ 'is-touch': isTouch }">
    <canvas ref="fxRef" class="fx-layer"></canvas>
    <div class="hint" v-if="!selected && !glFailed">{{ hintText }}</div>
    <div class="gl-fallback" v-if="glFailed" role="status">
      <div class="gl-icon" aria-hidden="true">3D</div>
      <p class="gl-title">当前设备未启用 WebGL，3D 场景无法渲染</p>
      <p class="gl-sub">
        可改用「健康监测 / 护理分析 / 空间关系」等图表页面查看同样的业务数据，
        或在浏览器设置中开启硬件加速后重试。
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'

const props = defineProps({
  theme: { type: String, default: 'room' },
  themeData: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['select', 'webgl-failed'])

const wrapRef = ref(null)
const fxRef = ref(null)
const selected = ref(null)
const glFailed = ref(false)

// 触控设备：手势提示与低像素比（兼顾移动端性能）
const isTouch = ref(
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(pointer: coarse)').matches
    : false
)
const hintText = computed(() =>
  isTouch.value
    ? '单指拖拽旋转俯仰 · 双指捏合缩放 · 轻点模型查看数据'
    : '鼠标拖拽 / 方向键旋转俯仰 · Q/E 缩放 · 滚轮缩放 · 点击查看数据'
)

let renderer, scene, camera, animationId, raycaster, mouse
let interactive = []
let group = null
let effectGroup = null
let lights = []
let particles = null
let orbitAngle = 0.55
let orbitRadius = 40
let orbitHeight = 20
let isDragging = false
let dragMoved = false
let lastX = 0
let lastY = 0
let selectionHalo = null
let selectionBeam = null
let pulseTime = 0
let animatables = []
let clock = null
let alive = false
let rebuildTimer = null
let resizeObserver = null
// 多点指针跟踪：用于双指捏合缩放
const activePointers = new Map()
let pinchDistance = 0
let pinchRadius = 40
let pinchActive = false
const keys = Object.create(null)
const KEY_ROTATE = 0.035
const KEY_PITCH = 0.35
const KEY_ZOOM = 0.45
const STEP_ROTATE = 0.2
const STEP_PITCH = 3
const STEP_ZOOM = 4
// 相机轨道限位，键盘 / 手势 / 虚拟按钮共用
const LIMIT = { radiusMin: 18, radiusMax: 65, heightMin: 8, heightMax: 35 }

const THEMES = {
  room: {
    label: '居室',
    fog: 0x1a1428,
    ground: 0x2a2030,
    accent: 0xff8c42,
    secondary: 0xffb627,
    wall: 0x4a3a2a,
    emissive: 0x3a2a1a,
    skyGlow: '#2a1f1a'
  },
  corridor: {
    label: '走廊',
    fog: 0x141e1a,
    ground: 0x1a2820,
    accent: 0x42d9b8,
    secondary: 0x6ec8ff,
    wall: 0x2a4a3a,
    emissive: 0x1a3a2a,
    skyGlow: '#102018'
  },
  dining: {
    label: '餐厅',
    fog: 0x1e1810,
    ground: 0x2a2418,
    accent: 0xffb627,
    secondary: 0xff8c42,
    wall: 0x4a3a1a,
    emissive: 0x3a2a10,
    skyGlow: '#2a2010'
  },
  nursing: {
    label: '护理站',
    fog: 0x0e1a22,
    ground: 0x14242e,
    accent: 0x4fb8d9,
    secondary: 0x6ec8ff,
    wall: 0x1a3a4a,
    emissive: 0x0a2a3a,
    skyGlow: '#0a1820'
  },
  rehab: {
    label: '康复室',
    fog: 0x0a1e14,
    ground: 0x102818,
    accent: 0x6dd97a,
    secondary: 0xa0e8b0,
    wall: 0x1a4a2a,
    emissive: 0x0a3a1a,
    skyGlow: '#082014'
  }
}

function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose()
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose())
      else child.material.dispose()
    }
  })
}

function clearSceneContent() {
  try {
    if (group && scene) { disposeObject(group); scene.remove(group) }
    if (effectGroup && scene) { disposeObject(effectGroup); scene.remove(effectGroup) }
    if (particles && scene) { disposeObject(particles); scene.remove(particles) }
  } catch { /* ignore */ }
  group = null; effectGroup = null; particles = null
  interactive = []; animatables = []
  selectionHalo = null; selectionBeam = null
}

function destroy() {
  alive = false
  if (rebuildTimer) { clearTimeout(rebuildTimer); rebuildTimer = null }
  if (animationId) { cancelAnimationFrame(animationId); animationId = null }
  if (resizeObserver) { try { resizeObserver.disconnect() } catch { /* ignore */ } resizeObserver = null }
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  Object.keys(keys).forEach((k) => { keys[k] = false })
  isDragging = false
  dragMoved = false
  activePointers.clear()
  pinchActive = false
  const dom = renderer?.domElement
  if (dom) {
    try {
      dom.removeEventListener('pointerdown', onPointerDown)
      dom.removeEventListener('pointermove', onPointerMove)
      dom.removeEventListener('pointerup', onPointerUp)
      dom.removeEventListener('pointercancel', onPointerUp)
      dom.removeEventListener('pointerleave', onPointerUp)
      dom.removeEventListener('wheel', onWheel)
    } catch { /* ignore */ }
  }
  clearSceneContent()
  try { lights.forEach((l) => scene?.remove(l)) } catch { /* ignore */ }
  lights = []
  try { renderer?.dispose() } catch { /* ignore */ }
  if (dom?.parentNode) { try { dom.parentNode.removeChild(dom) } catch { /* ignore */ } }
  renderer = null; scene = null; camera = null
  selected.value = null
}

/** WebGL 能力探测：不支持时降级为静态提示，避免黑屏 */
function hasWebGL() {
  try {
    if (typeof window === 'undefined' || !window.WebGLRenderingContext) return false
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
  } catch {
    return false
  }
}

function mat(opts = {}) {
  return new THREE.MeshStandardMaterial({
    color: opts.color ?? 0x4a3a2a,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0.35,
    metalness: opts.metalness ?? 0.55,
    roughness: opts.roughness ?? 0.35,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide
  })
}

function glass(color, opacity = 0.45) {
  return new THREE.MeshStandardMaterial({
    color, metalness: 0.15, roughness: 0.08,
    transparent: true, opacity, emissive: color, emissiveIntensity: 0.22
  })
}

function addHit(mesh, data) {
  mesh.userData = {
    ...data,
    baseScale: mesh.scale.clone(),
    baseEmissive: mesh.material?.emissive ? mesh.material.emissive.getHex() : 0x000000,
    baseEmissiveIntensity: mesh.material?.emissiveIntensity ?? 0.3
  }
  interactive.push(mesh)
  group.add(mesh)
  return mesh
}

function createGround(theme) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 36),
    mat({ color: theme.ground, metalness: 0.2, roughness: 0.9, emissive: theme.emissive, emissiveIntensity: 0.1 })
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  group.add(ground)

  const grid = new THREE.GridHelper(48, 24, theme.accent, 0x222233)
  grid.material.transparent = true
  grid.material.opacity = 0.15
  group.add(grid)
}

function createParticles(theme, count = 80) {
  const geo = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 40
    positions[i * 3 + 1] = Math.random() * 18 + 1
    positions[i * 3 + 2] = (Math.random() - 0.5) * 30
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  particles = new THREE.Points(geo, new THREE.PointsMaterial({
    color: theme.accent, size: 0.18, transparent: true, opacity: 0.45, depthWrite: false
  }))
  particles.userData.speed = 0.003 + Math.random() * 0.002
  scene.add(particles)
}

function createInfoStand(theme, data) {
  const stand = new THREE.Group()
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.12, 2.5, 8),
    mat({ color: 0x444444, metalness: 0.8, roughness: 0.3 })
  )
  pole.position.y = 1.25
  stand.add(pole)

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.6, 0.06),
    mat({ color: 0x1a1a2e, emissive: theme.accent, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.3 })
  )
  panel.position.y = 2.2
  stand.add(panel)

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.45),
    new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.7 })
  )
  screen.position.set(0, 2.2, 0.04)
  stand.add(screen)

  stand.position.set(7, 0, 7)

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 3, 0.3),
    new THREE.MeshBasicMaterial({ visible: false })
  )
  hit.position.set(7, 1.5, 7)
  addHit(hit, data)
  group.add(stand)
  animatables.push({ type: 'screen', obj: screen })
  return stand
}

// ─── 居室场景 ───
function buildRoom(theme, list) {
  // 墙壁
  const wallMat = mat({ color: 0x5a4a3a, metalness: 0.1, roughness: 0.85 })
  const wallH = 5
  // 后墙
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(20, wallH, 0.3), wallMat)
  backWall.position.set(0, wallH / 2, -8)
  group.add(backWall)
  // 左墙
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, wallH, 16), wallMat)
  leftWall.position.set(-10, wallH / 2, 0)
  group.add(leftWall)
  // 右墙（带窗户透明）
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, wallH, 16), glass(0x88aacc, 0.15))
  rightWall.position.set(10, wallH / 2, 0)
  group.add(rightWall)

  // 窗户
  const window = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 3, 5),
    glass(theme.secondary, 0.35)
  )
  window.position.set(10, 3, 0)
  group.add(window)

  // 床
  const bed = new THREE.Group()
  const bedFrame = new THREE.Mesh(
    new THREE.BoxGeometry(4, 0.5, 2.2),
    mat({ color: 0x6a4a2a, metalness: 0.3, roughness: 0.5 })
  )
  bedFrame.position.y = 0.6
  bed.add(bedFrame)
  const mattress = new THREE.Mesh(
    new THREE.BoxGeometry(3.8, 0.3, 2.0),
    mat({ color: 0xe8e0d0, emissive: theme.emissive, emissiveIntensity: 0.15, metalness: 0.1, roughness: 0.8 })
  )
  mattress.position.y = 0.95
  bed.add(mattress)
  const pillow = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.2, 0.8),
    mat({ color: 0xf0f0e8, roughness: 0.9 })
  )
  pillow.position.set(-1.2, 1.2, 0)
  bed.add(pillow)
  bed.position.set(-3, 0, -4)

  const bedHit = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 2, 2.4),
    new THREE.MeshBasicMaterial({ visible: false })
  )
  bedHit.position.set(-3, 1, -4)
  addHit(bedHit, {
    id: 'bed-1', name: '智能护理床', type: 'bed', category: '起居设备',
    value: list[0]?.value ?? 95, unit: '% 舒适度',
    district: '101室', status: 'normal',
    remark: '智能调节床垫硬度与角度，含体压监测',
    effect: 'device-glow',
    metrics: [
      { label: '床垫角度', value: '30°' },
      { label: '体压分布', value: '均匀' },
      { label: '离床预警', value: '正常' }
    ]
  })
  group.add(bed)

  // 床头柜
  const nightstand = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.5, 1.0),
    mat({ color: 0x7a5a3a, roughness: 0.6 })
  )
  nightstand.position.set(-6, 0.75, -4)
  addHit(nightstand, {
    id: 'nightstand-1', name: '床头柜', type: 'furniture', category: '家具',
    value: 80, unit: '% 使用率',
    district: '101室', status: 'normal',
    remark: '内置紧急呼叫按钮与夜灯',
    effect: 'device-glow',
    metrics: [
      { label: '呼叫按钮', value: '就绪' },
      { label: '夜灯', value: '开启' },
      { label: '抽屉', value: '关闭' }
    ]
  })

  // 监护仪
  const monitor = new THREE.Group()
  const monitorBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.6, 0.3),
    mat({ color: 0x2a2a2a, emissive: theme.accent, emissiveIntensity: 0.5, metalness: 0.7, roughness: 0.2 })
  )
  monitorBody.position.y = 1.8
  monitor.add(monitorBody)
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.4),
    new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.8 })
  )
  screen.position.set(0, 1.8, 0.16)
  monitor.add(screen)
  monitor.position.set(-6, 0, -3.5)

  const monitorHit = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.0, 0.5),
    new THREE.MeshBasicMaterial({ visible: false })
  )
  monitorHit.position.set(-6, 1.8, -3.5)
  addHit(monitorHit, {
    id: 'monitor-1', name: '生命体征监护仪', type: 'monitor', category: '医疗设备',
    value: list[1]?.value ?? 72, unit: 'bpm 心率',
    district: '101室', status: 'normal',
    remark: '实时监测心率、血压、血氧、体温',
    effect: 'device-pulse',
    metrics: [
      { label: '心率', value: '72 bpm' },
      { label: '血氧', value: '98%' },
      { label: '体温', value: '36.5℃' }
    ]
  })
  group.add(monitor)
  animatables.push({ type: 'screen', obj: screen })

  // 衣柜
  const wardrobe = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 4.0, 0.8),
    mat({ color: 0x5a3a2a, metalness: 0.3, roughness: 0.5 })
  )
  wardrobe.position.set(-9, 2, -2)
  addHit(wardrobe, {
    id: 'wardrobe-1', name: '衣柜', type: 'furniture', category: '家具',
    value: 60, unit: '% 占用率',
    district: '101室', status: 'normal',
    remark: '住户个人衣物存储',
    effect: 'device-glow',
    metrics: [
      { label: '挂衣区', value: '60%' },
      { label: '抽屉', value: '40%' },
      { label: '状态', value: '正常' }
    ]
  })

  // 智能手环
  const wearable = new THREE.Mesh(
    new THREE.TorusGeometry(0.25, 0.06, 8, 24),
    mat({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.2 })
  )
  wearable.position.set(2, 0.8, 0)
  addHit(wearable, {
    id: 'wearable-1', name: '智能手环', type: 'wearable', category: '穿戴设备',
    value: 85, unit: '% 电量',
    district: '101室', status: 'normal',
    remark: '定位、跌倒检测、运动量监测',
    effect: 'device-pulse',
    metrics: [
      { label: '电量', value: '85%' },
      { label: '步数', value: '1,248' },
      { label: '定位', value: '101室' }
    ]
  })
  animatables.push({ type: 'wearable', obj: wearable })

  // 跌倒检测仪（天花板）
  const fallSensor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 0.15, 12),
    mat({ color: theme.secondary, emissive: theme.secondary, emissiveIntensity: 0.7, metalness: 0.5, roughness: 0.3 })
  )
  fallSensor.position.set(0, 4.8, 0)
  addHit(fallSensor, {
    id: 'fall-1', name: '跌倒检测仪', type: 'sensor', category: '安全设备',
    value: 100, unit: '% 在线',
    district: '101室', status: 'normal',
    remark: '天花板安装，红外+AI双重跌倒检测',
    effect: 'device-pulse',
    metrics: [
      { label: '检测状态', value: '正常' },
      { label: '覆盖区域', value: '全室' },
      { label: '上次告警', value: '无' }
    ]
  })
  animatables.push({ type: 'fall-sensor', obj: fallSensor })

  createInfoStand(theme, {
    id: 'room-info', name: '居室信息站', type: 'info', category: '信息终端',
    value: 5, unit: '台 在线',
    district: '101室', status: 'normal',
    remark: '居室设备运行状态与环境数据汇总',
    effect: 'device-glow',
    metrics: [
      { label: '在线设备', value: 5 },
      { label: '环境指数', value: '良好' },
      { label: '住户状态', value: '稳定' }
    ]
  })
}

// ─── 走廊场景 ───
function buildCorridor(theme, list) {
  const wallMat = mat({ color: 0x3a4a3a, roughness: 0.8 })
  // 走廊地板
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 24),
    mat({ color: 0x3a3530, roughness: 0.7, metalness: 0.2 })
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0.01
  group.add(floor)

  // 走廊墙壁
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 24), wallMat)
    wall.position.set(side * 3, 2, 0)
    group.add(wall)
  }

  // 扶手
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.1, 20),
      mat({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.3 })
    )
    rail.position.set(side * 2.8, 0.9, 0)
    group.add(rail)
    addHit(rail, {
      id: `rail-${side}`, name: '辅助扶手', type: 'facility', category: '无障碍设施',
      value: 100, unit: '% 完好',
      district: '走廊', status: 'normal',
      remark: '防滑抗菌扶手，辅助老人行走',
      effect: 'device-glow',
      metrics: [
        { label: '材质', value: '抗菌PVC' },
        { label: '高度', value: '90cm' },
        { label: '状态', value: '完好' }
      ]
    })
  }

  // 呼叫按钮
  for (let i = 0; i < 6; i++) {
    const btn = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 12),
      mat({ color: 0xff4444, emissive: 0xff4444, emissiveIntensity: 0.7, metalness: 0.5, roughness: 0.2 })
    )
    btn.position.set(-2.7, 1.2, -8 + i * 3)
    addHit(btn, {
      id: `call-btn-${i}`, name: `紧急呼叫器 ${i + 1}`, type: 'call_button', category: '安全设备',
      value: 100, unit: '% 在线',
      district: '走廊', status: 'normal',
      remark: '一键紧急呼叫，联动护理站',
      effect: 'device-pulse',
      metrics: [
        { label: '位置', value: `走廊-${i + 1}` },
        { label: '响应时间', value: '< 5s' },
        { label: '状态', value: '就绪' }
      ]
    })
    animatables.push({ type: 'call-btn', obj: btn, phase: i * 0.5 })
  }

  // 监控摄像头
  for (let i = 0; i < 3; i++) {
    const cam = new THREE.Group()
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 0.5, 8),
      mat({ color: 0x333333, metalness: 0.8, roughness: 0.3 })
    )
    base.position.y = 3.8
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 12),
      mat({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.25 })
    )
    head.position.y = 3.5
    cam.add(base, head)
    cam.position.set(0, 0, -8 + i * 8)

    const camHit = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 10, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    )
    camHit.position.set(0, 3.6, -8 + i * 8)
    addHit(camHit, {
      id: `cam-${i}`, name: `走廊摄像头 ${i + 1}`, type: 'camera', category: '安防设备',
      value: 1080, unit: 'P',
      district: '走廊', status: 'normal',
      remark: 'AI行为分析，跌倒识别',
      effect: 'camera-scan',
      metrics: [
        { label: '分辨率', value: '1080P' },
        { label: 'AI分析', value: '开启' },
        { label: '状态', value: '在线' }
      ]
    })
    animatables.push({ type: 'camera', obj: head, ang: i })
    group.add(cam)
  }

  // 照明灯
  for (let i = 0; i < 5; i++) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 16, 16),
      mat({ color: 0xffe8aa, emissive: 0xffe8aa, emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.2 })
    )
    lamp.position.set(0, 3.9, -10 + i * 5)
    group.add(lamp)
    animatables.push({ type: 'lamp', obj: lamp, phase: i * 0.3 })
  }

  createInfoStand(theme, {
    id: 'corridor-info', name: '走廊信息站', type: 'info', category: '信息终端',
    value: 9, unit: '台 在线',
    district: '走廊', status: 'normal',
    remark: '走廊安全监控与通行辅助设备汇总',
    effect: 'device-glow',
    metrics: [
      { label: '呼叫器', value: 6 },
      { label: '摄像头', value: 3 },
      { label: '扶手', value: '完好' }
    ]
  })
}

// ─── 餐厅场景 ───
function buildDining(theme, list) {
  // 餐桌
  for (let i = 0; i < 4; i++) {
    const table = new THREE.Group()
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.1, 2),
      mat({ color: 0x8a6a3a, roughness: 0.5, metalness: 0.2 })
    )
    top.position.y = 0.8
    table.add(top)
    for (const [dx, dz] of [[-1.2, -0.8], [1.2, -0.8], [-1.2, 0.8], [1.2, 0.8]]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.8, 8),
        mat({ color: 0x5a3a1a, roughness: 0.5 })
      )
      leg.position.set(dx, 0.4, dz)
      table.add(leg)
    }
    const x = (i % 2) * 8 - 4
    const z = Math.floor(i / 2) * 8 - 4
    table.position.set(x, 0, z)
    group.add(table)

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 1, 2.2),
      new THREE.MeshBasicMaterial({ visible: false })
    )
    hit.position.set(x, 0.8, z)
    addHit(hit, {
      id: `dining-table-${i}`, name: `餐桌 ${i + 1}`, type: 'dining_table', category: '餐饮设施',
      value: 4, unit: '座位',
      district: '餐厅', status: 'normal',
      remark: '适老化餐桌，圆角防撞设计',
      effect: 'device-glow',
      metrics: [
        { label: '座位', value: '4人' },
        { label: '使用', value: i % 2 === 0 ? '空闲' : '使用中' },
        { label: '清洁度', value: '已消毒' }
      ]
    })
  }

  // 餐椅
  for (let i = 0; i < 16; i++) {
    const chair = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      mat({ color: theme.accent, emissive: theme.emissive, emissiveIntensity: 0.2, roughness: 0.6 })
    )
    chair.position.set((i % 4) * 2 - 3, 0.25, Math.floor(i / 4) * 2 - 3)
    group.add(chair)
  }

  // 消毒柜
  const sterilizer = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2.5, 0.8),
    mat({ color: 0xcccccc, emissive: theme.accent, emissiveIntensity: 0.3, metalness: 0.7, roughness: 0.2 })
  )
  sterilizer.position.set(8, 1.25, 0)
  addHit(sterilizer, {
    id: 'sterilizer-1', name: '餐具消毒柜', type: 'sterilizer', category: '消毒设备',
    value: 100, unit: '℃ 消毒温度',
    district: '餐厅', status: 'normal',
    remark: '紫外线+高温双重消毒',
    effect: 'device-pulse',
    metrics: [
      { label: '温度', value: '120℃' },
      { label: '模式', value: '高温消毒' },
      { label: '状态', value: '运行中' }
    ]
  })
  animatables.push({ type: 'sterilizer', obj: sterilizer })

  // 餐车
  const cart = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 2.0, 0.8),
    mat({ color: 0x4488aa, emissive: theme.secondary, emissiveIntensity: 0.25, metalness: 0.6, roughness: 0.3 })
  )
  cart.position.set(-8, 1, 0)
  addHit(cart, {
    id: 'cart-1', name: '送餐车', type: 'cart', category: '配送设备',
    value: 8, unit: '份 容量',
    district: '餐厅', status: 'normal',
    remark: '保温送餐车，为行动不便住户配送',
    effect: 'device-glow',
    metrics: [
      { label: '保温温度', value: '60℃' },
      { label: '容量', value: '8份' },
      { label: '状态', value: '待命' }
    ]
  })

  // 饮水机
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.5, 1.2, 16),
    mat({ color: 0x336699, emissive: theme.accent, emissiveIntensity: 0.3, metalness: 0.6, roughness: 0.25 })
  )
  fountain.position.set(8, 0.6, -4)
  addHit(fountain, {
    id: 'fountain-1', name: '智能饮水机', type: 'fountain', category: '饮水设备',
    value: 45, unit: '℃ 水温',
    district: '餐厅', status: 'normal',
    remark: '恒温直饮水，多温度可选',
    effect: 'device-glow',
    metrics: [
      { label: '水温', value: '45℃' },
      { label: '滤芯', value: '85%' },
      { label: '状态', value: '正常' }
    ]
  })

  createInfoStand(theme, {
    id: 'dining-info', name: '餐厅信息站', type: 'info', category: '信息终端',
    value: 7, unit: '台 在线',
    district: '餐厅', status: 'normal',
    remark: '膳食服务与餐饮设备运行汇总',
    effect: 'device-glow',
    metrics: [
      { label: '餐桌', value: 4 },
      { label: '消毒柜', value: 1 },
      { label: '送餐车', value: 1 }
    ]
  })
}

// ─── 护理站场景 ───
function buildNursing(theme, list) {
  // 护士台（弧形）
  const desk = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 1.0, 16, 1, false, 0, Math.PI),
    mat({ color: 0x2a4a5a, emissive: theme.emissive, emissiveIntensity: 0.25, metalness: 0.4, roughness: 0.4 })
  )
  desk.position.set(0, 0.5, 0)
  group.add(desk)

  // 电脑屏幕
  for (let i = 0; i < 4; i++) {
    const screen = new THREE.Group()
    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8),
      mat({ color: 0x333333, metalness: 0.8, roughness: 0.3 })
    )
    stand.position.y = 1.2
    const display = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.45),
      new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.75 })
    )
    display.position.set(0, 1.5, 0)
    screen.add(stand, display)
    const ang = (i / 4) * Math.PI + 0.3
    screen.position.set(Math.cos(ang) * 2, 0, Math.sin(ang) * 2)
    screen.lookAt(0, 1.5, 5)
    group.add(screen)
    animatables.push({ type: 'screen', obj: display })

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.6, 0.1),
      new THREE.MeshBasicMaterial({ visible: false })
    )
    hit.position.set(Math.cos(ang) * 2, 1.5, Math.sin(ang) * 2)
    addHit(hit, {
      id: `pc-${i}`, name: `护理工作站 ${i + 1}`, type: 'workstation', category: '信息系统',
      value: 98, unit: '% 在线',
      district: '护理站', status: 'normal',
      remark: '住户健康档案、护理计划、告警管理',
      effect: 'device-pulse',
      metrics: [
        { label: '系统状态', value: '在线' },
        { label: '监测住户', value: '10人' },
        { label: '待处理告警', value: i === 0 ? 2 : 0 }
      ]
    })
  }

  // 药品柜
  const medCab = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 3, 0.8),
    mat({ color: 0x3a3a4a, emissive: theme.secondary, emissiveIntensity: 0.3, metalness: 0.5, roughness: 0.3 })
  )
  medCab.position.set(-6, 1.5, -4)
  addHit(medCab, {
    id: 'med-cab-1', name: '智能药品柜', type: 'cabinet', category: '医疗设备',
    value: 156, unit: '份 药品',
    district: '护理站', status: 'normal',
    remark: '智能发药，用药提醒与记录',
    effect: 'device-pulse',
    metrics: [
      { label: '药品数', value: '156份' },
      { label: '待发药', value: '12份' },
      { label: '温控', value: '正常' }
    ]
  })
  animatables.push({ type: 'med-cab', obj: medCab })

  // 监护大屏
  const bigScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 2.2),
    new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.6 })
  )
  bigScreen.position.set(0, 4, -7.8)
  group.add(bigScreen)
  addHit(bigScreen, {
    id: 'big-screen-1', name: '综合监护大屏', type: 'display', category: '信息系统',
    value: 10, unit: '人 监测',
    district: '护理站', status: 'normal',
    remark: '全楼层住户实时健康状态总览',
    effect: 'device-pulse',
    metrics: [
      { label: '监测人数', value: '10人' },
      { label: '告警数', value: '2条' },
      { label: '在线率', value: '100%' }
    ]
  })
  animatables.push({ type: 'screen', obj: bigScreen })

  createInfoStand(theme, {
    id: 'nursing-info', name: '护理站信息终端', type: 'info', category: '信息终端',
    value: 6, unit: '台 在线',
    district: '护理站', status: 'normal',
    remark: '护理调度与告警管理信息汇总',
    effect: 'device-glow',
    metrics: [
      { label: '工作站', value: 4 },
      { label: '监测人数', value: 10 },
      { label: '告警', value: '2条' }
    ]
  })
}

// ─── 康复室场景 ───
function buildRehab(theme, list) {
  // 平行杠
  const parallelBars = new THREE.Group()
  for (const side of [-1, 1]) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.1, 0.1),
      mat({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.4, metalness: 0.7, roughness: 0.25 })
    )
    bar.position.set(0, 1 + side * 0.0, side * 0.6)
    parallelBars.add(bar)
    for (let i = 0; i < 3; i++) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1, 8),
        mat({ color: 0x444444, metalness: 0.8, roughness: 0.3 })
      )
      post.position.set(-2.5 + i * 2.5, 0.5, side * 0.6)
      parallelBars.add(post)
    }
  }
  parallelBars.position.set(0, 0, -4)
  group.add(parallelBars)
  addHit(parallelBars.children[0], {
    id: 'parallel-bars-1', name: '康复平行杠', type: 'rehab', category: '康复器材',
    value: 85, unit: '% 完好',
    district: '康复室', status: 'normal',
    remark: '步态训练，辅助行走康复',
    effect: 'device-glow',
    metrics: [
      { label: '训练时长', value: '30min' },
      { label: '负荷', value: '低' },
      { label: '状态', value: '空闲' }
    ]
  })

  // 跑步机
  const treadmill = new THREE.Group()
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.3, 1.0),
    mat({ color: 0x333333, emissive: theme.emissive, emissiveIntensity: 0.25, metalness: 0.6, roughness: 0.3 })
  )
  base.position.y = 0.3
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 1.2, 0.8),
    mat({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.3 })
  )
  handle.position.set(1.0, 0.9, 0)
  treadmill.add(base, handle)
  treadmill.position.set(-5, 0, 2)
  group.add(treadmill)

  const tmHit = new THREE.Mesh(
    new THREE.BoxGeometry(2.7, 1.5, 1.2),
    new THREE.MeshBasicMaterial({ visible: false })
  )
  tmHit.position.set(-5, 0.75, 2)
  addHit(tmHit, {
    id: 'treadmill-1', name: '康复跑步机', type: 'rehab', category: '康复器材',
    value: 3.2, unit: 'km/h 速度',
    district: '康复室', status: 'normal',
    remark: '低速安全跑步训练，含心率监测',
    effect: 'device-pulse',
    metrics: [
      { label: '速度', value: '3.2 km/h' },
      { label: '时长', value: '15min' },
      { label: '心率', value: '85 bpm' }
    ]
  })
  animatables.push({ type: 'treadmill', obj: handle })

  // 训练阶梯
  const stairs = new THREE.Group()
  for (let i = 0; i < 4; i++) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.25, 0.5),
      mat({ color: 0x5a5a5a, emissive: theme.emissive, emissiveIntensity: 0.2, metalness: 0.4, roughness: 0.4 })
    )
    step.position.set(0, 0.125 + i * 0.3, 3 - i * 0.5)
    stairs.add(step)
  }
  stairs.position.set(5, 0, 0)
  group.add(stairs)

  const stairsHit = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 1.5, 2.5),
    new THREE.MeshBasicMaterial({ visible: false })
  )
  stairsHit.position.set(5, 0.75, 1.5)
  addHit(stairsHit, {
    id: 'stairs-1', name: '训练阶梯', type: 'rehab', category: '康复器材',
    value: 4, unit: '级',
    district: '康复室', status: 'normal',
    remark: '上下阶梯训练，恢复关节活动度',
    effect: 'device-glow',
    metrics: [
      { label: '阶数', value: '4级' },
      { label: '高度', value: '60cm' },
      { label: '状态', value: '空闲' }
    ]
  })

  // 康复训练床
  const rehabBed = new THREE.Group()
  const bedFrame = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.4, 1.5),
    mat({ color: 0x444444, emissive: theme.emissive, emissiveIntensity: 0.2, metalness: 0.5, roughness: 0.4 })
  )
  bedFrame.position.y = 0.6
  rehabBed.add(bedFrame)
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.15, 1.3),
    mat({ color: theme.accent, emissive: theme.emissive, emissiveIntensity: 0.3, roughness: 0.7 })
  )
  pad.position.y = 0.85
  rehabBed.add(pad)
  rehabBed.position.set(-5, 0, -4)
  group.add(rehabBed)

  const rbHit = new THREE.Mesh(
    new THREE.BoxGeometry(2.7, 1.2, 1.7),
    new THREE.MeshBasicMaterial({ visible: false })
  )
  rbHit.position.set(-5, 0.7, -4)
  addHit(rbHit, {
    id: 'rehab-bed-1', name: '康复训练床', type: 'rehab', category: '康复器材',
    value: 30, unit: 'min 使用',
    district: '康复室', status: 'normal',
    remark: '体位训练、关节活动度恢复',
    effect: 'device-glow',
    metrics: [
      { label: '使用时长', value: '30min' },
      { label: '训练项目', value: '体位训练' },
      { label: '状态', value: '使用中' }
    ]
  })

  createInfoStand(theme, {
    id: 'rehab-info', name: '康复室信息站', type: 'info', category: '信息终端',
    value: 5, unit: '台 在线',
    district: '康复室', status: 'normal',
    remark: '康复训练计划与器材使用汇总',
    effect: 'device-glow',
    metrics: [
      { label: '器材', value: 4 },
      { label: '本周训练', value: '12人' },
      { label: '平均时长', value: '25min' }
    ]
  })
}

function buildTheme(themeKey) {
  if (!alive || !scene) return
  clearSceneContent()
  selected.value = null
  emit('select', null)

  const theme = THEMES[themeKey] || THEMES.room
  scene.fog = new THREE.FogExp2(theme.fog, 0.016)
  scene.background = null
  if (wrapRef.value) wrapRef.value.style.setProperty('--glow', theme.skyGlow)

  group = new THREE.Group()
  effectGroup = new THREE.Group()
  scene.add(group)
  scene.add(effectGroup)

  createGround(theme)
  createParticles(theme, 60)

  const list = Array.isArray(props.themeData?.nodes) && props.themeData.nodes.length
    ? props.themeData.nodes
    : Array.from({ length: 20 }, (_, i) => ({
        name: `${theme.label}设备${i + 1}`,
        value: Math.round(50 + Math.random() * 100),
        unit: '',
        district: theme.label,
        status: ['normal', 'warning', 'critical'][i % 5 === 0 ? 1 : 0],
        remark: `${theme.label}监测数据`
      }))

  if (themeKey === 'corridor') buildCorridor(theme, list)
  else if (themeKey === 'dining') buildDining(theme, list)
  else if (themeKey === 'nursing') buildNursing(theme, list)
  else if (themeKey === 'rehab') buildRehab(theme, list)
  else buildRoom(theme, list)

  selectionHalo = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.3, 48),
    new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  )
  selectionHalo.rotation.x = -Math.PI / 2
  selectionHalo.visible = false
  effectGroup.add(selectionHalo)

  selectionBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.25, 14, 12),
    new THREE.MeshBasicMaterial({ color: theme.secondary, transparent: true, opacity: 0.55 })
  )
  selectionBeam.visible = false
  effectGroup.add(selectionBeam)
}

function showSelectionEffect(obj, data) {
  const theme = THEMES[props.theme] || THEMES.room
  const pos = new THREE.Vector3()
  obj.getWorldPosition(pos)

  selectionHalo.visible = true
  selectionHalo.position.set(pos.x, 0.2, pos.z)
  const scale = Math.max(1.5, Math.min(4, 1.8 + Math.random()))
  selectionHalo.userData.baseScale = scale
  selectionHalo.scale.setScalar(scale)

  selectionBeam.visible = true
  selectionBeam.position.set(pos.x, 7, pos.z)
  selectionBeam.material.color.setHex(theme.accent)

  interactive.forEach((m) => {
    if (m.material?.emissive && m.userData.baseEmissive != null) {
      m.material.emissive.setHex(m.userData.baseEmissive)
      m.material.emissiveIntensity = m.userData.baseEmissiveIntensity
    }
    if (m.userData.baseScale) m.scale.copy(m.userData.baseScale)
  })

  if (obj.material?.emissive) {
    obj.material.emissive.setHex(0xffffff)
    obj.material.emissiveIntensity = 1.1
  }
  obj.scale.setScalar(1.08)
  pulseTime = 0

  const burst = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.6, 32),
    new THREE.MeshBasicMaterial({ color: theme.secondary, transparent: true, opacity: 0.95, side: THREE.DoubleSide })
  )
  burst.rotation.x = -Math.PI / 2
  burst.position.set(pos.x, 0.3, pos.z)
  effectGroup.add(burst)
  animatables.push({ type: 'burst', obj: burst, life: 0 })
}

function clearSelectionEffect() {
  if (selectionHalo) selectionHalo.visible = false
  if (selectionBeam) selectionBeam.visible = false
  interactive.forEach((m) => {
    if (m.material?.emissive && m.userData.baseEmissive != null) {
      m.material.emissive.setHex(m.userData.baseEmissive)
      m.material.emissiveIntensity = m.userData.baseEmissiveIntensity
    }
    if (m.userData.baseScale) m.scale.copy(m.userData.baseScale)
  })
}

function updateCamera() {
  camera.position.set(Math.cos(orbitAngle) * orbitRadius, orbitHeight, Math.sin(orbitAngle) * orbitRadius)
  camera.lookAt(0, 3, 0)
}

function init() {
  if (alive) destroy()
  const el = wrapRef.value
  if (!el) return

  // WebGL 不可用：给出可读降级提示，而不是留一块黑屏
  if (!hasWebGL()) {
    glFailed.value = true
    emit('webgl-failed')
    return
  }

  alive = true
  glFailed.value = false
  const w = el.clientWidth || window.innerWidth
  const h = el.clientHeight || window.innerHeight
  clock = new THREE.Clock()

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 300)
  updateCamera()

  try {
    renderer = new THREE.WebGLRenderer({ antialias: !isTouch.value, alpha: true })
  } catch (err) {
    alive = false
    glFailed.value = true
    emit('webgl-failed')
    return
  }
  // 触控设备降低像素比，兼顾清晰度与帧率
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch.value ? 1.5 : 2))
  renderer.setSize(w, h)
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  el.appendChild(renderer.domElement)

  const hemi = new THREE.HemisphereLight(0xffd8aa, 0x1a1428, 0.6)
  const dir = new THREE.DirectionalLight(0xfff0d0, 0.9)
  dir.position.set(15, 30, 10)
  const fill = new THREE.PointLight(0xff8c42, 0.8, 80)
  fill.position.set(-8, 15, -8)
  const rim = new THREE.PointLight(0xffffff, 0.4, 60)
  rim.position.set(10, 10, 15)
  lights = [hemi, dir, fill, rim]
  lights.forEach((l) => scene.add(l))

  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()

  const dom = renderer.domElement
  dom.style.touchAction = 'none' // 触摸手势自行处理，避免与页面滚动/缩放抢事件
  dom.addEventListener('pointerdown', onPointerDown)
  dom.addEventListener('pointermove', onPointerMove)
  dom.addEventListener('pointerup', onPointerUp)
  dom.addEventListener('pointercancel', onPointerUp)
  dom.addEventListener('pointerleave', onPointerUp)
  dom.addEventListener('wheel', onWheel, { passive: true })
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('resize', onResize)

  // 容器尺寸变化（侧栏折叠、抽屉开合、横竖屏切换）也能触发重绘
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => onResize())
    resizeObserver.observe(el)
  }

  buildTheme(props.theme)
  animate()
}

function isTypingTarget(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

function onKeyDown(e) {
  if (isTypingTarget(e.target)) return
  const code = e.code
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','KeyQ','KeyE'].includes(code)) {
    keys[code] = true
    e.preventDefault()
  }
}

function onKeyUp(e) { keys[e.code] = false }

function applyKeyboardOrbit() {
  let moved = false
  if (keys.ArrowLeft || keys.KeyA) { orbitAngle -= KEY_ROTATE; moved = true }
  if (keys.ArrowRight || keys.KeyD) { orbitAngle += KEY_ROTATE; moved = true }
  if (keys.ArrowUp || keys.KeyW) { orbitHeight = Math.min(LIMIT.heightMax, orbitHeight + KEY_PITCH); moved = true }
  if (keys.ArrowDown || keys.KeyS) { orbitHeight = Math.max(LIMIT.heightMin, orbitHeight - KEY_PITCH); moved = true }
  if (keys.KeyQ) { orbitRadius = Math.min(LIMIT.radiusMax, orbitRadius + KEY_ZOOM); moved = true }
  if (keys.KeyE) { orbitRadius = Math.max(LIMIT.radiusMin, orbitRadius - KEY_ZOOM); moved = true }
  if (moved) updateCamera()
}

function pointerList() {
  return [...activePointers.values()]
}

function measurePinch() {
  const [a, b] = pointerList()
  if (!a || !b) return 0
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function onPointerDown(e) {
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  // 双指：进入捏合缩放，暂停单指旋转
  if (activePointers.size === 2) {
    pinchDistance = measurePinch()
    pinchRadius = orbitRadius
    pinchActive = true
    isDragging = false
    dragMoved = true
    return
  }
  if (activePointers.size > 2) return

  isDragging = true
  dragMoved = false
  lastX = e.clientX
  lastY = e.clientY
}

function onPointerMove(e) {
  if (!activePointers.has(e.pointerId)) return
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  // 双指捏合缩放：按两指距离比例映射到相机半径
  if (pinchActive && activePointers.size >= 2) {
    const d = measurePinch()
    if (pinchDistance > 0 && d > 0) {
      orbitRadius = Math.min(LIMIT.radiusMax, Math.max(LIMIT.radiusMin, pinchRadius * (pinchDistance / d)))
      updateCamera()
    }
    dragMoved = true
    return
  }

  if (!isDragging) return
  const dx = e.clientX - lastX
  const dy = e.clientY - lastY
  if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true
  lastX = e.clientX; lastY = e.clientY
  orbitAngle += dx * 0.005
  orbitHeight = Math.min(LIMIT.heightMax, Math.max(LIMIT.heightMin, orbitHeight - dy * 0.04))
  updateCamera()
}

function onPointerUp(e) {
  activePointers.delete(e.pointerId)
  if (activePointers.size < 2) pinchActive = false

  // 从双指退回单指：重置拖拽基准，避免相机跳变
  if (activePointers.size === 1) {
    const [p] = pointerList()
    lastX = p.x
    lastY = p.y
    isDragging = true
    dragMoved = true
    return
  }
  if (activePointers.size > 1) return

  const wasDrag = dragMoved
  isDragging = false
  dragMoved = false
  if (!wasDrag) pick(e)
}

function onWheel(e) {
  orbitRadius = Math.min(LIMIT.radiusMax, Math.max(LIMIT.radiusMin, orbitRadius + e.deltaY * 0.025))
  updateCamera()
}

function pick(e) {
  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(mouse, camera)
  const hits = raycaster.intersectObjects(interactive, false)
  if (hits.length) {
    const obj = hits[0].object
    selected.value = { ...obj.userData }
    showSelectionEffect(obj, obj.userData)
    emit('select', selected.value)
  } else {
    selected.value = null
    clearSelectionEffect()
    emit('select', null)
  }
}

function animate() {
  if (!alive || !renderer || !scene || !camera) return
  animationId = requestAnimationFrame(animate)
  applyKeyboardOrbit()
  const t = clock ? clock.getElapsedTime() : 0
  pulseTime += 0.05

  if (particles) {
    particles.rotation.y += particles.userData.speed
    const pos = particles.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + 0.008
      if (y > 20) y = 1
      pos.setY(i, y)
    }
    pos.needsUpdate = true
  }

  if (selectionHalo?.visible) {
    selectionHalo.material.opacity = 0.55 + Math.sin(pulseTime * 4) * 0.3
    const base = selectionHalo.userData.baseScale || 2
    selectionHalo.scale.setScalar(base * (1 + Math.sin(pulseTime * 3) * 0.1))
    selectionBeam.material.opacity = 0.35 + Math.sin(pulseTime * 3) * 0.2
    selectionBeam.scale.y = 1 + Math.sin(pulseTime * 2) * 0.08
  }

  animatables = animatables.filter((a) => {
    if (a.type === 'burst') {
      a.life += 0.05
      a.obj.scale.setScalar(1 + a.life * 3)
      a.obj.material.opacity = Math.max(0, 0.95 - a.life)
      if (a.life > 1) {
        effectGroup.remove(a.obj)
        a.obj.geometry.dispose(); a.obj.material.dispose()
        return false
      }
    } else if (a.type === 'screen') {
      a.obj.material.opacity = 0.5 + Math.sin(t * 2) * 0.2
    } else if (a.type === 'call-btn') {
      a.obj.material.emissiveIntensity = 0.5 + Math.sin(t * 3 + a.phase) * 0.3
    } else if (a.type === 'camera') {
      a.obj.rotation.y = Math.sin(t * 0.6 + a.ang) * 0.4
    } else if (a.type === 'lamp') {
      a.obj.material.emissiveIntensity = 0.6 + Math.sin(t * 1.5 + a.phase) * 0.2
    } else if (a.type === 'wearable') {
      a.obj.material.emissiveIntensity = 0.4 + Math.sin(t * 4) * 0.2
    } else if (a.type === 'fall-sensor') {
      a.obj.material.emissiveIntensity = 0.5 + Math.sin(t * 1) * 0.2
    } else if (a.type === 'sterilizer') {
      a.obj.material.emissiveIntensity = 0.3 + Math.sin(t * 2) * 0.15
    } else if (a.type === 'med-cab') {
      a.obj.material.emissiveIntensity = 0.25 + Math.sin(t * 1.5) * 0.1
    } else if (a.type === 'treadmill') {
      a.obj.rotation.y = Math.sin(t * 0.8) * 0.15
    }
    return true
  })

  try { renderer.render(scene, camera) } catch { alive = false }
}

function onResize() {
  if (!alive || !wrapRef.value || !camera || !renderer) return
  const w = wrapRef.value.clientWidth
  const h = wrapRef.value.clientHeight
  if (!w || !h) return
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

function scheduleRebuild() {
  if (!alive || !scene) return
  if (rebuildTimer) clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null
    if (alive && scene) buildTheme(props.theme)
  }, 120)
}

watch(() => props.theme, (v) => { if (alive && scene) buildTheme(v) })
watch(() => props.themeData, () => scheduleRebuild(), { deep: true })

onMounted(() => init())
onBeforeUnmount(() => destroy())

defineExpose({
  clearSelect() { selected.value = null; clearSelectionEffect() },
  destroy,
  // 供虚拟控制按钮 / 无障碍键盘操作调用（步进值比连续按键更明确）
  rotateBy(direction = 1) { orbitAngle += STEP_ROTATE * direction; updateCamera() },
  pitchBy(direction = 1) {
    orbitHeight = Math.min(LIMIT.heightMax, Math.max(LIMIT.heightMin, orbitHeight + STEP_PITCH * direction))
    updateCamera()
  },
  zoomBy(direction = 1) {
    orbitRadius = Math.min(LIMIT.radiusMax, Math.max(LIMIT.radiusMin, orbitRadius + STEP_ZOOM * direction))
    updateCamera()
  },
  resetView() { orbitAngle = 0.55; orbitRadius = 40; orbitHeight = 20; updateCamera() },
  isWebglReady: () => alive && !!renderer
})
</script>

<style scoped>
.room3d {
  position: absolute;
  inset: 0;
  z-index: 0;
  cursor: grab;
  touch-action: none; /* 手势由组件接管，避免与页面滚动冲突 */
  --glow: #2a1f1a;
  background:
    radial-gradient(ellipse at 50% 20%, color-mix(in srgb, var(--glow) 70%, transparent), transparent 55%),
    radial-gradient(ellipse at 50% 100%, rgba(40, 30, 50, 0.35), transparent 50%);
}
.room3d:active { cursor: grabbing; }
.room3d.is-touch { cursor: default; }

/* 触控端：提示移到顶部，底部让位给虚拟控制条 */
.room3d.is-touch .hint {
  top: 10px;
  bottom: auto;
  font-size: 11px;
  padding: 6px 12px;
  letter-spacing: 0.5px;
}
.fx-layer { display: none; }
.hint {
  position: absolute;
  left: 50%;
  bottom: 42px;
  transform: translateX(-50%);
  z-index: 2;
  max-width: calc(100% - 32px);
  padding: 8px 16px;
  font-size: 12px;
  color: var(--sc-muted);
  background: rgba(20, 15, 25, 0.6);
  border: 1px solid var(--sc-border);
  pointer-events: none;
  letter-spacing: 1px;
  text-align: center;
  backdrop-filter: blur(6px);
}

/* WebGL 降级：给出可读说明，避免黑屏 */
.gl-fallback {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
  background: rgba(20, 15, 25, 0.72);
  backdrop-filter: blur(4px);
}
.gl-icon {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--sc-border);
  color: var(--sc-primary);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 1px;
  clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
  background: linear-gradient(135deg, rgba(255, 140, 66, 0.16), transparent 60%);
}
.gl-title {
  margin: 0;
  font-size: 14px;
  color: var(--sc-primary);
  letter-spacing: 1px;
}
.gl-sub {
  margin: 0;
  max-width: 420px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--sc-muted);
}
</style>

