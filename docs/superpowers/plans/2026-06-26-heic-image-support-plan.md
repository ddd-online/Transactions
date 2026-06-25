# HEIC 图片格式支持 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 关键事件图片上传支持 HEIC/HEIF 格式，前端使用 heic2any 自动转换为 JPEG 后存储。

**Architecture:** 仅在 `KeyEventView.vue` 的 `fileToBase64` 函数中增加 HEIC 检测和转换逻辑，其他层（store、API、后端、数据库）完全不变。使用 heic2any 在浏览器端将 HEIC 解码为 JPEG blob，再通过 FileReader 读取为 base64。

**Tech Stack:** TypeScript, Vue 3, heic2any (npm)

## Global Constraints

- 仅改前端，后端不动
- 支持 `.heic` 和 `.heif` 扩展名（大小写不敏感）
- 转换目标格式：JPEG，质量 0.92
- 上传时 `filename` 保留原始文件名（含 `.heic` 后缀）

---

### Task 1: 安装 heic2any 依赖并改造 fileToBase64

**解释：** 这是唯一的改动任务。包含依赖安装和核心逻辑修改，分为 6 个子步骤。验证方式为 TypeScript 编译检查 + Electron 运行实测。

**Files:**
- Modify: `app/src/components/key_event_view/KeyEventView.vue` — 第 149-156 行 `fileToBase64` 函数及其上方的 import 区域

**Interfaces:**
- Consumes: 无（不依赖其他任务）
- Produces: `fileToBase64(file: File): Promise<string>` — 签名不变，行为增强：HEIC 文件自动转 JPEG base64

- [ ] **Step 1: 安装 heic2any**

```bash
cd app && npm install heic2any
```

验证：`node -e "require('heic2any')"` 无报错。

- [ ] **Step 2: 添加 heic2any import**

在 `KeyEventView.vue` 的 `<script setup>` 顶部 import 区域（第 68 行之前）添加：

```typescript
import heic2any from 'heic2any'
```

完整 import 区域变为：

```typescript
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import heic2any from 'heic2any'
import type { KeyEvent, TransactionRecord } from '@/types/billadm'
```

- [ ] **Step 3: 改造 fileToBase64 函数**

将现有的 `fileToBase64` 函数（第 149-156 行）：

```typescript
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}
```

替换为：

```typescript
const HEIC_EXTENSIONS = ['.heic', '.heif']

const fileToBase64 = async (file: File): Promise<string> => {
  const isHeic = HEIC_EXTENSIONS.some(ext =>
    file.name.toLowerCase().endsWith(ext)
  )

  if (!isHeic) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('读取文件失败'))
      reader.readAsDataURL(file)
    })
  }

  try {
    const jpegBlob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92,
    }) as Blob

    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('HEIC 转换失败'))
      reader.readAsDataURL(jpegBlob)
    })
  } catch {
    throw new Error('HEIC 转换失败')
  }
}
```

**说明：** `HEIC_EXTENSIONS` 常量定义在 `fileToBase64` 上方（函数外部），与函数平级。

- [ ] **Step 4: TypeScript 编译检查**

```bash
cd app && npx vue-tsc --noEmit
```

预期：无类型错误。`heic2any` 自带 `.d.ts` 类型定义。

- [ ] **Step 5: 前端构建验证**

```bash
cd app && npm run build
```

预期：构建成功，`heic2any` 正确打包。

- [ ] **Step 6: Commit**

```bash
cd app && git add package.json package-lock.json src/components/key_event_view/KeyEventView.vue
git commit -m "feat: 关键事件图片上传支持 HEIC 格式

前端使用 heic2any 在浏览器端将 HEIC/HEIF 自动转换为 JPEG，
后端、API、数据库模型均无需改动。"
```

---

### Task 2: 运行实测（手动验证）

**解释：** 由于 FileReader 和 heic2any 都是浏览器 API，无法在单元测试中运行。需要启动应用手动测试。

**Files:** 无新建/修改

- [ ] **Step 1: 启动开发环境**

```bash
# 终端 1: 启动 Go 后端
cd kernel && go run .

# 终端 2: 启动 Vue 开发服务器
cd app && npm run dev

# 终端 3: 启动 Electron
cd electron && npm start
```

- [ ] **Step 2: 验证 HEIC 图片上传和显示**

1. 在关键事件页面选择一个日期
2. 点击添加图片，选择一个 `.heic` 文件（可从 iPhone 导出获取）
3. 确认上传成功（无错误提示）
4. 确认图片在画廊中正常显示（大图 + 缩略图）
5. 确认文件名显示正确（保留 `.heic` 后缀）

- [ ] **Step 3: 验证非 HEIC 图片不受影响（回归测试）**

1. 上传 `.jpg` 图片 → 正常显示
2. 上传 `.png` 图片 → 正常显示
3. 上传 `.heif` 图片 → 正常显示（HEIF 与 HEIC 同族格式）

- [ ] **Step 4: 验证错误处理**

1. 尝试上传损坏/空的 HEIC 文件 → 应提示"HEIC 转换失败"
2. 尝试上传无图片内容的文件 → 应提示错误

- [ ] **Step 5: 如发现问题则修复，重新验证，然后标记完成**
