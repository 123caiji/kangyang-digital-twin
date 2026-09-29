import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/** Both scenes share the same orbit/pan/zoom vocabulary. World units are metres. */
export function createSceneControls(camera, dom, options = {}) {
  const controls = new OrbitControls(camera, dom)
  controls.enableDamping = true
  controls.dampingFactor = 0.09
  controls.minDistance = options.minDistance ?? 2
  controls.maxDistance = options.maxDistance ?? 90
  controls.minPolarAngle = 0.12
  controls.maxPolarAngle = Math.PI * 0.485
  controls.rotateSpeed = 0.65
  controls.panSpeed = 0.8
  controls.zoomSpeed = 0.85
  controls.touches.ONE = THREE.TOUCH.ROTATE
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN
  const direction = (options.direction || new THREE.Vector3(1, 1.1, 1.3)).clone().normalize()
  let transition = null
  const stop = () => { transition = null }
  controls.addEventListener('start', stop)
  function move(target, distance, immediate = false, heading) {
    const offset = heading || camera.position.clone().sub(controls.target).normalize()
    const end = target.clone().addScaledVector(offset, THREE.MathUtils.clamp(distance, controls.minDistance, controls.maxDistance))
    // Flush residual damping before a programmed move.
    const damping = controls.enableDamping
    controls.enableDamping = false; controls.update(); controls.enableDamping = damping
    if (immediate) {
      stop(); controls.target.copy(target); camera.position.copy(end); controls.update()
    } else transition = { target: target.clone(), position: end }
  }
  function fit(box, { immediate = false } = {}) {
    if (!box || box.isEmpty()) return
    const center = box.getCenter(new THREE.Vector3())
    const radius = box.getSize(new THREE.Vector3()).length() / 2
    const vertical = THREE.MathUtils.degToRad(camera.fov) / 2
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect)
    const distance = radius / Math.sin(Math.min(vertical, horizontal)) * 1.1
    move(center, distance, immediate, direction)
  }
  function focus(target, distance) { move(target, distance) }
  function update(dt = 1 / 60) {
    if (transition) {
      const alpha = 1 - Math.exp(-7 * Math.min(dt, 0.05))
      controls.target.lerp(transition.target, alpha)
      camera.position.lerp(transition.position, alpha)
      if (camera.position.distanceToSquared(transition.position) < 0.00001 && controls.target.distanceToSquared(transition.target) < 0.00001) {
        camera.position.copy(transition.position); controls.target.copy(transition.target); stop()
      }
    }
    controls.update(dt)
  }
  function nudge(action, sign = 1) {
    stop()
    const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target))
    if (action === 'rotate') s.theta += sign * 0.16
    if (action === 'pitch') s.phi = THREE.MathUtils.clamp(s.phi - sign * 0.12, controls.minPolarAngle, controls.maxPolarAngle)
    if (action === 'zoom') s.radius = THREE.MathUtils.clamp(s.radius * Math.exp(sign * 0.13), controls.minDistance, controls.maxDistance)
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s))
    controls.update()
  }
  function dispose() { stop(); controls.removeEventListener('start', stop); controls.dispose() }
  return { controls, fit, focus, update, nudge, dispose }
}
