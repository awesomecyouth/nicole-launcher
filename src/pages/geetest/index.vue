<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { emit } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    initGeetest?: (config: Record<string, unknown>, cb: (captcha: any) => void) => void
  }
}

const route = useRoute()

onMounted(() => {
  const gt = String(route.query.gt ?? '')
  const challenge = String(route.query.challenge ?? '')
  const apiServer = route.query.oversea === '1' ? 'api-na.geetest.com' : 'api.geetest.com'

  const script = document.createElement('script')
  script.src = 'https://static.geetest.com/static/js/gt.0.5.2.js'
  script.onload = () => {
    window.initGeetest?.(
      {
        protocol: 'https://',
        gt,
        challenge,
        new_captcha: true,
        product: 'bind',
        api_server: apiServer,
      },
      (captcha: any) => {
        captcha.onReady(() => captcha.verify())
        captcha.onSuccess(() => {
          void emit('geetest:result', captcha.getValidate())
          void getCurrentWindow().close()
        })
        captcha.onError(() => {
          void emit('geetest:failed', null)
          void getCurrentWindow().close()
        })
      }
    )
  }
  document.head.appendChild(script)
})
</script>

<template>
  <div class="flex h-dvh w-dvw flex-col items-center justify-center gap-4 bg-base text-ink">
    <p class="text-sm text-ink-2">正在加载安全验证,请完成滑块验证…</p>
    <div id="geetest-div"></div>
  </div>
</template>
