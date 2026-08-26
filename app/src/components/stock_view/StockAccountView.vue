<template>
  <div class="stock-account">
    <!-- ========== 两栏主体：左栏（总资产 + 交易费用设置）/ 右栏（资金变化记录） ========== -->
    <div class="account-body">
      <div class="account-left">
        <!-- ========== 资产总览 ========== -->
        <section class="overview-panel">
          <div class="panel-title-row">
            <div class="panel-title-left">
              <h3 class="panel-title">总资产</h3>
            </div>
            <a-button type="primary" :loading="mutating" @click="openPrincipalModal()">追加本金</a-button>
          </div>
          <div class="overview-lead-value amount amount-large">
            <template v-if="!overviewLoading">{{ centsToYuan(overview.totalAssets) }}</template>
            <span v-else class="skeleton-bar skeleton-lg" aria-hidden="true" />
          </div>

        <div class="overview-stats">
          <div class="overview-stat">
            <span class="overview-label">本金</span>
            <div class="overview-stat-value amount amount-medium">
              <template v-if="!overviewLoading">{{ centsToYuan(overview.principal) }}</template>
              <span v-else class="skeleton-bar skeleton-md" aria-hidden="true" />
            </div>
          </div>

          <div class="overview-stat">
            <span class="overview-label">当前现金</span>
            <div class="overview-stat-value amount amount-medium">
              <template v-if="!overviewLoading">{{ centsToYuan(overview.currentCash) }}</template>
              <span v-else class="skeleton-bar skeleton-md" aria-hidden="true" />
            </div>
          </div>

          <div class="overview-stat">
            <div class="overview-stat-label">
              <span class="overview-label">总盈亏</span>
              <a-tooltip>
                <template #title>
                  总盈亏为已实现盈亏（卖出净盈亏合计）<br />
                  占本金比例 = 总盈亏 ÷ 本金（当前 {{ formatPercent(overview.totalPnlPercent) }}）
                </template>
                <QuestionCircleOutlined class="overview-stat-tip" aria-label="总盈亏计算说明" />
              </a-tooltip>
            </div>
            <div class="overview-stat-value amount amount-medium" :class="pnlClass">
              <template v-if="!overviewLoading">{{ formatSignedYuan(overview.realizedPnl) }}</template>
              <span v-else class="skeleton-bar skeleton-md" aria-hidden="true" />
            </div>
          </div>
        </div>

        <p v-if="!overviewLoading && overview.principal === 0" class="overview-hint">
          还没有资金记录 — 先「追加本金」，之后每一笔资金变动都会显示在「资金变化记录」中。
        </p>
        </section>

        <!-- 左栏下：交易费用设置 -->
        <section class="fee-panel">
        <div class="panel-title-row">
          <div class="panel-title-left">
            <h3 class="panel-title">交易费用设置</h3>
            <a-tooltip :overlay-style="{ maxWidth: '320px' }">
              <template #title>
                佣金：成交金额 × 费率，不足最低佣金时按最低佣金收取（买卖双向）<br />
                买入实际成本 = 成交金额 + 佣金 + 过户费
              </template>
              <QuestionCircleOutlined class="panel-title-tip" aria-label="查看交易费用说明" />
            </a-tooltip>
          </div>
          <a-button type="primary" :loading="feeSaving" @click="handleSaveFeeSettings">保存</a-button>
        </div>
        <a-form layout="vertical" class="fee-form">
          <a-form-item label="佣金费率">
            <a-input v-model:value="feeForm.commissionRate" addon-after="万分之" placeholder="如 2.354" />
          </a-form-item>
          <a-form-item label="最低佣金">
            <a-input v-model:value="feeForm.minCommission" addon-after="元/笔" placeholder="如 5" />
          </a-form-item>
          <a-form-item>
            <template #label>
              <span class="fee-label">
                印花税
                <a-tooltip>
                  <template #title>卖出时按成交金额 × 费率收取</template>
                  <QuestionCircleOutlined class="fee-label-tip" aria-label="印花税说明" />
                </a-tooltip>
              </span>
            </template>
            <a-input v-model:value="feeForm.stampDutyRate" addon-after="%" placeholder="如 0.05" />
          </a-form-item>
          <a-form-item>
            <template #label>
              <span class="fee-label">
                过户费
                <a-tooltip>
                  <template #title>买卖双向收取，仅沪市（60xxxx）适用</template>
                  <QuestionCircleOutlined class="fee-label-tip" aria-label="过户费说明" />
                </a-tooltip>
              </span>
            </template>
            <a-input v-model:value="feeForm.transferFeeRate" addon-after="%" placeholder="如 0.001" />
          </a-form-item>
        </a-form>
        </section>
      </div>

      <!-- 右栏：资金变化记录 -->
      <section class="records-panel">
        <div class="panel-title-row">
          <div class="panel-title-left">
            <h3 class="panel-title">资金变化记录</h3>
          </div>
        </div>
        <a-table :columns="columns" :data-source="fundRecords.items" :loading="recordsLoading" row-key="id"
          size="middle" :pagination="pagination" :scroll="{ x: 730 }" @change="handleTableChange">
          <template #emptyText>
            <a-empty description="暂无资金变化记录 — 追加本金或买入/卖出后，每一笔资金变动都会显示在这里" />
          </template>
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'amountChange'">
              <span class="amount amount-small" :class="signedClass(record.amountChange)">
                {{ formatSignedYuan(record.amountChange) }}
              </span>
            </template>
            <template v-else-if="column.dataIndex === 'cashBalance'">
              <span class="amount amount-small">{{ centsToYuan(record.cashBalance) }}</span>
            </template>
            <template v-else-if="column.dataIndex === 'remark'">
              <a-tooltip :title="record.remark || '-'">
                <span class="cell-ellipsis">{{ record.remark || '-' }}</span>
              </a-tooltip>
            </template>
            <template v-else-if="column.dataIndex === 'eventText'">
              <a-tooltip :title="record.eventText">
                <span class="cell-ellipsis">{{ record.eventText }}</span>
              </a-tooltip>
            </template>
          </template>
        </a-table>
      </section>
    </div>

    <!-- ========== 设置 / 追加本金弹窗 ========== -->
    <a-modal v-model:open="principalModal.open" title="追加本金" ok-text="追加" cancel-text="取消" centered
      :width="400" :confirm-loading="mutating" @ok="handlePrincipalModalOk">
      <a-form layout="vertical">
        <a-form-item label="追加金额" required>
          <a-input v-model:value="principalModal.amount" prefix="￥" placeholder="请输入金额（支持两位小数）" />
        </a-form-item>
        <p class="modal-hint">追加后本金随之增加，并生成一条资金变化记录。</p>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { message } from 'ant-design-vue'
