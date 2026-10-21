<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { SButton, SCard, SProgress } from '@/components/ui'
import { openSignWindow } from '@/components/sign/signWindow'
import { useAccountsStore, type UserRole } from '@/stores/accounts'
import { useNotesStore } from '@/stores/notes'
import { useSignStore } from '@/stores/sign'

const props = defineProps<{ uid?: string }>()
const accounts = useAccountsStore()
const notes = useNotesStore()
const sign = useSignStore()

/** 目标角色(默认当前角色);跨账号查找归属 */
const uid = computed(() => props.uid ?? accounts.currentRole?.uid ?? '')
const role = computed<UserRole | null>(() => {
  for (const user of accounts.users) {
    const found = user.roles.find((r) => r.uid === uid.value)
    if (found) return found
  }
  return null
})
/** 归属账号昵称(多账号时在卡头标识) */
const accountName = computed(() => {
  for (const user of accounts.users) {
    if (user.roles.some((r) => r.uid === uid.value)) return user.nickname || user.aid
  }
  return ''
})
const multiAccount = computed(() => accounts.users.length > 1)

const signState = computed(() => sign.stateOf(uid.value))
const signInfo = computed(() => sign.infoOf(uid.value))
const signLoading = computed(() => sign.stateOf(uid.value) === 'loading')

const note = computed(() => notes.entryOf(uid.value)?.note ?? null)
const fetchedAt = computed(() => notes.entryOf(uid.value)?.fetchedAt ?? 0)
const state = computed(() => notes.stateOf(uid.value))
const errorMsg = computed(() => notes.errorOf(uid.value))

/** 每分钟跳动一次的本地时钟,驱动倒计时推进(不发请求) */
const now = ref(Date.now())
const ticker = window.setInterval(() => {
  now.value = Date.now()
}, 60_000)
onUnmounted(() => window.clearInterval(ticker))

/** 以该角色的 fetchedAt 为基准把剩余秒数推进到当前时刻 */
function remaining(seconds: number): number {
  const elapsed = Math.max(0, Math.floor((now.value - fetchedAt.value) / 1000))
  return Math.max(0, seconds - elapsed)
}

function fmtDuration(seconds: number): string {
  if (seconds <= 0) return '已回满'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h >= 24) return `${Math.floor(h / 24)}天${h % 24}小时`
  return `${h}小时${m}分`
}

