<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { SButton, SCard, SModal } from '@/components/ui'
import GachaCard from '@/components/gacha/GachaCard.vue'
import { exportUigfFile, pickAndParseUigf } from '@/api/uigf'
import { useAccountsStore } from '@/stores/accounts'
import { useGachaStore } from '@/stores/gacha'

/** 祈愿页:仅展示当前账号的角色(随全局账号切换);导入/拉取/导出/清空统一在页面级 */
const accounts = useAccountsStore()
const gacha = useGachaStore()

const roles = computed(() => accounts.currentUser?.roles ?? [])
const isOverseaAccount = computed(() => accounts.currentUser?.isOversea ?? false)
const refreshing = ref(false)

const importing = ref(false)
const importSummary = ref('')
const importError = ref('')

const exporting = ref(false)
const confirmClear = ref(false)

/** 当前账号中有记录的角色(导出/清空的对象) */
const rolesWithEntries = computed(() => roles.value.filter((role) => (gacha.entryOf(role.uid)?.items.length ?? 0) > 0))

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

/** 拉取当前账号全部角色(串行,首次全量/之后增量) */
async function refreshAll(): Promise<void> {
  refreshing.value = true
  try {
    await gacha.refreshCurrentAccount()
  } finally {
    refreshing.value = false
  }
}

/** 导入 UIGF v4 文件:仅接受当前账号角色的 uid,其余跳过并说明 */
async function importUigf(): Promise<void> {
  importError.value = ''
  importSummary.value = ''
  importing.value = true
  try {
    const entries = await pickAndParseUigf()
    if (!entries) return
    const { imported, skipped } = await gacha.importEntries(entries)
    const parts: string[] = []
    if (imported.length > 0) {
      parts.push(`导入完成:${imported.map((r) => `${r.uid} 新增 ${r.added} 条`).join('; ')}`)
    }
    if (skipped.length > 0) {
      parts.push(`已跳过非当前账号的 uid:${skipped.join(', ')}`)
    }
    if (parts.length === 0) parts.push('文件中没有属于当前账号的记录')
    importSummary.value = parts.join('。')
  } catch (err) {
    importError.value = err instanceof Error ? err.message : String(err)
  } finally {
    importing.value = false
  }
}

/** 导出当前账号全部有记录角色为单份 UIGF 文件(hk4e 数组多 uid) */
async function exportAll(): Promise<void> {
  if (rolesWithEntries.value.length === 0) return
  exporting.value = true
  try {
    await exportUigfFile(
      rolesWithEntries.value.map((role) => ({
        uid: role.uid,
        region: role.region,
        items: gacha.entryOf(role.uid)!.items,
      }))
    )
  } finally {
    exporting.value = false
  }
}

/** 清空当前账号全部角色的本地记录 */
async function clearAll(): Promise<void> {
  confirmClear.value = false
  for (const role of rolesWithEntries.value) {
    await gacha.clearUid(role.uid)
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <SCard title="祈愿记录">
      <template #header>
        <div class="flex flex-wrap gap-2">
          <SButton size="sm" variant="ghost" :loading="importing" @click="importUigf">导入</SButton>
          <SButton
            size="sm"
            variant="ghost"
            :disabled="rolesWithEntries.length === 0"
            :loading="exporting"
            @click="exportAll"
          >
            导出
          </SButton>
          <SButton size="sm" :loading="refreshing" :disabled="roles.length === 0" @click="refreshAll">拉取记录</SButton>
          <SButton size="sm" variant="danger" :disabled="rolesWithEntries.length === 0" @click="confirmClear = true">
            清空记录
          </SButton>
        </div>
      </template>

      <p class="mb-3 text-xs text-ink-2">
        展示当前账号(左下角头像菜单切换)的全部角色;首次拉取为全量,之后增量合并;导入/导出均针对当前账号,UIGF v4 格式。
      </p>
      <!-- 国际服账号:直接拉取暂不支持(缺盐),导入可用 -->
      <div
        v-if="isOverseaAccount"
        class="mb-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning"
      >
        当前为国际服(HoYoLAB)账号:祈愿记录直接拉取暂不支持,可通过「导入」读取 UIGF v4 文件;签到 / 便笺 / 启动游戏等其他功能不受影响。
      </div>
      <p v-if="importSummary" class="mb-3 text-xs text-success">{{ importSummary }}</p>
      <p v-if="importError" class="mb-3 text-xs text-danger">{{ importError }}</p>

      <div v-if="accounts.users.length === 0" class="py-8 text-center text-sm text-ink-2">请先添加米游社账号</div>
      <div v-else-if="roles.length === 0" class="py-8 text-center text-sm text-ink-2">当前账号暂无原神角色</div>
      <div v-else class="flex flex-col gap-6">
        <GachaCard v-for="role in roles" :key="role.uid" :role="role" />
      </div>
    </SCard>

    <!-- 清空确认 -->
    <SModal :model-value="confirmClear" title="清空祈愿记录" width="24rem" @update:model-value="confirmClear = false">
      <p class="text-sm text-ink">
        确定清空当前账号全部 {{ rolesWithEntries.length }} 个角色的本地祈愿记录吗?可随时重新拉取或导入。
      </p>
      <div class="mt-4 flex justify-end gap-2">
        <SButton variant="ghost" size="sm" @click="confirmClear = false">取消</SButton>
        <SButton variant="danger" size="sm" @click="clearAll">清空</SButton>
      </div>
    </SModal>
  </div>
</template>
