# 版本检查与自动更新 — 设计规格

> 创建于 2026-07-10 | 状态: ready

## 概述

在设置 → 关于页面增加版本检查和更新功能。进入关于页自动检查 GitHub Release 是否有新版本，有新版本时显示更新按钮，点击后在主进程后台下载安装包，底部状态栏显示下载进度，下载完成后用户手动触发安装并退出。

## 架构

```
renderer (Vue)                        main process (Electron)
                                      
AboutSetting.vue ──checkUpdate()──→   ipcMain: update:check
       ↑                              │  GET api.github.com/repos/ddd-online/Transactions/releases/latest
       │                              │  semver compare (ignore pre-release)
       │                              └──→ { hasUpdate, latestVersion, downloadUrl, body }
                                      
AboutSetting.vue ──downloadUpdate()─→ ipcMain: update:download
       │                              │  https.get → os.tmpdir()/Transactions-vX.Y.Z.exe
       │                              │  push progress events
       │  ←── update:download-progress ── { percent, downloaded, total, speed }
       │  ←── update:download-complete ── { filePath }
       │  ←── update:download-error    ── { message }
                                      
AboutSetting.vue ──installUpdate()──→ ipcMain: update:install
                                       │  shell.openPath(filePath)
                                       │  app.quit()
```

## 数据流

```
updateStore (Pinia)
  state:
    status: 'idle' | 'checking' | 'available' | 'no-update' | 'downloading' | 'downloaded' | 'error'
    latestVersion: string | null
    downloadPercent: number
    downloadSpeed: string
    errorMessage: string | null
    filePath: string | null
  actions:
    checkForUpdate()
    downloadUpdate()
    installUpdate()
    reset()

Layout.vue
  showBottomBar = route条件 OR updateStore.status === 'downloading'
  
AppBottomBar.vue
  下载中: 左侧进度条 + 右侧统计共存
  非下载中: 现有统计（无变化）

AboutSetting.vue
  idle → 不显示更新区域
  checking → "检查中..." + loading
  no-update → "已是最新版本 ✓"
  available → "vX.Y.Z 可用" + [立即更新] 按钮
  downloading → [下载中 XX%]（进度详情在状态栏）
  downloaded → "下载完成" + [安装并退出] 按钮
  error → "检查失败，请稍后重试" + [重试] 按钮
```

## 涉及文件

| 文件 | 改动 |
|------|------|
| `electron/src/main.js` | 新增 4 个 ipcMain handler：`update:check`、`update:download`、`update:cancel`、`update:install` |
| `electron/src/preload.js` | 扩展 `electronAPI`：`checkUpdate()`、`downloadUpdate()`、`cancelDownload()`、`installUpdate()`、`onDownloadProgress(cb)`、`removeDownloadListener()` |
| `app/src/types/electron.d.ts` | 新 API 类型声明 |
| `app/src/stores/updateStore.ts` | **新建** — 更新状态管理 Pinia store |
| `app/src/components/settings_view/AboutSetting.vue` | 版本号下方新增更新区域（6 态 UI） |
| `app/src/components/AppBottomBar.vue` | 下载中时左侧显示进度条 + 百分比 + 速度 |
| `app/src/components/Layout.vue` | `showBottomBar` 增加下载中条件 |

## 更新源

GitHub Releases API（公开仓库无需鉴权）：
```
GET https://api.github.com/repos/ddd-online/Transactions/releases/latest
→ { tag_name: "v0.2.0", assets: [{ browser_download_url: "..." }], body: "...", prerelease: false }
```

- 当前版本号：主进程通过 `app.getVersion()` 从 `electron/package.json` 读取
- 版本比较：去掉 tag 的 `v` 前缀后做 semver 比较（`compareVersions(latest, current) > 0`）
- 忽略 `prerelease: true` 的 Release
- Rate limit：未鉴权 60 req/hour，进关于页触发，足够

## 下载与存储

- 下载路径：`os.tmpdir()/Transactions-v{version}.exe`
- 使用 Node.js `https` 模块下载
- 每收到 data chunk 计算百分比和速度，通过 `mainWindow.webContents.send()` 推送到渲染进程
- 支持取消：主进程持有 `AbortController` 引用，`update:cancel` 触发 abort + 清理临时文件

## 安装触发

- 下载完成后不自动安装
- 关于页按钮变为"安装并退出"
- 用户点击后：`shell.openPath(filePath)` 拉起 NSIS 安装程序 → `app.quit()`
- 如果 `shell.openPath` 失败：NotificationUtil 通知，告知文件路径

## UI 状态矩阵

### 关于页 (AboutSetting.vue)

| 状态 | 显示 |
|------|------|
| idle | 不显示更新区域 |
| checking | `Spin` + "正在检查更新..." |
| no-update | 绿色勾 + "已是最新版本" |
| available | "发现新版本 vX.Y.Z" + `Button` "立即更新" + release body 摘要 |
| downloading | "下载中 XX%" + `Progress` bar |
| downloaded | 绿色提示 "下载完成" + `Button` "安装并退出" |
| error | 红色提示 "检查失败" + `Button` "重试" |

### 底部状态栏 (AppBottomBar.vue)

| 状态 | 左侧 | 右侧 |
|------|------|------|
| 非下载中 | (空) | 收入/支出/转账统计 |
| 下载中 | `Progress` + "45% · 3.2 MB/s" | 收入/支出/转账统计 |

### 底部状态栏显示逻辑 (Layout.vue)

```
showBottomBar = route 匹配 (tr_view | da_view | key_event_view) 
             || updateStore.status === 'downloading'
```

## 错误处理

| 场景 | 处理 |
|------|------|
| GitHub API 不可达 | status='error', "检查失败，请稍后重试" + 重试按钮 |
| 下载中网络断开 | status='error', 状态栏消失, 清理临时文件, 关于页按钮恢复 |
| `shell.openPath` 失败 | NotificationUtil.error("安装程序启动失败", "文件位于: {path}") |

## IPC 通道

| 通道 | 方向 | 载荷 |
|------|------|------|
| `update:check` | renderer→main | (空) → `{ hasUpdate, latestVersion, downloadUrl, body }` |
| `update:download` | renderer→main | (空) → 开始下载 |
| `update:cancel` | renderer→main | (空) → 取消下载 |
| `update:install` | renderer→main | (空) → 拉起安装程序 + 退出 |
| `update:download-progress` | main→renderer | `{ percent, downloaded, total, speed }` |
| `update:download-complete` | main→renderer | `{ filePath }` |
| `update:download-error` | main→renderer | `{ message }` |

## Preload 回调模式

主进程→渲染进程的事件通过 `ipcRenderer.on` 监听。`onDownloadProgress(cb)` 注册回调并返回取消订阅函数：

```js
// preload.js
onDownloadProgress: (cb) => {
  const handler = (event, data) => cb(data)
  ipcRenderer.on('update:download-progress', handler)
  return () => ipcRenderer.removeListener('update:download-progress', handler)
}
```

## 约束

- 仅 Windows 平台（和现有 NSIS 安装包一致）
- 不需要后台自动检查 — 只在用户进关于页时触发
- 不需要增量更新/差分包 — 全量下载
- 不需要静默安装 — NSIS 安装程序需要用户交互
- 不持久化下载进度 — 应用退出后进度重置
