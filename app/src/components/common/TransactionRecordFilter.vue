<template>
  <a-modal title="筛选消费记录" v-model:open="open" width="600px" @cancel="confirmFilterModal" centered :closable="false">
    <template #footer>
      <a-button key="clear" @click="clearAllConditions">清除条件</a-button>
      <a-button key="confirm" type="primary" @click="confirmFilterModal">确认</a-button>
    </template>

    <div class="filter-form">
      <!-- 交易类型 -->
      <div class="form-item">
        <div class="form-label">交易类型</div>
        <a-select v-model:value="tempTransactionType" placeholder="请选择交易类型" allow-clear class="form-select">
          <a-select-option v-for="opt in transactionTypeOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </a-select-option>
        </a-select>
      </div>

      <!-- 分类 -->
      <div class="form-item">
        <div class="form-label">分类</div>
        <a-select v-model:value="tempCategory" placeholder="请选择分类" :options="categoryOptions" allow-clear
          @change="onCategoryChange" class="form-select" />
      </div>

      <!-- 标签 -->
      <div class="form-item">
        <div class="form-label">标签</div>
        <a-select v-model:value="tempTags" mode="multiple" placeholder="请选择标签" :options="tagOptions" allow-clear class="form-select" />
      </div>

      <!-- 标签匹配策略和取反 -->
      <div class="form-row">
        <div class="form-item-half">
          <div class="form-label">标签匹配</div>
          <a-select v-model:value="tempTagPolicy" class="form-select">
            <a-select-option value="any">任意</a-select-option>
            <a-select-option value="all">全部</a-select-option>
          </a-select>
        </div>
        <div class="form-item-half">
          <div class="form-label">标签取反</div>
          <a-select v-model:value="tempTagNot" class="form-select">
            <a-select-option value="no">否</a-select-option>
            <a-select-option value="yes">是</a-select-option>
          </a-select>
        </div>
      </div>

      <!-- 描述关键词 -->
      <div class="form-item">
        <div class="form-label">描述包含</div>
        <a-input v-model:value="tempDescription" placeholder="输入关键词" class="form-input" />
      </div>

      <!-- 添加按钮 -->
      <a-button type="dashed" @click="addCondition" block class="add-btn">
        + 添加筛选条件
      </a-button>

      <!-- 已添加条件列表 -->
      <div class="conditions-section" v-if="trQueryConditionItems.length > 0">
        <a-list :data-source="trQueryConditionItems" size="small" bordered>
          <template #renderItem="{ item, index }">
            <a-list-item>
              <template #actions>
                <a-button type="text" danger size="small" @click="deleteCondition(index)">删除</a-button>
              </template>
              <div class="condition-item">
                <a-tag :color="getTypeColor(item.transactionType)">
                  {{ TransactionTypeToLabel.get(item.transactionType) || item.transactionType }}
                </a-tag>
                <template v-if="item.category">
                  <span class="condition-separator">/</span>
                  <span>{{ item.category }}</span>
                </template>
                <template v-if="item.tags && item.tags.length > 0">
                  <span class="condition-separator">/</span>
                  <a-tag>{{ item.tags.join(', ') }}</a-tag>
                </template>
                <template v-if="item.description">
                  <span class="condition-separator">/</span>
                  <span class="condition-desc">"{{ item.description }}"</span>
                </template>
                <template v-if="item.tagNot">
                  <span class="condition-separator">/</span>
                  <a-tag color="red">取反</a-tag>
                </template>
              </div>
            </a-list-item>
          </template>
        </a-list>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { TrQueryConditionItem } from '@/types/billadm';

import { useCategoryTags } from '@/hooks/useCategoryTags'
import { useTrQueryConditionStore } from '@/stores/trQueryConditionStore';
import { useLedgerStore } from '@/stores/ledgerStore';
import { TransactionTypeToLabel } from '@/backend/constant';

