# Key Event Image Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add image attachment support to key events — users can attach multiple images via file picker or clipboard paste, displayed in a thumbnail grid with click-to-preview.

**Architecture:** New `KeyEventImage` model stored in separate SQLite table `tbl_billadm_key_event_image` with Base64 data. Follows existing layered pattern: model → DAO (singleton) → service (singleton) → API handler. Cascade delete images when key event is deleted. Frontend adds image state to Pinia store and image grid UI to KeyEventView.vue modal.

**Tech Stack:** Go + GORM + SQLite (backend), Vue 3 + Pinia + Ant Design Vue + TypeScript (frontend)

---

### Task 1: KeyEventImage model + AutoMigrate

**Files:**
- Modify: `kernel/models/key_event.go` (append struct)
- Modify: `kernel/util/database.go:30` (add to AutoMigrate list)

- [ ] **Step 1: Add KeyEventImage struct to kernel/models/key_event.go**

Append after the existing `KeyEvent` struct and its `TableName` method:

```go
type KeyEventImage struct {
	ID        string `gorm:"primaryKey;comment:图片UUID" json:"id"`
	EventDate string `gorm:"index;not null;comment:关联的关键事件日期" json:"eventDate"`
	Data      string `gorm:"type:text;not null;comment:Base64图片数据" json:"data"`
	Filename  string `gorm:"type:varchar(255);comment:原始文件名" json:"filename"`
	SortOrder int    `gorm:"not null;default:0;comment:排序序号" json:"sortOrder"`
	CreatedAt int64  `gorm:"autoCreateTime:unix;not null;comment:创建时间" json:"createdAt"`
}

func (k *KeyEventImage) TableName() string {
	return "tbl_billadm_key_event_image"
}
```

- [ ] **Step 2: Add KeyEventImage to AutoMigrate in kernel/util/database.go**

Change line 23-31 to add `&models.KeyEventImage{}` to the list:

```go
if err := db.AutoMigrate(
	&models.Ledger{},
	&models.TransactionRecord{},
	&models.TrTag{},
	&models.Category{},
	&models.Tag{},
	&models.TransactionTemplate{},
	&models.Chart{},
	&models.KeyEvent{},
	&models.KeyEventImage{},
); err != nil {
```

- [ ] **Step 3: Verify build**

Run: `cd kernel && go build ./...`
Expected: BUILD SUCCESS (no errors)

- [ ] **Step 4: Commit**

```bash
git add kernel/models/key_event.go kernel/util/database.go
git commit -m "feat: add KeyEventImage model and auto-migrate"
```

---

### Task 2: KeyEventImage DAO

**Files:**
- Create: `kernel/dao/key_event_image_dao.go`

- [ ] **Step 1: Create kernel/dao/key_event_image_dao.go**

```go
package dao

import (
	"sync"

	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

var (
	keyEventImageDao     KeyEventImageDao
	keyEventImageDaoOnce sync.Once
)

func GetKeyEventImageDao() KeyEventImageDao {
	if keyEventImageDao != nil {
		return keyEventImageDao
	}
	keyEventImageDaoOnce.Do(func() {
		keyEventImageDao = &keyEventImageDaoImpl{}
	})
	return keyEventImageDao
}

type KeyEventImageDao interface {
	InsertImage(ws *workspace.Workspace, image *models.KeyEventImage) error
	QueryImagesByEventDate(ws *workspace.Workspace, date string) ([]models.KeyEventImage, error)
	DeleteImage(ws *workspace.Workspace, imageId string) error
	DeleteImagesByEventDate(ws *workspace.Workspace, date string) error
}

var _ KeyEventImageDao = &keyEventImageDaoImpl{}

type keyEventImageDaoImpl struct{}

func (d *keyEventImageDaoImpl) InsertImage(ws *workspace.Workspace, image *models.KeyEventImage) error {
	return ws.GetDb().Create(image).Error
}

func (d *keyEventImageDaoImpl) QueryImagesByEventDate(ws *workspace.Workspace, date string) ([]models.KeyEventImage, error) {
	var images []models.KeyEventImage
	err := ws.GetDb().Where("event_date = ?", date).Order("sort_order ASC").Find(&images).Error
	return images, err
}

func (d *keyEventImageDaoImpl) DeleteImage(ws *workspace.Workspace, imageId string) error {
	return ws.GetDb().Where("id = ?", imageId).Delete(&models.KeyEventImage{}).Error
}

func (d *keyEventImageDaoImpl) DeleteImagesByEventDate(ws *workspace.Workspace, date string) error {
	return ws.GetDb().Where("event_date = ?", date).Delete(&models.KeyEventImage{}).Error
}
```

- [ ] **Step 2: Verify build**

