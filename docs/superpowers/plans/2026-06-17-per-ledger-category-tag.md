# 按账本隔离分类与标签 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将分类和标签从工作空间全局共享改为按账本隔离，新建账本不再自动预置，改为用户手动初始化。

**Architecture:** 在 Category 和 Tag 模型上增加 `LedgerID` 字段形成联合唯一约束；DAO 层所有查询增加 ledgerID 过滤；新增初始化 API 端点；前端在分类为空时显示初始化按钮。

**Tech Stack:** Go + GORM + Gin, Vue 3 + TypeScript + Ant Design Vue

---

### Task 1: Category 模型增加 LedgerID

**Files:**
- Modify: `kernel/models/category.go`
- Modify: `kernel/models/dto/category_dto.go`

- [ ] **Step 1: 修改 Category 模型**

将 `kernel/models/category.go` 改为：

```go
package models

type Category struct {
	LedgerID        string `gorm:"not null;uniqueIndex:idx_category_ledger_name_type;comment:账本ID" json:"ledger_id"`
	Name            string `gorm:"not null;uniqueIndex:idx_category_ledger_name_type;comment:消费类型" json:"name"`
	TransactionType string `gorm:"not null;uniqueIndex:idx_category_ledger_name_type;comment:交易类型" json:"transaction_type"`
	SortOrder       int    `gorm:"default:0;comment:排序顺序" json:"sort_order"`
}

func (c *Category) TableName() string {
	return "tbl_billadm_category"
}
```

- [ ] **Step 2: 修改 DTO 转换函数**

修改 `kernel/models/dto/category_dto.go` 中的 `FromCategory` 和 `ToCategory`，增加 LedgerID 映射：

```go
func (dto *CategoryDto) ToCategory() *models.Category {
	return &models.Category{
		LedgerID:        dto.LedgerID,
		Name:            dto.Name,
		TransactionType: dto.TransactionType,
		SortOrder:       dto.SortOrder,
	}
}

func (dto *CategoryDto) FromCategory(category *models.Category) {
	dto.LedgerID = category.LedgerID
	dto.Name = category.Name
	dto.TransactionType = category.TransactionType
	dto.SortOrder = category.SortOrder
}
```

并在 `CategoryDto` 结构体中增加 `LedgerID` 字段：

```go
type CategoryDto struct {
	LedgerID        string `json:"ledgerId"`
	Name            string `json:"name"`
	TransactionType string `json:"transactionType"`
	SortOrder       int    `json:"sortOrder"`
	RecordCount     int    `json:"recordCount"`
}
```

在文件顶部新增 DTO类型：

```go
type InitializeCategoriesResponse struct {
	Categories int `json:"categories"`
	Tags       int `json:"tags"`
}
```

- [ ] **Step 3: 验证编译**

```bash
cd kernel && go build ./...
```
Expected: 可能有其他文件引用旧字段导致编译错误，后续任务逐步修复。若无错误则继续。

- [ ] **Step 4: Commit**

```bash
git add kernel/models/category.go kernel/models/dto/category_dto.go
git commit -m "feat: add LedgerID to Category model and DTO"
```

---

### Task 2: Tag 模型增加 LedgerID

**Files:**
- Modify: `kernel/models/tag.go`
- Modify: `kernel/models/dto/tag_dto.go`

- [ ] **Step 1: 修改 Tag 模型**

将 `kernel/models/tag.go` 改为：

```go
package models

type Tag struct {
	LedgerID                string `gorm:"not null;uniqueIndex:idx_tag_ledger_name_cattype;comment:账本ID" json:"ledger_id"`
	Name                    string `gorm:"not null;uniqueIndex:idx_tag_ledger_name_cattype;comment:标签名称" json:"name"`
	CategoryTransactionType string `gorm:"not null;uniqueIndex:idx_tag_ledger_name_cattype;comment:分类:交易类型" json:"category_transaction_type"`
	SortOrder               int    `gorm:"default:0;comment:排序顺序" json:"sort_order"`
}

func (t *Tag) TableName() string {
	return "tbl_billadm_tag"
}
```

- [ ] **Step 2: 修改 DTO 转换函数**

修改 `kernel/models/dto/tag_dto.go`，在 `TagDto` 增加 `LedgerID`，并更新转换函数：

