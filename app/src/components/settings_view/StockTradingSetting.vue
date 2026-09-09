<template>
  <SettingsPageWrapper title="股票交易">
    <div class="setting-list">
      <!-- 交易标签 -->
      <div class="setting-card setting-card--tags">
        <div class="tag-top">
          <div class="setting-info">
            <span class="setting-title">交易标签</span>
            <span class="setting-desc">
              清仓或交易历史中为每轮交易选择，可增删；「分析」默认不可删除。
              删除不影响历史记录，单个不超过 8 字，最多保存 20 个。
            </span>
          </div>
          <div class="tag-action">
            <a-input
              id="stock-tag-new-input"
              v-model:value="newTag"
              class="tag-add-input"
              :maxlength="8"
              aria-label="新标签名称"
              placeholder="如：低吸"
              :disabled="saving"
              allow-clear
              @press-enter="addTag"
            />
            <a-button
              type="primary"
              :loading="saving"
              :disabled="!newTag.trim() || tags.length >= 20"
              aria-label="添加标签"
              @click="addTag"
            >
              添加
            </a-button>
          </div>
        </div>
        <div v-if="tags.length" class="tag-list">
          <span
            v-for="tag in tags"
            :key="tag"
            class="tag-item"
            :class="{ 'tag-item--default': tag === defaultTag }"
            :title="tag === defaultTag ? '默认标签，不可删除' : tag"
          >
            <span class="tag-item-name">{{ tag }}</span>
            <span v-if="tag === defaultTag" class="tag-item-default-label">默认</span>
            <button
              v-if="tag !== defaultTag"
              type="button"
              class="tag-item-remove"
              :disabled="saving"
              :aria-label="`删除标签 ${tag}`"
              @click="removeTag(tag)"
            >
              <CloseOutlined />
            </button>
          </span>
        </div>
        <div v-else class="tag-empty">{{ tagEmptyText }}</div>
      </div>

      <!-- 重置 -->
      <div class="setting-card">
        <div class="setting-info">
          <span class="setting-title">重置</span>
          <span class="setting-desc">
            清空当前账本的股票数据（账户本金、持仓、交易记录、资金记录、费用设置与交易标签），此操作不可恢复。
          </span>
        </div>
        <div class="setting-action">
          <a-button type="primary" danger @click="confirmOpen = true">重置</a-button>
        </div>
      </div>
    </div>

    <!-- 重置确认弹窗 -->
    <a-modal
      v-model:open="confirmOpen"
      title="重置股票交易数据"
      ok-text="确认重置"
      cancel-text="取消"
      :ok-button-props="{ danger: true }"
      :confirm-loading="resetting"
      centered
      @ok="handleReset"
    >
      <p class="reset-modal-text">
        将清空当前账本的账户本金、持仓、交易记录、资金记录、费用设置与交易标签。此操作不可恢复，确定继续吗？
      </p>
    </a-modal>
  </SettingsPageWrapper>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { CloseOutlined } from '@ant-design/icons-vue'
import { resetStockData } from '@/backend/api/stock'
import { withErrorHandling } from '@/backend/errorHandler'
import NotificationUtil from '@/backend/notification'
import { useStockPositionStore } from '@/stores/stockPositionStore'
import { useStockAccountStore } from '@/stores/stockAccountStore'
import { useStockTagStore } from '@/stores/stockTagStore'
import { useLedgerStore } from '@/stores/ledgerStore'

const resetting = ref(false)
const confirmOpen = ref(false)
const ledgerStore = useLedgerStore()
const stockTagStore = useStockTagStore()
const { tags, defaultTag, loading, saving } = storeToRefs(stockTagStore)
const newTag = ref('')

const tagEmptyText = computed(() => {
  if (loading.value) return '正在加载标签…'
  if (!ledgerStore.currentLedgerId) return '请先打开工作空间后配置交易标签'
  return '暂无标签'
})

const addTag = async () => {
  if (saving.value) return
  if (!ledgerStore.currentLedgerId) {
    NotificationUtil.error('请先打开工作空间')
    return
  }
  const next = newTag.value.trim()
  if (!next) return
  if (tags.value.includes(next)) {
    NotificationUtil.error(`标签「${next}」已存在`)
    return
  }
  if (tags.value.length >= 20) {
    NotificationUtil.error('最多保存 20 个标签，请先删除不再需要的标签')
    return
  }
  const ok = await stockTagStore.save([...tags.value, next])
  if (ok) {
    newTag.value = ''
    NotificationUtil.success(`标签「${next}」已添加`)
  }
}

