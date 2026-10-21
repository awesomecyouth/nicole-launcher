<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event'
import SignCalendar from '@/components/sign/SignCalendar.vue'
import type { SignWindowPayload } from '@/stores/sign'

/**
 * 签到日例子窗口(裸路由):自身不做任何网络请求,
 * 经跨窗口事件向主窗口请求数据(sign:req/sign:act → sign:data)
 */
const route = useRoute()
const uid = String(route.query.uid ?? '')

const payload = ref<SignWindowPayload | null>(null)
let unlisten: UnlistenFn | undefined

onMounted(async () => {
  unlisten = await listen<SignWindowPayload>('sign:data', (event) => {
    if (event.payload?.uid === uid) payload.value = event.payload
  })
  void emit('sign:req', { uid })
})

onUnmounted(() => unlisten?.())

function onSign(): void {
  payload.value = payload.value ? { ...payload.value, state: 'loading' } : null
  void emit('sign:act', { uid })
}
</script>

<template>
  <div class="min-h-dvh w-dvw bg-base p-3">
    <SignCalendar v-if="payload" v-bind="payload" @sign="onSign" />
    <div v-else class="flex h-full items-center justify-center text-sm text-ink-2">正在加载签到数据…</div>
  </div>
</template>
