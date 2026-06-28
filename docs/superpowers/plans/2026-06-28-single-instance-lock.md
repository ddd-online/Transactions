# 单实例锁 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Electron 主进程启动时抢占单实例锁，防止同一台电脑运行多个程序实例。

**Architecture:** 使用 Electron 原生 API `app.requestSingleInstanceLock()` 实现。在 `app.whenReady()` 之前抢占锁，若失败则第二个实例静默退出。首个实例监听 `second-instance` 事件，收到后将已有窗口恢复并聚焦。

**Tech Stack:** Electron (主进程), Node.js

## Global Constraints

- 修改仅限 `electron/src/main.js`，不动其他文件
- 第二个实例静默退出，不弹窗提示
- 锁随进程退出自动释放，不写 PID 文件
- 不影响现有内核启动、IPC 注册、窗口创建逻辑

---

### Task 1: 添加单实例锁和 second-instance 聚焦逻辑

**Files:**
- Modify: `electron/src/main.js`

**Interfaces:**
- Consumes: `app` (Electron app 模块), `mainWindow`, `initWindow` (已有窗口变量)
- Produces: 无新增导出，行为级变更

---

- [ ] **Step 1: 在 `app.whenReady()` 之前插入单实例锁检查**

打开 `electron/src/main.js`，在 `app.whenReady().then(() => {` 这行**之前**插入以下代码：

```js
// 单实例锁：确保同一台电脑只能运行一个程序实例
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
    return;
}
```

插入位置说明：当前文件第 224 行 `app.whenReady().then(() => {` 之前。插入后 `app.whenReady()` 块前会多出这 6 行代码。

---

- [ ] **Step 2: 在 `registerCommonHandlers()` 定义之后插入 `second-instance` 事件监听**

打开 `electron/src/main.js`，在 `registerCommonHandlers` 函数定义结束的 `};` 之后（约第 151 行），`let mainWindow = null;` 之前（约第 153 行），插入以下代码：

```js
app.on('second-instance', () => {
    const win = mainWindow || initWindow;
    if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
    }
});
```

插入后 `registerCommonHandlers` 和 `mainWindow` 声明之间会多出这 7 行代码。

---

- [ ] **Step 3: 验证代码语法正确**

运行 Node.js 语法检查（仅检查语法，不实际执行 Electron）：

```bash
cd electron/src && node --check main.js
```

预期输出：无输出（语法正确则静默通过）。

---

- [ ] **Step 4: 验证完整文件结构**

重新读取 `electron/src/main.js`，确认：
- 第 1-5 行：原有 `require` 语句不变
- 新增锁检查代码出现在 `app.whenReady()` 之前
- 新增 `second-instance` 事件监听出现在 `registerCommonHandlers` 和 `mainWindow` 声明之间
- `app.whenReady()` 及其内部逻辑完整保留

---

- [ ] **Step 5: 手动验证功能（推荐在 Windows 上执行）**

由于这是 Electron 主进程 API，单元测试不适用。通过以下步骤手动验证：

```bash
# 终端 1：启动应用
cd electron && npm start

# 终端 2：尝试启动第二个实例
cd electron && npm start
```

**预期行为：**
1. 首个实例正常启动，显示主窗口
2. 第二个实例静默退出（进程立即结束，无窗口弹出）
3. 首个实例的窗口被聚焦到前台

---

- [ ] **Step 6: 提交**

```bash
git add electron/src/main.js
git commit -m "feat: 添加单实例锁 — 防止重复启动程序"
```

---

## 实现后完整代码参考

修改后的 `electron/src/main.js` 关键区域如下：

```js
// ... 顶部 require 保持不变 ...

// ═══ 单实例锁 ═══ (新增)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
    return;
}

// ... 原有变量声明 (API_PORT, getUiServer, log, transactionsCfg, ...) 保持不变 ...

// ... registerCommonHandlers() 函数保持不变 ...

// ═══ second-instance 事件 (新增)
app.on('second-instance', () => {
    const win = mainWindow || initWindow;
    if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
    }
});

let mainWindow = null;
// ... 其余代码保持不变 ...
```
