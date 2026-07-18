# Key Event Image File Storage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate key event images from SQLite Base64 storage to file system storage under `data/assets/key_events/`, with backend-generated thumbnails.

**Architecture:** Images are saved as files under `{workspace}/data/assets/key_events/{eventDate}/{uuid}.{ext}` with `thumb_{uuid}.jpg` thumbnails. DB stores relative paths. A new `GET /api/v1/static/*filepath` endpoint serves the files. Old Base64 data is auto-migrated on workspace open.

**Tech Stack:** Go 1.26 (std `image` + `golang.org/x/image`), Vue 3 + TypeScript, GORM, Gin

## Global Constraints

- Money is always integer cents (unrelated, but project-wide)
- CGO is NOT required — `CGO_ENABLED=0` compatible
- Go import paths use `github.com/billadm/...` prefix
- Components are auto-imported via `unplugin-vue-components`
- Vue composition APIs (`ref`, `computed`, etc.) must be imported from `vue`
- Design system: light mode only, `--billadm-` CSS vars, accent `#4A8E70`
- API response envelope: `{ code: number, msg: string, data: T }`, `code === 0` = success

---

## File Structure Map

**New files:**
- `kernel/util/image.go` — SaveImage (decode base64, write files, generate thumbnail)
- `kernel/api/static_controller.go` — Static file endpoint handler
- `kernel/workspace/migrate_key_event_images.go` — Migration logic
- `app/src/backend/imageUrl.ts` — `getImageUrl()` helper

**Modified files:**
- `kernel/models/key_event.go` — KeyEventImage struct
- `kernel/service/key_event_image_service.go` — AddImage, DeleteImage, DeleteImagesByEventDate
- `kernel/api/key_event_controller.go` — addKeyEventImage handler
- `kernel/api/router.go` — Static file route
- `kernel/workspace/workspace.go` — Call migration
- `app/src/types/billadm.d.ts` — KeyEventImage interface
- `app/src/backend/api/key-event.ts` — addKeyEventImage signature
- `app/src/backend/keyEventCache.ts` — Remove blob URL logic
- `app/src/stores/keyEventStore.ts` — addImage, imageUrlCache
- `app/src/hooks/useImageUpload.ts` — UploadHandler type
- `app/src/components/key_event_view/KeyEventImageGallery.vue` — Display logic
- `app/src/components/key_event_view/KeyEventDetail.vue` — urlCache prop
- `app/src/components/key_event_view/KeyEventView.vue` — imageUrlCache reference

**Deleted files:**
- `app/src/backend/imageOptimizer.ts`

---

### Task 1: Go dependency + Model

**Files:**
- Modify: `kernel/models/key_event.go`
- Modify: `kernel/go.mod` (via `go get`)

**Interfaces:**
- Produces: `KeyEventImage` struct with fields `FilePath string`, `ThumbPath string`, and no `Data`/`Filename`

- [ ] **Step 1: Add golang.org/x/image dependency**

```bash
cd kernel && go get golang.org/x/image@latest
```

- [ ] **Step 2: Update KeyEventImage model**

Replace `kernel/models/key_event.go` lines 18-29 with:

```go
type KeyEventImage struct {
	ID        string `gorm:"primaryKey;comment:图片UUID" json:"id"`
	EventDate string `gorm:"index;not null;comment:关联的关键事件日期" json:"eventDate"`
	FilePath  string `gorm:"type:varchar(500);not null;comment:原图相对路径" json:"filePath"`
	ThumbPath string `gorm:"type:varchar(500);not null;comment:缩略图相对路径" json:"thumbPath"`
	SortOrder int    `gorm:"not null;default:0;comment:排序序号" json:"sortOrder"`
	CreatedAt int64  `gorm:"autoCreateTime:unix;not null;comment:创建时间" json:"createdAt"`
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd kernel && go build ./...
```

