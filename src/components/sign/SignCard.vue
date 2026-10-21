<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { openUrl } from '@tauri-apps/plugin-opener'
import { SButton, SCard, SModal } from '@/components/ui'
import { officialSignPageUrl } from '@/api/signin'
import { useAccountsStore } from '@/stores/accounts'
import { useSignStore } from '@/stores/sign'

const accounts = useAccountsStore()
const sign = useSignStore()

const showRiskModal = ref(false)
const gridRef = ref<HTMLElement | null>(null)

const role = computed(() => accounts.currentRole)

/** 当日格子:未签 = 第 totalSignDay+1 天(即将领取),已签 = 第 totalSignDay 天 */
const todayIndex = computed(() => {
  if (!sign.info) return -1
  return sign.info.isSign ? sign.info.totalSignDay - 1 : sign.info.totalSignDay
})

watch(
  () => accounts.currentRole?.uid,
  (uid) => {
    if (uid) void sign.load()
  },
  { immediate: true }
)

watch(todayIndex, async (idx) => {
  if (idx < 0 || !gridRef.value) return
  await nextTick()
  const cell = gridRef.value.children[idx] as HTMLElement | undefined
  cell?.scrollIntoView({ block: 'nearest' })
})

/** 独立函数读取,避免外层窄化误传(store 内部已变更 state) */
function isRisk(): boolean {
  return sign.state === 'risk'
}

async function doSign(): Promise<void> {
  if (isRisk()) {
    showRiskModal.value = true
    return
  }
  await sign.sign()
  if (isRisk()) showRiskModal.value = true
}

function openOfficial(): void {
  const user = accounts.currentUser
  void openUrl(officialSignPageUrl(user?.isOversea ?? false))
}
</script>

<template>
  <SCard title="每日签到">
    <template #header>
      <div class="flex items-center gap-2">
        <span v-if="sign.state === 'signed'" class="rounded bg-success/15 px-2 py-0.5 text-xs text-success">
          今日已签
        </span>
        <span v-else-if="sign.state === 'unsigned'" class="rounded bg-warning/15 px-2 py-0.5 text-xs text-warning">
          今日未签
        </span>
        <SButton
          v-if="role"
          size="sm"
          :variant="sign.state === 'signed' ? 'ghost' : 'primary'"
          :disabled="sign.state === 'signed' || sign.state === 'idle'"
          :loading="sign.state === 'loading'"
          @click="doSign"
        >
          {{ sign.state === 'risk' ? '触发风控,点击处理' : sign.state === 'signed' ? '已签到' : '一键签到' }}
        </SButton>
      </div>
    </template>

    <!-- 无账号 / 无角色 -->
    <div v-if="!role" class="py-8 text-center text-sm text-ink-2">添加米游社账号并选择角色后,可在此查看签到状态</div>

    <template v-else>
      <div class="mb-3 flex items-center gap-3 text-sm">
        <span class="font-medium text-ink">{{ role.nickname }} · {{ role.uid }}</span>
        <span class="text-ink-2">本月已签 {{ sign.totalSignDay }} 天</span>
        <span v-if="sign.info" class="text-ink-2">({{ sign.info.today }})</span>
      </div>

      <p v-if="sign.state === 'error'" class="mb-3 text-sm text-danger">{{ sign.errorMsg }}</p>

      <!-- 未签醒目提示条(M3-T5) -->
      <div
        v-if="sign.state === 'unsigned'"
        class="mb-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
      >
        今日尚未签到,点击右上角「一键签到」领取奖励
      </div>

      <!-- 月历奖励网格:7 列,已领高亮,当日定位 -->
      <div ref="gridRef" class="grid max-h-72 grid-cols-7 gap-1.5 overflow-y-auto">
        <div
          v-for="(award, i) in sign.awards"
          :key="i"
          class="flex flex-col items-center gap-1 rounded-lg border p-1.5 text-center"
          :class="i < sign.totalSignDay ? 'border-primary bg-primary-soft/50' : 'border-line bg-surface'"
          :title="`${award.name} x${award.cnt}`"
        >
          <img :src="award.icon" class="h-9 w-9" :alt="award.name" referrerpolicy="no-referrer" />
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
  </SCard>
</template>
