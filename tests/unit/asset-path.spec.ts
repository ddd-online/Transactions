import { describe, expect, it } from 'vitest'

import {
  assetUrl,
  contentTypeOf,
  isInside,
  normalizeAssetRequestPath,
} from '../../electron/shell/asset-path'

describe('asset paths', () => {
  it('builds trasset urls with percent-encoded segments', () => {
    expect(assetUrl('key_events/2026-01-01/a.jpg')).toBe(
      'trasset://local/key_events/2026-01-01/a.jpg',
    )
    expect(assetUrl('key_events/2026-01-01/图片 1.jpg')).toBe(
      'trasset://local/key_events/2026-01-01/%E5%9B%BE%E7%89%87%201.jpg',
    )
  })

  it('accepts normal relative paths', () => {
    expect(normalizeAssetRequestPath('key_events/2026-01-01/a.jpg')).toBe(
      'key_events/2026-01-01/a.jpg',
    )
    expect(normalizeAssetRequestPath('/key_events/a.jpg')).toBe('key_events/a.jpg')
    expect(normalizeAssetRequestPath('key_events/%E5%9B%BE%E7%89%87.jpg')).toBe(
      'key_events/图片.jpg',
    )
  })

  it('rejects traversal, absolute and NUL paths', () => {
    for (const raw of [
      '../../secrets.txt',
      'key_events/../../secrets.txt',
      '%2e%2e%2fsecrets.txt',
      'C:/Windows/win.ini',
      'C:\\Windows\\win.ini',
      'key_events/..%5csecrets.txt',
      'key_events/\0/a.jpg',
      '',
    ]) {
      expect(normalizeAssetRequestPath(raw), raw).toBeNull()
    }
  })

  it('checks that a candidate is inside the root', () => {
    const root = 'C:\\workspace\\data\\assets'
    expect(isInside(root, 'C:\\workspace\\data\\assets\\a\\b.jpg')).toBe(true)
    expect(isInside(root, 'C:\\workspace\\data\\assets\\..\\secret.txt')).toBe(false)
    expect(isInside(root, 'C:\\workspace\\data\\other\\a.jpg')).toBe(false)
    expect(isInside(root, root)).toBe(false)
  })

  it('maps mime types by extension', () => {
    expect(contentTypeOf('a.JPG')).toBe('image/jpeg')
    expect(contentTypeOf('a.png')).toBe('image/png')
    expect(contentTypeOf('a.webp')).toBe('image/webp')
    expect(contentTypeOf('a.wasm')).toBe('application/wasm')
    expect(contentTypeOf('a.woff2')).toBe('font/woff2')
    expect(contentTypeOf('a.txt')).toBe('application/octet-stream')
  })
})