import { QuestionCircleOutlined } from '@ant-design/icons-vue'
import type { ColumnsType } from 'ant-design-vue/es/table'
import { centsToYuan, yuanToCents } from '@/backend/functions'
import { useStockAccountStore } from '@/stores/stockAccountStore'
import type { StockFeeSetting } from '@/types/transactions'

const stockStore = useStockAccountStore()
const { overview, fundRecords, overviewLoading, recordsLoading, mutating } = storeToRefs(stockStore)

// ---------- 金额展示 ----------
const formatSignedYuan = (cents: number): string => {
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : ''
  return `${sign}${centsToYuan(Math.abs(cents))}`
}

const formatPercent = (percent: number): string => `${percent.toFixed(2)}%`

const signedClass = (cents: number): string =>
  cents > 0 ? 'amount-income' : cents < 0 ? 'amount-expense' : ''

const pnlClass = computed(() => signedClass(overview.value.realizedPnl))

// ---------- 交易费用设置 ----------
const feeForm = reactive({
  commissionRate: '',
  minCommission: '',
  stampDutyRate: '',
  transferFeeRate: '',
})

const feeSaving = ref(false)

const fillFeeForm = (feeSettings: StockFeeSetting) => {
  feeForm.commissionRate = String(parseFloat((feeSettings.commissionRate * 10000).toFixed(4)))
  feeForm.minCommission = String(parseFloat((feeSettings.minCommission / 100).toFixed(2)))
  feeForm.stampDutyRate = String(parseFloat((feeSettings.stampDutyRate * 100).toFixed(3)))
  feeForm.transferFeeRate = String(parseFloat((feeSettings.transferFeeRate * 100).toFixed(3)))
}

