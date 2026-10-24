/** 外壳命令的返回形状（图标 / 代理探测 / 保存文件 / DevTools）。 */

export interface ProxyTestResponse {
  ok: boolean
  status: number | null
  latencyMs: number
  url: string
  message: string
}

export interface ProxyResolveResponse {
  url: string
}

export interface FileSaveResponse {
  success: boolean
  canceled?: boolean
  error?: string
}
