import { isAbsolute, relative, resolve, sep } from 'node:path'

/**
 * 资产 URL 与相对路径的纯逻辑（不依赖 electron，可在单测里直接跑）。
 *
 * 安全契约：只接受**工作空间 assets 根目录内的相对路径**；解码、规范化、拒绝逃逸。
 */

export function encodeAssetPath(relativePath: string): string {
  return relativePath
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

export function assetUrl(relativePath: string): string {
  return `trasset://local/${encodeAssetPath(relativePath)}`
}

/** 把请求里的 pathname 规整成相对路径；非法输入返回 null。 */
export function normalizeAssetRequestPath(input: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(input)
  } catch {
    return null
  }

  const normalizedSeparators = decoded.replace(/\\/g, '/')
  if (normalizedSeparators.includes('\0')) return null
  if (normalizedSeparators.startsWith('/')) {
    return normalizeAssetRequestPath(normalizedSeparators.slice(1))
  }
  if (/^[A-Za-z]:/.test(normalizedSeparators)) return null

  const segments = normalizedSeparators.split('/')
  if (segments.some((segment) => segment === '..')) return null
  const cleaned = segments.filter((segment) => segment.length > 0 && segment !== '.')
  if (cleaned.length === 0) return null
  return cleaned.join('/')
}

/** 目标是否在根目录内（纯字符串判定；调用方随后仍应做 realpath 校验）。 */
export function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate))
  return rel.length > 0 && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)
}

export function contentTypeOf(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'bmp':
      return 'image/bmp'
    case 'svg':
      return 'image/svg+xml'
    case 'ico':
      return 'image/x-icon'
    case 'html':
      return 'text/html; charset=utf-8'
    case 'js':
    case 'mjs':
      return 'text/javascript; charset=utf-8'
    case 'css':
      return 'text/css; charset=utf-8'
    case 'json':
      return 'application/json; charset=utf-8'
    case 'wasm':
      return 'application/wasm'
    case 'woff2':
      return 'font/woff2'
    case 'woff':
      return 'font/woff'
    default:
      return 'application/octet-stream'
  }
}
