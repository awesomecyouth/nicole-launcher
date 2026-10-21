<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { SButton, SCard, SProgress } from '@/components/ui'
import { useAccountsStore } from '@/stores/accounts'
import { useNotesStore } from '@/stores/notes'

const accounts = useAccountsStore()
const notes = useNotesStore()

const role = computed(() => accounts.currentRole)

/** 每分钟跳动一次的本地时钟,驱动倒计时推进(不发请求) */
const now = ref(Date.now())
const ticker = window.setInterval(() => {
  now.value = Date.now()
}, 60_000)
onUnmounted(() => window.clearInterval(ticker))

/** 以 fetchedAt 为基准把剩余秒数推进到当前时刻 */
function remaining(seconds: number): number {
  const elapsed = Math.max(0, Math.floor((now.value - notes.fetchedAt) / 1000))
  return Math.max(0, seconds - elapsed)
}

function fmtDuration(seconds: number): string {
  if (seconds <= 0) return '已回满'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h >= 24) return `${Math.floor(h / 24)}天${h % 24}小时`
  return `${h}小时${m}分`
}

const resin = computed(() => notes.note?.resin)
const resinFullAt = computed(() => fmtDuration(remaining(resin.value?.recoveryTime ?? 0)))

watch(
  () => accounts.currentRole?.uid,
  (uid) => {
    if (uid) void notes.load()
  },
  { immediate: true }
)
</script>

<template>
  <SCard title="每日便笺">
    <template #header>
      <div class="flex items-center gap-2 text-xs text-ink-2">
        <span v-if="notes.fetchedAt">{{
          new Date(notes.fetchedAt).toLocaleTimeString('zh-CN', { hour12: false })
        }}</span>
        <SButton v-if="role" size="sm" variant="ghost" :loading="notes.state === 'loading'" @click="notes.load(true)">
          刷新
        </SButton>
      </div>
    </template>

    <!-- 无账号 / 无角色 -->
    <div v-if="!role" class="py-8 text-center text-sm text-ink-2">添加米游社账号并选择角色后,可在此查看实时便笺</div>

    <template v-else>
      <div class="mb-3 flex items-center gap-3 text-sm">
        <span class="font-medium text-ink">{{ role.nickname }} · {{ role.uid }}</span>
        <span class="text-ink-2">{{ role.regionName }}</span>
      </div>

      <!-- 风控态 -->
      <div
        v-if="notes.state === 'risk'"
        class="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
      >
        便笺请求触发米哈游风控(1034),请稍后点击「刷新」重试
      </div>
      <p v-else-if="notes.state === 'error'" class="text-sm text-danger">{{ notes.errorMsg || '便笺获取失败' }}</p>

      <!-- 骨架屏:首次加载(尚无数据)时占位 -->
      <div v-if="notes.state === 'loading' && !notes.note" class="flex flex-col gap-4">
        <div class="h-5 w-44 animate-pulse rounded bg-surface-2"></div>
        <div class="h-2.5 w-full animate-pulse rounded-full bg-surface-2"></div>
        <div class="flex gap-3">
          <div v-for="i in 5" :key="i" class="h-12 w-12 animate-pulse rounded-lg bg-surface-2"></div>
        </div>
        <div class="h-4 w-3/4 animate-pulse rounded bg-surface-2"></div>
        <div class="h-4 w-2/3 animate-pulse rounded bg-surface-2"></div>
      </div>

      <div v-if="notes.note" class="flex flex-col gap-4">
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

        <!-- 探索派遣 -->
        <div v-if="notes.note.expeditions.length > 0">
          <div class="mb-1 text-sm font-medium text-ink">探索派遣</div>
          <div class="flex flex-wrap gap-3">
            <div v-for="(e, i) in notes.note.expeditions" :key="i" class="flex w-14 flex-col items-center gap-1">
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
              <template v-if="notes.note.homeCoin.max > 0">
                {{ notes.note.homeCoin.current }}/{{ notes.note.homeCoin.max }}
                <span class="ml-1 text-xs">
                  {{
                    notes.note.homeCoin.current >= notes.note.homeCoin.max
                      ? '已回满'
                      : fmtDuration(remaining(notes.note.homeCoin.recoveryTime)) + '回满'
                  }}
                </span>
              </template>
              <template v-else>未解锁</template>
            </span>
          </div>
          <SProgress
            v-if="notes.note.homeCoin.max > 0"
            :value="notes.note.homeCoin.current"
            :max="notes.note.homeCoin.max"
          />
        </div>

        <!-- 每日委托 -->
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-ink">每日委托</span>
          <span class="text-sm text-ink-2">
            {{ notes.note.task.finished }}/{{ notes.note.task.total }}
            <span v-if="notes.note.task.extraRewardReceived" class="ml-1 text-xs text-success">额外奖励已领</span>
          </span>
        </div>

        <!-- 周本减半 -->
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-ink">周本树脂减半</span>
          <span class="text-sm text-ink-2"
            >剩余 {{ notes.note.resinDiscount.remain }}/{{ notes.note.resinDiscount.limit }} 次</span
          >
        </div>

        <!-- 参量质变仪 -->
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-ink">参量质变仪</span>
          <span class="text-sm" :class="notes.note.transformer.obtained ? 'text-ink-2' : 'text-ink-2'">
            <template v-if="!notes.note.transformer.obtained">未获得</template>
            <template v-else-if="notes.note.transformer.reached || notes.note.transformer.recoverySeconds === 0">
              <span class="text-success">可用</span>
            </template>
            <template v-else>{{ fmtDuration(remaining(notes.note.transformer.recoverySeconds)) }}</template>
          </span>
        </div>
      </div>
    </template>
  </SCard>
</template>
