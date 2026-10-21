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

/** 账号排序:当前账号在前 */
const orderedUsers = computed<MihoyoUser[]>(() => {
  const users = [...accounts.users]
  users.sort((a, b) => (a.id === accounts.currentUserId ? -1 : b.id === accounts.currentUserId ? 1 : 0))
  return users
})

function isExpanded(user: MihoyoUser): boolean {
  return user.id === accounts.currentUserId || expanded.value.has(user.id)
}

/** 展开/收起非当前账号;首次展开按需拉取其角色便笺(串行,仅拉缺失) */
async function toggleExpand(user: MihoyoUser): Promise<void> {
  const next = new Set(expanded.value)
  if (next.has(user.id)) {
    next.delete(user.id)
  } else {
    next.add(user.id)
  }
  expanded.value = next
  if (isExpanded(user)) {
    for (const role of user.roles) {
      void notes.loadUid(role.uid)
      await new Promise((r) => setTimeout(r, 800))
    }
  }
}

/** 一键刷新:当前账号全部角色 + 已展开的其他账号角色(串行防风控) */
async function refreshAll(): Promise<void> {
  const uids: string[] = []
  for (const user of orderedUsers.value) {
    if (isExpanded(user)) uids.push(...user.roles.map((r) => r.uid))
  }
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
      添加米游社账号后,可在此查看全部角色的实时便笺
    </div>

    <div v-else class="flex flex-col gap-4">
      <div v-for="user in orderedUsers" :key="user.id">
        <!-- 账号组头:当前账号直接展开;其他账号可点击展开/收起 -->
        <button
          class="flex w-full cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-left text-sm transition-colors hover:bg-surface-2"
          @click="user.id !== accounts.currentUserId && toggleExpand(user)"
        >
          <img
            v-if="user.avatarUrl"
            :src="user.avatarUrl"
            class="h-5 w-5 rounded-full object-cover"
            alt="avatar"
            referrerpolicy="no-referrer"
          />
          <span
            v-else
            class="flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft text-[10px] font-bold text-ink"
          >
            {{ (user.nickname || user.aid).charAt(0) }}
          </span>
          <span class="font-medium text-ink">{{ user.nickname || '未命名' }}</span>
          <span
            class="rounded px-1.5 py-0.5 text-[10px]"
            :class="user.isOversea ? 'bg-warning/20 text-warning' : 'bg-primary-soft text-primary-strong'"
          >
            {{ user.isOversea ? '国际服' : '国服' }}
          </span>
          <span class="text-xs text-ink-2">{{ user.roles.length }} 个角色</span>
          <svg
            v-if="user.id !== accounts.currentUserId"
            viewBox="0 0 24 24"
            class="ml-auto h-3.5 w-3.5 text-ink-2"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            :class="{ 'rotate-180': isExpanded(user) }"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        <!-- 展开态:逐角色便笺卡 -->
        <div v-if="isExpanded(user)" class="mt-2 flex flex-col gap-4">
          <NoteCard v-for="role in user.roles" :key="role.uid" :uid="role.uid" />
          <p v-if="user.roles.length === 0" class="px-1 py-2 text-xs text-ink-2">该账号无原神角色</p>
        </div>
        <!-- 折叠态:角色摘要行(展示已有缓存数据,无则提示未加载) -->
        <div v-else class="mt-1 flex flex-wrap gap-2 px-1">
          <span
            v-for="role in user.roles"
            :key="role.uid"
            class="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-2"
          >
            {{ role.nickname }}
            <template v-if="notes.entryOf(role.uid)">
              · 树脂 {{ notes.entryOf(role.uid)!.note.resin.current }}/{{ notes.entryOf(role.uid)!.note.resin.max }}
            </template>
          </span>
        </div>
      </div>
    </div>
  </SCard>
</template>
