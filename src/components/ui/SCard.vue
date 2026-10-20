<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
  <div class="rounded-xl border border-line bg-surface p-4 shadow-sm">
    <div v-if="title || $slots.header" class="mb-3 flex items-center justify-between">
      <h3 class="font-semibold text-ink">{{ title }}</h3>
      <slot name="header" />
    </div>
    <slot />
  </div>
</template>
