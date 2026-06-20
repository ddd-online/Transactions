<template>
  <BilladmPageLayout>
    <template #toolbar>
      <div class="tr-toolbar-left">
        <BilladmTimeRangePicker v-model:time-range="trQueryConditionStore.timeRange"
          v-model:time-range-type="trQueryConditionStore.timeRangeType" />
      </div>
      <div class="tr-toolbar-right">
        <billadm-ledger-select />
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
            <transaction-record-table :items="tableData" @edit="updateTr" @delete="deleteTr" @link="handleLink" />
          </a-spin>
        </div>

        <!-- 底部分页 -->
        <div class="tr-footer">
        <a-pagination v-model:current="currentPage" v-model:pageSize="pageSize" :total="trTotal"
          :show-total="(total: number) => `共 ${total} 条记录`" :pageSizeOptions="['15', '30', '50', '100']"
          show-size-changer />
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
    <a-modal :title="trModalTitle" :open="openTrModal" width="800px" @ok="confirmTrModal" ok-text="确认"
      @cancel="closeTrModal" cancel-text="取消" centered>
      <a-form :model="trForm" :rules="rules">
        <a-form-item label="模板">
          <div class="template-select-row">
            <a-select v-model:value="selectedTemplateId" :options="templateOptions" placeholder="选择模板自动填充"
              class="template-select" allowClear />
            <a-button @click="saveAsTemplate" :disabled="!trForm.type || !trForm.category">
              保存为模板
            </a-button>
          </div>
        </a-form-item>

        <a-form-item label="时间" name="time">
          <a-date-picker v-model:value="trForm.time" style="width: 100%" />
        </a-form-item>

        <a-form-item label="类型" name="type">
          <a-radio-group v-model:value="trForm.type" button-style="solid">
            <a-radio-button value="income">收入</a-radio-button>
            <a-radio-button value="expense">支出</a-radio-button>
            <a-radio-button value="transfer">转账</a-radio-button>
          </a-radio-group>
        </a-form-item>

        <a-form-item label="分类" name="category">
          <a-select v-model:value="trForm.category" :options="categoryOptions" />
        </a-form-item>

        <a-form-item label="标签" name="tags">
          <a-select v-model:value="trForm.tags" :options="tagOptions" mode="multiple" placeholder="选择一个或多个标签" />
        </a-form-item>

        <a-form-item label="标记" name="flags">
          <a-checkbox-group v-model:value="trForm.flags" :options="flagOptions" />
        </a-form-item>

        <a-form-item label="描述" name="description">
          <a-input v-model:value="trForm.description" placeholder="描述消费内容" allowClear />
        </a-form-item>

        <a-form-item label="金额" name="price">
          <a-input v-model:value="trForm.price" prefix="￥" style="width: 100%" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 保存模板弹窗 -->
    <a-modal v-model:open="openSaveTemplateModal" title="保存为模板" @ok="confirmSaveTemplate" ok-text="保存" cancel-text="取消"
      centered>
      <a-form>
        <a-form-item label="模板名称">
          <a-input v-model:value="templateName" placeholder="请输入模板名称" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 关联关键事件弹窗 -->
    <a-modal
      v-model:open="openLinkModal"
      title="关联关键事件"
      ok-text="确认关联"
      cancel-text="取消"
      centered
      @ok="confirmLink"
      @cancel="openLinkModal = false"
    >
      <a-form>
        <a-form-item label="选择日期">
          <a-date-picker
            v-model:value="linkDate"
            style="width: 100%"
            placeholder="选择要关联的日期"
          />
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
import type { TransactionRecord, TrForm, TrQueryCondition, TransactionTemplate } from "@/types/billadm";
import { convertToUnixTimeRange } from "@/backend/timerange.ts";
import {
  createTransactionRecord,
  deleteTransactionRecord,
  getTrOnCondition,
  linkTransactionToKeyEvent,
  unlinkTransactionFromKeyEvent,
  updateTransactionRecord,
  getTemplatesByLedgerId,
  saveTemplate
} from "@/backend/functions.ts";
import { useCategoryTags } from '@/hooks/useCategoryTags'
import { useLedgerStore } from "@/stores/ledgerStore.ts";
import { useTrQueryConditionStore } from "@/stores/trQueryConditionStore.ts";
import { useAppDataStore } from "@/stores/appDataStore.ts";
import dayjs, { type Dayjs } from "dayjs";
import { trDtoToTrForm, trFormToTrDto } from "@/backend/dto-utils.ts";
import type { DefaultOptionType } from "ant-design-vue/es/vc-cascader";
import type { Rule } from "ant-design-vue/es/form";
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

