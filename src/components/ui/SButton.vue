<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    loading?: boolean
  }>(),
  { variant: 'primary', size: 'md', disabled: false, loading: false }
)

const variantClass = computed(
  () =>
    ({
      primary: 'bg-primary text-white hover:bg-primary-strong',
      ghost: 'bg-transparent text-ink hover:bg-surface-2',
      danger: 'bg-danger text-white hover:opacity-90',
    })[props.variant]
)

const sizeClass = computed(
  () =>
    ({
      sm: 'h-8 px-2.5 text-sm',
      md: 'h-9 px-4 text-sm',
      lg: 'h-11 px-6 text-base',
    })[props.size]
)

/** spinner 跟随变体取色:深色底(primary/danger)用白,ghost 透明底用文字色 */
const spinnerClass = computed(
  () =>
    ({
      primary: 'border-white/40 border-t-white',
      ghost: 'border-ink/30 border-t-ink',
      danger: 'border-white/40 border-t-white',
    })[props.variant]
)
</script>

<template>
  <button
    :disabled="disabled || loading"
    class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50"
    :class="[variantClass, sizeClass]"
  >
    <span v-if="loading" class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2" :class="spinnerClass" />
    <slot />
  </button>
</template>
