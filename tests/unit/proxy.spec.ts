import { describe, expect, it } from 'vitest'

import {
  PROXY_MODE_AUTO,
  PROXY_MODE_MANUAL,
  defaultProxySetting,
  effectiveProxyMode,
  isKnownProxyMode,
  joinHttpProxy,
  manualProxy,
  manualProxyUrl,
  normalizeHttpProxy,
  parseWininetProxyServer,
  pickEnvProxy,
  splitHttpProxy,
  validatedProxySetting,
  type ProxySetting,
} from '../../shared/domain/proxy'

/**
 * 模拟配置层的 序列化 `缺省字段`：空对象 / 缺字段 → 回落到默认（auto）。
 * 真正的配置解码归外壳，这里只用来断言「缺省 = auto」这一契约。
 */
function decodeStoredProxy(raw: unknown): ProxySetting {
  const fallback = defaultProxySetting()
  if (typeof raw !== 'object' || raw === null) return fallback
  const record = raw as Record<string, unknown>
  return {
    mode: typeof record.mode === 'string' ? record.mode : fallback.mode,
    url: typeof record.url === 'string' ? record.url : fallback.url,
  }
}

describe('proxy settings', () => {
  it('default is auto and unknown mode falls back to auto', () => {
    expect(defaultProxySetting().mode).toBe(PROXY_MODE_AUTO)

    const broken: ProxySetting = { mode: 'whatever', url: 'http://127.0.0.1:7890' }
    expect(effectiveProxyMode(broken)).toBe(PROXY_MODE_AUTO)
    expect(manualProxyUrl(broken)).toBeNull()
    expect(isKnownProxyMode(broken.mode)).toBe(false)
  })

  it('normalizes bare host:port and http url', () => {
    expect(normalizeHttpProxy('127.0.0.1:7890')).toBe('http://127.0.0.1:7890')
    expect(normalizeHttpProxy('  http://127.0.0.1:7890/  ')).toBe('http://127.0.0.1:7890')
    expect(normalizeHttpProxy('http://user:pass@proxy.local:8080')).toBe(
      'http://user:pass@proxy.local:8080',
    )
    expect(normalizeHttpProxy('[::1]:1080')).toBe('http://[::1]:1080')
  })

  it('normalize rejects non-http scheme', () => {
    expect(() => normalizeHttpProxy('socks5://127.0.0.1:1080')).toThrow('socks5')
    expect(() => normalizeHttpProxy('https://127.0.0.1:8443')).toThrow('https')
  })

  it('normalize rejects broken values', () => {
    expect(() => normalizeHttpProxy('')).toThrow('请填写')
    expect(() => normalizeHttpProxy('127.0.0.1')).toThrow('端口')
    expect(() => normalizeHttpProxy('127.0.0.1:0')).toThrow('端口')
    expect(() => normalizeHttpProxy('127.0.0.1:70000')).toThrow('端口')
    expect(() => normalizeHttpProxy(':7890')).toThrow('主机名')
    expect(() => normalizeHttpProxy('http://127.0.0.1:78 90')).toThrow('空格')
  })

  it('manual form parts split and join back to a valid url', () => {
    // 拆：归一化过的、裸 host:port（老配置里可能存的就是它）、带认证、IPv6
    expect(splitHttpProxy('http://127.0.0.1:7890')).toEqual(['127.0.0.1', '7890'])
    expect(splitHttpProxy('127.0.0.1:7890')).toEqual(['127.0.0.1', '7890'])
    expect(splitHttpProxy('http://user:pass@proxy.local:8080')).toEqual([
      'user:pass@proxy.local',
      '8080',
    ])
    expect(splitHttpProxy('http://[::1]:1080')).toEqual(['[::1]', '1080'])
    // 缺端口 / 端口不像端口 / 空：都不猜，域名段原样留着让用户改
    expect(splitHttpProxy('http://127.0.0.1')).toEqual(['127.0.0.1', ''])
    expect(splitHttpProxy('http://127.0.0.1:78a90')).toEqual(['127.0.0.1:78a90', ''])
    expect(splitHttpProxy('   ')).toEqual(['', ''])

    // 拼：正常、两端带空格、协议带 `://`、表单空着
    expect(joinHttpProxy('http', '127.0.0.1', '7890')).toBe('http://127.0.0.1:7890')
    expect(joinHttpProxy('http://', ' 127.0.0.1 ', ' 7890 ')).toBe('http://127.0.0.1:7890')
    expect(joinHttpProxy('http', '', '')).toBe('')
    // 端口空着不加冒号（后端会说"缺少端口"），而不是替用户猜一个端口
    expect(joinHttpProxy('http', '127.0.0.1', '')).toBe('http://127.0.0.1')
    // 粘贴整条地址进「域名」框：丢掉自带 scheme，自带端口就留着
    expect(joinHttpProxy('http', 'http://127.0.0.1:7890', '')).toBe('http://127.0.0.1:7890')
    expect(joinHttpProxy('http', 'http://127.0.0.1', '7890')).toBe('http://127.0.0.1:7890')

    // 拼出来的一定过得了后端那唯一一次校验（表单不自己造文案）
    expect(normalizeHttpProxy(joinHttpProxy('http', '127.0.0.1', '7890'))).toBe(
      'http://127.0.0.1:7890',
    )
    expect(normalizeHttpProxy(joinHttpProxy('http', 'http://127.0.0.1:7890', ''))).toBe(
      'http://127.0.0.1:7890',
    )
    expect(() =>
      normalizeHttpProxy(joinHttpProxy('http', 'user:pass@proxy.local', '8080')),
    ).not.toThrow()
  })

  it('parsed wininet values pick the http entry', () => {
    expect(parseWininetProxyServer('127.0.0.1:7890')).toBe('http://127.0.0.1:7890')
    expect(
      parseWininetProxyServer('ftp=1.2.3.4:21;http=127.0.0.1:7890;https=127.0.0.1:7891'),
    ).toBe('http://127.0.0.1:7890')
    // 没有 http= 时退而用 https=
    expect(parseWininetProxyServer('https=127.0.0.1:7891')).toBe('http://127.0.0.1:7891')
    // 只有 socks= 段：不认（本版本只支持 HTTP 代理）
    expect(parseWininetProxyServer('socks=127.0.0.1:1080')).toBeNull()
    expect(parseWininetProxyServer('   ')).toBeNull()
  })

  it('env proxy prefers all then https then http', () => {
    const httpsFirst = (key: string): string | null => {
      switch (key) {
        case 'ALL_PROXY':
          return null
        case 'HTTPS_PROXY':
          return 'http://127.0.0.1:7891'
        case 'HTTP_PROXY':
          return '127.0.0.1:7890'
        default:
          return null
      }
    }
    expect(pickEnvProxy(httpsFirst)).toBe('http://127.0.0.1:7891')

    // 非 http 的取值跳过，继续看下一个
    const skipSocks = (key: string): string | null => {
      switch (key) {
        case 'ALL_PROXY':
          return 'socks5://127.0.0.1:1080'
        case 'HTTP_PROXY':
          return '127.0.0.1:7890'
        default:
          return null
      }
    }
    expect(pickEnvProxy(skipSocks)).toBe('http://127.0.0.1:7890')

    expect(pickEnvProxy(() => null)).toBeNull()
    expect(pickEnvProxy(() => '   ')).toBeNull()
    expect(pickEnvProxy(() => 'socks5://x:1')).toBeNull()
  })

  it('validated keeps url in off and auto but normalizes manual', () => {
    const manual = validatedProxySetting('manual', ' 127.0.0.1:7890 ')
    expect(manual.mode).toBe(PROXY_MODE_MANUAL)
    expect(manual.url).toBe('http://127.0.0.1:7890')
    expect(manualProxyUrl(manual)).toBe('http://127.0.0.1:7890')

    const auto = validatedProxySetting('auto', '127.0.0.1:7890')
    expect(auto.mode).toBe(PROXY_MODE_AUTO)
    expect(auto.url).toBe('127.0.0.1:7890') // auto 下地址原样保留
    expect(manualProxyUrl(auto)).toBeNull()

    expect(() => validatedProxySetting('manual', 'socks5://x:1')).toThrow('仅支持')
    expect(() => validatedProxySetting('nope', '127.0.0.1:7890')).toThrow('无效的代理模式')
  })

  it('setting roundtrips through json', () => {
    const json = JSON.stringify(manualProxy('http://127.0.0.1:7890'))
    expect(json).toBe('{"mode":"manual","url":"http://127.0.0.1:7890"}')
    const back = JSON.parse(json) as ProxySetting
    expect(back.mode).toBe(PROXY_MODE_MANUAL)
    // 缺字段 / 空对象 → 默认（auto）
    expect(decodeStoredProxy(JSON.parse('{}'))).toEqual(defaultProxySetting())
  })

  it('treats http scheme case-insensitively (ascii only)', () => {
    expect(normalizeHttpProxy('HTTP://127.0.0.1:7890')).toBe('http://127.0.0.1:7890')
    expect(normalizeHttpProxy('HtTp://127.0.0.1:7890/')).toBe('http://127.0.0.1:7890')
    expect(parseWininetProxyServer('HTTP=127.0.0.1:7890')).toBe('http://127.0.0.1:7890')
    expect(parseWininetProxyServer('HTTPS=127.0.0.1:7891')).toBe('http://127.0.0.1:7891')
  })
})
