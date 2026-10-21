<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSettingsStore, type ThemeMode } from '@/stores/settings'
import { useAccountsStore } from '@/stores/accounts'

const router = useRouter()
const route = useRoute()
const settings = useSettingsStore()
const accounts = useAccountsStore()

const menus = [
  { name: 'dashboard', label: 'Dashboard' },
  { name: 'accounts', label: 'Accounts' },
]

const activeMenu = computed(() => (route.name as string) ?? 'dashboard')
const onMenuClick = (menuName: string) => {
  router.replace({ name: menuName })
}

// ---------- 用户切换弹出菜单(侧边栏底部,参考 Snap.Hutao 布局) ----------
const userMenuOpen = ref(false)
const userMenuRef = ref<HTMLElement | null>(null)

function onDocumentClick(e: MouseEvent): void {
  if (userMenuOpen.value && userMenuRef.value && !userMenuRef.value.contains(e.target as Node)) {
    userMenuOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))

function pickUser(id: string): void {
  if (id !== accounts.currentUserId) void accounts.setCurrent(id)
}

function pickRole(uid: string): void {
  void accounts.setPreferredUid(uid)
  userMenuOpen.value = false
}

function gotoAccounts(): void {
  userMenuOpen.value = false
  void router.replace({ name: 'accounts' })
}

const refreshingUser = ref(false)
async function refreshCurrent(): Promise<void> {
  if (!accounts.currentUserId || refreshingUser.value) return
  refreshingUser.value = true
  try {
    await accounts.refreshUser(accounts.currentUserId)
  } catch (err) {
    console.error('refresh credentials failed:', err)
  } finally {
    refreshingUser.value = false
  }
}