const { categoryOptions, tagOptions, loadCategoryOptions, loadTagOptions } =
  useCategoryTags(() => ledgerStore.currentLedgerId)

// 表单校验规则
const rules: Record<string, Rule[]> = {
  price: [
    { trigger: 'blur' },
    {
      validator: (_: any, value: string) => {
        if (!value) return Promise.reject(new Error('请输入价格'));
        const regex = /^(0|[1-9]\d*)(\.\d{1,2})?$/;
        if (!regex.test(value)) {
          return Promise.reject(new Error('请输入 ≥0 的有效金额，最多两位小数'));
        }
        return Promise.resolve();
      },
      trigger: 'blur',
    },
  ],
};

// 状态
const openTrFilterModal = ref<boolean>();
const tableLoading = ref(false);
const tableData = ref<TransactionRecord[]>([]);
const currentPage = ref<number>(1);
const pageSize = ref<number>(15);
const trTotal = ref<number>(0);
const openTrModal = ref(false);
const trModalTitle = ref('');
const trForm = ref<TrForm>({
  id: '', price: '', type: '', category: '', description: '', tags: [], flags: [], time: dayjs()
});
const flagOptions = [{ label: '离群值', value: 'outlier' }];

// 模板相关状态
const templates = ref<TransactionTemplate[]>([]);
const templateOptions = ref<DefaultOptionType[]>([]);
const selectedTemplateId = ref<string | undefined>();
const openSaveTemplateModal = ref(false);
const templateName = ref('');

// 关联关键事件弹窗
const openLinkModal = ref(false);
const linkingRecord = ref<TransactionRecord | null>(null);
const linkDate = ref<Dayjs>(dayjs());

// 排序相关状态

const openSortModal = ref(false);
const sortItemsRef = ref<SortItem[]>([
  { field: 'transactionAt', order: 'desc' }
]);


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
  trForm.value.type = 'expense';
  if (trQueryConditionStore.timeRange) {
    trForm.value.time = trQueryConditionStore.timeRange[1];
  }
  trModalTitle.value = '新增消费记录';
  selectedTemplateId.value = undefined;
  openTrModal.value = true;
};

const updateTr = (tr: TransactionRecord) => {
  trModalTitle.value = '编辑消费记录';
  trForm.value = trDtoToTrForm(tr);
  selectedTemplateId.value = undefined;
  openTrModal.value = true;
};

const deleteTr = async (tr: TransactionRecord) => {
  await deleteTransactionRecord(tr.transactionId);
  await refreshTable();
};

const closeTrModal = () => {
  trForm.value = { id: '', price: '', type: '', category: '', description: '', tags: [], flags: [], time: dayjs() };
  openTrModal.value = false;
};

const confirmTrModal = async () => {
  trForm.value.time = trForm.value.time.hour(12).minute(0).second(0);
  const tr = trFormToTrDto(trForm.value, ledgerStore.currentLedgerId);
  if (tr.transactionId === '') {
    if (!tr.description) tr.description = '-';
    await createTransactionRecord(tr);
  } else {
    await updateTransactionRecord(tr);
  }
  await refreshTable();
  closeTrModal();
};

