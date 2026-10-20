<script setup lang="ts">
import { SCard } from '@/components/ui'
import SignCard from '@/components/sign/SignCard.vue'
</script>

<template>
  <div class="flex flex-col gap-4">
    <SignCard />
    <SCard title="每日便笺">
      <p class="text-ink-2">树脂 / 宝钱 / 委托 / 派遣实时便笺将在 M4 里程碑中填充。</p>
    </SCard>
  </div>
</template>
