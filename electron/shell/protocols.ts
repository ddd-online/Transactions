import { readFile } from 'node:fs/promises'
import { realpath } from 'node:fs/promises'
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
      const data = await readFile(realFile)
      return new Response(data, {
        status: 200,
        headers: {
          'content-type': contentTypeOf(realFile),
          'cache-control': 'no-store',
        },
      })
    } catch {
      return plain(404, 'file not found')
    }
  })
}
