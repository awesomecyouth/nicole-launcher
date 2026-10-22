<script setup lang="ts">
import NoteBoard from '@/components/note/NoteBoard.vue'
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 启动游戏在侧边栏全局可用;账号切换在侧边栏用户菜单 -->
    <NoteBoard />
  </div>
</template>
