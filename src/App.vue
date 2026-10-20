<script setup lang="ts">
import MainLayout from '@/layouts/MainLayout.vue'
</script>

<template>
  <main class="h-dvh w-dvw">
    <MainLayout>
      <RouterView v-slot="{ Component, route }">
        <Transition name="slide" mode="out-in">
          <component :is="Component" :key="route.fullPath" />
        </Transition>
      </RouterView>
    </MainLayout>
  </main>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition:
    transform 220ms ease,
    opacity 220ms ease;
}

.slide-enter-from {
  transform: translateX(-3%);
  opacity: 0;
}

.slide-leave-to {
  transform: translateX(3%);
  opacity: 0;
}
</style>