Expected: compiles successfully (tests may fail because service references old fields — that's for later tasks)

- [ ] **Step 4: Commit**

```bash
git add kernel/go.mod kernel/go.sum kernel/models/key_event.go
git commit -m "feat: add KeyEventImage FilePath/ThumbPath fields + x/image dep"
```

---

### Task 2: Image utility (SaveImage)

**Files:**
- Create: `kernel/util/image.go`

**Interfaces:**
- Produces: `func SaveImage(workspaceDir, eventDate, imageId string, base64Data []byte) (filePath string, thumbPath string, err error)`

Requirements:
- Decode base64 data URI → extract MIME type → determine file extension
- Create `{workspaceDir}/data/assets/key_events/{eventDate}/` directory
- Write original image as `{imageId}.{ext}`
- Decode image, scale to max 300px width, encode as JPEG quality 75 → `thumb_{imageId}.jpg`
- Return relative paths: `key_events/{eventDate}/{imageId}.{ext}` and `key_events/{eventDate}/thumb_{imageId}.jpg`

- [ ] **Step 1: Create kernel/util/image.go**

```go
package util

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/gif"
	_ "image/png"
	"os"
	"path/filepath"
	"strings"

	_ "golang.org/x/image/webp"
	"golang.org/x/image/draw"
)

const (
	assetsDir    = "data/assets"
	thumbMaxWidth = 300
	thumbQuality  = 75
)

// SaveImage decodes the given base64 data URI, writes the original image and a
// thumbnail to the workspace assets directory, and returns relative paths.
func SaveImage(workspaceDir, eventDate, imageId, rawBase64 string) (filePath, thumbPath string, err error) {
	mime, bin, err := decodeBase64Data(rawBase64)
	if err != nil {
		return "", "", fmt.Errorf("decode base64: %w", err)
	}

	ext := mimeToExt(mime)
	if ext == "" {
		ext = ".jpg"
	}

	dir := filepath.Join(workspaceDir, assetsDir, "key_events", eventDate)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return "", "", fmt.Errorf("create dir %s: %w", dir, err)
	}

	relBase := filepath.Join("key_events", eventDate)
	origName := imageId + ext
	thumbName := "thumb_" + imageId + ".jpg"

	origPath := filepath.Join(dir, origName)
	if err := os.WriteFile(origPath, bin, 0640); err != nil {
		return "", "", fmt.Errorf("write original: %w", err)
	}

	thumbPathAbs := filepath.Join(dir, thumbName)
	if err := generateThumbnail(bin, thumbPathAbs); err != nil {
		os.Remove(origPath)
		return "", "", fmt.Errorf("generate thumbnail: %w", err)
	}

	return filepath.ToSlash(filepath.Join(relBase, origName)),
		filepath.ToSlash(filepath.Join(relBase, thumbName)), nil
}

// decodeBase64Data parses a data URI (data:image/...;base64,...) and returns
// the MIME type and decoded bytes.
func decodeBase64Data(raw string) (mime string, data []byte, err error) {
	idx := strings.Index(raw, ",")
	if idx < 0 {
		return "", nil, fmt.Errorf("invalid data URI: no comma separator")
	}
	header := raw[:idx]
	payload := raw[idx+1:]

	if i := strings.Index(header, ":"); i >= 0 {
		mime = header[i+1:]
	}
	if i := strings.Index(mime, ";"); i >= 0 {
		mime = mime[:i]
	}

	b, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return "", nil, fmt.Errorf("base64 decode: %w", err)
	}
	return mime, b, nil
}

func mimeToExt(mime string) string {
	switch mime {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	default:
		return ".jpg"
	}
}

func generateThumbnail(data []byte, outPath string) error {
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("decode image: %w", err)
	}

	bounds := src.Bounds()
	w := bounds.Dx()
	h := bounds.Dy()
	newW := w
	newH := h
	if w > thumbMaxWidth {
		newW = thumbMaxWidth
		newH = int(float64(h) * float64(thumbMaxWidth) / float64(w))
		if newH < 1 {
			newH = 1
		}
	}

	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	draw.CatmullRom.Scale(dst, dst.Rect, src, bounds, draw.Over, nil)

	f, err := os.Create(outPath)
	if err != nil {
		return fmt.Errorf("create thumbnail file: %w", err)
	}
	defer f.Close()

	if err := jpeg.Encode(f, dst, &jpeg.Options{Quality: thumbQuality}); err != nil {
		return fmt.Errorf("encode thumbnail: %w", err)
	}
	return nil
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd kernel && go build ./...
```

Expected: compiles successfully.

- [ ] **Step 3: Commit**

```bash
git add kernel/util/image.go
git commit -m "feat: add SaveImage utility for key event image file storage"
```

---

### Task 3: Service + DAO changes

**Files:**
- Modify: `kernel/service/key_event_image_service.go`
- Modify: `kernel/dao/key_event_image_dao.go`

- [ ] **Step 1: Add QueryById to interface and implementation in kernel/dao/key_event_image_dao.go**

In the `KeyEventImageDao` interface (after line 12), add:
```go
	QueryById(ws *workspace.Workspace, imageId string) (*models.KeyEventImage, error)
```

After the `Create` method (after line 25), add:
```go
func (d *keyEventImageDaoImpl) QueryById(ws *workspace.Workspace, imageId string) (*models.KeyEventImage, error) {
	var image models.KeyEventImage
	err := ws.GetDb().Where("id = ?", imageId).First(&image).Error
	if err != nil {
		return nil, err
	}
	return &image, nil
}
```

- [ ] **Step 2: Rewrite kernel/service/key_event_image_service.go**

```go
package service

import (
	"os"
	"path/filepath"

	"github.com/sirupsen/logrus"

	"github.com/billadm/dao"
	"github.com/billadm/models"
	"github.com/billadm/util"
	"github.com/billadm/workspace"
)

func NewKeyEventImageService(keyEventImageDao dao.KeyEventImageDao) KeyEventImageService {
	return &keyEventImageServiceImpl{
		keyEventImageDao: keyEventImageDao,
	}
}

type KeyEventImageService interface {
	AddImage(ws *workspace.Workspace, date string, data string) (*models.KeyEventImage, error)
	GetImagesByEventDate(ws *workspace.Workspace, date string) ([]models.KeyEventImage, error)
	DeleteImage(ws *workspace.Workspace, imageId string) error
	DeleteImagesByEventDate(ws *workspace.Workspace, date string) error
}

var _ KeyEventImageService = &keyEventImageServiceImpl{}

type keyEventImageServiceImpl struct {
	keyEventImageDao dao.KeyEventImageDao
}

func (s *keyEventImageServiceImpl) AddImage(ws *workspace.Workspace, date string, data string) (*models.KeyEventImage, error) {
	imageId := util.GetUUID()

	filePath, thumbPath, err := util.SaveImage(ws.GetDirectory(), date, imageId, data)
	if err != nil {
		return nil, err
	}

	images, err := s.keyEventImageDao.QueryByEventDate(ws, date)
	if err != nil {
		_ = os.Remove(filepath.Join(ws.GetDirectory(), "data", "assets", filePath))
		_ = os.Remove(filepath.Join(ws.GetDirectory(), "data", "assets", thumbPath))
		return nil, err
	}

	maxOrder := 0
	for _, img := range images {
		if img.SortOrder > maxOrder {
			maxOrder = img.SortOrder
		}
	}

	image := &models.KeyEventImage{
		ID:        imageId,
		EventDate: date,
		FilePath:  filePath,
		ThumbPath: thumbPath,
		SortOrder: maxOrder + 1,
	}
	if err := s.keyEventImageDao.Create(ws, image); err != nil {
		_ = os.Remove(filepath.Join(ws.GetDirectory(), "data", "assets", filePath))
		_ = os.Remove(filepath.Join(ws.GetDirectory(), "data", "assets", thumbPath))
		return nil, err
	}
	return image, nil
}

func (s *keyEventImageServiceImpl) GetImagesByEventDate(ws *workspace.Workspace, date string) ([]models.KeyEventImage, error) {
	return s.keyEventImageDao.QueryByEventDate(ws, date)
}

func (s *keyEventImageServiceImpl) DeleteImage(ws *workspace.Workspace, imageId string) error {
	image, err := s.keyEventImageDao.QueryById(ws, imageId)
	if err == nil {
		removeImageFiles(ws.GetDirectory(), image.FilePath, image.ThumbPath)
	}
	return s.keyEventImageDao.DeleteById(ws, imageId)
}

func (s *keyEventImageServiceImpl) DeleteImagesByEventDate(ws *workspace.Workspace, date string) error {
	images, err := s.keyEventImageDao.QueryByEventDate(ws, date)
	if err != nil {
		return err
	}
	for i := range images {
		removeImageFiles(ws.GetDirectory(), images[i].FilePath, images[i].ThumbPath)
	}
	return s.keyEventImageDao.DeleteByEventDate(ws, date)
}

func removeImageFiles(dir, filePath, thumbPath string) {
	if filePath != "" {
		if err := os.Remove(filepath.Join(dir, "data", "assets", filePath)); err != nil && !os.IsNotExist(err) {
			logrus.Warnf("删除原图文件失败: %s, err: %v", filePath, err)
		}
	}
	if thumbPath != "" {
		if err := os.Remove(filepath.Join(dir, "data", "assets", thumbPath)); err != nil && !os.IsNotExist(err) {
			logrus.Warnf("删除缩略图文件失败: %s, err: %v", thumbPath, err)
		}
	}
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd kernel && go build ./...
```

Expected: compiles successfully.

- [ ] **Step 4: Commit**

```bash
git add kernel/service/key_event_image_service.go kernel/dao/key_event_image_dao.go
git commit -m "feat: update image service for file storage (AddImage, DeleteImage)"
```

---

### Task 4: API controller changes

**Files:**
- Modify: `kernel/api/key_event_controller.go`

**Interfaces:**
- Consumes: `KeyEventImageService.AddImage(ws, date, data) (*KeyEventImage, error)` — no `filename` param
- Consumes: `KeyEventImageService.DeleteImage(ws, imageId) error` — now cleans files

- [ ] **Step 1: Update addKeyEventImage handler**

Replace lines 121-147 (the `addKeyEventImage` function) in `kernel/api/key_event_controller.go`:

```go
// POST /api/v1/key-events/:date/images  body: { data }
func (h *Handlers) addKeyEventImage(c *gin.Context) (any, error) {
	ws := ws(c)

	date := c.Param("date")
	if date == "" {
		return nil, models.NewBadRequest("missing date parameter")
	}

	arg, ok := JsonArg(c)
	if !ok {
		return nil, models.NewBadRequest("parses request failed")
	}

	data, ok := arg["data"].(string)
	if !ok || data == "" {
		return nil, models.NewBadRequest("invalid image data")
	}

	image, err := h.KeyEventImgSvc.AddImage(ws, date, data)
	if err != nil {
		return nil, err
	}
	return image, nil
}
```

Only change: removed `filename` parsing and `AddImage` no longer takes `filename`; returns `*KeyEventImage` instead of just `image.ID`.

- [ ] **Step 2: Verify compilation**

```bash
cd kernel && go build ./...
```

Expected: compiles successfully.

- [ ] **Step 3: Commit**

```bash
git add kernel/api/key_event_controller.go
git commit -m "feat: update key event image API for file storage"
```

---

### Task 5: Static file endpoint + route

**Files:**
- Create: `kernel/api/static_controller.go`
- Modify: `kernel/api/router.go`

- [ ] **Step 1: Create kernel/api/static_controller.go**

```go
package api

import (
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/billadm/models"
)

// serveStaticFile serves files from the workspace's data/assets directory.
// Registered directly (not through Handle wrapper) because it writes binary data.
func (h *Handlers) serveStaticFile(c *gin.Context) {
	ws := ws(c)
	if ws == nil {
		c.JSON(http.StatusInternalServerError, models.Result{Code: -1, Msg: "workspace not opened"})
		return
	}

	reqPath := c.Param("filepath")
	cleanPath := filepath.Clean(reqPath)

	if strings.Contains(cleanPath, "..") {
		c.AbortWithStatusJSON(http.StatusForbidden, models.Result{Code: -1, Msg: "invalid file path"})
		return
	}

	fullPath := filepath.Join(ws.GetDirectory(), "data", "assets", cleanPath)
	c.File(fullPath)
}
```

- [ ] **Step 2: Register static route in kernel/api/router.go**

Add inside the `v1` group (after line 87, before the `}` of the RequireWorkspace group):

After line 82 (`keyEvents.POST("/:date/images", Handle(h.addKeyEventImage))`), add:
```go
		// Static assets
		v1.GET("/static/*filepath", h.serveStaticFile)
```

This must be inside the `v1 := ginServer.Group("/api/v1")...` block (so it has `RequireWorkspace` middleware), but outside any subgroup.

Actually, let me look at the router structure more carefully. The static route should be at the `v1` group level:

After line 82 (`keyEvents.POST("/:date/images", Handle(h.addKeyEventImage))`), after the keyEvents group closing brace, add:

```go

		// Static assets (served from workspace data/assets/ directory)
		v1.GET("/static/*filepath", h.serveStaticFile)
```

- [ ] **Step 3: Verify compilation**

```bash
cd kernel && go build ./...
```

Expected: compiles successfully.

- [ ] **Step 4: Commit**

```bash
git add kernel/api/static_controller.go kernel/api/router.go
git commit -m "feat: add static file endpoint for workspace assets"
```

---

### Task 6: Data migration

**Files:**
- Create: `kernel/workspace/migrate_key_event_images.go`
- Modify: `kernel/workspace/workspace.go`

- [ ] **Step 1: Create kernel/workspace/migrate_key_event_images.go**

```go
package workspace

import (
	"fmt"

	"github.com/sirupsen/logrus"
	"gorm.io/gorm"

	"github.com/billadm/util"
)

// migrateKeyEventImages migrates old Base64-encoded images to file storage.
// It queries all KeyEventImage records where file_path is empty (not yet migrated),
// decodes the Base64 data from the old "data" column, writes files, and updates paths.
func migrateKeyEventImages(db *gorm.DB, dir string) {
	type oldImage struct {
		ID        string
		EventDate string
		Data      string
		FilePath  string
		ThumbPath string
	}

	var rows []oldImage
	if err := db.Table("tbl_billadm_key_event_image").
		Where("file_path = '' OR file_path IS NULL").
		Where("data != '' AND data IS NOT NULL").
		Find(&rows).Error; err != nil {
		logrus.Warnf("查询待迁移图片失败: %v", err)
		return
	}

	if len(rows) == 0 {
		return
	}

	logrus.Infof("开始迁移 %d 张关键事件图片...", len(rows))
	success := 0
	failed := 0

	for _, row := range rows {
		filePath, thumbPath, err := util.SaveImage(dir, row.EventDate, row.ID, row.Data)
		if err != nil {
			logrus.Warnf("迁移图片失败 id=%s: %v", row.ID, err)
			failed++
			continue
		}

		if err := db.Table("tbl_billadm_key_event_image").
			Where("id = ?", row.ID).
			Updates(map[string]interface{}{
				"file_path":  filePath,
				"thumb_path": thumbPath,
			}).Error; err != nil {
			logrus.Warnf("更新图片路径失败 id=%s: %v", row.ID, err)
			failed++
			continue
		}

		success++
	}

	logrus.Infof("关键事件图片迁移完成: 成功 %d, 失败 %d", success, failed)
	if failed > 0 {
		logrus.Warnf("%d 张图片迁移失败，请检查日志", failed)
	}
}
```

Note: The migration reads `data` from the old column using raw SQL (`Table("tbl_billadm_key_event_image")`) since the column no longer exists in the Go struct. This is safe because GORM AutoMigrate doesn't drop columns in SQLite.

- [ ] **Step 2: Call migration in kernel/workspace/workspace.go**

In the `NewWorkspace` function, after the `migrateAiConfig(db)` call (line 46), add:

```go
	// 迁移关键事件图片：将旧 Base64 数据转为文件存储
	migrateKeyEventImages(db, directory)
```

- [ ] **Step 3: Verify compilation**

```bash
cd kernel && go build ./...
```

Expected: compiles successfully.

- [ ] **Step 4: Commit**

```bash
git add kernel/workspace/migrate_key_event_images.go kernel/workspace/workspace.go
git commit -m "feat: add key event image migration (Base64 → file storage)"
```

---

### Task 7: Backend verification (go test, go vet)

- [ ] **Step 1: Run go vet**

```bash
cd kernel && go vet ./...
```

Expected: no errors.

- [ ] **Step 2: Run go tests**

```bash
cd kernel && go test ./...
```

Expected: all tests pass. If tests reference old `Data`/`Filename` fields, fix them.

- [ ] **Step 3: Fix tests if needed**

Search for test files that reference `KeyEventImage` and update field names:
```bash
cd kernel && rg "Data\s*:|\.Data\s*=|\.Filename" --include="*_test.go"
```

If any test files exist and reference old fields, update them to use `FilePath`/`ThumbPath`.

- [ ] **Step 4: Commit (if tests were fixed)**

```bash
git add -A && git commit -m "fix: update tests for KeyEventImage field changes"
```

---

### Task 8: Frontend types + API client

**Files:**
- Modify: `app/src/types/billadm.d.ts`
- Modify: `app/src/backend/api/key-event.ts`

- [ ] **Step 1: Update KeyEventImage type in billadm.d.ts**

Replace lines 165-172:

```ts
export interface KeyEventImage {
    id: string;
    eventDate: string;
    filePath: string;
    thumbPath: string;
    sortOrder: number;
    createdAt: number;
}
```

- [ ] **Step 2: Update addKeyEventImage in key-event.ts**

Replace lines 24-38:

```ts
export async function addKeyEventImage(date: string, data: string, ledgerId: string, onProgress?: (percent: number) => void): Promise<KeyEventImage> {
    return api.post<KeyEventImage>(
        `/v1/key-events/${date}/images`,
        { data, ledger_id: ledgerId },
        '添加关键事件图片',
        {
            timeout: 30000,
            onUploadProgress: (e: { loaded: number; total?: number }) => {
                if (e.total && e.total > 0) {
                    onProgress?.(Math.round((e.loaded / e.total) * 100))
                }
            },
        }
    )
}
```

Changes: removed `filename` parameter, return type `Promise<KeyEventImage>` instead of `Promise<string>`.

- [ ] **Step 3: Verify no compilation errors in referenced files**

```bash
cd app && npx vue-tsc -b --noEmit 2>&1 | head -30
```

Expected: errors only from files not yet updated (store, hooks, components). These will be fixed in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add app/src/types/billadm.d.ts app/src/backend/api/key-event.ts
git commit -m "feat: update frontend types and API for file storage"
```

---

### Task 9: imageUrl utility + cache simplification

**Files:**
- Create: `app/src/backend/imageUrl.ts`
- Modify: `app/src/backend/keyEventCache.ts`
- Delete: `app/src/backend/imageOptimizer.ts`

- [ ] **Step 1: Create app/src/backend/imageUrl.ts**

```ts
import api from '@/backend/api/api-client'

let _baseUrl = ''

async function getBaseUrl(): Promise<string> {
    if (_baseUrl) return _baseUrl

    let baseURL = 'http://127.0.0.1:28080'

    if (window.electronAPI?.getApiServer) {
        try {
            const server = await window.electronAPI.getApiServer()
            baseURL = server
        } catch {
            // fallback
        }
    }

    _baseUrl = baseURL
    return _baseUrl
}

let _baseUrlPromise: Promise<string> | null = null

function ensureBaseUrl(): Promise<string> {
    if (!_baseUrlPromise) {
        _baseUrlPromise = getBaseUrl()
    }
    return _baseUrlPromise
}

export async function getImageUrl(filePath: string): Promise<string> {
    const base = await ensureBaseUrl()
    return `${base}/api/v1/static/${filePath}`
}
```

Wait — this is async because `getApiServer` returns a promise. But images are used in template `:src` bindings, which need synchronous URLs.

Let me use a different approach. The url can be constructed synchronously once the base URL is known. In `api-client.ts`, the base URL is determined lazily. Let me simplify: export a synchronous version that uses a pre-computed base.

Actually, looking at `api-client.ts` more carefully, `getApiServer()` is async because it uses `window.electronAPI.getApiServer()` which returns a promise. But we need synchronous URL generation for `:src` bindings.

Better approach: store the base URL in a variable that gets initialized once (on first access), and if it's not ready yet, return an empty string (or the default). Then in the component, use a computed property.

Actually, the simplest approach: since `getApiServer()` is called once during app initialization (when the api client is created), and the base URL doesn't change, let me just export the base URL after api-client initializes it.

Let me rewrite this more practically:

```ts
// app/src/backend/imageUrl.ts
import api from '@/backend/api/api-client'

export function getImageUrl(filePath: string): string {
    const baseURL = api.defaults.baseURL || 'http://127.0.0.1:28080/api'
    const root = baseURL.replace(/\/api$/, '')
    return `${root}/api/v1/static/${filePath}`
}
```

This is simpler and synchronous. It uses the axios instance's `baseURL` which is set during initialization. If it's not set yet, it falls back to the default.

- [ ] **Step 2 (revised): Create app/src/backend/imageUrl.ts**

```ts
import api from '@/backend/api/api-client'

export function getImageUrl(filePath: string): string {
    const baseURL = (api.defaults.baseURL as string) || 'http://127.0.0.1:28080/api'
    const root = baseURL.replace(/\/api$/, '')
    return `${root}/api/v1/static/${filePath}`
}
```

- [ ] **Step 3: Simplify keyEventCache.ts**

Replace `app/src/backend/keyEventCache.ts` entirely:

```ts
import type { KeyEventImage, TransactionRecord } from '@/types/billadm'

export class KeyEventCache {
  readonly trCache = new Map<string, TransactionRecord[]>()
  private imageCache = new Map<string, KeyEventImage[]>()

  getImages(date: string): KeyEventImage[] | undefined {
    return this.imageCache.get(date)
  }

  setImages(date: string, images: KeyEventImage[]): void {
    this.imageCache.set(date, images)
  }

  setTransactions(date: string, trs: TransactionRecord[]): void {
    this.trCache.set(date, trs)
  }

  getTransactions(date: string): TransactionRecord[] | undefined {
    return this.trCache.get(date)
  }

  invalidate(date: string): void {
    this.imageCache.delete(date)
    this.trCache.delete(date)
  }

  destroy(): void {
    this.imageCache.clear()
    this.trCache.clear()
  }
}
```

All blob URL logic removed (`imageUrlCache`, `ImageUrls`, `revokeImageUrls`, `createImageUrls`).

- [ ] **Step 4: Delete imageOptimizer.ts**

```bash
Remove-Item -LiteralPath "app/src/backend/imageOptimizer.ts"
```

- [ ] **Step 5: Commit**

```bash
git add app/src/backend/imageUrl.ts app/src/backend/keyEventCache.ts && git rm app/src/backend/imageOptimizer.ts && git commit -m "feat: add imageUrl helper, simplify cache, remove imageOptimizer"
```

---

### Task 10: Store changes

**Files:**
- Modify: `app/src/stores/keyEventStore.ts`

- [ ] **Step 1: Rewrite keyEventStore.ts**

Remove `ImageUrls` import, `imageUrlCache` export, update `addImage` and `fetchImages`.

Replace lines 1-17 (imports):
```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
    queryKeyEventsByYear,
    queryKeyEventByDate,
    saveKeyEvent,
    deleteKeyEvent,
    queryKeyEventImages,
    addKeyEventImage,
    deleteKeyEventImage
} from "@/backend/api/key-event"
import { fetchLinkedTransactions } from "@/backend/api/tr"
import { withErrorHandling } from "@/backend/errorHandler"
import { useLedgerStore } from '@/stores/ledgerStore'
import NotificationUtil from "@/backend/notification"
import { KeyEventCache } from '@/backend/keyEventCache'
import type { KeyEvent, KeyEventImage } from "@/types/billadm"
```

(Remove `ImageUrls` import from imageOptimizer — already removed above.)

Replace lines 27-31 (remove `images` ref, keep `events`):
No change for reactive state, `images` is still needed.

Replace lines 116-133 (`fetchImages`):
```ts
    const fetchImages = async (date: string): Promise<void> => {
        const ledgerId = getLedgerId()
        if (!ledgerId) return
        const cached = cache.getImages(date)
        if (cached) {
            images.value = cached
            return
        }
        try {
            const result = await queryKeyEventImages(date, ledgerId);
            cache.setImages(date, result);
            images.value = result;
        } catch (error) {
            NotificationUtil.error('加载图片失败', `${error}`);
            images.value = [];
        }
    };
