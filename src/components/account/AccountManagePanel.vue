<script setup lang="ts">
import { ref } from 'vue'
import { SButton, SCard, SModal } from '@/components/ui'
import AddAccountModal from '@/components/account/AddAccountModal.vue'
import { useAccountsStore, type MihoyoUser } from '@/stores/accounts'

/** 账号管理面板(由 Dashboard 经 AccountSwitcher 的「管理账号」展开) */
const emit = defineEmits<{ close: [] }>()
const accounts = useAccountsStore()

const showAdd = ref(false)
const pendingDelete = ref<MihoyoUser | null>(null)
const refreshingId = ref('')
const actionError = ref('')

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function refresh(user: MihoyoUser): Promise<void> {
  refreshingId.value = user.id
  actionError.value = ''
  try {
    await accounts.refreshUser(user.id)
  } catch (err) {
    actionError.value = `刷新 ${user.nickname || user.aid} 失败:${errText(err)}`
  } finally {
    refreshingId.value = ''
  }
}

async function confirmDelete(): Promise<void> {
  if (!pendingDelete.value) return
  await accounts.removeUser(pendingDelete.value.id)
  pendingDelete.value = null
}
</script>

<template>
  <SCard title="账号管理">
    <template #header>
      <SButton size="sm" @click="showAdd = true">添加账号</SButton>
      <SButton size="sm" variant="ghost" class="ms-2" @click="emit('close')">收起</SButton>
    </template>

    <p v-if="actionError" class="mb-3 text-sm text-danger">{{ actionError }}</p>

    <div v-if="accounts.users.length === 0" class="py-8 text-center text-ink-2">
      还没有账号,点击右上角「添加账号」开始
    </div>

    <ul v-else class="flex flex-col gap-2">
      <li
        v-for="user in accounts.users"
        :key="user.id"
        class="flex items-center gap-3 rounded-lg border p-3 transition-colors"
        :class="user.id === accounts.currentUserId ? 'border-primary bg-primary-soft/40' : 'border-line bg-surface'"
      >
        <img
          v-if="user.avatarUrl"
          :src="user.avatarUrl"
          class="h-12 w-12 rounded-full border border-line object-cover"
          alt="avatar"
          referrerpolicy="no-referrer"
        />
        <div v-else class="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft font-bold text-ink">
          {{ (user.nickname || user.aid).charAt(0) }}
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="truncate font-medium text-ink">{{ user.nickname || '未命名' }}</span>
            <span
              class="rounded px-1.5 py-0.5 text-xs"
              :class="user.isOversea ? 'bg-warning/20 text-warning' : 'bg-primary-soft text-primary-strong'"
            >
              {{ user.isOversea ? '国际服' : '国服' }}
            </span>
            <span
              v-if="user.id === accounts.currentUserId"
              class="rounded bg-success/15 px-1.5 py-0.5 text-xs text-success"
            >
              当前
            </span>
          </div>
          <div class="text-xs text-ink-2">aid {{ user.aid }} · {{ user.roles.length }} 个角色</div>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <SButton
            v-if="user.id !== accounts.currentUserId"
            variant="ghost"
            size="sm"
            @click="accounts.setCurrent(user.id)"
          >
            设为当前
          </SButton>
          <SButton variant="ghost" size="sm" :loading="refreshingId === user.id" @click="refresh(user)">刷新</SButton>
          <SButton variant="danger" size="sm" @click="pendingDelete = user">删除</SButton>
        </div>
      </li>
    </ul>

    <AddAccountModal v-model="showAdd" />

    <!-- 删除确认 -->
    <SModal
      :model-value="pendingDelete !== null"
      title="删除账号"
      width="22rem"
      @update:model-value="pendingDelete = null"
    >
      <p class="text-sm text-ink">
        确定删除账号「{{ pendingDelete?.nickname || pendingDelete?.aid }}」吗?该操作不可撤销。
      </p>
      <div class="mt-4 flex justify-end gap-2">
        <SButton variant="ghost" size="sm" @click="pendingDelete = null">取消</SButton>
        <SButton variant="danger" size="sm" @click="confirmDelete">删除</SButton>
      </div>
    </SModal>
  </SCard>
</template>
