import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useSettingsStore } from './stores/settings'
import { useAccountsStore } from './stores/accounts'
import { useNotesStore } from './stores/notes'
import { useLauncherStore } from './stores/launcher'
import { useSignStore } from './stores/sign'
import { logLine } from './api/logger'
import './styles/main.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.mount('#app')

// 页面错误红条的内容同步写入运行日志(nicole:error 由 index.html 派发)
window.addEventListener('nicole:error', (e) => logLine(String((e as CustomEvent).detail)))

// 子窗口(geetest 验证 / 签到日历)只渲染页面:不初始化任何 store,
// 也不发起网络请求——多 webview 下子窗口的 plugin:http 会踩资源表路由问题,
// 子窗口所需数据一律经 tauri event 由主窗口提供(见 stores/sign.ts setupBridge)
const firstSegment = window.location.pathname.split('/')[1] ?? ''
if (firstSegment === 'geetest' || firstSegment === 'sign') {
  // DEV 自测在子窗口执行一次也无妨,但保持子窗口零副作用,跳过
} else {
  // 设置与账号初始化(持久化加载 + 过期凭据惰性刷新);非 Tauri 环境由 store 内部回退
  // 注意:不要在此替换 window.fetch —— 见 src/api/http.ts 头部说明
  void useSettingsStore(pinia).init()
  void useAccountsStore(pinia).init()
  useNotesStore(pinia).setupAutoRefresh()
  useLauncherStore(pinia).setupMonitor()
  useSignStore(pinia).setupBridge()

  if (import.meta.env.DEV) {
    import('./api/ds').then(({ dsSelfTest }) => {
      const failures = dsSelfTest()
      console[failures.length ? 'error' : 'info']('[ds-selftest]', failures.length ? failures : 'all passed')
    })
  }
}