```

Replace lines 177-200 (`addImage`):
```ts
    const addImage = async (date: string, data: string, onProgress?: (percent: number) => void): Promise<void> => {
        const ledgerId = getLedgerId()
        if (!ledgerId) return
        try {
            const image = await addKeyEventImage(date, data, ledgerId, onProgress);
            images.value.push(image);
            const cached = cache.getImages(date);
            if (cached) {
                cached.push(image);
            }
        } catch (error) {
            NotificationUtil.error('添加图片失败', `${error}`);
            throw error;
        }
    };
```

Changes: removed `filename` param, response is now `KeyEventImage` object (with `filePath`/`thumbPath`), not just a string ID.

Replace lines 202-216 (`removeImage`):
```ts
    const removeImage = async (imageId: string): Promise<void> => {
        const ledgerId = getLedgerId()
        if (!ledgerId) return
        try {
            const target = images.value.find(img => img.id === imageId);
            await deleteKeyEventImage(imageId, ledgerId);
            images.value = images.value.filter(img => img.id !== imageId);
            if (target) {
                cache.invalidate(target.eventDate);
            }
        } catch (error) {
            NotificationUtil.error('删除图片失败', `${error}`);
            throw error;
        }
    };
```

Replace return object (lines 223-249), remove `imageUrlCache`:
```ts
    return {
        datesWithRecords,
        currentYear,
        titles,
        colors,
        images,
        events,
        trCache: cache.trCache,
        fetchDatesByYear,
        fetchEventByDate,
        saveEvent,
        deleteEvent,
        hasRecord,
        getTitle,
        getColor,
        getEventByDate,
        fetchImages,
        addImage,
        removeImage,
        clearImages,
        preloadYearData,
        cacheLinkedTransactions,
    };
