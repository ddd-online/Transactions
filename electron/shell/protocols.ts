import { readFile, realpath, open, stat } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

import { protocol } from 'electron'

import { logWarn } from '../logging'
import { contentTypeOf, isInside } from './asset-path'

export const APP_SCHEME = 'app'
export const ASSET_SCHEME = 'trasset'

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: trasset:",
  "media-src 'self' blob: trasset:",
  "font-src 'self' data:",
  "connect-src 'self' trasset:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/** 必须在 app ready 之前调用。 */
export function registerSchemesPrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
    {
      scheme: ASSET_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

function plain(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

function resolveInside(root: string, relativePath: string): string | null {
  const candidate = resolve(root, relativePath)
  if (!isInside(root, candidate)) return null
  return candidate
}

/** 注册 app://：只读服务渲染产物（生产）。 */
export function registerAppProtocol(rendererDirectory: string): void {
  const root = resolve(rendererDirectory)
  protocol.handle(APP_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const rawPath = decodeURIComponent(url.pathname)
      const relativePath = rawPath === '' || rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, '')
      const file = resolveInside(root, relativePath)
      if (!file) return plain(403, 'invalid path')

      const data = await readFile(file)
      return new Response(data, {
        status: 200,
        headers: {
          'content-type': contentTypeOf(file),
          'content-security-policy': CSP,
          'cache-control': relativePath === 'index.html' ? 'no-store' : 'public, max-age=31536000, immutable',
        },
      })
    } catch (error) {
      logWarn(`app:// 请求失败: ${String(error)}`)
      return plain(404, 'file not found')
    }
  })
}

interface ByteRange {
  start: number
  end: number
}

/**
 * 解析单段 `Range`。返回 null 表示没有（或无法解析）范围请求，按整份返回；
 * 返回 'invalid' 表示范围不可满足，按 416 处理。
 */
function parseRange(header: string | null, size: number): ByteRange | null | 'invalid' {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, rawStart, rawEnd] = match
  if (rawStart === '' && rawEnd === '') return null
  if (rawStart === '') {
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return 'invalid'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(rawStart)
  const end = rawEnd === '' ? size - 1 : Number(rawEnd)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return 'invalid'
  return { start, end: Math.min(end, size - 1) }
}

/**
 * 读文件（可选按 Range 切片）。
 *
 * `<video>` 要能拖动进度条就必须有 206 + `content-range`：实况视频、以及以后
 * 任何走 trasset:// 的媒体都靠这条路径。
 */
async function readAsset(
  file: string,
  rangeHeader: string | null,
): Promise<{ status: number; headers: Record<string, string>; body: Uint8Array<ArrayBuffer> }> {
  const info = await stat(file)
  const size = info.size
  const headers: Record<string, string> = {
    'content-type': contentTypeOf(file),
    'cache-control': 'no-store',
    'accept-ranges': 'bytes',
  }

  const range = parseRange(rangeHeader, size)
  if (range === 'invalid') {
    return { status: 416, headers: { ...headers, 'content-range': `bytes */${size}` }, body: new Uint8Array(0) }
  }
  if (!range) {
    return {
      status: 200,
      headers: { ...headers, 'content-length': String(size) },
      body: new Uint8Array(await readFile(file)),
    }
  }

  const length = range.end - range.start + 1
  const body = new Uint8Array(length)
  const handle = await open(file, 'r')
  try {
    await handle.read(body, 0, length, range.start)
  } finally {
    await handle.close()
  }
  return {
    status: 206,
    headers: {
      ...headers,
      'content-range': `bytes ${range.start}-${range.end}/${size}`,
      'content-length': String(length),
    },
    body,
  }
}

/** 注册 trasset://：只读暴露当前工作空间的 data/assets（每次请求都做真实路径校验）。 */
export function registerAssetProtocol(getAssetsDirectory: () => string | null): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    const root = getAssetsDirectory()
    if (!root) return plain(500, 'workspace not opened')

    let relativePath: string
    try {
      const url = new URL(request.url)
      relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    } catch {
      return plain(403, 'invalid file path')
    }
    if (!relativePath || relativePath.includes('\0') || relativePath.split('/').some((part) => part === '..')) {
      return plain(403, 'invalid file path')
    }

    try {
      const realRoot = await realpath(root)
      const realFile = await realpath(join(realRoot, relativePath))
      const rel = relative(realRoot, realFile)
      if (rel.length === 0 || rel === '..' || rel.startsWith(`..${sep}`) || resolve(realRoot, rel) === realRoot) {
        return plain(403, 'invalid file path')
      }
      const asset = await readAsset(realFile, request.headers.get('range'))
      return new Response(asset.body, { status: asset.status, headers: asset.headers })
    } catch {
      return plain(404, 'file not found')
    }
  })
}
