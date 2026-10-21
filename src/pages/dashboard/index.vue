<script setup lang="ts">
import { ref } from 'vue'
import AccountSwitcher from '@/components/account/AccountSwitcher.vue'
import AccountManagePanel from '@/components/account/AccountManagePanel.vue'
import LaunchButton from '@/components/launcher/LaunchButton.vue'
import NoteBoard from '@/components/note/NoteBoard.vue'
import SignCard from '@/components/sign/SignCard.vue'

const showManage = ref(false)
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 顶部操作条:账号切换 + 启动游戏(仅 Windows) -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <AccountSwitcher @manage="showManage = !showManage" />
      <LaunchButton />
    </div>

    <!-- 账号管理(按需展开) -->
    <AccountManagePanel v-if="showManage" @close="showManage = false" />

    <NoteBoard />
    <SignCard />
  </div>
</template>
