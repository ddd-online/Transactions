<template>
  <div class="key-event-view">
    <!-- 顶部工具栏 -->
    <div class="key-event-toolbar">
      <div class="key-event-toolbar-left">
        <a-button type="text" @click="goToPrevYear">
          <template #icon><LeftOutlined /></template>
        </a-button>
        <a-date-picker
          v-model:value="selectedYearDayjs"
          picker="year"
          :style="{ width: '120px' }"
          @change="(val) => onYearChange(val)"
        />
        <a-button type="text" @click="goToNextYear">
          <template #icon><RightOutlined /></template>
        </a-button>
      </div>
      <div class="key-event-toolbar-center"></div>
      <div class="key-event-toolbar-right"></div>
    </div>

    <!-- 全年日历 -->
    <div class="calendar-container" :class="{ 'is-loading': isLoading }">
      <div v-for="month in 12" :key="month" class="month-grid">
        <div class="month-header">{{ month }}月</div>
        <div class="weekday-header">
          <span v-for="day in weekdays" :key="day">{{ day }}</span>
        </div>
        <div class="days-grid">
          <!-- 空白占位格 -->
          <div v-for="n in getMonthFirstWeekday(month)" :key="'blank-' + n" class="day-cell day-cell--blank" />
          <!-- 日期格 -->
          <a-tooltip
            v-for="day in getMonthDays(month)"
            :key="day"
            :title="hasRecord(selectedYear, month, day) ? (getTooltipTitle(formatDate(selectedYear, month, day)) || '无标题') : ''"
          >
            <div
              class="day-cell"
              :class="{ 'day-cell--has-record': hasRecord(selectedYear, month, day), 'day-cell--today': isToday(selectedYear, month, day) }"
              :style="getDayCellStyle(selectedYear, month, day)"
              role="button"
              tabindex="0"
              :aria-label="`${month}月${day}日`"
              :aria-pressed="keyEventStore.hasRecord(formatDate(selectedYear, month, day))"
              @click="onDayClick(selectedYear, month, day)"
              @keydown.enter.prevent="onDayClick(selectedYear, month, day)"
              @keydown.space.prevent="onDayClick(selectedYear, month, day)"
            >
              {{ day }}
            </div>
          </a-tooltip>
        </div>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <a-modal
      :open="modalVisible"
      :title="modalTitle"
      :confirm-loading="confirmLoading"
      ok-text="保存"
      cancel-text="取消"
      centered
      :width="modalWidth"
      :body-style="{ height: modalBodyHeight }"
      @ok="handleSave"
      @cancel="handleModalClose"
    >
      <div class="event-modal-content">
        <a-tabs v-model:activeKey="activeTab">
          <a-tab-pane key="detail" tab="详情">
            <a-input
              v-model:value="eventTitle"
              placeholder="标题（可选）"
              :maxlength="200"
              class="event-title-input"
            />
            <div class="color-picker">
              <div
                v-for="c in EVENT_COLORS"
                :key="c"
                class="color-swatch"
                :class="{ 'is-selected': eventColor === c }"
                :style="{ backgroundColor: c }"
                @click="eventColor = c"
              >
                <CheckOutlined v-if="eventColor === c" class="check-icon" />
              </div>
            </div>
            <a-textarea
              v-model:value="eventContent"
              placeholder="记录今天发生的事情..."
              :rows="5"
              :maxlength="5000"
              show-count
            />
            <div class="image-section">
              <div class="image-section-header">
                <span class="image-section-title">图片</span>
                <span class="image-section-count" v-if="images.length">({{ images.length }})</span>
              </div>
              <div class="image-grid" v-if="images.length > 0">
                <div
                  v-for="img in images"
                  :key="img.id"
                  class="image-thumb"
                >
                  <a-image
                    :src="img.data"
                    :preview="true"
                    preview-mask="预览"
                    width="100%"
                    height="120px"
                    style="object-fit: cover; border-radius: 4px;"
                  />
                  <a-button
                    type="text"
                    danger
                    size="small"
                    class="image-delete-btn"
                    @click="handleDeleteImage(img.id)"
                  >
                    <template #icon><CloseOutlined /></template>
                  </a-button>
                </div>
              </div>
              <div
                class="image-drop-zone"
                tabindex="0"
                @click="triggerFileInput"
                @paste="handlePaste"
              >
                <PlusOutlined />
                <span>点击或粘贴添加图片</span>
              </div>
              <input
                ref="fileInputRef"
                type="file"
                accept="image/*"
                multiple
                style="display: none"
                @change="handleFileSelect"
              />
            </div>
          </a-tab-pane>

          <a-tab-pane key="linked" :tab="`关联交易 (${linkedCount})`">
            <div class="linked-summary" v-if="linkedTransactions.length > 0">
              <div class="summary-item income">
                <span class="summary-label">收入</span>
                <span class="summary-value">+{{ centsToYuan(linkedSummary.income) }}</span>
              </div>
              <div class="summary-item expense">
                <span class="summary-label">支出</span>
                <span class="summary-value">-{{ centsToYuan(linkedSummary.expense) }}</span>
              </div>
              <div class="summary-item transfer">
                <span class="summary-label">转账</span>
                <span class="summary-value">{{ centsToYuan(linkedSummary.transfer) }}</span>
              </div>
            </div>
            <div v-if="linkedLoading" style="text-align:center;padding:24px">
              <a-spin />
            </div>
            <div v-else-if="linkedTransactions.length === 0" style="text-align:center;padding:24px;color:var(--billadm-color-text-secondary)">
              暂无关联交易记录
            </div>
            <a-table
              v-else
              :columns="linkedColumns"
              :data-source="linkedTransactions"
              :pagination="false"
              size="small"
              :scroll="{ y: linkedScrollY }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'ledgerName'">
                  <span style="font-size:12px;color:var(--billadm-color-text-secondary)">{{ getLedgerName(record.ledgerId) }}</span>
                </template>
                <template v-else-if="column.dataIndex === 'tags'">
                  <div style="display:flex;flex-wrap:wrap;gap:4px">
                    <a-tag v-for="tag in record.tags" :key="tag" style="font-size:11px">{{ tag }}</a-tag>
                  </div>
                </template>
                <template v-else-if="column.dataIndex === 'price'">
                  <span :style="{ color: record.transactionType === 'expense' ? 'var(--billadm-color-expense)' : record.transactionType === 'income' ? 'var(--billadm-color-income)' : 'var(--billadm-color-transfer)', fontFamily: 'var(--billadm-font-mono)' }">
                    <template v-if="record.transactionType === 'expense'">-</template>
                    <template v-else-if="record.transactionType === 'income'">+</template>
                    {{ centsToYuan(record.price) }}
                  </span>
                </template>
                <template v-else-if="column.dataIndex === 'action'">
                  <a-button type="text" danger size="small" @click="handleUnlinkTr(record)">删除</a-button>
                </template>
              </template>
            </a-table>
          </a-tab-pane>
        </a-tabs>
      </div>
      <template #footer v-if="isEditMode">
        <a-popconfirm
          title="确认删除此条记录？"
          ok-text="确认"
          :showCancel="false"
          @confirm="handleDelete"
        >
          <a-button danger>删除</a-button>
        </a-popconfirm>
        <a-button @click="handleModalClose">取消</a-button>
        <a-button type="primary" :loading="confirmLoading" @click="handleSave">保存</a-button>
      </template>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useKeyEventStore } from "@/stores/keyEventStore";