const handleSaveFeeSettings = async () => {
  const commissionRate = parseFloat(feeForm.commissionRate)
  const minCommission = parseFloat(feeForm.minCommission)
  const stampDutyRate = parseFloat(feeForm.stampDutyRate)
  const transferFeeRate = parseFloat(feeForm.transferFeeRate)

  if (isNaN(commissionRate) || commissionRate <= 0) {
    message.error('请填写大于 0 的佣金费率')
    return
  }
  if (isNaN(minCommission) || minCommission < 0) {
    message.error('请填写不小于 0 的最低佣金')
    return
  }
  if (isNaN(stampDutyRate) || stampDutyRate < 0 || isNaN(transferFeeRate) || transferFeeRate < 0) {
    message.error('印花税与过户费不能为负')
    return
  }

  feeSaving.value = true
  try {
    await stockStore.saveFeeSettings(
      commissionRate / 10000,
      yuanToCents(String(minCommission)),
      stampDutyRate / 100,
      transferFeeRate / 100
    )
  } finally {
    feeSaving.value = false
  }
}

// ---------- 资金变化记录 ----------
const columns: ColumnsType = [
  { title: '日期', dataIndex: 'recordDate', width: 110, align: 'center' },
  { title: '事件', dataIndex: 'eventText', minWidth: 180 },
  { title: '金额变化', dataIndex: 'amountChange', width: 130, align: 'right' },
  { title: '现金余额', dataIndex: 'cashBalance', width: 130, align: 'right' },
  { title: '备注', dataIndex: 'remark', minWidth: 180 },
]

const pagination = computed(() => ({
  current: fundRecords.value.page,
  pageSize: fundRecords.value.pageSize,
  total: fundRecords.value.total,
  showSizeChanger: false,
  showTotal: (t: number) => `共 ${t} 条`,
}))

const handleTableChange = (pag: { current?: number; pageSize?: number }) => {
  stockStore.loadFundRecords(pag.current ?? 1, pag.pageSize ?? 10)
}

// ---------- 本金弹窗 ----------
const principalModal = reactive({
  open: false,
  amount: '',
})

const openPrincipalModal = () => {
  principalModal.amount = ''
  principalModal.open = true
}

const handlePrincipalModalOk = async () => {
  let cents: number
  try {
    cents = yuanToCents(principalModal.amount)
  } catch {
    message.error('请输入有效的金额')
    return
  }
  if (cents <= 0) {
    message.error('金额必须大于 0')
    return
  }
  const ok = await stockStore.addPrincipal(cents)
  if (ok !== null) {
    principalModal.open = false
  }
}

// ---------- 初始化 ----------
onMounted(() => {
  stockStore.reloadAll()
})

// 费用设置变化（首次加载 / 保存 / 切换账本）时同步到表单
watch(
  () => stockStore.feeSettings,
  (feeSettings) => {
    if (feeSettings) {
      fillFeeForm(feeSettings)
    }
  },
  { immediate: true }
)
</script>

<style scoped lang="scss">
.stock-account {
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-xl);
  height: 100%;
  min-height: 0;
}

/* ========== 资产总览面板 ========== */
.overview-panel {
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-lg);
  padding: var(--transactions-space-xl);
  border-bottom: 1px solid var(--transactions-color-divider);
  flex-shrink: 0;
}

.overview-label {
  font-size: var(--transactions-size-text-caption);
  font-weight: var(--transactions-weight-medium);
  color: var(--transactions-color-text-secondary);
  line-height: var(--transactions-height-snug);
  white-space: nowrap;
}

.overview-lead-value {
  color: var(--transactions-color-text-major);
}

.overview-stats {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--transactions-color-divider);
}

.overview-stat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--transactions-space-md);
  padding: var(--transactions-space-xs) 0;
  min-width: 0;
}

.overview-stat-label {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-xs);
  min-width: 0;
}