```go
type TagDto struct {
	LedgerID                string `json:"ledgerId"`
	Name                    string `json:"name"`
	CategoryTransactionType string `json:"categoryTransactionType"`
	SortOrder               int    `json:"sortOrder"`
	RecordCount             int    `json:"recordCount"`
}

func (dto *TagDto) ToTag() *models.Tag {
	return &models.Tag{
		LedgerID:                dto.LedgerID,
		Name:                    dto.Name,
		CategoryTransactionType: dto.CategoryTransactionType,
		SortOrder:               dto.SortOrder,
	}
}

func (dto *TagDto) FromTag(tag *models.Tag) {
	dto.LedgerID = tag.LedgerID
	dto.Name = tag.Name
	dto.CategoryTransactionType = tag.CategoryTransactionType
	dto.SortOrder = tag.SortOrder
}
```

- [ ] **Step 3: 验证编译**

```bash
cd kernel && go build ./...
```
Expected: 编译错误（其他文件引用旧方法签名），后续任务修复。

- [ ] **Step 4: Commit**

```bash
git add kernel/models/tag.go kernel/models/dto/tag_dto.go
git commit -m "feat: add LedgerID to Tag model and DTO"
```

---

### Task 3: 移除自动预置 + 导出预置数据

**Files:**
- Modify: `kernel/workspace/workspace.go`
- Modify: `kernel/workspace/seed.go`

- [ ] **Step 1: 移除 workspace.go 中的 seedData 调用**

修改 `kernel/workspace/workspace.go`，删除 seed 调用：

```go
func NewWorkspace(directory string) (*Workspace, error) {
	if !util.IsDirectoryExists(directory) {
		err := os.MkdirAll(directory, 0750)
		if err != nil {
			return nil, err
		}
	}
	dbFile := filepath.Join(directory, constant.DbName)
	db, err := util.NewDbInstance(dbFile)
	if err != nil {
		return nil, err
	}

	return &Workspace{
		directory: directory,
		db:        db,
	}, nil
}
```

同时删除文件顶部不再需要的 `"github.com/sirupsen/logrus"` import。

- [ ] **Step 2: 修改 seed.go — 导出 GetDefaultData**

修改 `kernel/workspace/seed.go`，将包级变量改为导出函数，保留 `seedData` 用于初始化接口：

```go
package workspace

import (
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"

	"github.com/billadm/models"
)

var defaultData = map[string]map[string][]string{
	"expense": {
		"餐饮美食": {"三餐", "零食", "商场", "外卖", "饮料", "奶茶", "咖啡", "水果", "茶叶", "买菜"},
		"购物消费": {"衣物", "数码", "家居", "书籍", "礼物", "玩具", "宠物", "游戏", "快递", "彩票", "电影", "运动", "酒店", "烟酒", "充值", "汽车", "还款"},
		"交通出行": {"打车", "地铁", "公交", "高铁", "油费", "停车", "ETC", "车险"},
		"生活缴费": {"房租", "物业", "燃气", "水费", "电费", "通讯", "还款", "网费", "理发"},
		"贷款还款": {},
		"医疗健康": {"医药", "医险"},
		"娱乐休闲": {},
		"人情往来": {"红包", "请客", "礼金"},
		"教育学习": {},
	},
	"income": {
		"工资奖金": {"工资", "奖金"},
		"补贴补助": {},
		"退税退款": {},
		"二手转卖": {},
		"彩票收入": {},
		"投资理财": {},
		"借贷借款": {},
		"红包转账": {},
	},
	"transfer": {
		"五险一金": {"养老", "医疗", "失业", "住房"},
		"税费党费": {"团费", "交税"},
	},
}

// GetDefaultData returns the preset categories and tags map.
func GetDefaultData() map[string]map[string][]string {
	return defaultData
}

// seedData seeds the given ledger with default categories and tags.
// Returns (categoryCount, tagCount, error).
func seedData(db *gorm.DB, ledgerID string) (int, int, error) {
	categoryCount := 0
	tagCount := 0

	for transactionType, categories := range defaultData {
		for categoryName, tags := range categories {
			category := models.Category{
				LedgerID:        ledgerID,
				Name:            categoryName,
				TransactionType: transactionType,
			}
			if err := db.FirstOrCreate(&category, models.Category{
				LedgerID:        ledgerID,
				Name:            categoryName,
				TransactionType: transactionType,
			}).Error; err != nil {
				logrus.Errorf("创建分类失败: %v", err)
				return 0, 0, err
			}
			categoryCount++

			categoryTransactionType := categoryName + ":" + transactionType
			for _, tagName := range tags {
				tag := models.Tag{
					LedgerID:                ledgerID,
					Name:                    tagName,
					CategoryTransactionType: categoryTransactionType,
				}
				if err := db.FirstOrCreate(&tag, models.Tag{
					LedgerID:                ledgerID,
					Name:                    tagName,
					CategoryTransactionType: categoryTransactionType,
				}).Error; err != nil {
					logrus.Errorf("创建标签失败: %v", err)
					return 0, 0, err
				}
				tagCount++
			}
		}
	}
	return categoryCount, tagCount, nil
}
```

