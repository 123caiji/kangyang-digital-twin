<template>
  <div ref="wrap" class="room3d care-room" tabindex="0" aria-label="康养三维场景，方向键旋转，Q E 缩放，R 重置，Esc 取消选中" @keydown="onKey">
    <div class="model-toolbar" role="group" aria-label="模型显示选项">
      <button type="button" @click="resetView">重置视角</button>
      <button type="button" :aria-pressed="paused" @click="paused = !paused">{{ paused ? '播放动作' : '暂停动作' }}</button>
      <button type="button" :aria-pressed="skeleton" @click="skeleton = !skeleton">{{ skeleton ? '隐藏骨架' : '查看骨架' }}</button>
    </div>
    <div class="model-caption" aria-live="polite">
      <b>{{ themeData.roomNo ? `${themeData.roomNo}室 · 空间特写` : '康养空间 · 布局示意' }}</b>
      <span>{{ loading ? 'Blender 模型加载中…' : assetSource === 'blender-glb' ? 'Blender 建模 · GLB 实时加载' : '基础示意模型' }}</span>
      <span v-if="assetError" role="status">模型资源加载失败，已保留基础场景</span>
      <span>人物姿态为示意，非实时定位 · {{ actorCount }} 个角色</span>
      <span v-if="theme === 'room' && themeData.roomNo && !themeData.nodes?.length">暂无入住数据，不生成住户人物</span>
    </div>
    <div v-if="failed" class="gl-fallback" role="status">三维场景暂不可用，请使用园区总览或数据管理查看信息。</div>
    <div v-else class="model-hint">拖拽旋转 · 右键平移 · 滚轮缩放 · 点选查看 · 双击聚焦</div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { buildCareScene } from '@/three/careScene'
