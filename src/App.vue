<script setup lang="ts">
import MainLayout from '@/layouts/MainLayout.vue'
</script>

<template>
  <main class="h-dvh w-dvw">
    <RouterView v-slot="{ Component, route }">
      <!-- 裸页(极验验证子窗口等):无布局直接渲染 -->
      <component :is="Component" v-if="route.meta.bare" :key="route.fullPath" />
      <MainLayout v-else>
        <Transition name="slide" mode="out-in">
          <component :is="Component" :key="route.fullPath" />
        </Transition>
      </MainLayout>
    </RouterView>
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