// ---------- 主题三态(日间 / 跟随系统 / 夜间) ----------
const themeModes: { value: ThemeMode; label: string; icon: string }[] = [
  {
    value: 'light',
    label: '日间',
    icon: 'M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  },
  { value: 'auto', label: '跟随系统', icon: 'M4 5h16v11H4zM8 20h8' },
  { value: 'dark', label: '夜间', icon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z' },
]

// ---------- Logo 随机与点击切换机制(规范第 6.8 条,务必保留) ----------
// 彩蛋:1% 概率启用 other 系列(角色固定,点击在该系列图间切换;单图系列点击无动作)
const otherLogos = [
  { name: 'Alice', images: ['alice-01.png'] },
  { name: 'Citlali', images: ['citlali-01.png'] },
  { name: 'Columbina', images: ['columbina-01.png', 'columbina-02.png'] },
  { name: 'Jahoda', images: ['jahoda-01.png'] },
  { name: 'Paimon', images: ['paimon-01.png'] },
  { name: 'Sandrone', images: ['sandrone-01.png', 'sandrone-02.png'] },
  { name: 'What', images: ['what-01.png'] },
]
const otherLogo = Math.random() * 100 < 1 ? otherLogos[Math.floor(Math.random() * otherLogos.length)] : null
const launcherPrefix = otherLogo ? otherLogo.name : 'Nicole'
const iconIndexRef = ref(
  otherLogo ? Math.floor(Math.random() * otherLogo.images.length) : Math.floor(Math.random() * 6) + 1
)
const iconHref = computed(() => {
  if (otherLogo) {
    return new URL(`../assets/other/${otherLogo.images[iconIndexRef.value]}`, import.meta.url).href
  }
  const index = iconIndexRef.value.toString().padStart(5, '0')
  return new URL(`../assets/nicole/nicole-${index}.png`, import.meta.url).href
})
const refreshIcon = () => {
  if (otherLogo) {
    // other 系列索引从 0 开始;单图系列无切换
    if (otherLogo.images.length < 2) return
    let i = Math.floor(Math.random() * otherLogo.images.length)
    while (i === iconIndexRef.value) {
      i = Math.floor(Math.random() * otherLogo.images.length)
    }
    iconIndexRef.value = i
    return
  }
  // nicole 系列文件为 nicole-00001~00006,索引从 1 开始(0 会拼出不存在的文件名)
  let n = Math.floor(Math.random() * 6) + 1
  while (n === iconIndexRef.value) {
    n = Math.floor(Math.random() * 6) + 1
  }
  iconIndexRef.value = n
}
</script>

<template>
  <div class="flex h-full w-full flex-row bg-base">
    <aside class="flex min-w-64 flex-col ps-4 py-4">
      <div class="flex flex-row items-end justify-start gap-2 py-2">
        <img :src="iconHref" class="w-15 cursor-pointer" alt="Logo" @click="refreshIcon" />
        <span class="cursor-pointer font-extrabold text-ink" @click="refreshIcon">{{ launcherPrefix }} Launcher</span>
      </div>

      <!-- 主导航 -->
      <div class="flex flex-col items-start justify-start gap-2 py-2">
        <div
          v-for="menu in menus"
          :key="menu.name"
          class="w-full cursor-pointer rounded-l-lg p-4 transition-all duration-300 hover:bg-primary hover:text-white hover:shadow-2xl"
          :class="{ 'bg-primary font-semibold text-white shadow-lg shadow-primary/40': activeMenu === menu.name }"
          @click="onMenuClick(menu.name)"
        >
          {{ menu.label }}
        </div>
      </div>

      <!-- 底部:用户切换入口(设置项之上)+ Settings + 主题三态,参考 Snap.Hutao 布局 -->
      <div ref="userMenuRef" class="relative mt-auto flex flex-col gap-2 pb-1">
        <!-- 弹出菜单(向上、向右展开) -->
        <div
          v-if="userMenuOpen"
          class="absolute bottom-full left-0 z-40 mb-2 w-80 rounded-xl border border-line bg-surface p-2 shadow-2xl"
        >
          <!-- 账号列表 -->
          <button
            v-for="user in accounts.users"
            :key="user.id"
            class="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-surface-2"
            :class="{ 'bg-primary-soft/50': user.id === accounts.currentUserId }"
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
              <span class="block text-xs text-ink-2">
                {{ user.isOversea ? '国际服' : '国服' }} · {{ user.roles.length }} 个角色
              </span>
            </span>
            <svg
              v-if="user.id === accounts.currentUserId"
              viewBox="0 0 24 24"
              class="h-4 w-4 text-primary-strong"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path d="m5 13 4 4L19 7" />
            </svg>
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
                  {{ role.nickname }} · {{ role.uid }}
                </button>
              </div>
            </div>
          </template>

          <!-- 操作 -->
          <div class="mt-2 flex flex-col border-t border-line pt-2">
            <button
              class="w-full cursor-pointer rounded-lg px-2 py-2 text-left text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              @click="gotoAccounts"
            >
              账号管理(添加 / 删除 / 复制 Cookie)…
            </button>
            <button
              class="w-full cursor-pointer rounded-lg px-2 py-2 text-left text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-default disabled:opacity-60"
              :disabled="refreshingUser"
              @click="refreshCurrent"
            >
              {{ refreshingUser ? '正在刷新凭据…' : '刷新当前账号凭据' }}
            </button>
          </div>
        </div>

        <!-- 用户入口(位于 Settings 之上) -->
        <button
          class="flex w-full cursor-pointer items-center gap-2 rounded-lg p-2.5 text-ink transition-colors hover:bg-surface-2"
          @click="userMenuOpen = !userMenuOpen"
        >
          <img
            v-if="accounts.currentUser?.avatarUrl"
            :src="accounts.currentUser.avatarUrl"
            class="h-8 w-8 rounded-full object-cover"
            alt="avatar"
            referrerpolicy="no-referrer"
          />
          <span
            v-else
            class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-ink"
          >
            {{ (accounts.currentUser?.nickname || '未登录').charAt(0) }}
          </span>
          <span class="min-w-0 flex-1 truncate text-left text-sm font-medium">
            {{ accounts.currentUser?.nickname || '未登录' }}
          </span>
          <svg
            viewBox="0 0 24 24"
            class="h-3.5 w-3.5 text-ink-2 transition-transform"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            :class="{ 'rotate-180': userMenuOpen }"
          >
            <path d="m18 15-6-6-6 6" />
          </svg>
        </button>

        <!-- Settings(用户入口之下,末位菜单) -->
        <div
          class="w-full cursor-pointer rounded-l-lg p-4 transition-all duration-300 hover:bg-primary hover:text-white hover:shadow-2xl"
          :class="{ 'bg-primary font-semibold text-white shadow-lg shadow-primary/40': activeMenu === 'settings' }"
          @click="onMenuClick('settings')"
        >
          Settings
        </div>

        <!-- 主题三态 -->
        <div class="flex items-center gap-1 rounded-lg bg-surface-2 p-1">
          <button
            v-for="mode in themeModes"
            :key="mode.value"
            class="flex h-7 flex-1 cursor-pointer items-center justify-center rounded-md transition-colors"
            :class="
              settings.theme === mode.value ? 'bg-surface text-primary-strong shadow-sm' : 'text-ink-2 hover:text-ink'
            "
            :title="mode.label"
            @click="settings.setTheme(mode.value)"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
              <path :d="mode.icon" />
              <template v-if="mode.value === 'light'">
                <circle cx="12" cy="12" r="4" />
              </template>
            </svg>
          </button>
        </div>
      </div>
    </aside>

    <div class="flex-1 overflow-x-hidden rounded-2xl border border-line bg-surface p-4 shadow-lg">
      <slot></slot>
    </div>
  </div>
</template>