Run: `cd kernel && go build ./...`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add kernel/dao/key_event_image_dao.go
git commit -m "feat: add KeyEventImage DAO with CRUD operations"
```

---

### Task 3: KeyEventImage Service

**Files:**
- Create: `kernel/service/key_event_image_service.go`

- [ ] **Step 1: Create kernel/service/key_event_image_service.go**

```go
package service

import (
	"sync"

	"github.com/billadm/dao"
	"github.com/billadm/models"
	"github.com/billadm/util"
	"github.com/billadm/workspace"
)

var (
	keyEventImageService     KeyEventImageService
	keyEventImageServiceOnce sync.Once
)

func GetKeyEventImageService() KeyEventImageService {
	if keyEventImageService != nil {
		return keyEventImageService
	}
	keyEventImageServiceOnce.Do(func() {
		keyEventImageService = &keyEventImageServiceImpl{
			imageDao: dao.GetKeyEventImageDao(),
		}
	})
	return keyEventImageService
}

type KeyEventImageService interface {
	AddImage(ws *workspace.Workspace, date string, data string, filename string) (*models.KeyEventImage, error)
	GetImagesByEventDate(ws *workspace.Workspace, date string) ([]models.KeyEventImage, error)
	DeleteImage(ws *workspace.Workspace, imageId string) error
	DeleteImagesByEventDate(ws *workspace.Workspace, date string) error
}

var _ KeyEventImageService = &keyEventImageServiceImpl{}

type keyEventImageServiceImpl struct {
	imageDao dao.KeyEventImageDao
}

func (s *keyEventImageServiceImpl) AddImage(ws *workspace.Workspace, date string, data string, filename string) (*models.KeyEventImage, error) {
	images, err := s.imageDao.QueryImagesByEventDate(ws, date)
	if err != nil {
		return nil, err
	}
	sortOrder := len(images) + 1
	image := &models.KeyEventImage{
		ID:        util.GetUUID(),
		EventDate: date,
		Data:      data,
		Filename:  filename,
		SortOrder: sortOrder,
	}
	if err := s.imageDao.InsertImage(ws, image); err != nil {
		return nil, err
	}
	return image, nil
}

func (s *keyEventImageServiceImpl) GetImagesByEventDate(ws *workspace.Workspace, date string) ([]models.KeyEventImage, error) {
	return s.imageDao.QueryImagesByEventDate(ws, date)
}

func (s *keyEventImageServiceImpl) DeleteImage(ws *workspace.Workspace, imageId string) error {
	return s.imageDao.DeleteImage(ws, imageId)
}

func (s *keyEventImageServiceImpl) DeleteImagesByEventDate(ws *workspace.Workspace, date string) error {
	return s.imageDao.DeleteImagesByEventDate(ws, date)
}
```

- [ ] **Step 2: Verify build**

Run: `cd kernel && go build ./...`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add kernel/service/key_event_image_service.go
git commit -m "feat: add KeyEventImage service layer with sort-order logic"
```

---

### Task 4: Cascade delete images in KeyEventService.DeleteByDate

**Files:**
- Modify: `kernel/service/key_event_service.go`

- [ ] **Step 1: Add imageDao field to keyEventServiceImpl**

In `kernel/service/key_event_service.go`, change the singleton init to also inject the image DAO. Replace lines 23-27:

```go
keyEventServiceOnce.Do(func() {
	keyEventService = &keyEventServiceImpl{
		keyEventDao: dao.GetKeyEventDao(),
		imageDao:    dao.GetKeyEventImageDao(),
	}
})
```

Add `imageDao` to the struct (after line 42, within the struct):

```go
type keyEventServiceImpl struct {
	keyEventDao dao.KeyEventDao
	imageDao    dao.KeyEventImageDao
}
```

- [ ] **Step 2: Wrap DeleteByDate in transaction with cascade image delete**

Replace the `DeleteByDate` method (lines 95-98):

```go
func (s *keyEventServiceImpl) DeleteByDate(ws *workspace.Workspace, date string) error {
	logrus.Infof("delete key event, date: %s", date)
	return ws.Transaction(func(tx *workspace.Workspace) error {
		if err := s.imageDao.DeleteImagesByEventDate(tx, date); err != nil {
			return err
		}
		return s.keyEventDao.DeleteByDate(tx, date)
	})
}
```

- [ ] **Step 3: Verify build**