import { loadBlenderCareScene } from '@/three/blenderCareScene'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createSceneControls } from '@/three/sceneControls'
const props = defineProps({ theme: { type: String, default: 'room' }, themeData: { type: Object, default: () => ({ nodes: [] }) } })
const emit = defineEmits(['select', 'webgl-failed'])
const wrap = ref(null), failed = ref(false), paused = ref(false), skeleton = ref(false), actorCount = ref(0)
let renderer, scene, camera, rig, model, observer, frame, selectionBox, lastTime = 0, elapsed = 0, selectedObject = null
const loading = ref(false), assetSource = ref('procedural'), assetError = ref('')
let generation = 0, destroyed = false, environmentTarget
let gesture = null, pointers = new Set(), reducedMotion, selectTimer
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
function clearSelection() {
  clearTimeout(selectTimer)
  selectionBox && scene?.remove(selectionBox)
  selectionBox?.geometry.dispose(); selectionBox?.material.dispose(); selectionBox = null
  selectedObject = null
  emit('select', null)
}
async function rebuild(reset = true) {
  if (!scene || !rig || failed.value || destroyed) return
  const current = ++generation
  loading.value = true; assetError.value = ''; assetSource.value = 'procedural'
  clearSelection()
  if (model) { scene.remove(model.group); model.dispose() }
  model = buildCareScene(props.theme, props.themeData)
  scene.add(model.group)
  model.setSkeletonVisible(skeleton.value)
  actorCount.value = model.actors.length
  if (reset) rig.fit(model.bounds, { immediate: true })
  try {
    const loaded = await loadBlenderCareScene(props.theme, props.themeData)
    if (destroyed || current !== generation) { loaded.dispose(); return }
    clearSelection(); scene.remove(model.group); model.dispose()
    model = loaded; scene.add(model.group)
    model.setSkeletonVisible(skeleton.value)
    actorCount.value = model.actors.length; assetSource.value = model.assetSource
    if (reset) rig.fit(model.bounds, { immediate: true })
  } catch (error) {
    if (!destroyed && current === generation) {
      assetError.value = String(error.message || error)
      console.warn('Blender model unavailable; retaining procedural fallback:', error)
    }
  } finally { if (!destroyed && current === generation) loading.value = false }
}
function resetView() { clearSelection(); if (model) rig.fit(model.bounds) }
function hit(event) {
  const rect = renderer.domElement.getBoundingClientRect()
  ndc.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
  ray.setFromCamera(ndc, camera)
  return ray.intersectObjects(model?.pickables || [], false)[0]?.object
}
function select(event) {
  const object = hit(event)
  clearSelection()
  if (!object) return
  selectedObject = object
  selectionBox = new THREE.BoxHelper(object, 0xe4ad65)
  scene.add(selectionBox)
  emit('select', { ...object.userData })
}
function focusSelected(event) {
  clearTimeout(selectTimer)
  const object = hit(event)
  if (!object) return
  const box = new THREE.Box3().setFromObject(object), size = box.getSize(new THREE.Vector3())
  rig.focus(box.getCenter(new THREE.Vector3()), Math.max(3.6, size.length() * 2))
}
function pointerDown(e) {
  wrap.value?.focus({ preventScroll: true })
  pointers.add(e.pointerId)
  if (pointers.size === 1) gesture = { x: e.clientX, y: e.clientY, moved: 0, valid: e.button === 0 }
  else if (gesture) gesture.valid = false
}
function pointerMove(e) {
  if (!gesture || !pointers.has(e.pointerId)) return
  gesture.moved += Math.abs(e.clientX - gesture.x) + Math.abs(e.clientY - gesture.y)
  gesture.x = e.clientX; gesture.y = e.clientY
}
function pointerEnd(e) {
  pointers.delete(e.pointerId)
  if (!pointers.size) {
    if (e.type === 'pointerup' && gesture?.valid && gesture.moved < 6) {
      clearTimeout(selectTimer)
      const point = { clientX: e.clientX, clientY: e.clientY }
      selectTimer = setTimeout(() => select(point), 240)
    }
    gesture = null
  }
}
function onKey(e) {
  if (e.target !== wrap.value || !rig) return
  const commands = { ArrowLeft: ['rotate', -1], ArrowRight: ['rotate', 1], ArrowUp: ['pitch', 1], ArrowDown: ['pitch', -1], KeyQ: ['zoom', 1], KeyE: ['zoom', -1] }
  if (commands[e.code]) { e.preventDefault(); rig.nudge(...commands[e.code]) }
  if (e.code === 'KeyR') resetView()
  if (e.code === 'Escape') clearSelection()
}
function resize() {
  if (!renderer || !wrap.value) return
  const w = wrap.value.clientWidth, h = wrap.value.clientHeight
  if (!w || !h) return
  camera.aspect = w / h
  camera.setViewOffset(w, h, w >= 1024 ? -w * 0.1 : 0, 0, w, h)
  camera.updateProjectionMatrix(); renderer.setSize(w, h)
}
function animate(time) {
  frame = requestAnimationFrame(animate)
  const dt = Math.min((time - lastTime) / 1000 || 0, 0.05); lastTime = time
  if (document.hidden) return
  rig.update(dt)
  if (!paused.value) { elapsed += dt; model?.update(dt, elapsed) }
  selectionBox?.update()
  renderer.render(scene, camera)
}
function diagnostics() {
  let bones = 0, particles = 0
  model?.group.traverse(o => { if (o.isBone) bones++; if (o.isPoints) particles++ })
  return { assetSource: assetSource.value, assetUrl: model?.assetUrl, loading: loading.value, assetError: assetError.value, actors: actorCount.value, bones, particles, calls: renderer?.info.render.calls, triangles: renderer?.info.render.triangles, geometries: renderer?.info.memory.geometries, textures: renderer?.info.memory.textures, theme: props.theme, paused: paused.value, skeleton: skeleton.value, camera: camera?.position.toArray(), target: rig?.controls.target.toArray(), pose: model?.actors.map(a => [a.spine.rotation.z, a.head.rotation.y]), pickables: model?.pickables.map(o => { const p = o.getWorldPosition(new THREE.Vector3()).project(camera); return { name: o.userData.name, x: (p.x + 1) / 2, y: (1 - p.y) / 2 } }) }
}
function motionChange(e) { paused.value = e.matches }
onMounted(() => {
  try {
    reducedMotion = matchMedia('(prefers-reduced-motion: reduce)'); paused.value = reducedMotion.matches; reducedMotion.addEventListener('change', motionChange)
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(42, 1, 0.05, 160)
    camera.position.set(7, 7, 9)
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05
    const environment = new RoomEnvironment()
    const pmrem = new THREE.PMREMGenerator(renderer)
    environmentTarget = pmrem.fromScene(environment, 0.04)
    scene.environment = environmentTarget.texture; scene.environmentIntensity = 0.35
    environment.dispose(); pmrem.dispose()
    renderer.shadowMap.enabled = !matchMedia('(pointer: coarse)').matches
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    wrap.value.appendChild(renderer.domElement)
    scene.add(new THREE.HemisphereLight(0xfff4df, 0x727e86, 2.2))
    const sun = new THREE.DirectionalLight(0xffe6c3, 3)
    sun.position.set(-3, 10, 5); sun.castShadow = true
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.5, far: 30 })
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.001
    scene.add(sun)
    const fill = new THREE.DirectionalLight(0xcbe2ed, 1.4); fill.position.set(5, 4, -3); scene.add(fill)
    rig = createSceneControls(camera, renderer.domElement, { minDistance: 2, maxDistance: 35 })
    const dom = renderer.domElement
    dom.addEventListener('pointerdown', pointerDown)
    dom.addEventListener('pointermove', pointerMove)
    dom.addEventListener('pointerup', pointerEnd)
    dom.addEventListener('pointercancel', pointerEnd)
    dom.addEventListener('dblclick', focusSelected)
    observer = new ResizeObserver(resize); observer.observe(wrap.value)
    resize(); rebuild(); frame = requestAnimationFrame(animate)
  } catch (error) {
    console.error('Care scene initialization failed:', error)
    failed.value = true; emit('webgl-failed')
  }
})
watch(() => [props.theme, props.themeData], ([theme], [previousTheme]) => rebuild(theme !== previousTheme))
watch(skeleton, v => model?.setSkeletonVisible(v))
onBeforeUnmount(() => {
  destroyed = true; generation++; environmentTarget?.dispose()
  clearTimeout(selectTimer); cancelAnimationFrame(frame); observer?.disconnect(); reducedMotion?.removeEventListener('change', motionChange)
  const dom = renderer?.domElement
  dom?.removeEventListener('pointerdown', pointerDown); dom?.removeEventListener('pointermove', pointerMove)
  dom?.removeEventListener('pointerup', pointerEnd); dom?.removeEventListener('pointercancel', pointerEnd); dom?.removeEventListener('dblclick', focusSelected)
  rig?.dispose(); clearSelection(); model?.dispose()
  scene?.traverse(o => o.shadow?.dispose())
  renderer?.dispose(); dom?.remove(); pointers.clear()
})
defineExpose({ resetView, clearSelect: clearSelection, rotateBy: dir => rig?.nudge('rotate', dir), pitchBy: dir => rig?.nudge('pitch', dir), zoomBy: dir => rig?.nudge('zoom', dir), diagnostics })
</script>

