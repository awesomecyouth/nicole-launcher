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
</script>

<template>
  <button
    :disabled="disabled || loading"
    class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50"
    :class="[variantClass, sizeClass]"
  >
    <span
      v-if="loading"
      class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
    />
    <slot />
  </button>
</template>
