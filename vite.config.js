import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 响应式 mixin 全局注入路径（绝对路径，避免 additionalData 相对路径歧义）
const responsiveScss = fileURLToPath(new URL('./src/styles/responsive.scss', import.meta.url)).replace(/\\/g, '/')

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        // 让每个 <style lang="scss"> 都能直接用 @include mobile / tablet / desktop
        additionalData: `@use "${responsiveScss}" as *;`
      }
    }
  },
  server: {
    port: 5173,
    // 显式登记按需引入的深路径，让预构建在启动时一次做完。
    // 否则 Vite 会在页面加载过程中"发现新依赖 → 重跑预构建 → 整页 reload"，
    // 表现为改一次代码首屏连续刷新两三次。
    // ⚠️ 与 Element Plus 组件清单同步维护，见 src/plugins/element.js。
    optimizeDeps: {
      include: [
        'element-plus/es/components/button/index.mjs',
        'element-plus/es/components/checkbox/index.mjs',
        'element-plus/es/components/color-picker/index.mjs',
        'element-plus/es/components/config-provider/index.mjs',
        'element-plus/es/components/dialog/index.mjs',
        'element-plus/es/components/drawer/index.mjs',
        'element-plus/es/components/empty/index.mjs',
        'element-plus/es/components/form/index.mjs',
        'element-plus/es/components/icon/index.mjs',
        'element-plus/es/components/input/index.mjs',
        'element-plus/es/components/input-number/index.mjs',
        'element-plus/es/components/menu/index.mjs',
        'element-plus/es/components/option/index.mjs',
        'element-plus/es/components/pagination/index.mjs',
        'element-plus/es/components/select/index.mjs',
        'element-plus/es/components/skeleton/index.mjs',
        'element-plus/es/components/slider/index.mjs',
        'element-plus/es/components/switch/index.mjs',
        'element-plus/es/components/tabs/index.mjs',
        'element-plus/es/components/table/index.mjs',
        'element-plus/es/components/tag/index.mjs',
        'element-plus/es/components/tooltip/index.mjs',
        'element-plus/es/components/upload/index.mjs',
        'element-plus/es/components/message/index.mjs',
        'element-plus/es/components/message-box/index.mjs',
        'element-plus/es/locale/lang/zh-cn'
      ]
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    // 第三方库按域拆包：并行加载 + 独立缓存，避免单文件过大。
    // 注意把 Element Plus 的运行时依赖一并归入它的包，否则会被拆成两个必同时加载的 chunk。
    rollupOptions: {
      output: {
        manualChunks(id) {
          const p = id.replace(/\\/g, '/')
          if (!p.includes('node_modules')) return undefined
          // zrender 是 ECharts 的渲染引擎，路径里不含 "echarts"，必须显式归类
          if (/node_modules\/(echarts|zrender)/.test(p)) return 'vendor-echarts'
          if (/node_modules\/three/.test(p)) return 'vendor-three'
          if (
            /node_modules\/(element-plus|@element-plus|@ctrl|@popperjs|@floating-ui|lodash-es|lodash|async-validator|memoize-one|normalize-wheel-es)/.test(
              p
            )
          ) {
            return 'vendor-element'
          }
          if (/node_modules\/(vue|@vue|pinia|vue-router|vue-demi)/.test(p)) return 'vendor-vue'
          return 'vendor'
        }
      }
    },
    // ECharts 全量 + ECharts GL 本身体积就在 1.5MB 量级，且已按路由懒加载，
    // 故把告警阈值放宽到 1600KB，避免淹没其他真实告警
    chunkSizeWarningLimit: 1600
  }
})