```

Also update `preloadYearData` (lines 143-175) — remove `cache.setImages` async blob URL generation since setImages no longer generates blob URLs. The cache.setImages call on line 159 is now synchronous:

Line 159: `cache.setImages(e.date, imgs);` — already correct, just remove the async blob URL generation that used to happen inside setImages.

- [ ] **Step 2: Verify**

```bash
cd app && npx vue-tsc -b --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add app/src/stores/keyEventStore.ts
git commit -m "feat: update keyEventStore for file storage (remove blob URLs, adapt addImage)"
```

---

### Task 11: Hook changes

**Files:**
- Modify: `app/src/hooks/useImageUpload.ts`

- [ ] **Step 1: Update UploadHandler type**

Replace lines 20-25:

```ts
export type UploadHandler = (
  date: string,
  data: string,
  onProgress?: (percent: number) => void
) => Promise<void>
```

Remove `filename` from the UploadHandler type. The function now doesn't take filename.

- [ ] **Step 2: Update uploadFn call in uploadCurrentFile**

Replace lines 94-103:

```ts
      await uploadFn(
        targetDate,
        data,
        (percent: number) => {
          const entry = progress.value.files[currentFileIndex]
          if (entry) {
            entry.percent = percent
          }
        }
      )
```

- [ ] **Step 3: Commit**

```bash
git add app/src/hooks/useImageUpload.ts
git commit -m "feat: remove filename from UploadHandler type"
```

---

### Task 12: Component changes

**Files:**
- Modify: `app/src/components/key_event_view/KeyEventImageGallery.vue`
- Modify: `app/src/components/key_event_view/KeyEventDetail.vue`
- Modify: `app/src/components/key_event_view/KeyEventView.vue`

- [ ] **Step 1: Update KeyEventImageGallery.vue**

Replace the `<script setup>` section (lines 39-107):

```ts
<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { DownOutlined, CloseOutlined } from '@ant-design/icons-vue'
import type { KeyEventImage } from '@/types/billadm'
import { getImageUrl } from '@/backend/imageUrl'