const ledgerStore = useLedgerStore();

const { categoryOptions, tagOptions, loadCategoryOptions, loadTagOptions } =
  useCategoryTags(() => ledgerStore.currentLedgerId)

// 双向绑定 modal 开关
const open = defineModel<boolean>();

const trQueryConditionStore = useTrQueryConditionStore();
const trQueryConditionItems = ref<TrQueryConditionItem[]>([]);

// 临时输入状态
const tempTransactionType = ref<string | undefined>(undefined);
const tempCategory = ref<string | undefined>(undefined);
const tempTags = ref<string[]>([]);
const tempTagPolicy = ref<'any' | 'all'>('any');
const tempTagNot = ref<'yes' | 'no'>("no");
const tempDescription = ref<string>('');

// 交易类型选项
const transactionTypeOptions = [
  { label: '收入', value: 'income' },
  { label: '支出', value: 'expense' },
  { label: '转账', value: 'transfer' },
];

// 交易类型变化 → 刷新分类
watch(() => tempTransactionType.value, async (newVal) => {
  if (!newVal) {
    categoryOptions.value = []
    tempCategory.value = undefined
    return
  }
  await loadCategoryOptions(newVal)
})

// 分类变化 → 刷新标签
watch(() => tempCategory.value, async (newVal) => {
  if (!newVal) {
    tagOptions.value = []
    tempTags.value = []
    return
  }
  await loadTagOptions(newVal, tempTransactionType.value!)
});

// 打开时加载 store 中的条件
watch(open, (newVal) => {
  if (newVal) {
    trQueryConditionItems.value = [...(trQueryConditionStore.trQueryConditionItems || [])];
    // 重置临时输入
    resetTempInputs();
  }
});

function resetTempInputs() {
  tempTransactionType.value = undefined;
  tempCategory.value = undefined;
  tempTags.value = [];
  tempTagPolicy.value = 'any';
  tempTagNot.value = "no";
  tempDescription.value = '';
}

function addCondition() {
  // 至少需要一个有效字段
  if (
    !tempTransactionType.value &&
    !tempCategory.value &&
    tempTags.value.length === 0 &&
    !tempDescription.value.trim()
  ) {
    return;
  }

  const newItem: TrQueryConditionItem = {
    transactionType: tempTransactionType.value || '',
    category: tempCategory.value || '',
    tags: [...tempTags.value],
    tagPolicy: tempTagPolicy.value,
    tagNot: tempTagNot.value === "yes",
    description: tempDescription.value.trim(),
  };

  trQueryConditionItems.value.push(newItem);
  resetTempInputs();
}

function deleteCondition(index: number) {
  trQueryConditionItems.value.splice(index, 1);
}

function clearAllConditions() {
  trQueryConditionItems.value = [];
}

function confirmFilterModal() {
  trQueryConditionStore.trQueryConditionItems = trQueryConditionItems.value;
  open.value = false;
}

function onCategoryChange() {
  tempTags.value = [];
}

function getTypeColor(type: string): string {
  const colorMap: Record<string, string> = {
    income: 'green',
    expense: 'red',
    transfer: 'orange',
  };
  return colorMap[type] || 'blue';
}
</script>

<style scoped>
.filter-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-row {
  display: flex;
  gap: 16px;
}

.form-item-half {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  color: var(--billadm-color-text-minor);
}

.form-select {
  width: 100%;
}

.form-input {
  width: 100%;
}

.add-btn {
  margin-top: 8px;
}

.conditions-section {
  margin-top: 8px;
}

.condition-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
}

.condition-separator {
  color: var(--billadm-color-text-disabled);
}

.condition-desc {
  color: var(--billadm-color-text-secondary);
  font-style: italic;
}

:deep(.ant-list-item) {
  padding: 12px 16px;
}

:deep(.ant-list-bordered) {
  border-radius: var(--billadm-radius-md);
}
</style>
