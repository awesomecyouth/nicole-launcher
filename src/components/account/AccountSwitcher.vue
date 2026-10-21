<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useAccountsStore } from '@/stores/accounts'

const emit = defineEmits<{ manage: [] }>()
const accounts = useAccountsStore()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

function onDocumentClick(e: MouseEvent): void {
  if (open.value && rootRef.value && !rootRef.value.contains(e.target as Node)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))

function pickUser(id: string): void {
  if (id !== accounts.currentUserId) void accounts.setCurrent(id)
}

function pickRole(uid: string): void {
  void accounts.setPreferredUid(uid)
  open.value = false
}

function openManage(): void {
  open.value = false
  emit('manage')
}
</script>

<template>
  <div ref="rootRef" class="relative inline-block">
    <!-- 触发按钮 -->
    <button
      class="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink transition-colors hover:bg-surface-2"
      @click="open = !open"
    >
      <img
        v-if="accounts.currentUser?.avatarUrl"
        :src="accounts.currentUser.avatarUrl"
        class="h-6 w-6 rounded-full object-cover"
        alt="avatar"
        referrerpolicy="no-referrer"
      />
      <span v-else class="flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-xs font-bold">
        {{ (accounts.currentUser?.nickname || '未登录').charAt(0) }}
      </span>
      <span class="font-medium">{{ accounts.currentUser?.nickname || '未登录' }}</span>
      <svg
        viewBox="0 0 24 24"
        class="h-3.5 w-3.5 text-ink-2"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        :class="{ 'rotate-180': open }"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <!-- 下拉面板 -->
    <div
      v-if="open"
      class="absolute top-full left-0 z-40 mt-1 w-72 rounded-xl border border-line bg-surface p-2 shadow-xl"
    >
      <!-- 账号列表 -->
      <button
        v-for="user in accounts.users"
        :key="user.id"
        class="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-surface-2"
        :class="{ 'bg-primary-soft/40': user.id === accounts.currentUserId }"
        @click="pickUser(user.id)"
      >
        <img
          v-if="user.avatarUrl"
          :src="user.avatarUrl"
          class="h-8 w-8 rounded-full object-cover"
          alt="avatar"
          referrerpolicy="no-referrer"
        />
        <span
          v-else
          class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-ink"
        >
          {{ (user.nickname || user.aid).charAt(0) }}
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium text-ink">{{ user.nickname || '未命名' }}</span>
          <span class="block text-xs text-ink-2">{{ user.roles.length }} 个角色</span>
        </span>
        <span
          v-if="user.id === accounts.currentUserId"
          class="rounded bg-success/15 px-1.5 py-0.5 text-xs text-success"
        >
          当前
        </span>
      </button>

      <!-- 当前账号角色 -->
      <template v-if="accounts.currentUser && accounts.currentUser.roles.length > 0">
        <div class="mt-2 border-t border-line pt-2">
          <p class="px-2 pb-1 text-xs text-ink-2">当前账号角色</p>
          <div class="flex flex-wrap gap-1.5 px-1 pb-1">
            <button
              v-for="role in accounts.currentUser.roles"
              :key="role.uid"
              class="cursor-pointer rounded-md border px-2 py-1 text-xs transition-colors"
              :class="
                role.uid === accounts.currentRole?.uid
                  ? 'border-primary bg-primary text-white'
                  : 'border-line bg-surface text-ink hover:bg-surface-2'
              "
              @click="pickRole(role.uid)"
            >
              {{ role.nickname }}
            </button>
          </div>
        </div>
      </template>

      <!-- 管理入口 -->
      <div class="mt-2 border-t border-line pt-2">
        <button
          class="w-full cursor-pointer rounded-lg px-2 py-2 text-left text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          @click="openManage"
        >
          管理账号(添加 / 刷新 / 删除)…
        </button>
      </div>
    </div>
  </div>
</template>