- [ ] **Step 3: 验证编译**

```bash
cd kernel && go build ./...
```
Expected: workspace 包编译通过，其他包可能仍有方法签名不匹配。

- [ ] **Step 4: Commit**

```bash
git add kernel/workspace/workspace.go kernel/workspace/seed.go
git commit -m "refactor: remove auto-seed on workspace create, make seedData ledger-aware"
```

---

### Task 4: DAO 层增加 ledgerID 过滤

**Files:**
- Modify: `kernel/dao/category_dao.go`
- Modify: `kernel/dao/tag_dao.go`

- [ ] **Step 1: 修改 category_dao.go — 所有方法增加 ledgerID**

将 `kernel/dao/category_dao.go` 中 `CategoryDao` 接口和实现改为：

```go
type CategoryDao interface {
	QueryCategory(ws *workspace.Workspace, ledgerID string, trType string) ([]models.Category, error)
	CreateCategory(ws *workspace.Workspace, category *models.Category) error
	DeleteCategory(ws *workspace.Workspace, ledgerID string, name string, transactionType string) error
	IsCategoryInUse(ws *workspace.Workspace, ledgerID string, category string) (bool, error)
	UpdateCategorySort(ws *workspace.Workspace, ledgerID string, name string, transactionType string, sortOrder int) error
	GetMaxSortOrder(ws *workspace.Workspace, ledgerID string, transactionType string) (int, error)
	CountRecordsByCategory(ws *workspace.Workspace, ledgerID string, category string) (int64, error)
	HasCategories(ws *workspace.Workspace, ledgerID string) (bool, error)
}
```

每个方法的实现中 `db.Where(...)` 链式调用前加上 `.Where("ledger_id = ?", ledgerID)`：

```go
func (c *categoryDaoImpl) QueryCategory(ws *workspace.Workspace, ledgerID string, trType string) ([]models.Category, error) {
	categories := make([]models.Category, 0)
	db := ws.GetDb().Where("ledger_id = ?", ledgerID)
	if trType != constant.All {
		db = db.Where("transaction_type = ?", trType)
	}
	if err := db.Order("sort_order ASC, name DESC").Find(&categories).Error; err != nil {
		return nil, err
	}
	return categories, nil
}

func (c *categoryDaoImpl) CreateCategory(ws *workspace.Workspace, category *models.Category) error {
	return ws.GetDb().Create(category).Error
}

func (c *categoryDaoImpl) DeleteCategory(ws *workspace.Workspace, ledgerID string, name string, transactionType string) error {
	return ws.GetDb().
		Where("ledger_id = ? AND name = ? AND transaction_type = ?", ledgerID, name, transactionType).
		Delete(&models.Category{}).Error
}

func (c *categoryDaoImpl) IsCategoryInUse(ws *workspace.Workspace, ledgerID string, category string) (bool, error) {
	var count int64
	err := ws.GetDb().Model(&models.TransactionRecord{}).
		Where("ledger_id = ? AND category = ?", ledgerID, category).
		Count(&count).Error
	return count > 0, err
}

func (c *categoryDaoImpl) UpdateCategorySort(ws *workspace.Workspace, ledgerID string, name string, transactionType string, sortOrder int) error {
	return ws.GetDb().
		Model(&models.Category{}).
		Where("ledger_id = ? AND name = ? AND transaction_type = ?", ledgerID, name, transactionType).
		Update("sort_order", sortOrder).Error
}

func (c *categoryDaoImpl) GetMaxSortOrder(ws *workspace.Workspace, ledgerID string, transactionType string) (int, error) {
	var maxSortOrder int
	err := ws.GetDb().Model(&models.Category{}).
		Where("ledger_id = ? AND transaction_type = ?", ledgerID, transactionType).
		Select("COALESCE(MAX(sort_order), 0)").
		Scan(&maxSortOrder).Error
	return maxSortOrder, err
}

func (c *categoryDaoImpl) CountRecordsByCategory(ws *workspace.Workspace, ledgerID string, category string) (int64, error) {
	var count int64
	err := ws.GetDb().Model(&models.TransactionRecord{}).
		Where("ledger_id = ? AND category = ?", ledgerID, category).
		Count(&count).Error
	return count, err
}

func (c *categoryDaoImpl) HasCategories(ws *workspace.Workspace, ledgerID string) (bool, error) {
	var count int64
	err := ws.GetDb().Model(&models.Category{}).
		Where("ledger_id = ?", ledgerID).
		Count(&count).Error
	return count > 0, err
}
```