<style scoped>
.care-room { position:absolute; inset:0; outline:none; background:radial-gradient(ellipse at 58% 44%, #39413f 0, #22252b 46%, #171a20 85%); }
.care-room:focus-visible { outline:2px solid var(--sc-primary); outline-offset:-3px; }
.model-toolbar { position:absolute; right:20px; top:128px; z-index:3; display:flex; gap:6px; }
.model-toolbar button { min-height:44px; padding:0 12px; border:1px solid #64716e; border-radius:6px; color:#eee9de; background:#222d30ed; cursor:pointer; }
.model-toolbar button[aria-pressed="true"] { border-color:#dba16a; background:#554030; }
.model-toolbar button:focus-visible { outline:2px solid #f3c995; }
.model-caption { position:absolute; right:24px; bottom:78px; display:grid; gap:6px; color:#e5e8dd; text-align:right; pointer-events:none; z-index:2; }
.model-caption b { font-size:18px; letter-spacing:1px; }
.model-caption span { font-size:12px; color:#b7c4bd; }
.model-hint { position:absolute; bottom:48px; left:50%; transform:translateX(-50%); white-space:nowrap; font-size:12px; color:#abb8b3; pointer-events:none; }
.gl-fallback { position:absolute; inset:40% 10%; color:#fff; text-align:center; }
@media (max-width: 767px) {
  .model-toolbar { top:10px; right:10px; gap:4px; }
  .model-toolbar button { padding:0 8px; font-size:11px; }
  .model-caption { bottom:66px; right:12px; max-width:90%; }
  .model-caption b { font-size:14px; }
  .model-caption span { font-size:10px; }
  .model-hint { bottom:12px; font-size:10px; }
}
</style>