Run: `cd kernel && go build ./...`
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
git add kernel/service/key_event_service.go
git commit -m "feat: cascade delete images when deleting key event"
```

---

### Task 5: API handlers and routes

**Files:**
- Modify: `kernel/api/key_event_controller.go` (append 3 handlers)
- Modify: `kernel/api/router.go` (add routes)

- [ ] **Step 1: Add 3 handlers to kernel/api/key_event_controller.go**

Append to end of file:

```go
// GET /api/v1/key-events/:date/images
func listKeyEventImages(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := workspace.Manager.OpenedWorkspace()
	if ws == nil {
		ret.Code = -1
		ret.Msg = workspace.ErrOpenedWorkspaceNotFound
		return
	}

	date := c.Param("date")
	if date == "" {
		ret.Code = -1
		ret.Msg = "missing date parameter"
		return
	}

	images, err := service.GetKeyEventImageService().GetImagesByEventDate(ws, date)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = images
}

// POST /api/v1/key-events/:date/images  body: { data, filename }
func addKeyEventImage(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := workspace.Manager.OpenedWorkspace()
	if ws == nil {
		ret.Code = -1
		ret.Msg = workspace.ErrOpenedWorkspaceNotFound
		return
	}

	date := c.Param("date")
	if date == "" {
		ret.Code = -1
		ret.Msg = "missing date parameter"
		return
	}

	arg, ok := JsonArg(c, ret)
	if !ok {
		return
	}

	data, ok := arg["data"].(string)
	if !ok || data == "" {
		ret.Code = -1
		ret.Msg = "invalid image data"
		return
	}

	filename, _ := arg["filename"].(string)

	image, err := service.GetKeyEventImageService().AddImage(ws, date, data, filename)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = image.ID
}

// DELETE /api/v1/key-event-images/:id
func deleteKeyEventImage(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := workspace.Manager.OpenedWorkspace()
	if ws == nil {
		ret.Code = -1
		ret.Msg = workspace.ErrOpenedWorkspaceNotFound
		return
	}

	imageId := c.Param("id")
	if imageId == "" {
		ret.Code = -1
		ret.Msg = "missing image id parameter"
		return
	}

	if err := service.GetKeyEventImageService().DeleteImage(ws, imageId); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}
```

- [ ] **Step 2: Register routes in kernel/api/router.go**

In the `keyEvents` group (after line 83), add two new routes inside the existing block:

```go
keyEvents.GET("/:date/images", listKeyEventImages)
keyEvents.POST("/:date/images", addKeyEventImage)
```

After the keyEvents group closing brace (after line 84), add a new group:

```go
keyEventImages := v1.Group("/key-event-images")
{
	keyEventImages.DELETE("/:id", deleteKeyEventImage)
}
```

- [ ] **Step 3: Verify build**

Run: `cd kernel && go build ./...`
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
git add kernel/api/key_event_controller.go kernel/api/router.go
git commit -m "feat: add image CRUD API endpoints for key events"
```

---

### Task 6: Frontend TypeScript types + API client

**Files:**
- Modify: `app/src/types/billadm.d.ts` (after KeyEvent interface)
- Modify: `app/src/backend/api/key-event.ts` (append 3 functions)

- [ ] **Step 1: Add KeyEventImage interface**

Append after the `KeyEvent` interface (after line 156):

```ts
export interface KeyEventImage {
    id: string;
    eventDate: string;
    data: string;
    filename: string;
    sortOrder: number;
    createdAt: number;
}
```

- [ ] **Step 2: Add 3 API functions to key-event.ts**

Append to `app/src/backend/api/key-event.ts`:

```ts
import type { KeyEventImage } from "@/types/billadm";

export async function fetchKeyEventImages(date: string): Promise<KeyEventImage[]> {
    return api.get<KeyEventImage[]>(`/v1/key-events/${date}/images`, '查询关键事件图片');
}

export async function addKeyEventImage(date: string, data: string, filename: string): Promise<string> {
    return api.post<string>(`/v1/key-events/${date}/images`, { data, filename }, '添加关键事件图片');
}

export async function deleteKeyEventImage(imageId: string): Promise<void> {
    return api.delete<void>(`/v1/key-event-images/${imageId}`, '删除关键事件图片');
}
```

Note: the `import type { KeyEventImage }` line should be combined with the existing `import type { KeyEvent }` import on line 2.

- [ ] **Step 3: Verify frontend compiles**

Run: `cd app && npx vue-tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add app/src/types/billadm.d.ts app/src/backend/api/key-event.ts
git commit -m "feat: add KeyEventImage TypeScript types and API client functions"
```

---

### Task 7: Pinia store — image state and actions

**Files:**
- Modify: `app/src/stores/keyEventStore.ts`

- [ ] **Step 1: Add imports and state**

Add import lines at top (merge with existing imports):

```ts
import {
    queryKeyEventsByYear,
    queryKeyEventByDate,
    saveKeyEvent,
    deleteKeyEvent,
    fetchKeyEventImages,
    addKeyEventImage,
    deleteKeyEventImage
} from "@/backend/api/key-event";
import type { KeyEvent, KeyEventImage } from "@/types/billadm";
```

