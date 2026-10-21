<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { SButton, SCard } from '@/components/ui'
import NoteCard from '@/components/note/NoteCard.vue'
import { useAccountsStore } from '@/stores/accounts'
import { useNotesStore } from '@/stores/notes'
import { useSignStore } from '@/stores/sign'

const accounts = useAccountsStore()
const notes = useNotesStore()
const sign = useSignStore()

const refreshing = ref(false)

/** 账号排序:当前账号在前;全部角色的便笺卡直接平铺(无折叠) */
const orderedUsers = computed(() => {
  return [...accounts.users].sort((a, b) =>
    a.id === accounts.currentUserId ? -1 : b.id === accounts.currentUserId ? 1 : 0
  )
})

const allCards = computed(() => orderedUsers.value.flatMap((user) => user.roles.map((role) => ({ uid: role.uid }))))

/** 串行预拉取全部角色的便笺与签到(间隔 400ms,防并发突发触发风控);账号变动时重跑 */
let loadToken = 0
async function loadAll(): Promise<void> {
  const token = ++loadToken
  for (const card of allCards.value) {
    if (token !== loadToken) return
    void notes.loadUid(card.uid)
    void sign.loadUid(card.uid)
    await new Promise((r) => setTimeout(r, 400))
  }
}

watch(allCards, () => void loadAll(), { immediate: true })

/** 一键刷新:全部角色(串行防风控) */
async function refreshAll(): Promise<void> {
  const uids = allCards.value.map((c) => c.uid)
  if (uids.length === 0) return
  refreshing.value = true
  try {
    await notes.refreshSerially(uids)
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
  <SCard title="便笺总览">
    <template #header>
      <SButton size="sm" variant="ghost" :loading="refreshing" @click="refreshAll">一键刷新</SButton>
    </template>

    <div v-if="accounts.users.length === 0" class="py-8 text-center text-sm text-ink-2">
      在左侧头像菜单中添加米游社账号后,可在此查看全部角色的实时便笺
    </div>

    <div v-else-if="allCards.length === 0" class="py-6 text-center text-xs text-ink-2">已添加的账号暂无原神角色</div>

    <!-- 全部角色卡片:自适应多列,不足整行时均分宽度 -->
    <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(21rem,1fr))] gap-4">
      <NoteCard v-for="card in allCards" :key="card.uid" :uid="card.uid" />
    </div>
  </SCard>
</template>
