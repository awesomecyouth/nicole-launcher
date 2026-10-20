import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useSettingsStore } from './stores/settings'
import { useAccountsStore } from './stores/accounts'
import './styles/main.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.mount('#app')

// 设置与账号初始化(持久化加载 + 过期凭据惰性刷新);非 Tauri 环境由 store 内部回退
// 注意:不要在此替换 window.fetch —— 见 src/api/http.ts 头部说明
void useSettingsStore(pinia).init()
void useAccountsStore(pinia).init()

if (import.meta.env.DEV) {
  import('./api/ds').then(({ dsSelfTest }) => {
    const failures = dsSelfTest()
    console[failures.length ? 'error' : 'info']('[ds-selftest]', failures.length ? failures : 'all passed')
  })
}
