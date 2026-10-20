import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useSettingsStore } from './stores/settings'
import './styles/main.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.mount('#app')

// 设置初始化(主题 / deviceId 持久化);非 Tauri 环境由 store 内部回退默认值
// 注意:不要在此替换 window.fetch —— 见 src/api/http.ts 头部说明
void useSettingsStore(pinia).init()

if (import.meta.env.DEV) {
  import('./api/ds').then(({ dsSelfTest }) => {
    const failures = dsSelfTest()
    console[failures.length ? 'error' : 'info']('[ds-selftest]', failures.length ? failures : 'all passed')
  })
}