- [ ] **Step 2: 修改 tag_dao.go — 所有方法增加 ledgerID**

将 `kernel/dao/tag_dao.go` 中 `TagDao` 接口和实现改为：

```go
type TagDao interface {
	QueryTags(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) ([]models.Tag, error)
	CreateTag(ws *workspace.Workspace, tag *models.Tag) error
	DeleteTag(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string) error
	DeleteTagsByCategory(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) error
	UpdateTagSort(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string, sortOrder int) error
	GetMaxSortOrder(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) (int, error)
	CountRecordsByTag(ws *workspace.Workspace, ledgerID string, tag string) (int64, error)
}
```

每个方法的实现中加上 `ledgerID` 过滤：

```go
func (t *tagDaoImpl) QueryTags(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) ([]models.Tag, error) {
	tags := make([]models.Tag, 0)
	db := ws.GetDb().Where("ledger_id = ?", ledgerID)
	if categoryTransactionType != constant.All {
		db = db.Where("category_transaction_type = ?", categoryTransactionType)
	}
	if err := db.Order("sort_order ASC, name DESC").Find(&tags).Error; err != nil {
		return nil, err
	}
	return tags, nil
}

func (t *tagDaoImpl) CreateTag(ws *workspace.Workspace, tag *models.Tag) error {
	return ws.GetDb().Create(tag).Error
}

func (t *tagDaoImpl) DeleteTag(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string) error {
	return ws.GetDb().
		Where("ledger_id = ? AND name = ? AND category_transaction_type = ?", ledgerID, name, categoryTransactionType).
		Delete(&models.Tag{}).Error
}

func (t *tagDaoImpl) DeleteTagsByCategory(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) error {
	return ws.GetDb().
		Where("ledger_id = ? AND category_transaction_type = ?", ledgerID, categoryTransactionType).
		Delete(&models.Tag{}).Error
}

func (t *tagDaoImpl) UpdateTagSort(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string, sortOrder int) error {
	return ws.GetDb().
		Model(&models.Tag{}).
		Where("ledger_id = ? AND name = ? AND category_transaction_type = ?", ledgerID, name, categoryTransactionType).
		Update("sort_order", sortOrder).Error
}

func (t *tagDaoImpl) GetMaxSortOrder(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) (int, error) {
	var maxSortOrder int
	err := ws.GetDb().Model(&models.Tag{}).
		Where("ledger_id = ? AND category_transaction_type = ?", ledgerID, categoryTransactionType).
		Select("COALESCE(MAX(sort_order), 0)").
		Scan(&maxSortOrder).Error
	return maxSortOrder, err
}

func (t *tagDaoImpl) CountRecordsByTag(ws *workspace.Workspace, ledgerID string, tag string) (int64, error) {
	var count int64
	err := ws.GetDb().Model(&models.TrTag{}).
		Where("ledger_id = ? AND tag = ?", ledgerID, tag).
		Count(&count).Error
	if err != nil {
		return 0, err
	}
	return count, nil
}
```

- [ ] **Step 3: Commit**

```bash
git add kernel/dao/category_dao.go kernel/dao/tag_dao.go
git commit -m "refactor: add ledgerID filtering to category and tag DAO"
```

---

### Task 5: Service 层更新签名 + 新增 InitializeCategories

**Files:**
- Modify: `kernel/service/category_service.go`
- Modify: `kernel/service/tag_service.go`

- [ ] **Step 1: 更新 category_service.go**

将所有 DAO 调用加上 `ledgerID` 参数。新增 `InitializeCategories` 方法：