const refreshTable = async () => {
  if (!ledgerStore.currentLedgerId) return;
  tableLoading.value = true;
  try {
    const trCondition: TrQueryCondition = {
      ledgerId: ledgerStore.currentLedgerId,
      offset: pageSize.value * (currentPage.value - 1),
      limit: pageSize.value,
      sortFields: sortItemsRef.value
    };
    if (trQueryConditionStore.timeRange) {
      trCondition.tsRange = convertToUnixTimeRange(trQueryConditionStore.timeRange);
    }
    if (trQueryConditionStore.trQueryConditionItems) {
      trCondition.items = trQueryConditionStore.trQueryConditionItems;
    }
    const trQueryResult = await getTrOnCondition(trCondition);

    tableData.value = trQueryResult.items;
    trTotal.value = trQueryResult.total;
    appDataStore.setStatistics(trQueryResult.trStatistics);
  } finally {
    tableLoading.value = false;
  }
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

watch(() => [currentPage.value, pageSize.value], async () => {
  await refreshTable();
});

// 交易类型变化 → 加载分类
watch(() => trForm.value.type, async (newType) => {
  if (!newType || !ledgerStore.currentLedgerId) return
  const categoryList = await loadCategoryOptions(newType)
  const categoryNames = categoryList.map(c => c.name)
  if (categoryNames.length > 0) {
    if (!trForm.value.category || !categoryNames.includes(trForm.value.category)) {
      trForm.value.category = categoryNames[0] as string
    }
  } else {
    trForm.value.category = ''
  }
})

// 分类变化 → 加载标签
watch(() => trForm.value.category, async (newCategory) => {
  if (!newCategory || !trForm.value.type || !ledgerStore.currentLedgerId) return
  await loadTagOptions(newCategory, trForm.value.type)
  const tagNames = tagOptions.value.map(t => t.value as string)
  if (tagNames.length > 0 && trForm.value.tags) {
    trForm.value.tags = trForm.value.tags.filter(tag => tagNames.includes(tag))
  } else {
    trForm.value.tags = []
  }
});

// 加载模板列表
const loadTemplates = async () => {
  if (!ledgerStore.currentLedgerId) return;
  templates.value = await getTemplatesByLedgerId(ledgerStore.currentLedgerId);
  templateOptions.value = templates.value.map(t => ({
    value: t.template_id,
    label: t.template_name
  }));
};

// 模板选择监听 - 应用模板到表单
watch(selectedTemplateId, (newId) => {
  if (!newId) return;
  const template = templates.value.find(t => t.template_id === newId);
  if (!template) return;
  trForm.value.type = template.transaction_type;
  trForm.value.category = template.category;
  trForm.value.tags = [...template.tags];
  trForm.value.flags = template.flags ? [template.flags] : [];
  trForm.value.description = template.description;
});

// 保存为模板
const saveAsTemplate = () => {
  templateName.value = '';
  openSaveTemplateModal.value = true;
};

// 确认保存模板
const confirmSaveTemplate = async () => {
  if (!templateName.value.trim()) return;
  if (!ledgerStore.currentLedgerId) return;
  const data = {
    ledger_id: ledgerStore.currentLedgerId,
    template_name: templateName.value.trim(),
    transaction_type: trForm.value.type,
    category: trForm.value.category,
    tags: trForm.value.tags,
    flags: trForm.value.flags.join(','),
    description: trForm.value.description,
  };
  const result = await saveTemplate(data);
  if (result) {
    message.success('保存模板成功');
    openSaveTemplateModal.value = false;
    await loadTemplates();
  }
};

// 关联关键事件
const handleLink = (record: TransactionRecord) => {
  linkingRecord.value = record;
  linkDate.value = record.keyEventDate ? dayjs(record.keyEventDate) : dayjs();
  openLinkModal.value = true;
};

const confirmLink = async () => {
  if (!linkingRecord.value || !linkDate.value) return;
  const date = linkDate.value.format('YYYY-MM-DD');
  const ok = await linkTransactionToKeyEvent(linkingRecord.value.transactionId, date);
  if (ok) {
    openLinkModal.value = false;
    linkingRecord.value = null;
    await refreshTable();
  }
};

const handleUnlink = async () => {
  if (!linkingRecord.value) return;
  const ok = await unlinkTransactionFromKeyEvent(linkingRecord.value.transactionId);
  if (ok) {
    openLinkModal.value = false;
    linkingRecord.value = null;
    await refreshTable();
  }
};

// 监听账本变化，加载模板
watch(() => ledgerStore.currentLedgerId, () => {
  loadTemplates();
}, { immediate: true });
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

.template-select-row {
  display: flex;
  gap: var(--billadm-space-sm);
  align-items: center;
}

.template-select {
  flex: 1;
}

/* tr-body 作为 page-content 的 flex 子项，确保 tr-footer 始终在底部 */
.tr-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