Add state after `colors` ref (after line 19):

```ts
// 当前打开事件的图片列表
const images = ref<KeyEventImage[]>([]);
```

- [ ] **Step 2: Add image actions**

Add these actions after the `deleteEvent` action (after line 75):

```ts
// 获取事件的图片列表
const fetchImages = async (date: string): Promise<void> => {
    try {
        images.value = await fetchKeyEventImages(date);
    } catch (error) {
        NotificationUtil.error('加载图片失败', `${error}`);
        images.value = [];
    }
};

// 添加图片
const addImage = async (date: string, data: string, filename: string): Promise<void> => {
    try {
        const imageId = await addKeyEventImage(date, data, filename);
        images.value.push({
            id: imageId,
            eventDate: date,
            data,
            filename,
            sortOrder: images.value.length + 1,
            createdAt: Math.floor(Date.now() / 1000),
        });
    } catch (error) {
        NotificationUtil.error('添加图片失败', `${error}`);
        throw error;
    }
};

// 删除图片
const removeImage = async (imageId: string): Promise<void> => {
    try {
        await deleteKeyEventImage(imageId);
        images.value = images.value.filter(img => img.id !== imageId);
    } catch (error) {
        NotificationUtil.error('删除图片失败', `${error}`);
        throw error;
    }
};

// 清空图片列表（弹窗关闭时调用）
const clearImages = (): void => {
    images.value = [];
};
```

- [ ] **Step 3: Export new state and actions in return block**

Add to the return block (after `getColor`):

```ts
images,
fetchImages,
addImage,
removeImage,
clearImages,
```

- [ ] **Step 4: Verify frontend compiles**

Run: `cd app && npx vue-tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add app/src/stores/keyEventStore.ts
git commit -m "feat: add image state and actions to keyEventStore"
```

---

### Task 8: KeyEventView.vue — image area in details tab

**Files:**
- Modify: `app/src/components/key_event_view/KeyEventView.vue`

- [ ] **Step 1: Add image grid and drop zone template in detail tab**

Insert after the `<a-textarea>` block (after line 98) and before `</a-tab-pane>`:

```html
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
        :preview="{ mask: '预览' }"
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
```

- [ ] **Step 2: Add script logic**

Update imports — add `PlusOutlined, CloseOutlined` to the ant-design-icons-vue import on line 175:

```ts
import { LeftOutlined, RightOutlined, CheckOutlined, PlusOutlined, CloseOutlined } from "@ant-design/icons-vue";
```

Add reactive state and functions after the existing `linkedColumns` definition (before `loadLinkedTransactions`):

```ts
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
    const data = await fileToBase64(file);
    try {
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
        const data = await fileToBase64(file);
        try {
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
```

- [ ] **Step 3: Load images on modal open**

In `onDayClick`, add image loading after `loadLinkedTransactions(dateStr)` on line 372:

```ts
keyEventStore.fetchImages(dateStr);
```

- [ ] **Step 4: Clear images on modal close**

Add a `@cancel` handler update and a close cleanup. Replace `@cancel="modalVisible = false"` on the modal (line 69) with:

```html
@cancel="handleModalClose"
```

Add the handler function:

```ts
const handleModalClose = () => {
  modalVisible.value = false;
  keyEventStore.clearImages();
};
```

Also clear images after save success in `handleSave` (after line 385 `modalVisible.value = false`):

```ts
keyEventStore.clearImages();
```

And after delete success in `handleDelete` (after line 395 `modalVisible.value = false`):

```ts
keyEventStore.clearImages();
```

- [ ] **Step 5: Add image section styles**

Append to `<style scoped>` block:

```css
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
```

- [ ] **Step 6: Verify frontend compiles**

Run: `cd app && npx vue-tsc --noEmit`
Expected: No type errors (or only pre-existing errors unrelated to our changes)

- [ ] **Step 7: Commit**

```bash
git add app/src/components/key_event_view/KeyEventView.vue
git commit -m "feat: add image grid and drop zone to key event modal"
```

---

### Task 9: End-to-end build verification

- [ ] **Step 1: Full backend build**

Run: `cd kernel && go build -ldflags "-s -w -extldflags '-static'" -o Billadm-Kernel.exe`
Expected: BUILD SUCCESS, Billadm-Kernel.exe created

- [ ] **Step 2: Full frontend type check**

Run: `cd app && npx vue-tsc --noEmit`
Expected: No type errors from our changes

- [ ] **Step 3: Final commit (if any fixes needed)**

If build revealed issues, fix and commit. Otherwise, no action needed.
