// ============================================================
// Element Plus 按需注册 —— 项目唯一的 Element Plus 引用入口
//
// 【为什么要改】
// 原先 main.js 里 `app.use(ElementPlus)` 会把全部 124 个组件的 JS 与整份 theme-chalk
// （908KB JS + 358KB CSS）打进主包。首次尝试的修法是「保留 from 'element-plus' 的根导入，
// 只注册用到的组件」，实测 JS 从 908KB 只降到 907KB —— 几乎没动。
//
// 【为什么根导入摇不掉】
// 'element-plus' 的 ESM 入口 `es/index.mjs` 是一个 301 行的 barrel 文件，把 124 个组件、
// 全部 hooks、指令、插件一次性 re-export。只要项目里**任何一处**还写着
// `import { ElMessage } from 'element-plus'`，这棵 barrel 就完整进入依赖图；
// 而组件模块顶层都调用 `withInstall(xxx)`（未标 /*#__PURE__*/），Rollup 无法证明其无副作用，
// 于是整棵子树被保留。
// → 结论：按需引入必须"两头收口" —— 既要只注册用到的组件，也要把所有引用改为组件自身的深路径。
//
// 【本文件的约定】
// 1. 所有 Element Plus 组件从这里出去，其他业务文件一律 `import { X } from '@/plugins/element'`，
//    禁止再写 `from 'element-plus'`。由 scripts/check-element-imports.mjs 强制校验。
// 2. 每个组件的 style/css.mjs 会递归带入自己的依赖（dialog→overlay、select→popper/scrollbar），
//    并且都自带 base.css，无需再手工引入 base。
//
// ⚠️ 新增组件时：① 加到下面的 import ② 加到 COMPONENTS ③ 补 style/css 行 ④ 跑 check-element-imports + smoke。
// ============================================================

// ---- 组件 --------------------------------------------------------------
import ElButton from 'element-plus/es/components/button/index.mjs'
import { ElCheckbox, ElCheckboxGroup } from 'element-plus/es/components/checkbox/index.mjs'
import ElColorPicker from 'element-plus/es/components/color-picker/index.mjs'
import ElConfigProvider from 'element-plus/es/components/config-provider/index.mjs'
import ElDialog from 'element-plus/es/components/dialog/index.mjs'
import ElDrawer from 'element-plus/es/components/drawer/index.mjs'
import ElEmpty from 'element-plus/es/components/empty/index.mjs'
import { ElForm, ElFormItem } from 'element-plus/es/components/form/index.mjs'
import ElIcon from 'element-plus/es/components/icon/index.mjs'
import ElInput from 'element-plus/es/components/input/index.mjs'
import ElInputNumber from 'element-plus/es/components/input-number/index.mjs'
import { ElMenu, ElMenuItem } from 'element-plus/es/components/menu/index.mjs'
import { ElOption, ElSelect } from 'element-plus/es/components/select/index.mjs'
import ElPagination from 'element-plus/es/components/pagination/index.mjs'
import ElSkeleton from 'element-plus/es/components/skeleton/index.mjs'
import ElSlider from 'element-plus/es/components/slider/index.mjs'
import ElSwitch from 'element-plus/es/components/switch/index.mjs'
import { ElTabPane, ElTabs } from 'element-plus/es/components/tabs/index.mjs'
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index.mjs'
import ElTag from 'element-plus/es/components/tag/index.mjs'
import ElTooltip from 'element-plus/es/components/tooltip/index.mjs'
import ElUpload from 'element-plus/es/components/upload/index.mjs'

// ---- 函数式组件（不在模板里出现，但业务代码要直接调用） ----------------
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'

// ---- 逐组件样式 --------------------------------------------------------
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/checkbox/style/css'
import 'element-plus/es/components/color-picker/style/css'
import 'element-plus/es/components/config-provider/style/css'
import 'element-plus/es/components/dialog/style/css'
import 'element-plus/es/components/drawer/style/css'
import 'element-plus/es/components/empty/style/css'
import 'element-plus/es/components/form/style/css'
import 'element-plus/es/components/icon/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/input-number/style/css'
import 'element-plus/es/components/menu/style/css'
import 'element-plus/es/components/option/style/css'
import 'element-plus/es/components/pagination/style/css'
import 'element-plus/es/components/select/style/css'
import 'element-plus/es/components/skeleton/style/css'
import 'element-plus/es/components/slider/style/css'
import 'element-plus/es/components/switch/style/css'
import 'element-plus/es/components/tabs/style/css'
import 'element-plus/es/components/table/style/css'
import 'element-plus/es/components/tag/style/css'
import 'element-plus/es/components/tooltip/style/css'
import 'element-plus/es/components/upload/style/css'
// 函数式组件的样式不被任何注册清单覆盖，必须显式引；漏了的表现是 ElMessage 弹出来没有背景和阴影
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'

const COMPONENTS = [
  ElButton,
  ElCheckbox,
  ElCheckboxGroup,
  ElColorPicker,
  ElConfigProvider,
  ElDialog,
  ElDrawer,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElIcon,
  ElInput,
  ElInputNumber,
  ElMenu,
  ElMenuItem,
  ElOption,
  ElPagination,
  ElSelect,
  ElSkeleton,
  ElSlider,
  ElSwitch,
  ElTabPane,
  ElTable,
  ElTableColumn,
  ElTabs,
  ElTag,
  ElTooltip,
  ElUpload
]

/** 本地化文案契约：<el-config-provider :locale> 需要它 */
export { ElConfigProvider }
/** 业务代码直接调用的函数式组件 */
export { ElMessage, ElMessageBox }

export default {
  install(app) {
    for (const c of COMPONENTS) {
      // ElMessageBox 不是组件，跳过；其余均为 withInstall 包装，name 可直接用
      if (c?.name) app.component(c.name, c)
    }
  }
}
