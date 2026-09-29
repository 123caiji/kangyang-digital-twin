import { createApp, ref, h, computed } from 'vue'
import CareRoom3D from '/src/components/CareRoom3D.vue'
createApp({ setup() {
  const theme = ref('room'), empty = ref(false), selection = ref(null), room = ref(null)
  window.testState = { theme, empty, room }
  const data = computed(() => ({ roomNo: theme.value === 'room' ? 'DEMO' : null, nodes: empty.value ? [] : [{ name: '示意住户甲', bedNo: 1 }, { name: '示意住户乙', bedNo: 2 }] }))
  const titles = { room: '护理居室', corridor: '无障碍走廊', dining: '共享餐厅', nursing: '护理工作站', rehab: '康复训练室' }
  return () => [
    h(CareRoom3D, { ref: room, theme: theme.value, themeData: data.value, onSelect: v => selection.value = v }),
    h('nav', { class: 'testbar' }, [...Object.keys(titles).map(t => h('button', { onClick: () => theme.value = t }, titles[t])), h('button', { onClick: () => empty.value = !empty.value }, empty.value ? '显示示意角色' : '空房测试')]),
    selection.value ? h('aside', { class: 'detail' }, [h('b', selection.value.name), h('p', selection.value.remark)]) : null
  ]
} }).mount('#app')