const props = defineProps<{
  images: KeyEventImage[]
}>()

defineEmits<{
  (e: 'delete-image', imageId: string): void
}>()

const selectedId = ref<string>('')
const previewVisible = ref(false)

const selectedImage = computed(() =>
  props.images.find(img => img.id === selectedId.value) ?? null
)

watch(
  () => props.images,
  (imgs) => {
    if (imgs.length === 0) {
      selectedId.value = ''
      previewVisible.value = false
      return
    }
    if (!imgs.find(i => i.id === selectedId.value)) {
      selectedId.value = imgs[0]!.id
    }
  },
  { immediate: true, deep: true }
)

const thumbsRef = ref<HTMLElement | null>(null)
const showScrollHint = ref(false)

const checkOverflow = () => {
  const el = thumbsRef.value
  if (!el) return
  showScrollHint.value = el.scrollHeight > el.clientHeight + 2 && el.scrollTop + el.clientHeight < el.scrollHeight - 4
}

const onScroll = () => {
  checkOverflow()
}

watch(
  () => props.images,
  () => {
    nextTick(() => checkOverflow())
  }
)

const triggerPreview = () => {
  if (selectedImage.value) {
    previewVisible.value = true
  }
}

const onPreviewChange = (visible: boolean) => {
  previewVisible.value = visible
}
</script>
```

Update template (lines 1-37):

In the template, replace `urlCache` usage:
- Line 11: Change `props.urlCache?.get(selectedImage.id)?.full ?? selectedImage.data` to `getImageUrl(selectedImage.filePath)`
- Line 21: Change `props.urlCache?.get(img.id)?.thumb ?? img.data` to `getImageUrl(img.thumbPath)`

```html
<template>
  <div class="image-gallery">
    <div v-if="images.length === 0" class="gallery-empty">
      <span>暂无图片</span>
    </div>

    <template v-else>
      <div class="gallery-main" @click="triggerPreview">
        <a-image v-if="selectedImage" :src="getImageUrl(selectedImage.filePath)" :preview="true" width="100%" height="100%"
          style="object-fit: cover;" :preview-visible="previewVisible" @visible-change="onPreviewChange" loading="lazy" />
      </div>

      <div class="gallery-thumbs-wrap">
        <div ref="thumbsRef" class="gallery-thumbs" @scroll="onScroll">
          <div v-for="(img, index) in images" :key="img.id" class="thumb-item"
            :class="{ 'is-selected': selectedId === img.id, 'thumb-enter': true }"
            :style="{ animationDelay: `${Math.min(index * 50, 300)}ms` }" @click="selectedId = img.id">
            <img :src="getImageUrl(img.thumbPath)" class="thumb-img" alt="" loading="lazy" decoding="async" />
            <button class="thumb-delete-btn" @click.stop="$emit('delete-image', img.id)" aria-label="删除图片">
              <CloseOutlined />
            </button>
          </div>
        </div>

        <Transition name="scroll-hint">
          <div v-if="showScrollHint" class="scroll-hint-arrow">
            <DownOutlined />
          </div>
        </Transition>
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 2: Update KeyEventDetail.vue**

