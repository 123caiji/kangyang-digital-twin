import { computed, ref } from 'vue'
import { getSpaceLayout, getRoomOverview } from '@/api'

/**
 * 空间树 + 房间实时状态的取数逻辑。
 *
 * 三维渲染器只消费这里吐出的数据，不自己算坐标 ——
 * 布局的单一事实来源是后端的 space_nodes 表，前端只负责把层级坐标累加成世界坐标。
 */
export function useSpaceTree() {
  const loading = ref(false)
  const error = ref('')
  const tree = ref([])
  const module = ref({})
  const rooms = ref([])
  const summary = ref({})

  /** roomNo → 聚合状态，供三维着色 */
  const roomByNo = computed(() => new Map(rooms.value.map((r) => [r.roomNo, r])))

  /**
   * 展平空间树，并把「相对父节点」的坐标累加成世界坐标。
   * 用相对坐标是为了将来新增楼栋时，每栋可以有自己的原点。
   */
  const flatNodes = computed(() => {
    const out = []
    const walk = (list, parent) => {
      for (const node of list) {
        const world = {
          x: parent.x + (node.x || 0),
          y: parent.y + (node.y || 0),
          z: parent.z + (node.z || 0)
        }
        out.push({ ...node, world })
        if (node.children && node.children.length) walk(node.children, world)
      }
    }
    walk(tree.value, { x: 0, y: 0, z: 0 })
    return out
  })

  const byType = (type) => computed(() => flatNodes.value.filter((n) => n.node_type === type))

  const roomNodes = byType('room')
  const zoneNodes = byType('zone')
  const floorNodes = byType('floor')
  const buildingNodes = byType('building')

  /** 建筑整体包围盒（供相机取景与地面尺寸） */
  const bounds = computed(() => {
    const b = buildingNodes.value[0]
    if (!b) return { width: 40, depth: 40, height: 12, center: { x: 0, y: 0, z: 0 } }
    return {
      width: b.width,
      depth: b.depth,
      height: b.height,
      center: { x: b.world.x, y: b.height / 2, z: b.world.z }
    }
  })

  async function load() {
    loading.value = true
    error.value = ''
    try {
      const [layoutRes, roomRes] = await Promise.all([getSpaceLayout(), getRoomOverview()])
      tree.value = layoutRes.data.tree || []
      module.value = layoutRes.data.module || {}
      rooms.value = roomRes.data.list || []
      summary.value = roomRes.data.summary || {}
    } catch (e) {
      error.value = e?.message || '加载空间数据失败'
      tree.value = []
      rooms.value = []
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    tree,
    module,
    rooms,
    summary,
    roomByNo,
    flatNodes,
    roomNodes,
    zoneNodes,
    floorNodes,
    buildingNodes,
    bounds,
    load
  }
}

/** 房间状态 → 展示色（与全局主题一致） */
export const STATUS_COLOR = {
  normal: '#42d97a',
  warning: '#ffaa00',
  critical: '#ff4f7a',
  empty: '#4a4258'
}

export const STATUS_LABEL = {
  normal: '正常',
  warning: '关注',
  critical: '紧急',
  empty: '空闲'
}