import dayjs, { type Dayjs } from "dayjs";
import NotificationUtil from "@/backend/notification";
import { LeftOutlined, RightOutlined, CheckOutlined, PlusOutlined, CloseOutlined } from "@ant-design/icons-vue";
import { getLinkedTransactions, unlinkTransactionFromKeyEvent, centsToYuan } from "@/backend/functions.ts";
import { useLedgerStore } from "@/stores/ledgerStore";
import type { TransactionRecord } from "@/types/billadm";

const keyEventStore = useKeyEventStore();
const isLoading = ref(false);

// ========== 颜色配置 ==========
const EVENT_COLORS = [
  '#D4756E', '#E57373', '#3E8E50', '#4CAF50',
  '#6B8FB8', '#64B5F6', '#C9A227', '#9E8770',
  '#7A5C58', '#5C7A6A',
  '#9C27B0', '#BA68C8', '#FF9800', '#FFB74D',
  '#00BCD4', '#4DD0E1', '#795548', '#A1887F',
  '#607D8B', '#90A4AE'
]

const DEFAULT_COLOR = '#2D5A27'  // --billadm-color-primary

const eventColor = ref(DEFAULT_COLOR)

// ========== 弹窗尺寸 ==========
const windowWidth = ref(window.innerWidth);
const windowHeight = ref(window.innerHeight);
const modalWidth = computed(() => Math.floor(windowWidth.value * (2 / 3)));
const modalBodyHeight = computed(() => Math.floor(modalWidth.value * (3 / 4)) + 'px');

const handleResize = () => {
  windowWidth.value = window.innerWidth;
  windowHeight.value = window.innerHeight;
};

