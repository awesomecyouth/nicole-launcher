<script setup lang="ts">
import { computed } from 'vue'
import type { UserRole } from '@/stores/accounts'
import { useGachaStore } from '@/stores/gacha'
import PoolCard from '@/components/gacha/PoolCard.vue'

/** 单角色祈愿区:角色信息行 + 各卡池平铺卡片(角色池合并祈愿一/二);操作统一在页面级 */
const props = defineProps<{ role: UserRole }>()

const gacha = useGachaStore()

const uid = computed(() => props.role.uid)
const entry = computed(() => gacha.entryOf(uid.value))
const state = computed(() => gacha.states[uid.value] ?? 'idle')

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
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- 角色信息行 -->
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-sm font-semibold text-ink">
        {{ role.nickname }} · {{ role.uid }}
        <span class="ml-1 text-xs font-normal text-ink-2">{{ role.regionName }}</span>
      </span>
      <span v-if="total > 0" class="text-xs text-ink-2">共 {{ total }} 抽</span>
      <span v-if="updatedAtText" class="text-xs text-ink-2">({{ updatedAtText }})</span>
    </div>

    <div v-if="state === 'loading'" class="py-4 text-center text-xs text-ink-2">
      正在拉取祈愿记录…(已获取 {{ gacha.progresses[uid] ?? 0 }} 条)
    </div>

    <!-- 各卡池卡片平铺 -->
    <div v-if="poolGroups.length > 0" class="grid grid-cols-[repeat(auto-fill,minmax(21rem,1fr))] gap-3">
      <PoolCard v-for="group in poolGroups" :key="group.label" :title="group.label" :items="group.items" />
    </div>
    <div v-else-if="state !== 'loading'" class="py-6 text-center text-xs text-ink-2">暂无记录,点击「拉取记录」获取</div>
  </div>
</template>
