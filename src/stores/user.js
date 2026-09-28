import { defineStore } from 'pinia'
import { getMe, login as loginApi } from '@/api'

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem('sc_token') || '',
    user: JSON.parse(localStorage.getItem('sc_user') || 'null')
  }),
  getters: {
    isLogin: (s) => !!s.token,
    role: (s) => s.user?.role || '',
    permissions: (s) => s.user?.permissions || [],
    hasPerm: (s) => (perm) => s.user?.role === 'admin' || (s.user?.permissions || []).includes(perm)
  },
  actions: {
    async login(payload) {
      const res = await loginApi(payload)
      this.token = res.data.token
      this.user = res.data.user
      localStorage.setItem('sc_token', this.token)
      localStorage.setItem('sc_user', JSON.stringify(this.user))
      return res
    },
    async fetchMe() {
      const res = await getMe()
      this.user = res.data
      localStorage.setItem('sc_user', JSON.stringify(this.user))
    },
    logout() {
      this.token = ''
      this.user = null
      localStorage.removeItem('sc_token')
      localStorage.removeItem('sc_user')
    }
  }
})
