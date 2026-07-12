<template>
  <div class="app-left-bar">
    <!-- 顶部：账本切换 -->
    <div class="sidebar-ledger">
      <a-dropdown :trigger="['click']" placement="bottomLeft">
        <button class="ledger-btn">
          <BookOutlined class="ledger-btn-icon" />
          <span class="ledger-btn-name">{{ ledgerStore.currentLedgerName || '选择账本' }}</span>
          <DownOutlined class="ledger-btn-arrow" />
        </button>
        <template #overlay>
          <div class="ledger-menu">
            <div class="ledger-menu-item ledger-menu-create" @click="handleCreateLedger">
              <PlusOutlined />
              <span>创建账本</span>
            </div>
            <a-divider style="margin: 4px 0" />
            <div
              v-for="ledger in ledgerStore.ledgers"
              :key="ledger.id"
              class="ledger-menu-item"
              :class="{ active: ledger.id === ledgerStore.currentLedgerId }"
              @click="ledgerStore.setCurrentLedger(ledger.id)"
            >
              <span class="ledger-menu-name">{{ ledger.name }}</span>
              <a-button
                type="text"
                size="small"
                danger
                class="ledger-menu-delete"
                @click.stop="handleDeleteLedger(ledger.id, ledger.name)"
              >
                <template #icon><DeleteOutlined /></template>
              </a-button>
            </div>
          </div>
        </template>
      </a-dropdown>
    </div>

    <!-- 中间：导航 -->
    <nav class="sidebar-nav">
      <button
        v-for="item in navItems"
        :key="item.path"
        class="nav-btn"
        :class="{ active: route.path === item.path }"
        @click="navigate(item.path)"
        :aria-label="item.label"
      >
        <component :is="item.icon" class="nav-btn-icon" />
        <span class="nav-btn-text">{{ item.label }}</span>
      </button>
    </nav>

    <div class="sidebar-spacer"></div>

    <!-- 底部：设置 -->
    <div class="sidebar-bottom">
      <button
        class="nav-btn nav-btn-secondary"
        :class="{ active: route.path === '/settings_view' }"
        @click="navigate('settings_view')"
        aria-label="设置"
      >
        <SettingOutlined class="nav-btn-icon" />
        <span class="nav-btn-text">设置</span>
      </button>
    </div>

    <!-- 创建账本弹窗 -->
    <a-modal v-model:open="showCreateModal" title="创建账本" @ok="handleConfirmCreate" ok-text="创建" cancel-text="取消"
      centered :width="400">
      <a-form :model="createForm" layout="vertical">
        <a-form-item label="名称" name="name">
          <a-input v-model:value="createForm.name" placeholder="请输入账本名称" :maxlength="20" />
        </a-form-item>
        <a-form-item label="描述" name="description">
          <a-input v-model:value="createForm.description" placeholder="请输入账本描述" :maxlength="50" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  BookOutlined,
  DownOutlined,
  PlusOutlined,
  DeleteOutlined,
  TagOutlined,
  TransactionOutlined,
  LineChartOutlined,
  StarOutlined,
  SettingOutlined,
  RobotOutlined,
  ReadOutlined,
} from '@ant-design/icons-vue'
import { useLedgerStore } from '@/stores/ledgerStore'
import { message, Modal } from 'ant-design-vue'

const router = useRouter()
const route = useRoute()
const ledgerStore = useLedgerStore()

const navItems = [
  { path: '/category_tag_view', label: '分类标签', icon: TagOutlined },
  { path: '/tr_view', label: '消费记录', icon: TransactionOutlined },
  { path: '/da_view', label: '数据分析', icon: LineChartOutlined },
  { path: '/key_event_view', label: '关键事件', icon: StarOutlined },
  { path: '/diary_view', label: '日记管理', icon: ReadOutlined },
  { path: '/ai_view', label: '智能助手', icon: RobotOutlined },
]

const navigate = (path: string) => {
  router.push(path)
}

const showCreateModal = ref(false)
const createForm = ref({ name: '', description: '' })

const handleCreateLedger = () => {
  createForm.value = { name: '', description: '' }
  showCreateModal.value = true
}

