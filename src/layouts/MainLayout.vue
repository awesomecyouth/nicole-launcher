<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import { useAccountsStore } from '@/stores/accounts'
import { useLauncherStore } from '@/stores/launcher'

const router = useRouter()
const route = useRoute()
const settings = useSettingsStore()
const accounts = useAccountsStore()
const launcher = useLauncherStore()

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

/** 启动图标按钮的悬停提示(状态/错误的唯一展示位) */
const launchTooltip = computed(() => {
  if (launcher.errorMsg) return `启动失败:${launcher.errorMsg}`
  if (launcher.isGameRunning) return '游戏运行中'
  if (launcher.launchState === 'busy') return launcher.statusText || '正在启动…'
  return '启动游戏(当前账号免登;路径与参数在 Settings 配置)'
})

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

        <!-- 用户入口(位于 Settings 之上);启动游戏以 ghost 图标并入本行(仅 Windows):
             空闲=播放图标 / 启动中&运行中=loading;状态经 tooltip 展示,错误变 danger 色 -->
        <div
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

          <!-- 启动游戏 ghost 图标按钮 -->
          <button
            v-if="settings.isWindows"
            class="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            :class="
              launcher.errorMsg
                ? 'border-danger/50 text-danger hover:bg-danger/10'
                : 'border-line text-ink-2 hover:border-primary hover:text-primary-strong'
            "
            :disabled="launcher.isGameRunning || launcher.launchState === 'busy'"
            :title="launchTooltip"
            @click.stop="launcher.launch()"
          >
            <span
              v-if="launcher.launchState === 'busy' || launcher.isGameRunning"
              class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2"
              :class="launcher.errorMsg ? 'border-danger/40 border-t-danger' : 'border-ink-2/40 border-t-ink-2'"
            />
            <svg v-else viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor">
              <path d="M8 5.14v13.72L19 12 8 5.14Z" />
            </svg>
          </button>

          <svg
            viewBox="0 0 24 24"
            class="h-3.5 w-3.5 shrink-0 text-ink-2 transition-transform"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            :class="{ 'rotate-180': userMenuOpen }"
          >
            <path d="m18 15-6-6-6 6" />
          </svg>
        </div>

        <!-- Settings(用户入口之下,末位菜单) -->
        <div
          class="w-full cursor-pointer rounded-l-lg p-4 transition-all duration-300 hover:bg-primary hover:text-white hover:shadow-2xl"
          :class="{ 'bg-primary font-semibold text-white shadow-lg shadow-primary/40': activeMenu === 'settings' }"
          @click="onMenuClick('settings')"
        >
          Settings
        </div>
      </div>
    </aside>

    <div class="flex-1 overflow-x-hidden rounded-2xl border border-line bg-surface p-4 shadow-lg">
      <slot></slot>
    </div>
  </div>
</template>