// ========== 年份选择 ==========
const selectedYearDayjs = ref<Dayjs>(dayjs());
const selectedYear = computed(() => selectedYearDayjs.value.year());

const goToPrevYear = () => {
  selectedYearDayjs.value = selectedYearDayjs.value.year(selectedYearDayjs.value.year() - 1);
  keyEventStore.fetchDatesByYear(selectedYearDayjs.value.year());
};

const goToNextYear = () => {
  selectedYearDayjs.value = selectedYearDayjs.value.year(selectedYearDayjs.value.year() + 1);
  keyEventStore.fetchDatesByYear(selectedYearDayjs.value.year());
};

const onYearChange = (val: Dayjs | string | null) => {
  if (val) {
    const d = typeof val === 'string' ? dayjs(val) : val;
    selectedYearDayjs.value = d;
    keyEventStore.fetchDatesByYear(d.year());
  }
};

// ========== 工具函数 ==========
const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

const getMonthDays = (month: number) => {
  return dayjs(`${selectedYear.value}-${String(month).padStart(2, '0')}-01`).daysInMonth();
};

const getMonthFirstWeekday = (month: number) => {
  return dayjs(`${selectedYear.value}-${String(month).padStart(2, '0')}-01`).day();
};

const formatDate = (year: number, month: number, day: number) => {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const hasRecord = (year: number, month: number, day: number) => {
  const dateStr = formatDate(year, month, day);
  return keyEventStore.hasRecord(dateStr);
};

const isToday = (year: number, month: number, day: number) => {
  const today = dayjs();
  return year === today.year() && month === today.month() + 1 && day === today.date();
};

const getTooltipTitle = (dateStr: string): string => {
  if (!keyEventStore.hasRecord(dateStr)) return '';
  const title = keyEventStore.getTitle(dateStr);
  return title || '无标题';
};

const getDayCellStyle = (year: number, month: number, day: number) => {
  const dateStr = formatDate(year, month, day);
  if (!keyEventStore.hasRecord(dateStr)) return {};
  const color = keyEventStore.getColor(dateStr) || DEFAULT_COLOR;
  return { '--event-color': color } as Record<string, string>;
};

const extractTitle = (content: string): string => {
  const firstLine = content.split('\n')[0]?.trim() ?? '';
  return firstLine.length > 200 ? firstLine.slice(0, 200) : firstLine;
};

// ========== 弹窗状态 ==========
const modalVisible = ref(false);
const confirmLoading = ref(false);
const selectedDate = ref('');
const eventContent = ref('');
const eventTitle = ref('');
const isEditMode = ref(false);

// 关联交易 Tab
const activeTab = ref('detail');
const linkedTransactions = ref<TransactionRecord[]>([]);
const linkedLoading = ref(false);
const ledgerStore = useLedgerStore();

const getLedgerName = (ledgerId: string): string => {
  const ledger = ledgerStore.ledgers.find(l => l.id === ledgerId);
  return ledger?.name || ledgerId;
};

const linkedCount = computed(() => linkedTransactions.value.length);

const linkedScrollY = computed(() => {
  const bodyHeight = Math.floor(modalWidth.value * (3 / 4));
  return Math.max(200, bodyHeight - 200);
});

const linkedSummary = computed(() => {
  let income = 0, expense = 0, transfer = 0;
  for (const t of linkedTransactions.value) {
    if (t.transactionType === 'income') income += t.price;
    else if (t.transactionType === 'expense') expense += t.price;
    else if (t.transactionType === 'transfer') transfer += t.price;
  }
  return { income, expense, transfer };
});

const linkedColumns = [
  { title: '账本', dataIndex: 'ledgerName', width: 100 },
  { title: '分类', dataIndex: 'category', width: 100 },
  { title: '标签', dataIndex: 'tags', width: 160 },
  { title: '描述', dataIndex: 'description', ellipsis: true },
  { title: '金额', dataIndex: 'price', width: 110, align: 'right' as const },
  { title: '操作', dataIndex: 'action', width: 70, align: 'center' as const },
];

// ========== 图片 ==========
const images = computed(() => keyEventStore.images);
const fileInputRef = ref<HTMLInputElement | null>(null);

const triggerFileInput = () => {
  fileInputRef.value?.click();
};

const handleFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files || files.length === 0) return;
  for (const file of files) {
    try {
      const data = await fileToBase64(file);
      await keyEventStore.addImage(selectedDate.value, data, file.name);
    } catch {
      // error already shown by store
    }
  }
  input.value = '';
};

