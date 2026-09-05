<template>
  <TransactionsPageLayout>
    <template #toolbar>
      <div class="tr-toolbar-left">
        <TransactionsTimeRangePicker v-model:time-range="trQueryConditionStore.timeRange"
          v-model:time-range-type="trQueryConditionStore.timeRangeType" />
      </div>
      <div class="tr-toolbar-right">
      </div>
    </template>

    <!-- 主内容区：账本/时间窗口/条件变化时内容重新落定（数据重算的连续性） -->
    <Transition name="tr-content" mode="out-in">
    <div class="tr-state" :key="contentKey">
    <div v-if="tableData.length === 0" class="tr-empty">
      <div v-if="hasAnyRecords === null" class="empty-guide">
        <a-spin size="small" />
        <span class="empty-guide-loading">正在加载记录…</span>
      </div>

      <div v-else-if="hasAnyRecords === false" class="empty-guide">
        <TransactionOutlined class="empty-guide-icon" aria-hidden="true" />
        <p class="empty-guide-title">从第一笔开始</p>
        <p class="empty-guide-text">
          记下的收入与支出会按月自动汇总，之后可在「数据分析」里看趋势。
        </p>
        <div class="empty-guide-actions">
          <a-button
            v-if="hasAnyCategories === false"
            :loading="initCategoriesLoading"
            @click="handleInitCategories"
          >
            初始化默认分类
          </a-button>
          <a-button type="primary" @click="createTr">记一笔</a-button>
        </div>
      </div>

      <div v-else class="empty-guide">
        <TransactionOutlined class="empty-guide-icon" aria-hidden="true" />
        <p class="empty-guide-title">这段时间还没有记录</p>
        <p class="empty-guide-text">换个时间范围看看，或者直接记一笔。</p>
        <div class="empty-guide-actions">
          <a-button @click="goToLastMonth">看上个月</a-button>
          <a-button @click="goToThisYear">看今年</a-button>
          <a-button type="primary" @click="createTr">记一笔</a-button>
        </div>
      </div>
    </div>
    <template v-else>
      <div class="tr-body">
        <div class="tr-content">
          <a-spin :spinning="tableLoading">
            <transaction-record-table :items="tableData" :ledgers="ledgerStore.ledgers"
              :currentLedgerId="ledgerStore.currentLedgerId" @edit="updateTr" @delete="deleteTr" @link="handleLink" />
          </a-spin>
        </div>

        <!-- 底部分页 -->
        <div class="tr-footer">
          <a-pagination v-model:current="currentPage" v-model:pageSize="pageSize" :total="trTotal"
            :show-total="(total: number) => `共 ${total} 条记录`" :pageSizeOptions="['15', '30', '50', '100']"
            show-size-changer />
        </div>
      </div>
    </template>
    </div>
    </Transition>

    <!-- 悬浮按钮组 -->
    <a-float-button
      type="primary"
      class="float-primary"
      tooltip="记一笔"
      aria-label="记一笔"
      title="记一笔"
      @click="createTr"
    >
      <template #icon>
        <PlusOutlined />
      </template>
    </a-float-button>
    <a-float-button
      class="float-secondary"
      tooltip="筛选条件"
      aria-label="筛选条件"
      title="筛选条件"
      @click="openTrFilterModal = true"
      :badge="{ count: trQueryConditionStore.conditionLen, color: 'var(--transactions-color-primary)' }">
      <template #icon>
        <FilterOutlined />
      </template>
    </a-float-button>
    <a-float-button
      class="float-sort"
      tooltip="排序"
      aria-label="排序"
      title="排序"
      @click="openSort"
    >
      <template #icon>
        <SortAscendingOutlined v-if="isAscending" />
        <SortDescendingOutlined v-else />
      </template>
    </a-float-button>

    <!-- 排序弹窗 -->
    <TrSortModal ref="sortModalRef" v-model="openSortModal" @apply="onSortApply" />

    <!-- 筛选弹窗 -->
    <TransactionRecordFilter v-model="openTrFilterModal" />

    <!-- 编辑/新建弹窗 -->
    <TransactionRecordModal :open="openTrModal" :record="editingRecord" :currentLedgerId="ledgerStore.currentLedgerId"
      :defaultDate="trQueryConditionStore.timeRange?.[0]" @close="closeTrModal" @saved="onTrSaved" />

    <!-- 关联关键事件弹窗 -->
    <a-modal v-model:open="openLinkModal" title="关联关键事件" ok-text="确认关联" cancel-text="取消" centered @ok="confirmLink"
      @cancel="openLinkModal = false">
      <a-form>
        <a-form-item label="选择日期">
          <a-date-picker v-model:value="linkDate" style="width: 100%" placeholder="选择要关联的日期" />
        </a-form-item>
      </a-form>
      <template v-if="linkingRecord?.keyEventDate" #footer>
        <a-button danger @click="handleUnlink">解除关联</a-button>
        <a-button @click="openLinkModal = false">取消</a-button>
        <a-button type="primary" @click="confirmLink">确认关联</a-button>
      </template>
    </a-modal>
  </TransactionsPageLayout>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import TransactionRecordTable from '@/components/tr_view/TransactionRecordTable.vue';
