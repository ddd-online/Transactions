import { defineConfig } from '@playwright/test'

/**
 * 并发数：默认 4，可用 TRANSACTIONS_E2E_WORKERS 覆盖（只有正整数生效，其余一律回落 4）。
 *
 * 为什么不取 CPU 核数自动：每个 worker 起的是完整 Electron（主进程 + 渲染层 + SQLite），
 * 真正的约束是内存与磁盘 I/O，不是核数 —— 按 16 核开 16 个实例只会互相抢磁盘、越跑越慢。
 * 默认值要保守到普通开发机能直接跑，想压满再用环境变量加。
 */
function workers(): number {
  const raw = process.env.TRANSACTIONS_E2E_WORKERS?.trim()
  if (!raw || !/^\d+$/.test(raw)) return 4
  const parsed = Number(raw)
  return parsed > 0 ? parsed : 4
}

export default defineConfig({
  testDir: './tests/e2e',
  // 隔离单元是**文件**，不是用例：每个 spec 自己建临时根目录 / USERPROFILE / 用户数据 /
  // 工作空间 / 对话框队列，同一个文件里的用例共享这些前提，所以文件内必须串行。
  // 改成 true 会让文件内用例并发，那不是这次要的隔离。
  fullyParallel: false,
  workers: workers(),
  // 并发争用会让冷启动、落盘断言变慢：单测与断言超时都上调一档，用来吸收排队，
  // 不是为了掩盖问题 —— 真坏了就该失败（retries 保持 0）。
  timeout: 120_000,
  expect: { timeout: 20_000 },
  // 失败即暴露：并发下的偶发失败要修那条 spec 的隔离，不靠重试糊过去。
  retries: 0,
  reporter: [['list']],
  outputDir: 'artifacts/tests/playwright',
})
