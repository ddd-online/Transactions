# ADR 0005：IPC 契约与自定义协议

## 决策

1. **命令面保留旧版 117 条命令名与请求/响应字段名**（M0 先落最小集合，M1–M3 补齐），
   减少 UI 移植时的语义漂移；失败信封仍是 `{code,msg,status}`，code `-1` / `-2`，新增 `-3`
   （旧版工作空间，需要导入）。
2. `shared/commands.ts` 是唯一命令目录：名字 + zod 请求 schema + 响应类型。main 的 router 与
   renderer 的 `window.api.invoke` 都从它取类型；禁止在别处写命令名字符串。
3. preload 只暴露 `invoke(name, req)` 与 `onEvent(cb)`；`ipcRenderer` 不进入 renderer。
4. 协议：
   - `app://` 只读服务 `out/renderer`（生产），带 CSP；开发用 `http://127.0.0.1:16000`。
   - `trasset://local/<相对路径>` 只读当前工作空间 `data/assets`；每次请求做真实路径校验，
     拒绝 `..`、绝对路径、符号链接逃逸。
   - 不监听任何端口。
5. 安全：`contextIsolation` + `sandbox` + `webSecurity`，`nodeIntegration: false`；
   `will-navigate` 只放行自身页面；`setWindowOpenHandler` 只把 GitHub 链接交给系统浏览器；
   `will-attach-webview` 拒绝；session 权限请求一律拒绝。
6. 测试缝：`TRANSACTIONS_TEST_DIALOG_DIR` / `TRANSACTIONS_TEST_CLOSE` / `TRANSACTIONS_USER_DATA`
   只在测试环境设置；生产行为走原生对话框与配置。

## 后果

- 渲染层迁移可以按旧 `api/*` 一一对照，E2E 的可访问名与文案可以复用。
- 新增命令必须同时更新 `shared/commands.ts`、`electron/ipc/commands.ts` 与测试；
  “目录 ↔ 实现”覆盖由单测守卫（M1 起）。
- `trasset` URL 与旧版 `http://trasset.localhost/...` 不同，但只在运行时生成、不持久化。
