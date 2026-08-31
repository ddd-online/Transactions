<template>
  <TransactionsPageLayout>
    <!-- 股票交易主界面：多 Tab 页 -->
    <a-tabs v-model:activeKey="activeKey" class="tabs-wrapper">
      <a-tab-pane key="account" tab="我的账户">
        <StockAccountView />
      </a-tab-pane>
      <a-tab-pane key="position" tab="我的持仓">
        <StockPositionView />
      </a-tab-pane>
      <a-tab-pane key="trade" tab="交易历史">
        <StockTradeRecordView />
      </a-tab-pane>
      <a-tab-pane key="statistics" tab="交易统计">
        <StockStatisticsView />
      </a-tab-pane>
    </a-tabs>
  </TransactionsPageLayout>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const activeKey = ref('account')
</script>