import TrSortModal from './TrSortModal.vue'
import type { SortItem } from './TrSortModal.vue'
import type { TransactionRecord } from "@/types/transactions";
import { withErrorHandling } from "@/backend/errorHandler"
import { deleteTrById, linkTrToKeyEvent, unlinkTrFromKeyEvent, queryTrOnCondition } from "@/backend/api/tr"
import { queryCategory, initializeCategories } from "@/backend/api/category"
import { getLastMonthRange, getThisYearRange } from "@/backend/timerange"
import { useLedgerStore } from "@/stores/ledgerStore.ts";
import { useTrQueryConditionStore } from "@/stores/trQueryConditionStore.ts";
import { useAppDataStore } from "@/stores/appDataStore.ts";
import { useTransactionStore } from "@/stores/transactionStore";
import { storeToRefs } from "pinia"
import dayjs, { type Dayjs } from "dayjs";
import {
  FilterOutlined,
  PlusOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  TransactionOutlined,
} from "@ant-design/icons-vue";
import { message, Modal } from "ant-design-vue";
import type { TimeRangeTypeValue } from "@/types/transactions";

const ledgerStore = useLedgerStore();
const trQueryConditionStore = useTrQueryConditionStore();
const appDataStore = useAppDataStore();
const transactionStore = useTransactionStore();

// 状态
const openTrFilterModal = ref<boolean>();
const { tableData, trTotal, currentPage, pageSize, tableLoading, sortItems: sortItemsRef } = storeToRefs(transactionStore)
const { fetchTransactions } = transactionStore
const openTrModal = ref(false);
const editingRecord = ref<TransactionRecord | null>(null);

// 关联关键事件弹窗
const openLinkModal = ref(false);
const linkingRecord = ref<TransactionRecord | null>(null);
const linkDate = ref<Dayjs>(dayjs());

// 排序相关状态

const openSortModal = ref(false);
const sortModalRef = ref<{ setItems: (v: SortItem[]) => void } | null>(null);
// 账本元信息：是否已有记录 / 是否已有分类（驱动空态引导与初始化入口）
const hasAnyRecords = ref<boolean | null>(null);
const hasAnyCategories = ref<boolean | null>(null);
const initCategoriesLoading = ref(false);

const loadLedgerMeta = async () => {
  const ledgerId = ledgerStore.currentLedgerId;
  hasAnyRecords.value = null;
  hasAnyCategories.value = null;
  if (!ledgerId) return;
  try {
    const [recordResult, categories] = await Promise.all([
      queryTrOnCondition({ ledgerId, items: [], limit: 1 }).catch(() => null),
      queryCategory('all', ledgerId).catch(() => null),
    ]);
    hasAnyRecords.value = !!(recordResult && recordResult.total > 0);
    hasAnyCategories.value = !!(categories && categories.length > 0);
  } catch {
    // 元信息查询失败时保持 null，回退为通用空态，不让引导信息阻断页面
  }
};

const applyPresetRange = (range: [Dayjs, Dayjs], type: TimeRangeTypeValue) => {
  trQueryConditionStore.timeRange = range;
  trQueryConditionStore.timeRangeType = type;
};

const goToLastMonth = () => applyPresetRange(getLastMonthRange(), 'month');
const goToThisYear = () => applyPresetRange(getThisYearRange(), 'year');