const resin = computed(() => note.value?.resin)
const resinFullAt = computed(() => fmtDuration(remaining(resin.value?.recoveryTime ?? 0)))
/** 更新时间(带日期,本地缓存可能跨天) */
const fetchedAtText = computed(() =>
  fetchedAt.value
    ? `更新于 ${new Date(fetchedAt.value).toLocaleString('zh-CN', {
        hour12: false,
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : ''
)

watch(
  uid,
  (value) => {
    if (value) {
      void notes.loadUid(value)
      void sign.loadUid(value)
    }
  },
  { immediate: true }
)

/** 便笺内快捷签到;风控则转入日历窗口处理 */
async function quickSign(): Promise<void> {
  await sign.signUid(uid.value)
  if (sign.stateOf(uid.value) === 'risk') openSignWindow(uid.value)
}
</script>

<template>
  <SCard :title="role ? `${role.nickname} · 便笺` : '每日便笺'">
    <template #header>
      <div class="flex items-center gap-2 text-xs text-ink-2">
        <span v-if="fetchedAtText">{{ fetchedAtText }}</span>
        <SButton v-if="uid" size="sm" variant="ghost" :loading="state === 'loading'" @click="notes.loadUid(uid, true)">
          刷新
        </SButton>
      </div>
    </template>

    <!-- 无角色 -->
    <div v-if="!role" class="py-8 text-center text-sm text-ink-2">该角色不存在或已移除</div>

    <template v-else>
      <div class="mb-3 flex items-center gap-3 text-sm">
        <span class="font-medium text-ink">{{ role.nickname }} · {{ role.uid }}</span>
        <span class="text-ink-2">{{ role.regionName }}</span>
        <span v-if="multiAccount" class="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-ink-2">
          {{ accountName }}
        </span>
      </div>

      <!-- 每日签到(集成入口):点击整行打开日历窗口 -->
      <div
        class="mb-3 flex cursor-pointer items-center justify-between rounded-lg border border-line px-3 py-2 text-sm transition-colors hover:border-primary hover:bg-surface-2"
        @click="openSignWindow(uid)"
      >
        <span class="flex items-center gap-2 text-ink">
          每日签到
          <span v-if="signState === 'signed'" class="text-xs text-success">已签 · {{ signInfo?.totalSignDay }} 天</span>
          <span v-else-if="signState === 'unsigned'" class="text-xs text-warning">今日未签</span>
          <span v-else-if="signState === 'risk'" class="text-xs text-warning">触发风控</span>
          <span v-else-if="signState === 'error'" class="text-xs text-danger" :title="sign.errorOf(uid)">获取失败</span>
        </span>
        <span class="flex items-center gap-2">
          <SButton v-if="signState === 'unsigned'" size="sm" :loading="signLoading" @click.stop="quickSign">
            签到
          </SButton>
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 text-ink-2" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </span>
      </div>

      <!-- 风控态 -->
      <div
        v-if="state === 'risk'"
        class="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
      >
        便笺请求触发米哈游风控(1034),请稍后点击「刷新」重试
      </div>
      <p v-else-if="state === 'error'" class="text-sm text-danger">{{ errorMsg || '便笺获取失败' }}</p>

      <!-- 骨架屏:首次加载(尚无数据)时占位 -->
      <div v-if="state === 'loading' && !note" class="flex flex-col gap-4">
        <div class="h-5 w-44 animate-pulse rounded bg-surface-2"></div>
        <div class="h-2.5 w-full animate-pulse rounded-full bg-surface-2"></div>
        <div class="flex gap-3">
          <div v-for="i in 5" :key="i" class="h-12 w-12 animate-pulse rounded-lg bg-surface-2"></div>
        </div>
        <div class="h-4 w-3/4 animate-pulse rounded bg-surface-2"></div>
        <div class="h-4 w-2/3 animate-pulse rounded bg-surface-2"></div>
      </div>

      <div v-if="note" class="flex flex-col gap-4">
        <!-- 树脂(最醒目位) -->
        <div>
          <div class="mb-1 flex items-baseline justify-between">
            <span class="text-sm font-medium text-ink">原粹树脂</span>
            <span class="text-sm text-ink-2">
              {{ resin?.current }}/{{ resin?.max }}
              <span class="ml-1 text-xs">{{
                resin && resin.current >= resin.max ? '已回满' : resinFullAt + '回满'
              }}</span>
            </span>
          </div>
          <SProgress :value="resin?.current ?? 0" :max="resin?.max ?? 1" />
        </div>

        <!-- 探索派遣(单行排列,不换行) -->
        <div v-if="note.expeditions.length > 0">
          <div class="mb-1 text-sm font-medium text-ink">探索派遣</div>
          <div class="flex flex-nowrap gap-2">
            <div v-for="(e, i) in note.expeditions" :key="i" class="flex w-14 flex-col items-center gap-1">
              <img :src="e.avatarSideIcon" class="h-10 w-10" alt="expedition" referrerpolicy="no-referrer" />
              <span class="text-center text-[10px]" :class="e.status === 'Finished' ? 'text-success' : 'text-ink-2'">
                {{ e.status === 'Finished' ? '已完成' : fmtDuration(remaining(e.remainedTime)) }}
              </span>
            </div>
          </div>
        </div>

        <!-- 洞天宝钱 -->
        <div>
          <div class="mb-1 flex items-baseline justify-between">
            <span class="text-sm font-medium text-ink">洞天宝钱</span>
            <span class="text-sm text-ink-2">
              <template v-if="note.homeCoin.max > 0">
                {{ note.homeCoin.current }}/{{ note.homeCoin.max }}
                <span class="ml-1 text-xs">
                  {{
                    note.homeCoin.current >= note.homeCoin.max
                      ? '已回满'
                      : fmtDuration(remaining(note.homeCoin.recoveryTime)) + '回满'
                  }}
                </span>
              </template>
              <template v-else>未解锁</template>
            </span>
          </div>
          <SProgress v-if="note.homeCoin.max > 0" :value="note.homeCoin.current" :max="note.homeCoin.max" />
        </div>

        <!-- 每日委托 -->
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-ink">每日委托</span>
          <span class="text-sm text-ink-2">
            {{ note.task.finished }}/{{ note.task.total }}
            <span v-if="note.task.extraRewardReceived" class="ml-1 text-xs text-success">额外奖励已领</span>
          </span>
        </div>

        <!-- 周本减半 -->
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-ink">周本树脂减半</span>
          <span class="text-sm text-ink-2">剩余 {{ note.resinDiscount.remain }}/{{ note.resinDiscount.limit }} 次</span>
        </div>

        <!-- 参量质变仪 -->
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-ink">参量质变仪</span>
          <span class="text-sm text-ink-2">
            <template v-if="!note.transformer.obtained">未获得</template>
            <template v-else-if="note.transformer.reached || note.transformer.recoverySeconds === 0">
              <span class="text-success">可用</span>
            </template>
            <template v-else>{{ fmtDuration(remaining(note.transformer.recoverySeconds)) }}</template>
          </span>
        </div>
      </div>
    </template>
  </SCard>
</template>
