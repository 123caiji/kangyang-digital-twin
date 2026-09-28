import { defineStore } from 'pinia'
import { getSettings, saveSettings } from '@/api'

const defaults = {
  themeName: '康养暖橙',
  primaryColor: '#ff8c42',
  accentColor: '#ffb627',
  bgColor: '#1a1a2e',
  panelBg: 'rgba(45, 35, 55, 0.58)',
  fontFamily: '"Noto Sans SC", "Microsoft YaHei", sans-serif',
  fontSize: '14',
  chartTheme: 'dark',
  modelTheme: 'room',
  headerTitle: '康养数字孪生平台'
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    settings: { ...defaults }
  }),
  actions: {
    applyCss() {
      const s = this.settings
      const root = document.documentElement
      root.style.setProperty('--sc-bg', s.bgColor)
      root.style.setProperty('--sc-panel', s.panelBg)
      root.style.setProperty('--sc-primary', s.primaryColor)
      root.style.setProperty('--sc-accent', s.accentColor)
      root.style.setProperty('--sc-font', s.fontFamily)
      root.style.setProperty('--sc-font-size', `${s.fontSize}px`)
      document.body.style.background = s.bgColor
    },
    async load() {
      try {
        const res = await getSettings()
        this.settings = { ...defaults, ...res.data }
        this.applyCss()
      } catch {
        this.applyCss()
      }
    },
    async save( partial ) {
      this.settings = { ...this.settings, ...partial }
      this.applyCss()
      await saveSettings(this.settings)
    },
    setLocal(partial) {
      this.settings = { ...this.settings, ...partial }
      this.applyCss()
    }
  }
})
