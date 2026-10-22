<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { SButton, SCard } from '@/components/ui'
import GachaCard from '@/components/gacha/GachaCard.vue'
import { useAccountsStore } from '@/stores/accounts'
import { useGachaStore } from '@/stores/gacha'

/** 祈愿页:仅展示当前账号的角色(随全局账号切换,不混排多账号) */
const accounts = useAccountsStore()
const gacha = useGachaStore()

const roles = computed(() => accounts.currentUser?.roles ?? [])
const refreshing = ref(false)

// 切换账号/进入页面:仅从磁盘恢复本地数据展示(网络刷新走手动按钮,全量拉取代价高)
watch(
  () => accounts.currentUserId,
  (userId) => {
    if (!userId) return
    const user = accounts.users.find((u) => u.id === userId)
    for (const role of user?.roles ?? []) {
      void gacha.hydrate(role.uid)
    }
  },
  { immediate: true }
)

async function refreshAll(): Promise<void> {
  refreshing.value = true
  try {
    await gacha.refreshCurrentAccount()
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <SCard title="祈愿记录">
      <template #header>
        <SButton size="sm" :loading="refreshing" :disabled="roles.length === 0" @click="refreshAll">
          拉取当前账号
        </SButton>
      </template>

      <p class="mb-3 text-xs text-ink-2">
        展示当前账号(左下角头像菜单切换)的全部角色;首次拉取为全量,之后增量合并;导出为 UIGF v4.2。
      </p>

      <div v-if="accounts.users.length === 0" class="py-8 text-center text-sm text-ink-2">请先添加米游社账号</div>
      <div v-else-if="roles.length === 0" class="py-8 text-center text-sm text-ink-2">当前账号暂无原神角色</div>
      <div v-else class="flex flex-col gap-6">
        <GachaCard v-for="role in roles" :key="role.uid" :role="role" />
      </div>
    </SCard>
  </div>
</template>
