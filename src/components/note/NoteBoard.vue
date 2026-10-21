<script setup lang="ts">
import { computed, ref } from 'vue'
import { SButton, SCard } from '@/components/ui'
import NoteCard from '@/components/note/NoteCard.vue'
import { useAccountsStore, type MihoyoUser } from '@/stores/accounts'
import { useNotesStore } from '@/stores/notes'

const accounts = useAccountsStore()
const notes = useNotesStore()

/** 展开的非当前账号 id 集合(当前账号默认展开) */
const expanded = ref<Set<string>>(new Set())
const refreshing = ref(false)

/** 参与展示的卡片:当前账号全部角色 + 已展开的其他账号角色,单一横向流 */
const visibleCards = computed(() => {
  const cards: { uid: string }[] = []
  const ordered = [...accounts.users].sort((a, b) =>
    a.id === accounts.currentUserId ? -1 : b.id === accounts.currentUserId ? 1 : 0
  )
  for (const user of ordered) {
    if (user.id === accounts.currentUserId || expanded.value.has(user.id)) {
      for (const role of user.roles) cards.push({ uid: role.uid })
    }
  }
  return cards
})

/** 未展开的其他账号(以芯片行形式提供入口) */
const collapsedUsers = computed<MihoyoUser[]>(() =>
  accounts.users.filter((u) => u.id !== accounts.currentUserId && !expanded.value.has(u.id))
)

/** 展开/收起非当前账号;首次展开按需拉取其角色便笺(串行,仅拉缺失) */
async function toggleExpand(user: MihoyoUser): Promise<void> {
  const next = new Set(expanded.value)
  if (next.has(user.id)) {
    next.delete(user.id)
  } else {
    next.add(user.id)
  }
  expanded.value = next
  if (expanded.value.has(user.id)) {
    for (const role of user.roles) {
      void notes.loadUid(role.uid)
      await new Promise((r) => setTimeout(r, 800))
    }
  }
}

/** 一键刷新:所有已展示角色(串行防风控) */
async function refreshAll(): Promise<void> {
  const uids = visibleCards.value.map((c) => c.uid)
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

    <template v-else>
      <!-- 未展开账号芯片入口 -->
      <div v-if="collapsedUsers.length > 0" class="mb-3 flex flex-wrap gap-2">
        <button
          v-for="user in collapsedUsers"
          :key="user.id"
          class="flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink transition-colors hover:border-primary"
          @click="toggleExpand(user)"
        >
          <img
            v-if="user.avatarUrl"
            :src="user.avatarUrl"
            class="h-4 w-4 rounded-full object-cover"
            alt="avatar"
            referrerpolicy="no-referrer"
          />
          {{ user.nickname || user.aid }} · {{ user.roles.length }} 角色
          <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14m-6-6 6 6 6-6" />
          </svg>
        </button>
      </div>

      <!-- 全部已展开角色的便笺卡:固定宽度横向 flow(最大化窗口多列铺开) -->
      <div v-if="visibleCards.length > 0" class="flex flex-wrap gap-4">
        <div v-for="card in visibleCards" :key="card.uid" class="w-90">
          <NoteCard :uid="card.uid" />
        </div>
      </div>
      <p v-else class="py-6 text-center text-xs text-ink-2">当前账号暂无原神角色</p>
    </template>
  </SCard>
</template>