const handleConfirmCreate = async () => {
  if (!createForm.value.name.trim()) {
    message.error('请输入账本名称')
    return
  }
  try {
    await ledgerStore.createLedger(createForm.value.name, createForm.value.description)
    showCreateModal.value = false
  } catch {
    message.error('创建失败')
  }
}

const handleDeleteLedger = (id: string, name: string) => {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除账本「${name}」吗？此操作不可撤销。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        await ledgerStore.deleteLedger(id)
      } catch {
        message.error('删除失败')
      }
    },
  })
}
</script>

<style scoped>
.app-left-bar {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

/* 账本切换区域 — 顶部锚点，充裕呼吸空间 */
.sidebar-ledger {
  padding: var(--billadm-space-lg);
  padding-bottom: var(--billadm-space-lg);
}

.ledger-btn {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  width: 100%;
  height: 32px;
  padding: 0 var(--billadm-space-md);
  border: 1px solid var(--billadm-color-window-border);
  border-radius: var(--billadm-radius-md);
  background: var(--billadm-color-major-background);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-major);
  transition: all var(--billadm-transition-fast);
}

.ledger-btn:hover {
  border-color: var(--billadm-color-primary);
  background: var(--billadm-color-hover-bg);
}

.ledger-btn-icon {
  font-size: 16px;
  color: var(--billadm-color-primary);
  flex-shrink: 0;
}

.ledger-btn-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.ledger-btn-arrow {
  font-size: 10px;
  color: var(--billadm-color-text-secondary);
  flex-shrink: 0;
}

/* 下拉菜单 */
.ledger-menu {
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-2xs);
  min-width: 180px;
  padding: var(--billadm-space-xs);
  background: var(--billadm-color-major-background);
  border-radius: var(--billadm-radius-md);
  box-shadow: var(--billadm-shadow-lg);
}

.ledger-menu-item {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  border-radius: var(--billadm-radius-sm);
  cursor: pointer;
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-major);
  transition: background var(--billadm-transition-fast);
}

.ledger-menu-item:hover {
  background: var(--billadm-color-hover-bg);
}

.ledger-menu-item.active {
  background: var(--billadm-color-active-bg);
  color: var(--billadm-color-primary);
  font-weight: 500;
}

.ledger-menu-create {
  color: var(--billadm-color-primary);
  font-weight: 500;
}

.ledger-menu-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger-menu-delete {
  opacity: 0;
  transition: opacity var(--billadm-transition-fast);
}

.ledger-menu-item:hover .ledger-menu-delete {
  opacity: 1;
}

/* 导航 — 紧凑核心区域，底部留呼吸空间 */
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-2xs);
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  padding-bottom: var(--billadm-space-md);
}

.sidebar-spacer {
  flex: 1;
}

.sidebar-bottom {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: var(--billadm-size-footer-height);
  padding: 0 var(--billadm-space-md);
  border-top: 1px solid var(--billadm-color-divider);
}

/* 导航按钮 */
.nav-btn {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  width: 100%;
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  border: none;
  background: none;
  border-radius: var(--billadm-radius-md);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-secondary);
  text-align: left;
  transition: all var(--billadm-transition-fast);
  position: relative;
}

.nav-btn:hover {
  background-color: var(--billadm-color-hover-bg);
  color: var(--billadm-color-text-major);
}

.nav-btn.active {
  background-color: var(--billadm-color-active-bg);
  color: var(--billadm-color-primary);
  font-weight: 500;
}

.nav-btn.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  background: var(--billadm-color-primary);
  border-radius: 0 2px 2px 0;
}

/* 次级导航按钮 — 设置等工具项，视觉降权 */
.nav-btn-secondary {
  font-size: var(--billadm-size-text-caption);
}

.nav-btn-secondary .nav-btn-icon {
  font-size: 16px;
}

.nav-btn-secondary .nav-btn-text {
  color: var(--billadm-color-text-disabled);
}

.nav-btn-secondary:hover .nav-btn-text,
.nav-btn-secondary.active .nav-btn-text {
  color: inherit;
}

.nav-btn-icon {
  font-size: 18px;
  flex-shrink: 0;
  width: 20px;
  text-align: center;
}

.nav-btn-text {
  white-space: nowrap;
}
</style>
