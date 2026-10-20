<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number
    max: number
    /** 接近满值(>=90%)时切换为 warning 色 */
    warnNearFull?: boolean
  }>(),
  { warnNearFull: true }
)

const percent = computed(() => (props.max > 0 ? Math.min(100, (props.value / props.max) * 100) : 0))
const barClass = computed(() => {
  if (props.warnNearFull && props.max > 0 && props.value / props.max >= 0.9) return 'bg-warning'
  return 'bg-primary'
})
</script>

<template>
  <div class="h-2 w-full overflow-hidden rounded-full bg-surface-2">
    <div class="h-full rounded-full transition-all duration-500" :class="barClass" :style="{ width: `${percent}%` }" />
  </div>
</template>