const handlePaste = async (event: ClipboardEvent) => {
  const items = event.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        try {
          const data = await fileToBase64(file);
          await keyEventStore.addImage(selectedDate.value, data, file.name || 'pasted-image.png');
        } catch {
          // error already shown by store
        }
      }
    }
  }
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
};

const handleDeleteImage = async (imageId: string) => {
  try {
    await keyEventStore.removeImage(imageId);
  } catch {
    // error already shown by store
  }
};

const loadLinkedTransactions = async (date: string) => {
  linkedLoading.value = true;
  try {
    linkedTransactions.value = await getLinkedTransactions(date);
  } finally {
    linkedLoading.value = false;
  }
};

const handleUnlinkTr = async (record: Record<string, any>) => {
  const ok = await unlinkTransactionFromKeyEvent(record.transactionId);
  if (ok) {
    linkedTransactions.value = linkedTransactions.value.filter(
      t => t.transactionId !== record.transactionId
    );
  }
};

const modalTitle = computed(() => {
  return isEditMode.value ? selectedDate.value : `添加事件 — ${selectedDate.value}`;
});

const onDayClick = async (year: number, month: number, day: number) => {
  const dateStr = formatDate(year, month, day);
  selectedDate.value = dateStr;

  if (keyEventStore.hasRecord(dateStr)) {
    // 有记录，加载详情
    confirmLoading.value = true;
    try {
      const event = await keyEventStore.fetchEventByDate(dateStr);
      if (event) {
        eventTitle.value = event.title;
        eventContent.value = event.content;
        eventColor.value = event.color || DEFAULT_COLOR;
        isEditMode.value = true;
      } else {
        eventTitle.value = '';
        eventContent.value = '';
        eventColor.value = DEFAULT_COLOR;
        isEditMode.value = false;
      }
    } finally {
      confirmLoading.value = false;
    }
  } else {
    // 无记录，直接新建
    eventTitle.value = '';
    eventContent.value = '';
    eventColor.value = DEFAULT_COLOR;
    isEditMode.value = false;
  }

  activeTab.value = 'detail';
  loadLinkedTransactions(dateStr);
  keyEventStore.fetchImages(dateStr);
  modalVisible.value = true;
};

const handleSave = async () => {
  if (!eventContent.value.trim()) {
    NotificationUtil.warning('内容不能为空', '请输入事件内容');
    return;
  }
  const title = eventTitle.value.trim() || extractTitle(eventContent.value);
  confirmLoading.value = true;
  try {
    await keyEventStore.saveEvent(selectedDate.value, title, eventContent.value.trim(), eventColor.value);
    modalVisible.value = false;
    keyEventStore.clearImages();
  } finally {
    confirmLoading.value = false;
  }
};

const handleDelete = async () => {
  confirmLoading.value = true;
  try {
    await keyEventStore.deleteEvent(selectedDate.value);
    modalVisible.value = false;
    keyEventStore.clearImages();
  } finally {
    confirmLoading.value = false;
  }
};

const handleModalClose = () => {
  modalVisible.value = false;
  keyEventStore.clearImages();
};

// ========== 初始化 ==========
onMounted(() => {
  keyEventStore.fetchDatesByYear(selectedYear.value);
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});
</script>

<style scoped>
.key-event-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--billadm-space-md) var(--billadm-space-lg);
  gap: var(--billadm-space-md);
}

/* ========== 工具栏 ========== */
.key-event-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  padding-bottom: var(--billadm-space-md);
  border-bottom: 1px solid var(--billadm-color-divider);
}

.key-event-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.key-event-toolbar-right {
  flex: 1;
}

.key-event-toolbar-center {
  display: flex;
  align-items: center;
  gap: 8px;
}

.key-event-toolbar-center :deep(.ant-btn-text) {
  border-radius: var(--billadm-radius-sm);
}

.key-event-toolbar-center :deep(.ant-btn-text:hover) {
  background-color: var(--billadm-color-hover-bg);
}

/* ========== 日历容器 ========== */
.calendar-container {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--billadm-space-md);
  overflow-y: auto;
  align-content: start;
}

@media (max-width: 1024px) {
  .calendar-container {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .calendar-container {
    grid-template-columns: 1fr;
  }
}

.calendar-container.is-loading {
  opacity: 0.6;
  pointer-events: none;
}

/* ========== 月份网格 ========== */
.month-grid {
  background-color: var(--billadm-color-major-background);
  border: 1px solid var(--billadm-color-window-border);
  border-radius: var(--billadm-radius-lg);
  padding: var(--billadm-space-sm);
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-xs);
}

