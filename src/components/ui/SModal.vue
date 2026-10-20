<script setup lang="ts">
defineProps<{ modelValue: boolean; title?: string; width?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

function close(): void {
  emit('update:modelValue', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        @click.self="close"
      >
        <div class="rounded-xl border border-line bg-surface p-5 shadow-2xl" :style="{ width: width ?? '28rem' }">
          <div v-if="title || $slots.header" class="mb-4 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-ink">{{ title }}</h3>
            <button class="cursor-pointer rounded p-1 text-ink-2 hover:bg-surface-2 hover:text-ink" @click="close">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 200ms ease;
}
.modal-enter-active > div,
.modal-leave-active > div {
  transition: transform 200ms ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from > div {
  transform: scale(0.96);
}
</style>