const handleInitCategories = async () => {
  const ledgerId = ledgerStore.currentLedgerId;
  if (!ledgerId || initCategoriesLoading.value) return;
  initCategoriesLoading.value = true;
  try {
    const result = await withErrorHandling(
      () => initializeCategories(ledgerId),
      { errorPrefix: '初始化分类失败', rethrow: true },
    );
    message.success(`已创建 ${result.categories} 个默认分类和 ${result.tags} 个标签`);
    await loadLedgerMeta();
  } catch {
    // 错误已由 withErrorHandling 通知
  } finally {
    initCategoriesLoading.value = false;
  }
};
// 打开排序弹窗时回填当前排序，避免弹窗总从默认排序开始
const openSort = () => {
  sortModalRef.value?.setItems(sortItemsRef.value);
  openSortModal.value = true;
};
// 判断当前排序是否为升序（用于图标显示）
const isAscending = computed(() => {
  const first = sortItemsRef.value[0];
  return !!first && first.order === 'asc';
});

const onSortApply = (sortItems: SortItem[]) => {
  sortItemsRef.value = sortItems;
  refreshTable();
};
const createTr = async () => {
  if (ledgerStore.currentLedgerId && hasAnyCategories.value === false) {
    Modal.confirm({
      title: '还没有分类',
      content: '先创建默认分类与标签，记下的每一笔才能归档和复盘。',
      okText: '初始化分类',
      cancelText: '暂不记录',
      onOk: async () => {
        await handleInitCategories();
        if (hasAnyCategories.value) {
          editingRecord.value = null;
          openTrModal.value = true;
        }
      },
    });
    return;
  }
  editingRecord.value = null;
  openTrModal.value = true;
};

const updateTr = (tr: TransactionRecord) => {
  editingRecord.value = tr;
  openTrModal.value = true;
};

const deleteTr = async (tr: TransactionRecord) => {
  try {
    await withErrorHandling(
      () => deleteTrById(tr.transactionId),
      { errorPrefix: '删除消费记录失败', rethrow: true }
    );
    await refreshTable();
  } catch { /* 错误已在 withErrorHandling 中通知 */ }
};

const closeTrModal = () => {
  openTrModal.value = false;
};

const onTrSaved = async () => {
  await refreshTable();
};

const refreshTable = async () => {
  const stats = await fetchTransactions();
  if (stats) appDataStore.setStatistics(stats);
};

// 内容重算标识：账本 / 时间范围 / 筛选条件 / 排序任一变化，列表区做一次轻量重新落定
const contentKey = computed(() => {
  const range = trQueryConditionStore.timeRange;
  const start = range && range[0] ? range[0].unix() : 'all';
  const end = range && range[1] ? range[1].unix() : 'all';
  const filterSignature = trQueryConditionStore.trQueryConditionItems
    .map((item) =>
      `${item.transactionType}|${item.category}|${item.tags.join(',')}|${item.tagPolicy}|${item.tagNot}|${item.description}`
    )
    .join('§');
  const sortSignature = sortItemsRef.value
    .map((item) => `${item.field}:${item.order}`)
    .join('|');
  return `${ledgerStore.currentLedgerId}|${start}|${end}|${filterSignature}|${sortSignature}`;
});

watch(() => [ledgerStore.currentLedgerId, trQueryConditionStore.timeRange, trQueryConditionStore.trQueryConditionItems],
  async () => {
    if (currentPage.value !== 1) {
      currentPage.value = 1;
      return;
    }
    await refreshTable();
  },
  { immediate: true }
);

// 切换账本时刷新空态元信息（是否有记录 / 是否有分类）
watch(
  () => ledgerStore.currentLedgerId,
  () => {
    loadLedgerMeta();
  },
  { immediate: true },
);

let ignoreNextPageWatch = false;

watch(pageSize, async () => {
  ignoreNextPageWatch = true;
  currentPage.value = 1;
  await refreshTable();
});

watch(currentPage, async () => {
  if (ignoreNextPageWatch) {
    ignoreNextPageWatch = false;
    return;
  }
  await refreshTable();
});

// 关联关键事件
const handleLink = (record: TransactionRecord) => {
  linkingRecord.value = record;
  linkDate.value = record.keyEventDate ? dayjs(record.keyEventDate) : dayjs.unix(record.transactionAt);
  openLinkModal.value = true;
};

const confirmLink = async () => {
  if (!linkingRecord.value || !linkDate.value) return;
  const date = linkDate.value.format('YYYY-MM-DD');
  try {
    await withErrorHandling(
      () => linkTrToKeyEvent(linkingRecord.value!.transactionId, date),
      { errorPrefix: '关联失败', rethrow: true }
    );
    message.success('关联成功');
    openLinkModal.value = false;
    linkingRecord.value = null;
    await refreshTable();
  } catch { /* 错误已在 withErrorHandling 中通知 */ }
};

