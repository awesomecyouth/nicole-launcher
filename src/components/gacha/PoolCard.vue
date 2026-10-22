<script setup lang="ts">
import { computed, ref } from 'vue'
import type { GachaItem } from '@/api/gacha'

/**
 * 单卡池卡片:统计 + 祈愿记录列表(新→旧,分页 50)
 * 「角色」池合并 301+400(祈愿二共享保底,UIGF 同源归并)
 */
const props = defineProps<{
  title: string
  /** 该池全部记录(任意顺序,内部按 id 降序展示) */
  items: GachaItem[]
}>()

const itemsDesc = computed(() => [...props.items].sort((a, b) => (a.id > b.id ? -1 : 1)))
const visibleCount = ref(50)
const visibleItems = computed(() => itemsDesc.value.slice(0, visibleCount.value))

const stats = computed(() => {
  const items = itemsDesc.value
  const five = items.filter((i) => i.rankType === 5).length
  const four = items.filter((i) => i.rankType === 4).length
  let sinceFive = 0
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].rankType === 5) break
    sinceFive++
  }
  return {
    total: items.length,
    five,
    four,
    rate: items.length > 0 ? ((five / items.length) * 100).toFixed(1) : '0.0',
    sinceFive,
  }
})

function rankColor(rank: number): string {
  if (rank === 5) return 'text-primary-strong font-semibold'
  if (rank === 4) return 'text-purple-500 dark:text-purple-300'
  return 'text-ink-2'
}
</script>

<template>
  <div class="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3 shadow-sm">
    <div class="flex items-baseline justify-between">
      <h4 class="text-sm font-semibold text-ink">{{ title }}</h4>
      <span class="text-xs text-ink-2">{{ stats.total }} 抽</span>
    </div>

    <!-- 统计 -->
    <div class="grid grid-cols-4 gap-1 text-center">
      <div>
        <p class="text-base font-bold text-primary-strong">{{ stats.five }}</p>
        <p class="text-[10px] text-ink-2">五星 {{ stats.rate }}%</p>
      </div>
      <div>
        <p class="text-base font-bold text-purple-500 dark:text-purple-300">{{ stats.four }}</p>
        <p class="text-[10px] text-ink-2">四星</p>
      </div>
      <div>
        <p class="text-base font-bold text-ink">{{ stats.sinceFive }}</p>
        <p class="text-[10px] text-ink-2">距上次五星</p>
      </div>
      <div class="flex items-center justify-center">
        <p class="text-[10px] text-ink-2">
          最早 {{ itemsDesc.length > 0 ? itemsDesc[itemsDesc.length - 1].time.slice(0, 10) : '—' }}
        </p>
      </div>
    </div>

    <!-- 记录列表 -->
    <div class="flex flex-col divide-y divide-line">
      <div v-for="item in visibleItems" :key="item.id" class="flex items-center gap-2 py-1 text-sm">
        <span class="w-28 shrink-0 text-xs text-ink-2">{{ item.time }}</span>
        <span class="min-w-0 flex-1 truncate" :class="rankColor(item.rankType)">{{ item.name }}</span>
        <span class="shrink-0 text-xs text-ink-2">{{ item.itemType }}</span>
      </div>
      <button
        v-if="visibleCount < itemsDesc.length"
        class="mt-1 cursor-pointer rounded-md py-1.5 text-center text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        @click="visibleCount += 50"
      >
        加载更多({{ itemsDesc.length - visibleCount }} 条)
      </button>
    </div>
  </div>
</template>
