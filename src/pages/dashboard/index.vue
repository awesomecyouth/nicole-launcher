<script setup lang="ts">
import LaunchButton from '@/components/launcher/LaunchButton.vue'
import NoteBoard from '@/components/note/NoteBoard.vue'
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 启动游戏(仅 Windows;账号切换在侧边栏用户菜单) -->
    <LaunchButton />
    <!-- 便笺总览(各角色卡片横向 flow,含每日签到入口) -->
    <NoteBoard />
  </div>
</template>