```go
package service

import (
	"fmt"
	"sync"

	"github.com/billadm/dao"
	"github.com/billadm/models"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
)

var (
	categoryService     CategoryService
	categoryServiceOnce sync.Once
)

func GetCategoryService() CategoryService {
	if categoryService != nil {
		return categoryService
	}
	categoryServiceOnce.Do(func() {
		categoryService = &categoryServiceImpl{
			categoryDao: dao.GetCategoryDao(),
		}
	})
	return categoryService
}

type CategoryService interface {
	QueryCategory(ws *workspace.Workspace, ledgerID string, trType string) ([]models.Category, error)
	CreateCategory(ws *workspace.Workspace, ledgerID string, name string, transactionType string) error
	DeleteCategory(ws *workspace.Workspace, ledgerID string, name string, transactionType string) error
	UpdateCategorySort(ws *workspace.Workspace, ledgerID string, name string, transactionType string, sortOrder int) error
	CountRecordsByCategory(ws *workspace.Workspace, ledgerID string, category string) (int64, error)
	InitializeCategories(ws *workspace.Workspace, ledgerID string) (int, int, error)
}

var _ CategoryService = &categoryServiceImpl{}

type categoryServiceImpl struct {
	categoryDao dao.CategoryDao
}

func (c *categoryServiceImpl) QueryCategory(ws *workspace.Workspace, ledgerID string, trType string) ([]models.Category, error) {
	logrus.Infof("start to query category by %s for ledger %s", trType, ledgerID)
	categories, err := c.categoryDao.QueryCategory(ws, ledgerID, trType)
	if err != nil {
		return nil, err
	}
	for i, cat := range categories {
		if cat.SortOrder != i {
			cat.SortOrder = i
			if err := c.categoryDao.UpdateCategorySort(ws, ledgerID, cat.Name, cat.TransactionType, i); err != nil {
				logrus.Errorf("reindex category sort failed: %v", err)
				return nil, err
			}
		}
	}
	logrus.Infof("query category success, length: %v", len(categories))
	return categories, nil
}

func (c *categoryServiceImpl) CreateCategory(ws *workspace.Workspace, ledgerID string, name string, transactionType string) error {
	logrus.Infof("start to create category, ledger id: %s, name: %s, type: %s", ledgerID, name, transactionType)
	maxSortOrder, err := c.categoryDao.GetMaxSortOrder(ws, ledgerID, transactionType)
	if err != nil {
		logrus.Errorf("get max sort order failed: %v", err)
		return err
	}
	category := &models.Category{
		LedgerID:        ledgerID,
		Name:            name,
		TransactionType: transactionType,
		SortOrder:       maxSortOrder + 1,
	}
	if err := c.categoryDao.CreateCategory(ws, category); err != nil {
		logrus.Errorf("create category failed: %v", err)
		return err
	}
	logrus.Infof("create category success, ledger id: %s, name: %s", ledgerID, name)
	return nil
}

func (c *categoryServiceImpl) DeleteCategory(ws *workspace.Workspace, ledgerID string, name string, transactionType string) error {
	logrus.Infof("start to delete category, ledger id: %s, name: %s", ledgerID, name)
	inUse, err := c.categoryDao.IsCategoryInUse(ws, ledgerID, name)
	if err != nil {
		logrus.Errorf("check category usage failed: %v", err)
		return err
	}
	if inUse {
		logrus.Warnf("category is in use, cannot delete: %s", name)
		return fmt.Errorf("分类已被使用，无法删除")
	}
	categoryTransactionType := fmt.Sprintf("%s:%s", name, transactionType)
	tagDao := dao.GetTagDao()
	if err := tagDao.DeleteTagsByCategory(ws, ledgerID, categoryTransactionType); err != nil {
		logrus.Errorf("delete category tags failed: %v", err)
		return err
	}
	if err := c.categoryDao.DeleteCategory(ws, ledgerID, name, transactionType); err != nil {
		logrus.Errorf("delete category failed: %v", err)
		return err
	}
	logrus.Infof("delete category success, ledger id: %s, name: %s", ledgerID, name)
	return nil
}

func (c *categoryServiceImpl) UpdateCategorySort(ws *workspace.Workspace, ledgerID string, name string, transactionType string, sortOrder int) error {
	logrus.Infof("start to update category sort, ledger: %s, name: %s, type: %s, sortOrder: %d", ledgerID, name, transactionType, sortOrder)
	if err := c.categoryDao.UpdateCategorySort(ws, ledgerID, name, transactionType, sortOrder); err != nil {
		logrus.Errorf("update category sort failed: %v", err)
		return err
	}
	logrus.Infof("update category sort success, name: %s", name)
	return nil
}

func (c *categoryServiceImpl) CountRecordsByCategory(ws *workspace.Workspace, ledgerID string, category string) (int64, error) {
	return c.categoryDao.CountRecordsByCategory(ws, ledgerID, category)
}

func (c *categoryServiceImpl) InitializeCategories(ws *workspace.Workspace, ledgerID string) (int, int, error) {
	has, err := c.categoryDao.HasCategories(ws, ledgerID)
	if err != nil {
		return 0, 0, err
	}
	if has {
		return 0, 0, fmt.Errorf("账本已有分类，无需初始化")
	}
	return workspace.SeedData(ws.GetDb(), ledgerID)
}
```

- [ ] **Step 2: 更新 tag_service.go**

同样的方式增加 `ledgerID` 参数：