Remove `urlCache` prop and `ImageUrls` import. Update the props and template.

Replace lines 117-130 (props section in script):

Find the `defineProps` in KeyEventDetail.vue. The props should no longer include `urlCache`:

```ts
const props = defineProps<{
  event: KeyEvent | null
  images: KeyEventImage[]
  loading: boolean
  isSelected: boolean
  isEditing: boolean
}>()
```

And in the template, update the `KeyEventImageGallery` usage (around line 33-37):

```html
          <KeyEventImageGallery
            :images="images"
            @delete-image="(id: string) => $emit('delete-image', id)"
          />
```

Remove `:url-cache="urlCache"`.

Also remove the import of `ImageUrls` and `getImageUrls`:
```ts
// Remove this import if present:
import type { ImageUrls } from '@/backend/imageOptimizer'
```

- [ ] **Step 3: Update KeyEventView.vue**

Update the `KeyEventDetail` usage and `useImageUpload` call.

Find the `useImageUpload` call (around line 169):
```ts
// Old:
(date, data, filename, onProgress) => keyEventStore.addImage(date, data, filename, onProgress)
// New:
(date, data, onProgress) => keyEventStore.addImage(date, data, onProgress)
```

Remove `urlCache` from `KeyEventDetail` props (around line 32):
```html
        <!-- Remove :url-cache="keyEventStore.imageUrlCache" line -->
```

