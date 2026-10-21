<script setup lang="ts">
import { ref } from 'vue'
import { SButton, SCard, SModal } from '@/components/ui'
import AddAccountModal from '@/components/account/AddAccountModal.vue'
import { useAccountsStore, type MihoyoUser } from '@/stores/accounts'

/**
 * 账号管理页(低频集中操作):添加 / 刷新 / 复制 Cookie / 删除
 * 当前账号与角色的选择在侧边栏用户菜单中完成(不在此页)
 */
const accounts = useAccountsStore()

const showAdd = ref(false)
const pendingDelete = ref<MihoyoUser | null>(null)
const refreshingId = ref('')
const actionError = ref('')
const copiedId = ref('')
let copiedTimer: number | undefined

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

/** 复制完整凭据 Cookie(含 stuid/stoken/mid/ltoken/cookie_token,可用于网页端或后续祈愿功能) */
async function copyCookie(user: MihoyoUser): Promise<void> {
  const text = [
    `stuid=${user.aid}`,
    `stoken=${user.stoken}`,
    `mid=${user.mid}`,
    `ltuid=${user.aid}`,
    `ltoken=${user.ltoken}`,
    `account_id=${user.aid}`,
    `cookie_token=${user.cookieToken}`,
  ].join('; ')
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // 剪贴板 API 不可用时的兜底
    const textarea = document.createElement('textarea')
    textarea.value = text
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }
  copiedId.value = user.id
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
  copiedTimer = window.setTimeout(() => (copiedId.value = ''), 1500)
}

async function confirmDelete(): Promise<void> {
  if (!pendingDelete.value) return
  await accounts.removeUser(pendingDelete.value.id)
  pendingDelete.value = null
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <SCard title="账号管理">
      <template #header>
        <SButton size="sm" @click="showAdd = true">添加账号</SButton>
      </template>

      <p class="mb-3 text-xs text-ink-2">切换当前账号与角色请使用左下角头像菜单;此处为低频管理操作。</p>
      <p v-if="actionError" class="mb-3 text-sm text-danger">{{ actionError }}</p>

      <div v-if="accounts.users.length === 0" class="py-10 text-center text-ink-2">
        还没有账号,点击右上角「添加账号」开始
      </div>

      <ul v-else class="flex flex-wrap gap-3">
        <li
          v-for="user in accounts.users"
          :key="user.id"
          class="flex w-90 flex-col gap-3 rounded-xl border p-4 transition-colors"
          :class="user.id === accounts.currentUserId ? 'border-primary bg-primary-soft/30' : 'border-line bg-surface'"
        >
          <div class="flex items-center gap-3">
            <img
              v-if="user.avatarUrl"
              :src="user.avatarUrl"
              class="h-12 w-12 rounded-full border border-line object-cover"
              alt="avatar"
              referrerpolicy="no-referrer"
            />
            <div
              v-else
              class="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft font-bold text-ink"
            >
              {{ (user.nickname || user.aid).charAt(0) }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate font-medium text-ink">{{ user.nickname || '未命名' }}</span>
                <span
                  class="shrink-0 rounded px-1.5 py-0.5 text-xs"
                  :class="user.isOversea ? 'bg-warning/20 text-warning' : 'bg-primary-soft text-primary-strong'"
                >
                  {{ user.isOversea ? '国际服' : '国服' }}
                </span>
                <span
                  v-if="user.id === accounts.currentUserId"
                  class="shrink-0 rounded bg-success/15 px-1.5 py-0.5 text-xs text-success"
                >
                  当前
                </span>
              </div>
              <div class="text-xs text-ink-2">aid {{ user.aid }} · {{ user.roles.length }} 个角色</div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <SButton variant="ghost" size="sm" :loading="refreshingId === user.id" @click="refresh(user)"
              >刷新凭据</SButton
            >
            <SButton variant="ghost" size="sm" @click="copyCookie(user)">
              {{ copiedId === user.id ? '已复制 ✓' : '复制 Cookie' }}
            </SButton>
            <SButton variant="danger" size="sm" class="ml-auto" @click="pendingDelete = user">删除</SButton>
          </div>
        </li>
      </ul>
    </SCard>

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
  </div>
</template>