```go
type TagService interface {
	QueryTags(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) ([]models.Tag, error)
	CreateTag(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string) error
	DeleteTag(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string) error
	UpdateTagSort(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string, sortOrder int) error
	CountRecordsByTag(ws *workspace.Workspace, ledgerID string, tag string) (int64, error)
}
```

实现中所有 DAO 调用增加 `ledgerID`：

`tag_service.go` 中需要改动的方法：

- `QueryTags` 调用 `t.tagDao.QueryTags(ws, ledgerID, categoryTransactionType)`
- `CreateTag` 中 `tag` 对象增加 `LedgerID: ledgerID`，调用 `t.tagDao.GetMaxSortOrder(ws, ledgerID, ...)`
- `DeleteTag` 调用 `t.tagDao.DeleteTag(ws, ledgerID, ...)`
- `UpdateTagSort` 调用 `t.tagDao.UpdateTagSort(ws, ledgerID, ...)`
- `CountRecordsByTag` 调用 `t.tagDao.CountRecordsByTag(ws, ledgerID, ...)`

完整代码：

```go
func (t *tagServiceImpl) QueryTags(ws *workspace.Workspace, ledgerID string, categoryTransactionType string) ([]models.Tag, error) {
	logrus.Info("start to query tag")
	tags, err := t.tagDao.QueryTags(ws, ledgerID, categoryTransactionType)
	if err != nil {
		return nil, err
	}
	for i, tag := range tags {
		if tag.SortOrder != i {
			tag.SortOrder = i
			if err := t.tagDao.UpdateTagSort(ws, ledgerID, tag.Name, tag.CategoryTransactionType, i); err != nil {
				logrus.Errorf("reindex tag sort failed: %v", err)
				return nil, err
			}
		}
	}
	logrus.Infof("query tag success, length: %v", len(tags))
	return tags, nil
}

func (t *tagServiceImpl) CreateTag(ws *workspace.Workspace, ledgerID string, name string, categoryTransactionType string) error {
	logrus.Infof("start to create tag, ledger: %s, name: %s, category: %s", ledgerID, name, categoryTransactionType)
	maxSortOrder, err := t.tagDao.GetMaxSortOrder(ws, ledgerID, categoryTransactionType)
	if err != nil {
		logrus.Errorf("get max sort order failed: %v", err)
		return err
	}
	tag := &models.Tag{
		LedgerID:                ledgerID,
		Name:                    name,
		CategoryTransactionType: categoryTransactionType,
		SortOrder:               maxSortOrder + 1,
	}
	if err := t.tagDao.CreateTag(ws, tag); err != nil {
		logrus.Errorf("create tag failed: %v", err)
		return err
	}
	logrus.Infof("create tag success, name: %s", name)
	return nil
}
```

（其他方法类似添加 `ledgerID` 参数并传入 DAO 调用）

- [ ] **Step 3: seed.go 重命名导出函数**

`kernel/workspace/seed.go` 中将函数名从 `seedData` 改为导出的 `SeedData`，更新 service 引用。

在文件底部确认：

```go
// SeedData seeds default categories and tags for a ledger.
func SeedData(db *gorm.DB, ledgerID string) (int, int, error) {
	// ... 同前面的 seedData 实现
}
```

- [ ] **Step 4: Commit**

```bash
git add kernel/service/category_service.go kernel/service/tag_service.go kernel/workspace/seed.go
git commit -m "refactor: add ledgerID to service layer, add InitializeCategories"
```

---

### Task 6: API 层更新 + 新增初始化端点

**Files:**
- Modify: `kernel/api/category_controller.go`
- Modify: `kernel/api/tag_controller.go`
- Modify: `kernel/api/router.go`

- [ ] **Step 1: 更新 category_controller.go**

所有 service 调用增加 `ledgerID` 参数。新增 `initializeCategories` handler：