.overview-stat-tip {
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-tertiary);
  cursor: help;
  transition: color var(--transactions-transition-fast);
}

.overview-stat-tip:hover {
  color: var(--transactions-color-text-secondary);
}

.overview-stat + .overview-stat {
  border-top: 1px solid var(--transactions-color-divider);
}

.overview-stat-value {
  color: var(--transactions-color-text-major);
  white-space: nowrap;
}

.overview-hint {
  margin: 0;
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-tertiary);
  line-height: var(--transactions-height-normal);
}

/* ========== 两栏主体 ========== */
.account-body {
  display: grid;
  grid-template-columns: 380px minmax(0, 1fr);
  gap: 0;
  align-items: stretch;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background-color: var(--transactions-color-major-background);
  border: 1px solid var(--transactions-color-window-border);
  border-radius: var(--transactions-radius-lg);
}

.account-left {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--transactions-color-divider);
}

.fee-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: var(--transactions-space-xl);
}

.fee-form {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: var(--transactions-space-lg);
}

.panel-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--transactions-space-md);
  margin-bottom: 0;
  padding-bottom: var(--transactions-space-lg);
  border-bottom: 1px solid var(--transactions-color-divider);
}

.panel-title-left {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-xs);
  min-width: 0;
}

.panel-title {
  margin: 0;
  font-family: var(--transactions-font-display);
  font-size: var(--transactions-size-text-title);
  font-weight: 600;
  color: var(--transactions-color-text-major);
  line-height: var(--transactions-height-snug);
}

.panel-title-tip {
  font-size: var(--transactions-size-text-body);
  color: var(--transactions-color-text-tertiary);
  cursor: help;
  transition: color var(--transactions-transition-fast);
}

.panel-title-tip:hover {
  color: var(--transactions-color-text-secondary);
}

/* 费用设置表单 */
.fee-form :deep(.ant-form-item) {
  margin-bottom: var(--transactions-space-md);
}

.fee-form :deep(.ant-form-item-label) {
  padding-bottom: var(--transactions-space-2xs);
}

.fee-form :deep(.ant-form-item-label > label) {
  font-size: var(--transactions-size-text-body-sm);
  color: var(--transactions-color-text-secondary);
}

.fee-label {
  display: inline-flex;
  align-items: center;
  gap: var(--transactions-space-xs);
}

.fee-label-tip {
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-tertiary);
  cursor: help;
  transition: color var(--transactions-transition-fast);
}

.fee-label-tip:hover {
  color: var(--transactions-color-text-secondary);
}

/* 资金变化记录 */
.records-panel {
  display: flex;
  flex-direction: column;
  min-height: 320px;
  padding: var(--transactions-space-xl);
}

.records-panel :deep(.ant-table-wrapper) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: var(--transactions-space-lg);
}

.records-panel :deep(.ant-table-wrapper .ant-spin-nested-loading) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.records-panel :deep(.ant-table-wrapper .ant-spin-container) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.records-panel :deep(.ant-table-wrapper .ant-table) {
  flex-shrink: 0;
}

.records-panel :deep(.ant-table-pagination) {
  margin-top: auto;
  margin-bottom: 0;
}

/* 窄窗口：费用设置与记录改为上下堆叠，表格保持列宽并内部横向滚动 */
@media (max-width: 1365px) {
  .account-body {
    grid-template-columns: minmax(0, 1fr);
    overflow: visible;
  }

  .account-left {
    border-right: none;
    border-bottom: 1px solid var(--transactions-color-divider);
  }

  .fee-form {
    max-width: 560px;
  }
}

.cell-ellipsis {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 加载骨架 */
.skeleton-bar {
  display: inline-block;
  border-radius: var(--transactions-radius-sm);
  background: var(--transactions-color-minor-background);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}

.skeleton-lg {
  width: 160px;
  height: 28px;
}

.skeleton-md {
  width: 96px;
  height: 20px;
}

@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-bar {
    animation: none;
    opacity: 0.6;
  }
}

/* 弹窗提示 */
.modal-hint {
  margin: 0;
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-tertiary);
  line-height: var(--transactions-height-normal);
}
</style>
