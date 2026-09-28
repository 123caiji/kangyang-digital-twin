import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
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
  PieChart,
  Share,
  SwitchButton,
  User
} from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
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
app.use(ElementPlus, { locale: zhCn })
app.mount('#app')