```go
package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/billadm/models"
	"github.com/billadm/models/dto"
	"github.com/billadm/service"
	"github.com/billadm/workspace"
)

// GET /categories?type=all|income|expense|transfer&ledgerId=xxx
func listCategories(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := workspace.Manager.OpenedWorkspace()
	if ws == nil {
		ret.Code = -1
		ret.Msg = workspace.ErrOpenedWorkspaceNotFound
		return
	}

	trType := c.Query("type")
	ledgerID := c.Query("ledgerId")
	if ledgerID == "" {
		ret.Code = -1
		ret.Msg = "ledgerId is required"
		return
	}

	categories, err := service.GetCategoryService().QueryCategory(ws, ledgerID, trType)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	categoryDtos := make([]dto.CategoryDto, 0)
	for _, category := range categories {
		categoryDto := dto.CategoryDto{}
		categoryDto.FromCategory(&category)
		if ledgerID != "" {
			count, err := service.GetCategoryService().CountRecordsByCategory(ws, ledgerID, category.Name)
			if err == nil {
				categoryDto.RecordCount = int(count)
			}
		}
		categoryDtos = append(categoryDtos, categoryDto)
	}

	ret.Data = categoryDtos
}

// POST /categories
func createCategory(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := workspace.Manager.OpenedWorkspace()
	if ws == nil {
		ret.Code = -1
		ret.Msg = workspace.ErrOpenedWorkspaceNotFound
		return
	}

	var req dto.CreateCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		ret.Code = -1
		ret.Msg = "Invalid request: " + err.Error()
		return
	}

	if err := service.GetCategoryService().CreateCategory(ws, req.LedgerID, req.Name, req.TransactionType); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}

// DELETE /categories/:name
func deleteCategory(c *gin.Context) {
	// ... 同上逻辑，传入 c.Query("ledgerId")
}

// PATCH /categories/:name/sort
func updateCategorySort(c *gin.Context) {
	// ... 同上逻辑，传入 req.LedgerID
}

// POST /categories/initialize
func initializeCategories(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := workspace.Manager.OpenedWorkspace()
	if ws == nil {
		ret.Code = -1
		ret.Msg = workspace.ErrOpenedWorkspaceNotFound
		return
	}

	var req struct {
		LedgerID string `json:"ledgerId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		ret.Code = -1
		ret.Msg = "Invalid request: " + err.Error()
		return
	}

	categoryCount, tagCount, err := service.GetCategoryService().InitializeCategories(ws, req.LedgerID)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = dto.InitializeCategoriesResponse{
		Categories: categoryCount,
		Tags:       tagCount,
	}
}
```

- [ ] **Step 2: 更新 tag_controller.go**

不修改接口定义，仅增加 `ledgerID` 参数传入 service 调用。关键改动：

- `listTags`: 从 query 获取 `ledgerId`，传入 `QueryTags(ws, ledgerID, ...)`
- `createTag`: request 中增加 `ledgerId` 字段传入 `CreateTag(ws, ledgerID, ...)`
- `deleteTag`: 从 query 获取 `ledgerId`，传入 `DeleteTag(ws, ledgerID, ...)`
- `updateTagSort`: request 中 LedgerID 传入 `UpdateTagSort(ws, ledgerID, ...)`

- [ ] **Step 3: 注册路由**

修改 `kernel/api/router.go`，在 categories 组添加初始化路由：

```go
// Categories: GET by type query param
v1.GET("/categories", listCategories)
v1.POST("/categories", createCategory)
v1.POST("/categories/initialize", initializeCategories)
v1.DELETE("/categories/:name", deleteCategory)
v1.PATCH("/categories/:name/sort", updateCategorySort)
```

- [ ] **Step 4: 验证编译**

```bash
cd kernel && go build -ldflags '-s -w -extldflags "-static"' -o Billadm-Kernel.exe
```
Expected: 编译成功。

- [ ] **Step 5: 运行测试**

```bash
cd kernel && go test ./...
```
Expected: 全部通过。

- [ ] **Step 6: Commit**

```bash
git add kernel/api/category_controller.go kernel/api/tag_controller.go kernel/api/router.go
git commit -m "feat: add initialize categories API endpoint, update controllers with ledgerID"
```

---

### Task 7: 前端 API 客户端 — 新增初始化接口

**Files:**
- Modify: `app/src/backend/api/category.ts`

- [ ] **Step 1: 添加 initializeCategories 函数**

在 `app/src/backend/api/category.ts` 文件末尾添加：

```ts
export interface InitializeCategoriesResponse {
    categories: number;
    tags: number;
}

export async function initializeCategories(ledgerId: string): Promise<InitializeCategoriesResponse> {
    return api.post<InitializeCategoriesResponse>('/v1/categories/initialize', { ledgerId }, '初始化分类标签');
}
```

- [ ] **Step 2: 在 functions.ts 中添加封装**

在 `app/src/backend/functions.ts` 中添加（靠近其他 category 函数处）：

```ts
import { initializeCategories as initCats } from "@/backend/api/category";

export async function initializeCategoriesForLedger(ledgerId: string): Promise<{ categories: number; tags: number }> {
    return initCats(ledgerId);
}
```

- [ ] **Step 3: 验证类型检查**

```bash
cd app && npx vue-tsc --noEmit
```
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add app/src/backend/api/category.ts app/src/backend/functions.ts
git commit -m "feat: add initializeCategories frontend API client"
```

