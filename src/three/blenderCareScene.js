import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { buildCareScene } from './careScene'

export const CARE_THEMES = ['room', 'corridor', 'dining', 'nursing', 'rehab']
export function disposeAsset(group) {
  const geometries = new Set(), materials = new Set(), textures = new Set()
  group.traverse(o => {
    if (o.geometry) geometries.add(o.geometry)
    for (const m of (Array.isArray(o.material) ? o.material : o.material ? [o.material] : [])) {
      materials.add(m)
      Object.values(m).forEach(v => { if (v?.isTexture) textures.add(v) })
    }
  })
  geometries.forEach(g => g.dispose())
  textures.forEach(t => { t.dispose(); t.source?.data?.close?.() })
  materials.forEach(m => m.dispose())
  group.clear()
}

export async function loadBlenderCareScene(theme, data = {}) {
  const valid = CARE_THEMES.includes(theme) ? theme : 'room'
  const url = `${import.meta.env.BASE_URL}models/care-${valid}.glb`
  const gltf = await new GLTFLoader().loadAsync(url)
  let actors
  try {
    actors = buildCareScene(valid, data, { actorsOnly: true })
    const group = new THREE.Group()
    group.name = `BlenderCare-${valid}`
    group.add(gltf.scene, actors.group)
    const pickables = [...actors.pickables]
    gltf.scene.traverse(o => {
      if (!o.isMesh) return
      o.castShadow = true; o.receiveShadow = true
      let semantic = o
      while (semantic && !semantic.userData.pickLabel) semantic = semantic.parent
      if (semantic) {
        o.userData = { ...o.userData, name: semantic.userData.pickLabel,
          assetKind: semantic.userData.assetKind, category: '康养空间', type: 'Blender 建模设施',
          status: 'demo', value: '示意', unit: '', district: data.roomNo ? `${data.roomNo}室` : '布局示意',
          remark: 'Blender 制作的展示模型，未关联实时设备状态。', effect: 'outline' }
        pickables.push(o)
      }
    })
    let disposed = false
    return { group, pickables, actors: actors.actors, bounds: new THREE.Box3().setFromObject(group),
      assetSource: 'blender-glb', assetUrl: url,
      update: (dt, elapsed) => actors.update(dt, elapsed),
      setSkeletonVisible: value => actors.setSkeletonVisible(value),
      dispose() {
        if (disposed) return
        disposed = true
        actors.dispose(); disposeAsset(gltf.scene); group.clear()
      }
    }
  } catch (error) { actors?.dispose(); disposeAsset(gltf.scene); throw error }
}
