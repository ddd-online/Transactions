<template>
  <BilladmPageLayout>
    <template #toolbar>
      <div class="tr-toolbar-left">
        <BilladmTimeRangePicker v-model:time-range="trQueryConditionStore.timeRange"
          v-model:time-range-type="trQueryConditionStore.timeRangeType" />
      </div>
      <div class="tr-toolbar-right">
      </div>
    </template>

    <!-- 主内容区 -->
    <div v-if="tableData.length === 0" class="tr-empty">
      <a-empty description="暂无记录" />
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

    <!-- 悬浮按钮组 -->
    <a-float-button type="primary" class="float-primary" @click="createTr">
      <template #icon>
        <PlusOutlined />
      </template>
    </a-float-button>
    <a-float-button class="float-secondary" @click="openTrFilterModal = true"
      :badge="{ count: trQueryConditionStore.conditionLen, color: 'var(--billadm-color-primary)' }">
      <template #icon>
        <FilterOutlined />
      </template>
    </a-float-button>
    <a-float-button class="float-sort" @click="openSortModal = true">
      <template #icon>
        <SortAscendingOutlined v-if="isAscending" />
        <SortDescendingOutlined v-else />
      </template>
    </a-float-button>

    <!-- 排序弹窗 -->
    <TrSortModal v-model="openSortModal" @apply="onSortApply" />

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
  </BilladmPageLayout>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import TransactionRecordTable from '@/components/tr_view/TransactionRecordTable.vue';
import TrSortModal from './TrSortModal.vue'
import type { SortItem } from './TrSortModal.vue'
import type { TransactionRecord } from "@/types/billadm";
import { withErrorHandling } from "@/backend/errorHandler"
import { deleteTrById, linkTrToKeyEvent, unlinkTrFromKeyEvent } from "@/backend/api/tr"
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
} from "@ant-design/icons-vue";
import { message } from "ant-design-vue";

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
// 判断当前排序是否为升序（用于图标显示）
const isAscending = computed(() => {
  const first = sortItemsRef.value[0];
  return !!first && first.order === 'asc';
});

const onSortApply = (sortItems: SortItem[]) => {
  sortItemsRef.value = sortItems;
  refreshTable();
};
const createTr = () => {
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

<style scoped>
.tr-toolbar-left {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-md);
}

.tr-toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-md);
}

.tr-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;

  &::-webkit-scrollbar {
    width: 5px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
    margin-block: var(--billadm-space-xs);
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(141, 127, 111, 0.18);
    border-radius: 8px;
    transition: background 0.3s ease;
  }
}

.tr-content::-webkit-scrollbar-thumb:hover {
  background: rgba(141, 127, 111, 0.40);
}

.tr-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tr-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: var(--billadm-space-lg) 0 var(--billadm-space-sm);
}

.float-primary {
  right: 40px;
  bottom: 72px;
}

.float-secondary {
  right: 100px;
  bottom: 72px;
}

.float-sort {
  right: 160px;
  bottom: 72px;
}

/* tr-body 作为 page-content 的 flex 子项，确保 tr-footer 始终在底部 */
.tr-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
