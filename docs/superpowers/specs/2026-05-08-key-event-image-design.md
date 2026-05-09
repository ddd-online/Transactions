# Key Event Image Support Design

## Date
2026-05-08

## Overview

Add image attachment support to key events. Users can add multiple images per event via file selection or clipboard paste, displayed in a thumbnail grid with click-to-preview.

## Design Decisions

- **Storage**: Base64-encoded in separate SQLite table (`tbl_billadm_key_event_image`)
- **Multi-image**: Multiple images per event, ordered by `sort_order`
- **Input methods**: File picker + clipboard paste (Ctrl+V)
- **Display**: 3-column thumbnail grid, click to enlarge (Ant Design a-image preview)
- **Calendar**: No visual indicator on calendar cells for images
- **Limits**: No hard limits on file size or image count

## Data Model

### New Table: `tbl_billadm_key_event_image`

| Field | Type | Notes |
|-------|------|-------|
| `id` | VARCHAR PK | UUID |
| `event_date` | VARCHAR (indexed) | FK → `key_event.date` |
| `data` | TEXT NOT NULL | Full Base64 data (including `data:image/...;base64,` prefix) |
| `filename` | VARCHAR | Original filename |
| `sort_order` | INT | Display order within the event |
| `created_at` | INT | Unix timestamp (autoCreateTime) |

GORM auto-migrated via `kernel/util/database.go`.

## Backend

### DAO (`kernel/dao/key_event_image_dao.go` — new file)

```
InsertImage(ws, *models.KeyEventImage) error
QueryImagesByEventDate(ws, date string) ([]models.KeyEventImage, error)
DeleteImage(ws, imageId string) error
DeleteImagesByEventDate(ws, date string) error
```

### Service (`kernel/service/key_event_image_service.go` — new file)

```
AddImage(ws, date, data, filename string) (*models.KeyEventImage, error)
GetImagesByEventDate(ws, date string) ([]models.KeyEventImage, error)
DeleteImage(ws, imageId string) error
DeleteImagesByEventDate(ws, date string) error
```

- `AddImage` auto-computes `sort_order` as `current_count + 1`.

### Cascade Delete

`key_event_service.DeleteByDate` wraps in a transaction:
1. Call `imageSvc.DeleteImagesByEventDate(tx, date)`
2. Call `dao.DeleteByDate(tx, date)`

### API Endpoints

| Method | Path | Handler | Body |
|--------|------|---------|------|
| `GET` | `/api/v1/key-events/:date/images` | `listKeyEventImages` | — |
| `POST` | `/api/v1/key-events/:date/images` | `addKeyEventImage` | `{ data, filename }` |
| `DELETE` | `/api/v1/key-event-images/:id` | `deleteKeyEventImage` | — |

Response format: standard `{ code, msg, data }` envelope.

- `GET` returns `KeyEventImage[]` in `data`
- `POST` returns the new image ID in `data`
- `DELETE` returns empty `data`

### Error Handling

- Invalid/missing image data: `code: -1, msg: "invalid image data"`
- Image not found on delete: `code: -1, msg: "image not found"`
- DB errors: standard `code: -1` with error message

## Frontend

### TypeScript Types (`billadm.d.ts`)

```ts
interface KeyEventImage {
    id: string;
    eventDate: string;
    data: string;
    filename: string;
    sortOrder: number;
    createdAt: number;
}
```

### API Client (`key-event.ts`)

```
fetchKeyEventImages(date: string): Promise<KeyEventImage[]>
addKeyEventImage(date: string, data: string, filename: string): Promise<string>
deleteKeyEventImage(imageId: string): Promise<void>
```

### Store (`keyEventStore.ts`)

- State: `images: Ref<KeyEventImage[]>`
- Actions: `fetchImages(date)`, `addImage(date, data, filename)`, `deleteImage(imageId)`
- Clear `images` on modal close

### UI Layout (KeyEventView.vue — Details Tab)

Image area added below the content textarea:

```
── 图片 ──
┌──────┐ ┌──────┐ ┌──────┐
│ img1 │ │ img2 │ │ img3 │   ← 3-column thumbnail grid
└──────┘ └──────┘ └──────┘
┌────────────────────────────┐
│    点击或粘贴添加图片        │   ← dashed bordered drop zone
└────────────────────────────┘
```

### Interaction Details

- **File selection**: Click drop zone → `<input type="file" accept="image/*" multiple>`
- **Clipboard paste**: Drop zone focused + Ctrl+V → read `clipboardData.files`
- **Thumbnail**: Fixed height, `object-fit: cover`, × button on top-right corner for delete
- **Preview**: Click thumbnail → Ant Design `a-image` preview (built-in lightbox)
- **Grid**: 3 equal-width columns, auto-flow rows

### Flows

**Add image:**
1. User clicks drop zone or presses Ctrl+V
2. JS reads file, converts to Base64 via `FileReader.readAsDataURL`
3. Call `store.addImage(date, base64data, filename)`
4. On success, thumbnail appears in grid

**Delete image:**
1. User clicks × on thumbnail
2. Call `store.deleteImage(imageId)`
3. On success, thumbnail removed from grid

**View image:**
1. User clicks thumbnail
2. Ant Design `a-image` preview opens with full-size view

## File Change Summary

| File | Change |
|------|--------|
| `kernel/models/key_event.go` | Add `KeyEventImage` struct |
| `kernel/util/database.go` | Add `KeyEventImage` to AutoMigrate |
| `kernel/dao/key_event_image_dao.go` | **New** |
| `kernel/service/key_event_image_service.go` | **New** |
| `kernel/service/key_event_service.go` | Cascade delete images in `DeleteByDate` |
| `kernel/api/key_event_controller.go` | Add 3 handlers |
| `kernel/api/router.go` | Register 3 routes |
| `app/src/types/billadm.d.ts` | Add `KeyEventImage` interface |
| `app/src/backend/api/key-event.ts` | Add 3 API functions |
| `app/src/stores/keyEventStore.ts` | Add image state + 3 actions |
| `app/src/components/key_event_view/KeyEventView.vue` | Add image area in details tab |
