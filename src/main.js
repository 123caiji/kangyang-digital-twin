import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  Brush,
  Coin,
  DataLine,
  Grid,
  Iphone,
  Key,
  Lock,
  MagicStick,
  Menu,
  Monitor,
  OfficeBuilding,
  PieChart,
  Share,
  SwitchButton,
  User
} from '@element-plus/icons-vue'
// 按需注册，取代原先 app.use(ElementPlus) 全量注册。详见 plugins/element.js 头部说明。
import ElementPlusLite from '@/plugins/element'
import App from './App.vue'
import router from './router'
import './styles/global.scss'

/**
 * 只注册项目实际使用的图标。
 * 原先用 `for (const [k, v] of Object.entries(ElementPlusIconsVue))` 全量注册约 290 个图标，
 * 会把整个图标库打进主包；这里按实际引用清单注册，构建产物可被 tree-shaking。
 * 新增图标时记得在此补充（侧栏菜单的图标名见 components/SideNav.vue）。
 */
const ICONS = {
  Brush,
  Coin,
  DataLine,
  Grid,
  Iphone,
  Key,
  Lock,
  MagicStick,
  Menu,
  Monitor,
  OfficeBuilding,
  PieChart,
  Share,
  SwitchButton,
  User
}

const app = createApp(App)
for (const [name, component] of Object.entries(ICONS)) {
  app.component(name, component)
}
app.use(createPinia())
app.use(router)
// 文案本地化（"暂无数据"、分页 aria 等）改由 App.vue 的 <el-config-provider :locale> 承担
app.use(ElementPlusLite)
app.mount('#app')