.month-header {
  font-family: var(--billadm-font-display);
  font-size: var(--billadm-size-text-body);
  font-weight: var(--billadm-weight-semibold);
  color: var(--billadm-color-text-major);
  text-align: center;
  padding-bottom: var(--billadm-space-xs);
  letter-spacing: -0.01em;
}

.weekday-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
  font-weight: var(--billadm-weight-medium);
}

.days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.day-cell {
  position: relative;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-major);
  border-radius: var(--billadm-radius-sm);
  cursor: pointer;
  transition: background-color var(--billadm-transition-fast),
              filter var(--billadm-transition-fast),
              box-shadow var(--billadm-transition-fast);
}

.day-cell:hover {
  background-color: var(--billadm-color-hover-bg);
}

.day-cell--blank {
  pointer-events: none;
}

.day-cell--has-record {
  background-color: var(--event-color, var(--billadm-color-primary));
  color: var(--billadm-color-text-inverse);
  font-weight: var(--billadm-weight-semibold);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.day-cell--has-record:hover {
  filter: brightness(1.12);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}

.day-cell--today::after {
  content: '';
  position: absolute;
  top: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  background-color: var(--billadm-color-negative);
  border-radius: 50%;
}

.day-cell:active {
  background-color: var(--billadm-color-active-bg);
}

/* ========== 弹窗内容 ========== */
.event-modal-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 让 Tabs 和 Tab 内容区支持 flex 伸缩 */
.event-modal-content :deep(.ant-tabs) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.event-modal-content :deep(.ant-tabs-content-holder) {
  flex: 1;
}

.event-modal-content :deep(.ant-tabs-content) {
  height: 100%;
}

.event-modal-content :deep(.ant-tabs-tabpane) {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.event-title-input {
  margin-bottom: var(--billadm-space-sm);
}

.event-modal-content :deep(.ant-input-textarea) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.event-modal-content :deep(.ant-input-textarea textarea) {
  flex: 1;
  resize: none;
}

/* ========== 颜色选择器 ========== */
.color-picker {
  display: flex;
  gap: 6px;
  margin-bottom: var(--billadm-space-sm);
  flex-wrap: wrap;
}

.color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color var(--billadm-transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}

.color-swatch:hover {
  border-color: rgba(0, 0, 0, 0.3);
}

.color-swatch.is-selected {
  border-color: #000;
}

.check-icon {
  color: #fff;
  font-size: 12px;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.5));
}

.event-date-label {
  font-size: var(--billadm-size-text-body);
  font-weight: var(--billadm-weight-semibold);
  color: var(--billadm-color-text-major);
}

/* ========== 关联交易统计栏 ========== */
.linked-summary {
  display: flex;
  gap: var(--billadm-space-md);
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  margin-bottom: var(--billadm-space-sm);
  background: var(--billadm-color-minor-background);
  border-radius: var(--billadm-radius-md);
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.summary-label {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
}

.summary-value {
  font-family: var(--billadm-font-mono);
  font-size: var(--billadm-size-text-body);
  font-weight: var(--billadm-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.summary-item.income .summary-value {
  color: var(--billadm-color-income);
}

.summary-item.expense .summary-value {
  color: var(--billadm-color-expense);
}

.summary-item.transfer .summary-value {
  color: var(--billadm-color-transfer);
}

/* ========== 图片区域 ========== */
.image-section {
  margin-top: var(--billadm-space-sm);
}

.image-section-header {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: var(--billadm-space-sm);
}

.image-section-title {
  font-size: var(--billadm-size-text-body-sm);
  font-weight: var(--billadm-weight-medium);
  color: var(--billadm-color-text-major);
}

.image-section-count {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: var(--billadm-space-sm);
}

.image-thumb {
  position: relative;
  border-radius: var(--billadm-radius-sm);
  overflow: hidden;
}

.image-thumb :deep(.ant-image) {
  display: block;
}

.image-delete-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  padding: 0;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--billadm-transition-fast);
}

.image-thumb:hover .image-delete-btn {
  opacity: 1;
}

.image-delete-btn :deep(.anticon) {
  color: #fff;
  font-size: 10px;
}

.image-drop-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: var(--billadm-space-md);
  border: 1px dashed var(--billadm-color-window-border);
  border-radius: var(--billadm-radius-md);
  color: var(--billadm-color-text-secondary);
  font-size: var(--billadm-size-text-body-sm);
  cursor: pointer;
  transition: border-color var(--billadm-transition-fast),
              background-color var(--billadm-transition-fast);
}

.image-drop-zone:hover {
  border-color: var(--billadm-color-primary);
  background-color: var(--billadm-color-hover-bg);
}
</style>