const handleUnlink = async () => {
  if (!linkingRecord.value) return;
  try {
    await withErrorHandling(
      () => unlinkTrFromKeyEvent(linkingRecord.value!.transactionId),
      { errorPrefix: '解除关联失败', rethrow: true }
    );
    message.success('已解除关联');
    openLinkModal.value = false;
    linkingRecord.value = null;
    await refreshTable();
  } catch { /* 错误已在 withErrorHandling 中通知 */ }
};

</script>

<style scoped lang="scss">
@use '@/styles/mixins' as *;
.tr-toolbar-left {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-md);
}

.tr-toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-md);
}

.tr-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;

  @include custom-scrollbar;
}

.tr-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-guide {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--transactions-space-sm);
  max-width: 360px;
  padding: var(--transactions-space-xl);
  text-align: center;
}

.empty-guide-icon {
  font-size: 34px;
  color: var(--transactions-color-text-disabled);
  margin-bottom: var(--transactions-space-sm);
}

.empty-guide-loading {
  font-size: var(--transactions-size-text-body-sm);
  color: var(--transactions-color-text-secondary);
}

.empty-guide-title {
  margin: 0;
  font-size: var(--transactions-size-text-title-sm);
  font-weight: 600;
  color: var(--transactions-color-text-major);
}

.empty-guide-text {
  margin: 0;
  font-size: var(--transactions-size-text-body);
  line-height: var(--transactions-height-normal);
  color: var(--transactions-color-text-secondary);
}

.empty-guide-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--transactions-space-md);
  margin-top: var(--transactions-space-md);
}

.tr-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: var(--transactions-space-lg) 0 var(--transactions-space-sm);
}

.float-primary {
  right: 40px;
  bottom: 72px;
}

.float-secondary {
  right: 100px;
  bottom: 72px;
}

.float-secondary :deep(.ant-float-btn-body) {
  background-color: var(--transactions-color-minor-background);
  box-shadow: var(--transactions-shadow-sm);
  border: 1px solid transparent;
  transition: background-color var(--transactions-transition-fast),
              box-shadow var(--transactions-transition-fast),
              border-color var(--transactions-transition-fast);
}

.float-secondary:hover :deep(.ant-float-btn-body) {
  background-color: var(--transactions-color-major-background);
  border-color: var(--transactions-color-border-l2);
  box-shadow: var(--transactions-shadow-md);
}

.float-sort {
  right: 160px;
  bottom: 72px;
}

.float-sort :deep(.ant-float-btn-body) {
  background-color: var(--transactions-color-minor-background);
  box-shadow: var(--transactions-shadow-sm);
  border: 1px solid transparent;
  transition: background-color var(--transactions-transition-fast),
              box-shadow var(--transactions-transition-fast),
              border-color var(--transactions-transition-fast);
}

.float-sort:hover :deep(.ant-float-btn-body) {
  background-color: var(--transactions-color-major-background);
  border-color: var(--transactions-color-border-l2);
  box-shadow: var(--transactions-shadow-md);
}

/* 悬浮按钮：悬停轻抬、按下收拢，作为主入口的触感反馈 */
.float-primary :deep(.ant-float-btn-body),
.float-secondary :deep(.ant-float-btn-body),
.float-sort :deep(.ant-float-btn-body) {
  transition: background-color var(--transactions-transition-fast),
              box-shadow var(--transactions-transition-fast),
              border-color var(--transactions-transition-fast),
              transform var(--transactions-transition-fast);
}

.float-primary:hover :deep(.ant-float-btn-body),
.float-secondary:hover :deep(.ant-float-btn-body),
.float-sort:hover :deep(.ant-float-btn-body) {
  transform: translateY(-2px);
}

.float-primary:active :deep(.ant-float-btn-body),
.float-secondary:active :deep(.ant-float-btn-body),
.float-sort:active :deep(.ant-float-btn-body) {
  transform: scale(0.94);
}

/* 内容重新落定：账本/窗口/条件切换时，旧视图快速退场、新视图轻量沉降 */
.tr-state {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.tr-content-enter-active {
  transition: opacity 200ms var(--transactions-ease-out-expo),
              transform 200ms var(--transactions-ease-out-expo);
}

.tr-content-leave-active {
  transition: opacity 120ms ease;
}

.tr-content-enter-from {
  opacity: 0;
  transform: translateY(3px);
}

.tr-content-leave-to {
  opacity: 0;
}

/* tr-body 作为 page-content 的 flex 子项，确保 tr-footer 始终在底部 */
.tr-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
