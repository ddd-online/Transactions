/** 外壳命令的返回形状（图标 / 代理探测 / 保存文件 / DevTools）。 */

export interface ProxyDetectResponse {
  url: string
  source: string
  pac: boolean
  message: string
}

export interface FileSaveResponse {
  success: boolean
  canceled?: boolean
  error?: string
}
