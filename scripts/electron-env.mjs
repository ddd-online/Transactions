/**
 * 启动 electron-vite（dev / preview），并清掉 ELECTRON_RUN_AS_NODE。
 *
 * 这台机器（以及部分 CI）把 ELECTRON_RUN_AS_NODE=1 设进了全局环境，Electron 会退化成
 * Node 直接退出，表现是“窗口一闪都没有”。Playwright 侧同样在 tests/e2e 里清了它。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

delete process.env.ELECTRON_RUN_AS_NODE

const here = dirname(fileURLToPath(import.meta.url))
const root = dirname(here)
const cli = join(root, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')

if (!existsSync(cli)) {
  console.error(`找不到 electron-vite CLI：${cli}（请先 pnpm install）`)
  process.exit(1)
}

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
})

child.on('exit', (code) => process.exit(code ?? 0))