---

### Task 8: 前端 — 分类标签页面增加初始化按钮

**Files:**
- Modify: `app/src/components/settings_view/BilladmCategoryTagSetting.vue`

- [ ] **Step 1: 添加模板 — 空状态初始化引导**

在分类列 `<section class="column column-categories">` 中，将 `column-empty` 替换为带初始化按钮的空状态。找到：

```html
<div class="column-empty" v-else>
  <span>暂无分类</span>
</div>
```

替换为：

```html
<div class="column-empty" v-else>
  <div class="empty-init">
    <div class="empty-init-icon">
      <svg viewBox="0 0 48 48" fill="none">
        <rect x="6" y="8" width="36" height="32" rx="3" stroke="currentColor" stroke-width="2"/>
        <path d="M6 16h36" stroke="currentColor" stroke-width="2"/>
        <path d="M16 4v8M32 4v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M18 26h12M20 32h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </div>
    <span class="empty-init-text">当前账本暂无分类标签</span>
    <button
      class="init-btn"
      :disabled="!ledgerStore.currentLedgerId"
      :class="{ 'is-loading': initLoading }"
      @click="handleInitialize"
    >
      <svg v-if="!initLoading" class="init-btn-icon" viewBox="0 0 16 16" fill="none">
        <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
      <span v-if="initLoading">初始化中...</span>
      <span v-else>初始化分类标签</span>
    </button>
  </div>
</div>
```

- [ ] **Step 2: 添加脚本逻辑**

在 `<script>` 中添加：

```ts
import { initializeCategoriesForLedger } from '@/backend/functions';

const initLoading = ref(false);

const handleInitialize = async () => {
  if (!ledgerStore.currentLedgerId) return;
  initLoading.value = true;
  try {
    const result = await initializeCategoriesForLedger(ledgerStore.currentLedgerId);
    message.success(`已添加 ${result.categories} 个分类、${result.tags} 个标签`);
    await loadCategories();
  } catch (error: any) {
    message.error(error?.message || '初始化失败');
  } finally {
    initLoading.value = false;
  }
};
```

- [ ] **Step 3: 添加样式**

在 `<style scoped>` 末尾（`</style>` 之前）添加：

```css
/* 初始化空状态 */
.empty-init {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--billadm-space-md);
  padding: var(--billadm-space-xl);
  text-align: center;
}

.empty-init-icon {
  width: 64px;
  height: 64px;
  color: var(--billadm-color-text-disabled);
  opacity: 0.4;
}

.empty-init-icon svg {
  width: 100%;
  height: 100%;
}

.empty-init-text {
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-secondary);
}

.init-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  font-size: var(--billadm-size-text-body-sm);
  font-weight: 500;
  color: var(--billadm-color-text-inverse);
  background-color: var(--billadm-color-primary);
  border: none;
  border-radius: var(--billadm-radius-md);
  cursor: pointer;
  transition: all var(--billadm-transition-fast);
}

.init-btn:hover:not(:disabled) {
  background-color: var(--billadm-color-primary-light);
}

.init-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.init-btn-icon {
  width: 14px;
  height: 14px;
}
```

- [ ] **Step 4: 验证类型检查**

```bash
cd app && npx vue-tsc --noEmit
```
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add app/src/components/settings_view/BilladmCategoryTagSetting.vue
git commit -m "feat: add initialize categories button to category/tag settings"
```

---

### Task 9: 集成测试与验证

- [ ] **Step 1: 完整编译后端**

```bash
cd kernel && go build -ldflags '-s -w -extldflags "-static"' -o Billadm-Kernel.exe
```
Expected: 编译成功。

- [ ] **Step 2: 完整编译前端**

```bash
cd app && npm run build
```
Expected: 构建成功。

- [ ] **Step 3: 运行全部测试**

```bash
cd kernel && go test ./...
```
Expected: 全部通过。

- [ ] **Step 4: 手动验证清单**

启动应用后验证：
1. 创建新账本 → 切换到分类标签页 → 显示"当前账本暂无分类标签"及初始化按钮
2. 点击"初始化分类标签" → 按钮 loading → 弹出成功提示 → 显示完整分类列表
3. 切换到支出/收入/转账 → 每个类型下分类和标签正确显示
4. 添加新分类 → 显示正常
5. 删除分类 → 显示正常
6. 切换到另一个账本 → 各自分类独立
7. 再次点击初始化 → 提示"已有分类，无需初始化"

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: final verification after per-ledger category/tag isolation"
```
