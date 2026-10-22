<script setup lang="ts">
import { computed, ref } from 'vue'
import { SButton, SModal } from '@/components/ui'
import { exportUigfFile } from '@/api/uigf'
import type { UserRole } from '@/stores/accounts'
import { useGachaStore } from '@/stores/gacha'
import PoolCard from '@/components/gacha/PoolCard.vue'

/** 单角色祈愿卡:头部操作 + 各卡池平铺卡片(角色池合并祈愿一/二) */
const props = defineProps<{ role: UserRole }>()

const gacha = useGachaStore()

const uid = computed(() => props.role.uid)
const entry = computed(() => gacha.entryOf(uid.value))
const state = computed(() => gacha.states[uid.value] ?? 'idle')
const errorMsg = computed(() => gacha.errors[uid.value] ?? '')

/** 展示分组:角色(301+400 合并,共享保底)/ 武器 / 常驻 / 集录 / 新手;仅有记录的分组渲染 */
const POOL_GROUPS: { label: string; types: number[] }[] = [
  { label: '角色', types: [301, 400] },
  { label: '武器', types: [302] },
  { label: '常驻', types: [200] },
  { label: '集录', types: [500] },
  { label: '新手', types: [100] },
]

const poolGroups = computed(() => {
  const items = entry.value?.items ?? []
  return POOL_GROUPS.map((group) => ({
    label: group.label,
    items: items.filter((i) => group.types.includes(i.gachaType)),
  })).filter((group) => group.items.length > 0)
})

const total = computed(() => (entry.value?.items ?? []).length)
const updatedAtText = computed(() =>
  entry.value
    ? new Date(entry.value.updatedAt).toLocaleString('zh-CN', {
        hour12: false,
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
)

const confirmClear = ref(false)
const exporting = ref(false)

async function refresh(): Promise<void> {
  await gacha.refreshUid(uid.value)
}

async function exportFile(): Promise<void> {
  if (!entry.value || entry.value.items.length === 0) return
  exporting.value = true
  try {
    await exportUigfFile(uid.value, props.role.region, entry.value.items)
  } finally {
    exporting.value = false
  }
}

async function clear(): Promise<void> {
  confirmClear.value = false
  await gacha.clearUid(uid.value)
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- 头部:角色信息 + 操作 -->
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-sm font-semibold text-ink">
        {{ role.nickname }} · {{ role.uid }}
        <span class="ml-1 text-xs font-normal text-ink-2">{{ role.regionName }}</span>
      </span>
      <span v-if="total > 0" class="text-xs text-ink-2">共 {{ total }} 抽</span>
      <span v-if="updatedAtText" class="text-xs text-ink-2">({{ updatedAtText }})</span>
      <span class="ml-auto flex gap-2">
        <SButton size="sm" variant="ghost" :loading="state === 'loading'" @click="refresh">刷新</SButton>
        <SButton size="sm" variant="ghost" :disabled="total === 0" :loading="exporting" @click="exportFile">
          导出
        </SButton>
        <SButton size="sm" variant="danger" :disabled="!entry" @click="confirmClear = true">清空</SButton>
      </span>
    </div>

    <p v-if="errorMsg" class="text-xs text-danger">{{ errorMsg }}</p>
    <div v-if="state === 'loading'" class="py-4 text-center text-xs text-ink-2">
      正在拉取祈愿记录…(已获取 {{ gacha.progresses[uid] ?? 0 }} 条)
    </div>

    <!-- 各卡池卡片平铺 -->
    <div v-if="poolGroups.length > 0" class="grid grid-cols-[repeat(auto-fill,minmax(21rem,1fr))] gap-3">
      <PoolCard v-for="group in poolGroups" :key="group.label" :title="group.label" :items="group.items" />
    </div>
    <div v-else-if="state !== 'loading'" class="py-6 text-center text-xs text-ink-2">暂无记录,点击「刷新」获取</div>

    <!-- 清空确认 -->
    <SModal :model-value="confirmClear" title="清空祈愿记录" width="22rem" @update:model-value="confirmClear = false">
      <p class="text-sm text-ink">确定清空「{{ role.nickname }} · {{ role.uid }}」的本地祈愿记录吗?可随时重新拉取。</p>
      <div class="mt-4 flex justify-end gap-2">
        <SButton variant="ghost" size="sm" @click="confirmClear = false">取消</SButton>
        <SButton variant="danger" size="sm" @click="clear">清空</SButton>
      </div>
    </SModal>
  </div>
</template>
