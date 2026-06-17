# 按账本隔离分类与标签 — 设计文档

## 目标

将分类和标签从工作空间全局共享改为按账本隔离，每个账本拥有独立的分类和标签体系。新建账本不再自动预置数据，改为用户在分类标签页面手动点击初始化按钮。

## 数据模型变更

### Category

```go
type Category struct {
    LedgerID        string `gorm:"not null;uniqueIndex:idx_category_ledger_name_type"`
    Name            string `gorm:"not null;uniqueIndex:idx_category_ledger_name_type"`
    TransactionType string `gorm:"not null;uniqueIndex:idx_category_ledger_name_type"`
    SortOrder       int
}
```

由 `(Name, TransactionType)` 为主键改为 `(LedgerID, Name, TransactionType)` 联合唯一约束。

### Tag

```go
type Tag struct {
    LedgerID                string `gorm:"not null;uniqueIndex:idx_tag_ledger_name_cattype"`
    Name                    string `gorm:"not null;uniqueIndex:idx_tag_ledger_name_cattype"`
    CategoryTransactionType string `gorm:"not null;uniqueIndex:idx_tag_ledger_name_cattype"`
    SortOrder               int
}
```

由 `(Name, CategoryTransactionType)` 为主键改为 `(LedgerID, Name, CategoryTransactionType)` 联合唯一约束。

### 存量数据处理

- 不在代码层面做自动迁移
- 已有工作空间的分类标签将在打开工作空间时因缺少 `LedgerID` 而触发 GORM 自动迁移添加列（默认值为空字符串）
- 空 `LedgerID` 的旧数据在按 `ledgerId` 查询时不会被返回，自然失效
- 用户需手动点击初始化按钮来为每个账本创建新的分类标签

## 后端变更

### workspace/seed.go

- **移除** `seedData()` 在 `NewWorkspace()` 中的自动调用
- **保留** `defaultData` 预置数据定义，供初始化接口使用
- 新增导出函数 `GetDefaultData() map[string]map[string][]string`

### service/category_service.go

新增方法：

```go
InitializeCategories(ws *workspace.Workspace, ledgerID string) error
```

内部逻辑：遍历 `defaultData`，在同一事务中批量创建分类和对应标签，全部关联到指定 `ledgerID`。若账本已有分类则直接返回（幂等）。

### dao

- `QueryCategory` — 增加 `ledgerID` 过滤
- `GetMaxSortOrder` — 增加 `ledgerID` 过滤
- `QueryTags` — 增加 `ledgerID` 过滤
- `GetMaxSortOrder`（tag）— 增加 `ledgerID` 过滤
- 其他方法同理

### api

新增端点：

```
POST /api/v1/categories/initialize
Body: { "ledgerId": "xxx" }
```

逻辑：调用 `service.InitializeCategories(ws, ledgerID)`，返回创建的分类/标签数量。

现有接口（list/create/delete/update sort）已接受 `ledgerId` 参数，保持不变；后端 DAO 层增加过滤。

### router

```go
v1.POST("/categories/initialize", initializeCategories)
```

## 前端变更

### API 客户端

新增 `app/src/backend/api/category.ts`:

```ts
export async function initializeCategories(ledgerId: string): Promise<{ categories: number; tags: number }>
```

### 分类与标签页面 (BilladmCategoryTagSetting.vue)

- 当选中交易类型且分类列表为空时，页面主体区域显示初始化引导：
  - 图标 + 文案 "当前账本暂无分类标签"
  - "初始化分类标签" 按钮
- 点击按钮调用初始化 API
- 成功后刷新分类列表，引导区域消失
- 初始化按钮在加载中显示 loading 状态

## 预置数据

与当前 `seed.go` 中的 `defaultData` 保持一致（9 个支出分类 + 8 个收入分类 + 2 个转账分类及其标签）。

## 不在范围内

- 账本删除时不自动清理分类标签（由外键或手动处理，后续可加）
- 分类标签的跨账本复制/迁移功能
- 现有数据的自动迁移