const removeTag = async (tag: string) => {
  if (saving.value || tag === defaultTag.value) return
  if (!ledgerStore.currentLedgerId) {
    NotificationUtil.error('请先打开工作空间')
    return
  }
  const ok = await stockTagStore.save(tags.value.filter((t) => t !== tag))
  if (ok) {
    NotificationUtil.success(`标签「${tag}」已删除`)
  }
}

const handleReset = async () => {
  if (resetting.value) return
  const ledgerId = ledgerStore.currentLedgerId
  if (!ledgerId) {
    NotificationUtil.error('重置股票交易数据失败', '请先打开工作空间')
    return
  }
  resetting.value = true
  try {
    await withErrorHandling(() => resetStockData(ledgerId), {
      errorPrefix: '重置股票交易数据失败',
      rethrow: true,
    })
    // 刷新当前账本的内存数据，保证回到股票页时立即呈现空状态
    await Promise.all([
      useStockPositionStore().reloadAll(),
      useStockAccountStore().reloadAll(),
      stockTagStore.load(true),
    ])
    NotificationUtil.success('股票交易数据已重置')
    confirmOpen.value = false
  } catch {
    // 错误已由 withErrorHandling 提示
  } finally {
    resetting.value = false
  }
}

onMounted(() => {
  stockTagStore.load()
})

watch(
  () => ledgerStore.currentLedgerId,
  () => {
    newTag.value = ''
  }
)
</script>

<style scoped>
.setting-list {
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-sm);
}

.setting-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--transactions-space-md) var(--transactions-space-lg);
  background-color: var(--transactions-color-major-background);
  border: 1px solid var(--transactions-color-divider);
  border-radius: var(--transactions-radius-md);
  transition: background-color var(--transactions-transition-fast);
}

.setting-card:hover {
  background-color: var(--transactions-color-hover-bg);
}

.setting-card--tags {
  align-items: flex-start;
  flex-direction: column;
  gap: var(--transactions-space-md);
}

.tag-top {
  width: 100%;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--transactions-space-sm) var(--transactions-space-xl);
}

.tag-top .setting-info {
  flex: 1;
  min-width: min(320px, 100%);
}

.tag-action {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--transactions-space-sm);
}

.tag-list {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  gap: var(--transactions-space-xs) var(--transactions-space-sm);
}

.tag-item {
  display: inline-flex;
  align-items: center;
  gap: var(--transactions-space-2xs);
  padding: 2px var(--transactions-space-xs) 2px var(--transactions-space-sm);
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-secondary);
  background-color: var(--transactions-color-minor-background);
  border-radius: var(--transactions-radius-sm);
}

.tag-item--default {
  color: var(--transactions-color-primary);
  background-color: var(--transactions-color-primary-tint);
}

.tag-item-name {
  line-height: var(--transactions-height-snug);
}

.tag-item-default-label {
  flex-shrink: 0;
  padding-left: var(--transactions-space-xs);
  border-left: 1px solid currentColor;
  font-size: var(--transactions-size-text-small);
  line-height: var(--transactions-height-snug);
  opacity: 0.85;
}

.tag-item-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 10px;
  color: var(--transactions-color-text-tertiary);
  cursor: pointer;
  transition: color var(--transactions-transition-fast);
}

.tag-item-remove:hover:not(:disabled) {
  color: var(--transactions-color-expense);
}

.tag-item-remove:focus-visible {
  outline: 2px solid var(--transactions-color-primary);
  outline-offset: 1px;
  border-radius: var(--transactions-radius-sm);
}

.tag-item-remove:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.tag-empty {
  width: 100%;
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-tertiary);
}

.tag-add-input {
  width: 190px;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-2xs);
  min-width: 0;
}

.setting-title {
  font-size: var(--transactions-size-text-body);
  font-weight: var(--transactions-weight-medium);
  color: var(--transactions-color-text-major);
}

.setting-desc {
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-secondary);
  line-height: var(--transactions-height-snug);
  max-width: 560px;
}

.setting-action {
  flex-shrink: 0;
  margin-left: var(--transactions-space-lg);
}

.reset-modal-text {
  margin: 0;
  font-size: var(--transactions-size-text-body);
  color: var(--transactions-color-text-major);
  line-height: var(--transactions-height-relaxed);
}

@media (prefers-reduced-motion: reduce) {
  .setting-card { transition: none; }
}
</style>
