import { defineConfig } from '@playwright/test'

/**
 * 并发数：默认 4，可用 TRANSACTIONS_E2E_WORKERS 覆盖（只有正整数生效，其余一律回落 4）。
 *
 * 为什么不取 CPU 核数自动：每个 worker 起的是完整 Electron（主进程 + 渲染层 + SQLite），
 * 真正的约束是内存与磁盘 I/O，不是核数 —— 按 16 核开 16 个实例只会互相抢磁盘、越跑越慢。
 * 默认值要保守到普通开发机能直接跑，想压满再用环境变量加。
 */
function resolveWorkerCount(): number {
  const raw = process.env.TRANSACTIONS_E2E_WORKERS?.trim()
  // 空串 / 非数字 / 0 / 负数都回落默认值：这些写法多半是手滑，不该把整台机器拖住。
  if (!raw || !/^\d+$/.test(raw)) return 4
  const parsed = Number(raw)
  if (parsed <= 0) return 4
  // 上限 16：防止手滑写 1000 把机器打死；要更多就改这里。
  return Math.min(16, parsed)
}

export default defineConfig({
  testDir: './tests/e2e',
  // 打包冒烟有自己的配置（playwright.packaged.config.ts，单 worker）。它跑的是安装目录里的
  // 真产物，和开发构建的实例不是一类东西，所以默认全量里根本不收集它。
  testIgnore: ['**/packaged.spec.ts'],
  // 这次只验证了**文件级**并行：一个文件一个临时根，是实测过的隔离单元。
  // 文件内逐条并发没有逐条验证过，要开需要另一轮测量，所以保持 false。
  fullyParallel: false,
  workers: resolveWorkerCount(),
  // 并发下冷启动与排队会让个别用例比串行慢一档；上调一档是给这种尾部延迟留余量，
  // 不是把慢当成好 —— 真坏了仍然失败（retries: 0）。
  timeout: 120_000,
  expect: { timeout: 20_000 },
  // 显式写出来：默认就是 0，写出来是为了让「不允许重试」这条纪律在配置里可见，
  // 别哪天被顺手调成 1。
  retries: 0,
  reporter: [['list']],
  outputDir: 'artifacts/tests/playwright',
})
