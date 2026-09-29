import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Metres, schematic cutaway architecture. Articulated rigid meshes, not skinned GLB assets.
export function buildCareScene(theme = 'room', data = {}, { actorsOnly = false } = {}) {
  const group = new THREE.Group(), pickables = [], actors = [], helpers = []
  const geometries = new Set(), materials = new Map(), textures = new Set()
  const geo = g => (geometries.add(g), g)
  const cube = geo(new THREE.BoxGeometry(1, 1, 1))
  const sphere = geo(new THREE.SphereGeometry(1, 12, 8))
  const cylinder = geo(new THREE.CylinderGeometry(1, 1, 1, 12))
  const colors = { wall: 0xe8e2d4, floor: 0xcab394, wood: 0x966b49, lightWood: 0xcfaa7c, teal: 0x6a9892, white: 0xf7f1e5, metal: 0x8b979c, dark: 0x35494c, leaf: 0x5b8064, skin: 0xd5a27c, hair: 0xd3d3cb, blue: 0x7599ac, orange: 0xdca36b }
  function mat(color) {
    const key = typeof color === 'string' ? colors[color] ?? color : color
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color: key, roughness: 0.76, metalness: key === colors.metal ? 0.45 : 0.04 }))
    return materials.get(key)
  }
  function mesh(parent, geometry, color, scale, position) {
    const m = new THREE.Mesh(geometry, mat(color)); m.scale.set(...scale); m.position.set(...position)
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m
  }
  const box = (p, s, xyz, c = 'wood') => mesh(p, cube, c, s, xyz)
  const ball = (p, s, xyz, c = 'skin') => mesh(p, sphere, c, s, xyz)
  const rod = (p, s, xyz, c = 'metal') => mesh(p, cylinder, c, s, xyz)
  function part(name, x = 0, y = 0, z = 0) { const p = new THREE.Group(); p.name = name; p.position.set(x, y, z); group.add(p); return p }
  function detail(object, name, extra = {}) {
    object.userData = { name, category: '康养空间', type: '设施示意', status: 'demo', value: '示意', unit: '', district: data.roomNo ? `${data.roomNo}室` : '布局示意', remark: '空间和设施为设计示意，未关联实时设备状态。', effect: 'outline', ...extra }
    pickables.push(object); return object
  }
  function label(parent, text, x, y, z, width = 1.1) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#304a49'; ctx.fillRect(0, 0, 512, 96)
    ctx.font = '500 40px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff4dc'; ctx.fillText(text, 256, 49, 488)
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture)
    const material = new THREE.MeshBasicMaterial({ map: texture }); materials.set(Symbol(text), material)
    const m = new THREE.Mesh(geo(new THREE.PlaneGeometry(width, width * 96 / 512)), material); m.position.set(x, y, z); parent.add(m)
  }
  function plant(x, z, height = 0.85) {
    const p = part('绿植', x, 0, z); rod(p, [0.18, 0.3, 0.18], [0, 0.15, 0], 'white')
    rod(p, [0.023, height * 0.7, 0.023], [0, height * 0.52, 0], 'wood')
    for (let i = 0; i < 5; i++) { const a = i * 2.4; const leaf = ball(p, [0.1, 0.25, 0.07], [Math.sin(a) * 0.12, height * (0.58 + i * 0.07), Math.cos(a) * 0.12], 'leaf'); leaf.rotation.z = Math.sin(a) * 0.65 }
  }
  function shell(w, d, title) {
    const p = part('空间建筑')
    box(p, [w + 0.2, 0.16, d + 0.2], [0, -0.08, 0], 'floor')
    // Back wall with a real opening for the window; front and right are cut away.
    box(p, [w, 0.8, 0.12], [0, 0.4, -d / 2], 'wall')
    box(p, [w, 0.5, 0.12], [0, 2.55, -d / 2], 'wall')
    box(p, [w * 0.25, 1.5, 0.12], [-w * 0.375, 1.55, -d / 2], 'wall')
    box(p, [w * 0.25, 1.5, 0.12], [w * 0.375, 1.55, -d / 2], 'wall')
    box(p, [w * 0.5, 1.45, 0.035], [0, 1.55, -d / 2 + 0.02], 0xbdd4d2)
    box(p, [0.055, 1.5, 0.1], [0, 1.55, -d / 2 + 0.07], 'white')
    box(p, [w * 0.53, 0.07, 0.26], [0, 0.84, -d / 2 + 0.06], 'white')
    for (const sign of [-1, 1]) box(p, [0.24, 1.6, 0.15], [sign * w * 0.25, 1.58, -d / 2 + 0.12], 'teal')
    // Left wall: open doorway towards the foreground.
    box(p, [0.12, 2.8, d - 1.1], [-w / 2, 1.4, -0.55], 'wall')
    box(p, [0.12, 0.6, 1.1], [-w / 2, 2.5, d / 2 - 0.55], 'wall')
    box(p, [0.18, 0.85, d - 1.1], [-w / 2 + 0.06, 0.425, -0.55], 'lightWood')
    box(p, [w, 0.08, 0.07], [0, 0.05, -d / 2 + 0.09], 'wood')
    box(p, [0.06, 0.07, d - 1.3], [-w / 2 + 0.19, 0.87, -0.55], 'wood')
    label(p, title, -w * 0.32, 2.53, -d / 2 + 0.08, Math.min(1.7, w * 0.32))
    // Floorboard seams, thin geometry with no bright grid or decorative particles.
    for (let z = -d / 2 + 0.45; z < d / 2; z += 0.45) box(p, [w, 0.002, 0.012], [0, 0.004, z], 0xb79e7e)
    plant(w / 2 - 0.4, -d / 2 + 0.4)
  }
  function chair(x, z, rotation = 0, c = 'teal') {
    const p = part('扶手座椅', x, 0, z); p.rotation.y = rotation
    box(p, [0.52, 0.12, 0.5], [0, 0.48, 0], c); box(p, [0.52, 0.48, 0.1], [0, 0.78, -0.23], c)
    for (const xx of [-0.22, 0.22]) { box(p, [0.055, 0.48, 0.055], [xx, 0.24, -0.2]); box(p, [0.055, 0.66, 0.055], [xx, 0.33, 0.2]); box(p, [0.07, 0.06, 0.5], [xx, 0.67, 0]) }
    return p
  }
  function bed(x, z, n) {
    const p = part(`护理床${n}`, x, 0, z)
    const base = box(p, [0.95, 0.15, 2], [0, 0.43, 0], 'metal'); detail(base, `${n}号护理床`)
    box(p, [0.91, 0.16, 1.94], [0, 0.58, 0], 'white')
    box(p, [0.86, 0.12, 1.15], [0, 0.7, 0.32], n === 1 ? 'teal' : 'blue')
    box(p, [0.64, 0.14, 0.38], [0, 0.72, -0.64], 'white')
    for (const zz of [-0.99, 0.99]) { box(p, [1.02, 0.58, 0.085], [0, 0.58, zz], 'lightWood'); for (const xx of [-0.35, 0.35]) rod(p, [0.06, 0.12, 0.06], [xx, 0.11, zz * 0.85], 'dark') }
    for (const xx of [-0.49, 0.49]) { box(p, [0.045, 0.045, 0.95], [xx, 0.89, 0.05], 'metal'); for (const zz of [-0.37, 0.42]) box(p, [0.035, 0.37, 0.035], [xx, 0.7, zz], 'metal') }
    label(p, `BED 0${n}`, 0, 0.62, 1.038, 0.46)
  }
  function cabinet(x, z, name, height = 0.75) {
    const p = part(name, x, 0, z); const body = box(p, [0.58, height, 0.5], [0, height / 2, 0], 'lightWood'); detail(body, name)
    for (const y of [height * 0.3, height * 0.7]) { box(p, [0.52, height * 0.36, 0.03], [0, y, 0.266], 'white'); box(p, [0.14, 0.018, 0.035], [0, y + 0.04, 0.29], 'metal') }
    return p
  }
  function wheelchair(parent) {
    box(parent, [0.48, 0.12, 0.48], [0, 0.5, 0], 'dark'); box(parent, [0.48, 0.44, 0.09], [0, 0.76, -0.22], 'teal')
    const wheelGeo = geo(new THREE.TorusGeometry(0.29, 0.032, 6, 18))
    for (const x of [-0.34, 0.34]) {
      const w = new THREE.Mesh(wheelGeo, mat('dark')); w.rotation.y = Math.PI / 2; w.position.set(x, 0.31, -0.06); parent.add(w)
      rod(parent, [0.035, 0.65, 0.035], [x, 0.5, -0.18]); box(parent, [0.07, 0.07, 0.5], [x, 0.72, 0.02], 'dark')
      for (let i = 0; i < 4; i++) { const spoke = box(parent, [0.018, 0.52, 0.018], [x, 0.31, -0.06], 'metal'); spoke.rotation.x = i * Math.PI / 4 }
      ball(parent, [0.075, 0.075, 0.055], [x * 0.8, 0.09, 0.42], 'dark')
      box(parent, [0.19, 0.035, 0.25], [x * 0.5, 0.12, 0.49], 'metal')
    }
  }
  function person(x, z, { nurse = false, seated = false, wheel = false, node = null, angle = 0 } = {}) {
    const p = part(nurse ? '护理员（示意）' : '长者（示意）', x, 0, z); p.rotation.y = angle
    if (wheel) wheelchair(p)
    const bone = (parent, name, xyz) => { const b = new THREE.Bone(); b.name = name; b.position.set(...xyz); parent.add(b); return b }
    const root = bone(p, 'hips', [0, seated ? 0.62 : 0.87, 0])
    const spine = bone(root, 'spine', [0, 0.14, 0]), neck = bone(spine, 'neck', [0, 0.38, 0]), head = bone(neck, 'head', [0, 0.15, 0])
    const outfit = nurse ? 'white' : 'blue'
    const torso = box(spine, [0.38, 0.4, 0.23], [0, 0.17, 0], outfit)
    ball(head, [0.145, 0.18, 0.14], [0, 0.015, 0]); ball(head, [0.149, 0.09, 0.14], [0, 0.12, -0.018], nurse ? 'wood' : 'hair')
    ball(head, [0.032, 0.035, 0.04], [0, 0.015, 0.14])
    for (const s of [-1, 1]) ball(head, [0.012, 0.013, 0.008], [s * 0.056, 0.05, 0.135], 'dark')
    if (nurse) { box(head, [0.25, 0.065, 0.21], [0, 0.19, 0], 'white'); box(spine, [0.09, 0.065, 0.008], [-0.09, 0.26, 0.12], 'teal') }
    const arms = [], legs = []
    for (const s of [-1, 1]) {
      const shoulder = bone(spine, `${s}shoulder`, [s * 0.24, 0.31, 0]); ball(shoulder, [0.075, 0.08, 0.075], [0, 0, 0], outfit)
      rod(shoulder, [0.06, 0.24, 0.06], [0, -0.12, 0], outfit)
      const elbow = bone(shoulder, `${s}elbow`, [0, -0.25, 0]); rod(elbow, [0.045, 0.23, 0.045], [0, -0.11, 0], 'skin')
      const hand = bone(elbow, `${s}hand`, [0, -0.24, 0]); ball(hand, [0.047, 0.065, 0.035], [0, -0.025, 0])
      shoulder.rotation.x = seated ? -0.25 : 0; elbow.rotation.x = seated ? -1.12 : -0.12; arms.push({ shoulder, elbow })
      const hip = bone(root, `${s}hip`, [s * 0.105, -0.02, 0]); rod(hip, [0.085, 0.38, 0.085], [0, -0.18, 0], 'dark')
      const knee = bone(hip, `${s}knee`, [0, -0.38, 0]); rod(knee, [0.065, 0.36, 0.065], [0, -0.18, 0], 'dark')
      const ankle = bone(knee, `${s}ankle`, [0, -0.36, 0]); box(ankle, [0.15, 0.085, 0.27], [0, -0.025, 0.06], 'wood')
      hip.rotation.x = seated ? -Math.PI / 2 : 0; knee.rotation.x = seated ? Math.PI / 2 : 0; legs.push({ hip, knee })
    }
    const payload = node ? { ...node, category: '住户健康', type: '关节人物 · 示意姿态', remark: `${node.remark || ''}；姿态仅示意，非实时定位或动作。` } : { type: nurse ? '护理员 · 示意角色' : wheel ? '轮椅长者 · 示意角色' : '长者 · 示意角色', remark: '用于展示康养空间尺度与活动方式，不代表真实人员位置或动作。' }
    detail(torso, node?.name || p.name, payload)
    // All visible body segments resolve to the same semantic resident/role.
    root.traverse(o => { if (o.isMesh && o !== torso) { o.userData = torso.userData; pickables.push(o) } })
    const helper = new THREE.SkeletonHelper(root); helper.visible = false; helper.material.depthTest = false; helper.renderOrder = 10; group.add(helper); helpers.push(helper)
    actors.push({ group: p, root, spine, head, arms, legs, seated, nurse })
  }
  const validTheme = ['room', 'corridor', 'dining', 'nursing', 'rehab'].includes(theme) ? theme : 'room'
  if (validTheme === 'room') {
    shell(4, 4, data.roomNo ? `${data.roomNo} · 康养居室` : '康养双床居室 · 示意')
    bed(-1.05, -0.5, 1); bed(1.05, -0.5, 2)
    cabinet(0, -1.45, '床头储物柜', 0.7)
    for (const x of [-1.05, 1.05]) {
      const button = box(group, [0.18, 0.14, 0.08], [x, 1.14, -1.9], 'white'); detail(button, '床头紧急呼叫按钮')
      ball(group, [0.035, 0.035, 0.02], [x, 1.14, -1.85], 'orange')
    }
    chair(-1.5, 1.35, -0.2); chair(1.45, 1.32, 0.2)
    if (data.roomNo) {
      const seen = new Set()
      for (const [index, node] of (data.nodes || []).slice(0, 2).entries()) {
        const bedNo = Number(node.bedNo) === 2 ? 2 : Number(node.bedNo) === 1 ? 1 : index + 1
        if (seen.has(bedNo)) continue
        seen.add(bedNo); person(bedNo === 1 ? -1.5 : 1.45, bedNo === 1 ? 1.35 : 1.32, { seated: true, node, angle: bedNo === 1 ? -0.2 : 0.2 })
      }
    } else person(-1.5, 1.35, { seated: true, angle: -0.2 })
  } else if (validTheme === 'corridor') {
    shell(3.2, 7, '无障碍通行 · 示意')
    for (const z of [-2.3, 0, 2]) {
      const door = box(group, [0.08, 2.12, 0.85], [-1.5, 1.06, z], 'lightWood'); detail(door, '居室通道门')
      box(group, [0.16, 0.07, 0.08], [-1.4, 0.96, z + 0.23], 'metal')
    }
    box(group, [0.07, 0.07, 6.4], [1.35, 0.85, 0], 'wood')
    for (const z of [-2.8, 0, 2.8]) box(group, [0.045, 0.86, 0.045], [1.35, 0.43, z], 'metal')
    person(0.4, 0.6, { wheel: true, seated: true }); person(-0.55, -0.5, { nurse: true })
  } else if (validTheme === 'dining') {
    shell(6, 5, '共享餐厅 · 示意')
    for (const x of [-1.45, 1.45]) {
      const table = box(group, [1.5, 0.1, 1.05], [x, 0.78, -0.3], 'lightWood'); detail(table, '适老化餐桌')
      for (const xx of [-0.58, 0.58]) for (const zz of [-0.38, 0.38]) box(group, [0.08, 0.76, 0.08], [x + xx, 0.38, -0.3 + zz], 'wood')
      chair(x - 0.36, 0.55); chair(x + 0.36, -1.15, Math.PI)
      for (const xx of [-0.36, 0.36]) { rod(group, [0.14, 0.022, 0.14], [x + xx, 0.85, -0.3], 'white'); rod(group, [0.04, 0.12, 0.04], [x + xx + 0.2, 0.9, -0.4], 'teal') }
    }
    cabinet(-2.5, -1.9, '餐具储存柜', 1.4); person(-1.81, 0.55, { seated: true }); person(1.8, 1.6, { nurse: true, angle: -0.65 })
  } else if (validTheme === 'nursing') {
    shell(5.6, 4.6, '护理工作站 · 示意')
    const desk = box(group, [3, 0.95, 0.65], [0, 0.475, 0.5], 'lightWood'); detail(desk, '护理接待台')
    box(group, [3.1, 0.08, 0.75], [0, 0.99, 0.5], 'white')
    box(group, [0.78, 0.46, 0.07], [-0.4, 1.28, 0.49], 'dark'); box(group, [0.7, 0.36, 0.012], [-0.4, 1.29, 0.535], 'teal')
    box(group, [0.09, 0.16, 0.09], [-0.4, 1.06, 0.49], 'metal')
    cabinet(-2.15, -1.8, '药品收纳柜', 1.8); cabinet(-1.4, -1.8, '护理档案柜', 1.8)
    label(group, 'CARE · 护理服务', 0.75, 0.6, 0.836, 1.1)
    person(0.55, -0.2, { nurse: true }); person(0.8, 1.5, { wheel: true, seated: true, angle: Math.PI })
  } else {
    shell(6, 5, '康复训练空间 · 示意')
    for (const x of [-1.7, -0.75]) {
      const rail = box(group, [0.075, 0.075, 2.6], [x, 0.94, -0.1], 'wood'); detail(rail, '康复平行杠')
      for (const z of [-1.2, 1]) box(group, [0.06, 0.94, 0.06], [x, 0.47, z], 'metal')
    }
    box(group, [1.5, 0.035, 2.9], [-1.22, 0.023, -0.1], 'teal')
    for (let i = 0; i < 3; i++) box(group, [1.15, (i + 1) * 0.13, 0.4], [1.7, (i + 1) * 0.065, 0.5 - i * 0.4], 'lightWood')
    cabinet(2.4, -1.9, '康复器具柜', 1.2)
    person(-1.22, 0.1, { angle: 0 }); person(0.05, 0.7, { nurse: true, angle: -0.6 })
  }
  // GLB owns the environment; retain only live, data-bound demonstration actors.
  if (actorsOnly) {
    const retained = new Set([...actors.map(a => a.group), ...helpers])
    for (const child of [...group.children]) if (!retained.has(child)) group.remove(child)
    const actorMeshes = new Set()
    actors.forEach(a => a.group.traverse(o => { if (o.isMesh) actorMeshes.add(o) }))
    for (let i = pickables.length - 1; i >= 0; i--) if (!actorMeshes.has(pickables[i])) pickables.splice(i, 1)
  }
  // Batch non-interactive, static geometry by material. Skeleton parts stay articulated.
  group.updateMatrixWorld(true)
  const interactive = new Set(pickables), batches = new Map(), remove = []
  group.traverse(o => {
    if (!o.isMesh || interactive.has(o)) return
    let p = o.parent; while (p && p !== group) { if (p.isBone || actors.some(a => a.group === p)) return; p = p.parent }
    if (!batches.has(o.material)) batches.set(o.material, [])
    batches.get(o.material).push(o.geometry.clone().applyMatrix4(o.matrixWorld)); remove.push(o)
  })
  for (const [material, pieces] of batches) {
    const merged = mergeGeometries(pieces, false)
    pieces.forEach(g => g.dispose())
    if (merged) { const m = new THREE.Mesh(geo(merged), material); m.castShadow = true; m.receiveShadow = true; group.add(m) }
  }
  remove.forEach(o => o.removeFromParent())
  const bounds = new THREE.Box3().setFromObject(group)
  let disposed = false
  return {
    group, pickables, actors, bounds,
    update(dt, elapsed) {
      actors.forEach((a, i) => { const wave = Math.sin(elapsed * 1.4 + i * 0.9); a.spine.rotation.z = wave * 0.012; a.head.rotation.y = Math.sin(elapsed * 0.55 + i) * 0.065; if (!a.seated) a.arms.forEach(({ elbow }, n) => { elbow.rotation.x = -0.16 + Math.sin(elapsed * 1.1 + n) * 0.07 }) })
    },
    setSkeletonVisible(value) { helpers.forEach(h => { h.visible = value }) },
    dispose() {
      if (disposed) return; disposed = true
      helpers.forEach(h => { h.geometry.dispose(); h.material.dispose() })
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); group.clear()
    }
  }
}