Find and update the `currentImages`/`imageUrlCache` references. Replace `keyEventStore.imageUrlCache` usage — since `imageUrlCache` no longer exists in the store.

- [ ] **Step 4: Verify typecheck**

```bash
cd app && npx vue-tsc -b --noEmit 2>&1 | head -50
```

- [ ] **Step 5: Commit**

```bash
git add app/src/components/key_event_view/KeyEventImageGallery.vue app/src/components/key_event_view/KeyEventDetail.vue app/src/components/key_event_view/KeyEventView.vue
git commit -m "feat: update components for file-based image URLs"
```

---

### Task 13: Frontend final verification

- [ ] **Step 1: Run TypeScript type check**

```bash
cd app && npx vue-tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 2: Fix any remaining type errors**

If there are remaining type errors (e.g., from other files referencing `imageUrlCache`, `ImageUrls`, etc.), fix them. Search for remaining references:

```bash
cd app && rg "imageUrlCache|ImageUrls|imageOptimizer|\.data\b.*KeyEventImage|\.filename\b.*KeyEventImage" src/ --include="*.ts" --include="*.vue"
```

Fix any remaining references.

- [ ] **Step 3: Commit (if fixes made)**

```bash
git add -A && git commit -m "fix: remaining type errors for file storage migration"
```

---

### Task 14: Final integration verification

- [ ] **Step 1: Full Go build**

```bash
cd kernel && go build -o billadm.exe .
```

Expected: builds successfully.

- [ ] **Step 2: Go tests**

```bash
cd kernel && go test ./...
```

Expected: all tests pass.

- [ ] **Step 3: Go vet**

```bash
cd kernel && go vet ./...
```

Expected: no issues.

- [ ] **Step 4: Frontend type-check**

```bash
cd app && npx vue-tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit tag**

```bash
git add -A && git commit -m "chore: final verification for key event image file storage"
```
