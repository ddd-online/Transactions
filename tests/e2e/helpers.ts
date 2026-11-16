/**
 * E2E 公共助手：启动环境、日期格式、临时 HTTP 服务。
 *
 * 这三段此前在每个 spec 里逐字复制（environment 46 份、ymd / listen 各 4 份）：
 * 只搬不改行为 —— 测试之间的隔离仍由各 spec 自己建 USERPROFILE / 工作空间 / 应用副本。
 */
import type { Server } from 'node:http'

/**
 * 继承当前进程环境并清掉 `ELECTRON_RUN_AS_NODE`。
 *
 * 本机可能全局设置了这个变量：留着它，Electron 会退化成 Node 直接退出。
 */
export function environment(overrides: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value
  }
  delete result.ELECTRON_RUN_AS_NODE
  return { ...result, ...overrides }
}

/** 本地日期 → `YYYY-MM-DD`。 */
export function ymd(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 让临时服务监听 127.0.0.1 的随机端口，返回端口号。 */
export function listen(server: Server): Promise<number> {
  return new Promise((resolveListening, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') reject(new Error('无法获取端口'))
      else resolveListening(address.port)
    })
  })
}
