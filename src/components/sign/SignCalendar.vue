<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { openUrl } from '@tauri-apps/plugin-opener'
import { SButton, SModal } from '@/components/ui'
import { officialSignPageUrl, type SignAward, type SignInfo } from '@/api/signin'
import type { SignState } from '@/stores/sign'

/**
 * 签到日历展示组件(纯展示 + 动作上抛):主窗口与子窗口共用;
 * 数据来源分别为 sign store(主)与跨窗口事件桥(子)
 */
const props = defineProps<{
  uid: string
  info: SignInfo | null
  state: SignState
  errorMsg: string
  awards: SignAward[]
  month: number
  role: { nickname: string; regionName: string; isOversea: boolean } | null
}>()

const emit = defineEmits<{ sign: [] }>()

const totalSignDay = computed(() => props.info?.totalSignDay ?? 0)
const showRiskModal = ref(false)
const gridRef = ref<HTMLElement | null>(null)

/** 当日格子:未签 = 第 totalSignDay+1 天(即将领取),已签 = 第 totalSignDay 天 */
const todayIndex = computed(() => {
  if (!props.info) return -1
  return props.info.isSign ? props.info.totalSignDay - 1 : props.info.totalSignDay
})

watch(todayIndex, async (idx) => {
  if (idx < 0 || !gridRef.value) return
  await nextTick()
  // 仅滚动日历网格自身(scrollIntoView 会级联滚动祖先,把整页顶上去造成跳动)
  const grid = gridRef.value
  const cell = grid.children[idx] as HTMLElement | undefined
  if (cell) grid.scrollTop = cell.offsetTop - grid.clientHeight / 2 + cell.clientHeight / 2
})

async function doSign(): Promise<void> {
  if (props.state === 'risk') {
    showRiskModal.value = true
    return
  }
  emit('sign')
}

/** 签到结果回传后若进入风控态,自动弹出兜底弹窗 */
watch(
  () => props.state,
  (s) => {
    if (s === 'risk') showRiskModal.value = true
  }
)

function openOfficial(): void {
  void openUrl(officialSignPageUrl(props.role?.isOversea ?? false))
}
</script>

<template>
  <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="font-semibold text-ink">每日签到</h3>
      <div class="flex items-center gap-2">
        <span v-if="state === 'signed'" class="rounded bg-success/15 px-2 py-0.5 text-xs text-success">今日已签</span>
        <span v-else-if="state === 'unsigned'" class="rounded bg-warning/15 px-2 py-0.5 text-xs text-warning">
          今日未签
        </span>
        <SButton
          size="sm"
          :variant="state === 'signed' ? 'ghost' : 'primary'"
          :disabled="state === 'signed' || state === 'idle'"
          :loading="state === 'loading'"
          @click="doSign"
        >
          {{ state === 'risk' ? '触发风控,点击处理' : state === 'signed' ? '已签到' : '一键签到' }}
        </SButton>
      </div>
    </div>

    <div v-if="!role" class="py-8 text-center text-sm text-ink-2">该角色不存在或已移除</div>

    <template v-else>
      <div class="mb-3 flex items-center gap-3 text-sm">
        <span class="font-medium text-ink">{{ role.nickname }} · {{ uid }}</span>
        <span class="text-ink-2">本月已签 {{ totalSignDay }} 天</span>
        <span v-if="info" class="text-ink-2">({{ info.today }})</span>
      </div>

      <p v-if="state === 'error'" class="mb-3 text-sm text-danger">{{ errorMsg || '签到信息获取失败' }}</p>

      <!-- 未签醒目提示条 -->
      <div
        v-if="state === 'unsigned'"
        class="mb-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
      >
        今日尚未签到,点击右上角「一键签到」领取奖励
      </div>

      <!-- 月历奖励网格:自然高度(整月平铺,无内部滚动);7 列,已领高亮,当日居中 -->
      <div ref="gridRef" class="relative grid grid-cols-7 gap-1.5">
        <div
          v-for="(award, i) in awards"
          :key="i"
          class="flex flex-col items-center gap-1 rounded-lg border p-1.5 text-center"
          :class="i < totalSignDay ? 'border-primary bg-primary-soft/50' : 'border-line bg-surface'"
          :title="`${award.name} x${award.cnt}`"
        >
          <img :src="award.icon" class="h-9 w-9 object-contain" :alt="award.name" referrerpolicy="no-referrer" />
          <span class="text-[10px] text-ink-2">x{{ award.cnt }}</span>
          <span class="text-[10px]" :class="i === todayIndex ? 'font-bold text-primary-strong' : 'text-ink-2'">
            {{ i + 1 }}
          </span>
        </div>
      </div>
    </template>

    <!-- 风控兜底 -->
    <SModal v-model="showRiskModal" title="触发米哈游风控验证" width="24rem">
      <p class="text-sm text-ink">签到触发了米哈游风控验证,本应用暂不支持自动验证。可在官方签到页完成今日签到。</p>
      <div class="mt-4 flex justify-end gap-2">
        <SButton variant="ghost" size="sm" @click="showRiskModal = false">关闭</SButton>
        <SButton size="sm" @click="openOfficial">打开官方签到页</SButton>
      </div>
    </SModal>
  </div>
</template>
