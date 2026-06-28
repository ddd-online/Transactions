# 单实例锁 设计规格

> 日期：2026-06-28 | 状态：已确认

## 目的

约束同一台电脑只能运行一个 Transactions 程序实例，防止多实例导致的数据冲突（同一 SQLite workspace 被多进程写入）和端口冲突（内核端口 28080/31943）。

## 方案

使用 Electron 原生 API `app.requestSingleInstanceLock()`，在启动时抢占互斥锁。

### 行为矩阵

| 场景 | 行为 |
|------|------|
| 首次启动 | 正常启动，持有锁 |
| 再次双击图标 | 第二个进程检测锁失败 → 立即 `quit()`；第一个进程收到 `second-instance` 事件 → 恢复并聚焦已有窗口 |
| 主窗口已打开时二次启动 | 聚焦主窗口 |
| 还在工作区选择页时二次启动 | 聚焦选择页窗口（initWindow） |
| 用户关闭所有窗口（Windows/Linux） | `window-all-closed` 触发 → 杀内核 → `app.quit()` → 锁释放 |
| 崩溃后重启 | 锁随进程死亡自动释放，无残留 |

### 锁生命周期

- **创建**：`app.requestSingleInstanceLock()` 在 `app.whenReady()` 之前调用
- **持有**：首个实例进程存活期间
- **释放**：进程退出时由操作系统自动释放（Windows 命名管道 / macOS NSDistributedNotificationCenter / Linux 套接字）
- **无残留**：不写 PID 文件，崩溃不会残留锁

## 修改范围

**仅修改一个文件**：`electron/src/main.js`

### 新增代码段 1 — 启动时抢占锁

在 `app.whenReady()` 调用之前插入：

```js
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
    return;
}
```

- 第二个实例在此处直接退出，不执行后续任何初始化（不读配置、不启内核、不建窗口）

### 新增代码段 2 — 聚焦已有窗口

在 `registerCommonHandlers()` 定义之后、`let mainWindow = null;` 附近插入：

```js
app.on('second-instance', () => {
    const win = mainWindow || initWindow;
    if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
    }
});
```

- `second-instance` 事件仅在首个实例中触发
- 优先聚焦主窗口，回退到初始化窗口
- 若窗口最小化则先恢复再聚焦

## 边界情况

- **macOS**：关闭所有窗口后进程不退（符合平台惯例），锁依然有效；Dock 点击图标触发 `activate` 事件已有处理，二次启动走 `second-instance` 聚焦
- **对现有逻辑影响**：零。不影响内核生命周期、IPC 注册、窗口创建的任何逻辑
- **Go 内核端口**：内核端口冲突不再发生（因为不会有两个 Electron 进程各自 spawn 内核）

## 不做

- 不实现文件锁 / PID 文件方案（Electron API 已足够）
- 不实现端口检测方案（不可靠）
- 不在前端渲染层做任何处理（纯主进程逻辑）
- 不添加用户可见的提示弹窗（静默处理，最佳 UX）
