/**
 * 代理设置（目前只支持 **HTTP 代理**）。
 *
 * 三态：
 * * `off` —— 不使用代理（**显式**禁用，连环境变量代理也不读）；
 * * `auto` —— 自动探测：环境变量 → Windows「Internet 选项」→ 直连（见外壳侧的探测实现）；
 * * `manual` —— 手动 `http://host:port`（可带 `user:pass@`，请求层会做 Basic 认证）。
 *
 * 自动探测只读环境变量与系统「Internet 选项」里的静态代理值；**不解析 PAC 自动配置脚本**
 *（`AutoConfigURL` 只作为提示上报，不解析）。
 *
 * 本模块只放**纯逻辑**（归一化 / 校验 / 解析），探测与网络都不在这里：
 * 这样界面能在发请求前先本地校验，主进程也能复用同一套文案，两侧不会漂移。
 * 错误 `message` **直接展示给用户**，改动即破坏文案契约。
 */

/** 不使用代理。 */
export const PROXY_MODE_OFF = 'off' as const
/** 自动探测（环境变量 → 系统代理 → 直连）。 */
export const PROXY_MODE_AUTO = 'auto' as const
/** 手动指定 HTTP 代理。 */
export const PROXY_MODE_MANUAL = 'manual' as const
/** 手动代理支持的协议：**目前只有它**（界面「协议」下拉框里就这一项）。 */
export const PROXY_SCHEME_HTTP = 'http' as const

/** 三种已知模式之一。 */
export type ProxyMode = typeof PROXY_MODE_OFF | typeof PROXY_MODE_AUTO | typeof PROXY_MODE_MANUAL

/**
 * 代理设置（`~/.transactions.json` 的 `proxy` 键；字段名是配置契约，不可改）。
 *
 * 缺省 / 旧配置里没有 `proxy` 键时 = {@link defaultProxySetting}（自动探测）。
 */
export interface ProxySetting {
  /** `off` / `auto` / `manual`；未知取值按 `auto` 处理（见 {@link effectiveProxyMode}）。 */
  mode: string
  /** 手动模式下的地址；`off` / `auto` 下也原样保留，切回手动时不必重打。 */
  url: string
}

/**
 * 缺省 = **自动探测**（旧配置里没有 `proxy` 键时也是它）：本机有代理就跟着走。
 */
export function defaultProxySetting(): ProxySetting {
  return { mode: PROXY_MODE_AUTO, url: '' }
}

/** 手动模式 + 已归一化的地址。 */
export function manualProxy(url: string): ProxySetting {
  return { mode: PROXY_MODE_MANUAL, url }
}

/** 模式是否是已知取值（未知取值一律按 `auto` 处理，见 {@link effectiveProxyMode}）。 */
export function isKnownProxyMode(mode: string): boolean {
  return mode === PROXY_MODE_OFF || mode === PROXY_MODE_AUTO || mode === PROXY_MODE_MANUAL
}

/** 实际生效的模式：手改配置写进未知值时回退到 `auto`（不抛错、不崩溃）。 */
export function effectiveProxyMode(setting: ProxySetting): ProxyMode {
  switch (setting.mode) {
    case PROXY_MODE_OFF:
      return PROXY_MODE_OFF
    case PROXY_MODE_MANUAL:
      return PROXY_MODE_MANUAL
    default:
      return PROXY_MODE_AUTO
  }
}

/**
 * 手动模式下**可用**的代理地址；其它模式、或值非法时都是 `null`（非法值不报错，按未配置处理）。
 */
export function manualProxyUrl(setting: ProxySetting): string | null {
  if (effectiveProxyMode(setting) !== PROXY_MODE_MANUAL) return null
  return normalizeProxyOrNull(setting.url)
}

/**
 * 校验界面 / 配置传来的 (mode, url)，返回可落盘的设置。抛出的 `Error.message` 是给用户看的文案。
 *
 * `off` / `auto` 下**原样保留** `url`：用户切回手动时地址还在，不必重打一遍。
 */
export function validatedProxySetting(mode: string, url: string): ProxySetting {
  if (!isKnownProxyMode(mode)) throw new Error(`无效的代理模式：${mode}`)
  if (mode === PROXY_MODE_MANUAL) return manualProxy(normalizeHttpProxy(url))
  return { mode, url: rustTrim(url) }
}

/**
 * 归一化一个 HTTP 代理地址：接受 `host:port` 与 `http://[user:pass@]host:port`。
 *
 * 只认 `http://`：`https://`（HTTPS 代理）与 `socks*://` 明确拒绝并说明原因，
 * 而不是静默当成 http —— 那样连不上时用户无从判断。
 */
export function normalizeHttpProxy(raw: string): string {
  const trimmed = rustTrim(raw)
  if (trimmed.length === 0) {
    throw new Error('请填写代理地址（形如 http://127.0.0.1:7890）')
  }

  // scheme：有就校验，没有就按 http 处理（请求层的默认行为一致）
  const schemeEnd = trimmed.indexOf('://')
  let authority: string
  if (schemeEnd >= 0) {
    const scheme = trimmed.slice(0, schemeEnd)
    if (!asciiEqualsIgnoreCase(scheme, PROXY_SCHEME_HTTP)) {
      throw new Error(`仅支持 http:// 代理，暂不支持 ${scheme}://（如需请手动填写本机转发端口）`)
    }
    authority = trimmed.slice(schemeEnd + 3)
  } else {
    authority = trimmed
  }

  // 路径 / 查询串没有意义，直接截掉（`http://host:8080/` 很常见）
  authority = rustTrim(authority.split(/[/?#]/)[0])
  if (authority.length === 0) {
    throw new Error('代理地址缺少主机名')
  }
  if (containsWhitespace(authority)) {
    throw new Error('代理地址含空格，请检查')
  }

  // 端口：从右往左找最后一个 `:`（IPv6 的 `[::1]:8080` 也能正确切分）
  const colon = authority.lastIndexOf(':')
  if (colon < 0) {
    throw new Error('代理地址缺少端口（形如 http://127.0.0.1:7890）')
  }
  const host = authority.slice(0, colon)
  const port = parsePort(authority.slice(colon + 1))
  if (host.length === 0) {
    throw new Error('代理地址缺少主机名')
  }
  if (port === null || port === 0) {
    throw new Error('代理端口无效（应为 1-65535 的数字）')
  }

  return `http://${host}:${port}`
}

/**
 * 手动地址 → 表单的「域名 / 端口」两段（协议恒为 `http`，不在这里返回）。
 *
 * 只做**形状**上的拆分，不做校验：拆不出来就返回空串（或整段），让表单留空 / 原样显示 ——
 * 唯一的判据仍是 {@link normalizeHttpProxy}，它给出用户看到的文案。表单不是第二个校验入口。
 * 「域名」段保留 `user:pass@` 与 IPv6 的方括号，原样带回 {@link joinHttpProxy}。
 */
export function splitHttpProxy(raw: string): [string, string] {
  const trimmed = rustTrim(raw)
  const schemeEnd = trimmed.indexOf('://')
  const withoutScheme = schemeEnd >= 0 ? trimmed.slice(schemeEnd + 3) : trimmed
  // 路径 / 查询串没有意义（老配置里可能是 `http://host:8080/`）
  const authority = rustTrim(withoutScheme.split(/[/?#]/)[0])
  if (authority.length === 0) return ['', '']

  // 从右往左找最后一个冒号（`[::1]:8080` 也切得对）；端口不像端口就整段当域名，
  // 别在这里猜 —— 用户还能看见自己填的东西，后端会说明哪里不对。
  const colon = authority.lastIndexOf(':')
  if (colon >= 0) {
    const host = authority.slice(0, colon)
    const port = authority.slice(colon + 1)
    if (host.length > 0 && port.length > 0 && /^[0-9]+$/.test(port)) return [host, port]
  }
  return [authority, '']
}

/**
 * 表单的「协议 / 域名 / 端口」→ 一条 `scheme://host:port`（仍由 {@link normalizeHttpProxy} 校验）。
 *
 * 宽容之处只有一处：往「域名」框里**粘贴整条地址**是常见操作，所以丢掉它自带的
 * `scheme://` 前缀；它若自带端口而端口框空着，就原样带下去（拼出来还是 `host:port`，后端认得）。
 * 其余一律照抄：端口空着就**不加冒号**，让后端说"缺少端口"，而不是这里替他猜一个 80。
 */
export function joinHttpProxy(scheme: string, host: string, port: string): string {
  const schemeText = trimEndMatches(rustTrim(scheme), '://')
  const rawHost = rustTrim(host)
  const schemeInHost = rawHost.indexOf('://')
  const hostText = rustTrim(schemeInHost >= 0 ? rawHost.slice(schemeInHost + 3) : rawHost)
  const portText = rustTrim(port)
  if (hostText.length === 0 && portText.length === 0) {
    // 表单空着：交给后端说「请填写代理地址（形如 http://127.0.0.1:7890）」
    return ''
  }
  if (portText.length === 0) return `${schemeText}://${hostText}`
  return `${schemeText}://${hostText}:${portText}`
}

/**
 * 解析 Windows「Internet 选项」里的 `ProxyServer` 值。
 *
 * 该值有两种形态：裸 `host:port`，或 `http=host:port;https=host:port;ftp=…;socks=…`。
 * 只取 `http=` 段（退而取 `https=` 段）；`socks=` 段**不认**（本版本只支持 HTTP 代理）。
 */
export function parseWininetProxyServer(raw: string): string | null {
  const trimmed = rustTrim(raw)
  if (trimmed.length === 0) return null
  if (!trimmed.includes('=')) return normalizeProxyOrNull(trimmed)

  let fallback: string | null = null
  for (const part of trimmed.split(';')) {
    const equals = part.indexOf('=')
    if (equals < 0) continue
    const scheme = rustTrim(part.slice(0, equals))
    const value = rustTrim(part.slice(equals + 1))
    if (asciiEqualsIgnoreCase(scheme, PROXY_SCHEME_HTTP)) {
      const url = normalizeProxyOrNull(value)
      if (url !== null) return url
    } else if (asciiEqualsIgnoreCase(scheme, 'https') && fallback === null) {
      fallback = normalizeProxyOrNull(value)
    }
  }
  return fallback
}

/**
 * 从环境变量里挑代理：顺序与 ureq 的 `Proxy::try_from_env()` **完全一致**
 * （`ALL_PROXY` → `HTTPS_PROXY` → `HTTP_PROXY`，各含小写变体），
 * 这样"界面显示的代理"与"实际生效的代理"不会各说一套。
 *
 * `lookup` 注入是为了单测不碰进程环境。
 */
export function pickEnvProxy(lookup: (key: string) => string | null): string | null {
  const keys = [
    'ALL_PROXY',
    'all_proxy',
    'HTTPS_PROXY',
    'https_proxy',
    'HTTP_PROXY',
    'http_proxy',
  ] as const

  for (const key of keys) {
    const value = lookup(key)
    if (value === null) continue
    if (rustTrim(value).length === 0) continue
    const url = normalizeProxyOrNull(value)
    if (url !== null) return url
    // 非 http 的环境变量（例如 socks5://）跳过，继续看下一个
  }
  return null
}

/**
 * Rust `char::is_whitespace`（Unicode White_Space）的精确集合。
 * JS 的 `trim()` / `\s` 少了 U+0085、多了 U+FEFF，不能直接替。
 */
function isRustWhitespaceAt(value: string, index: number): boolean {
  const code = value.charCodeAt(index)
  return (
    (code >= 0x09 && code <= 0x0d) ||
    code === 0x20 ||
    code === 0x85 ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000
  )
}

/** Rust `str::trim`：按 Unicode White_Space 裁掉两端。 */
function rustTrim(value: string): string {
  let start = 0
  let end = value.length
  while (start < end && isRustWhitespaceAt(value, start)) start += 1
  while (end > start && isRustWhitespaceAt(value, end - 1)) end -= 1
  return value.slice(start, end)
}

/** Rust `str::chars().any(char::is_whitespace)`。 */
function containsWhitespace(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (isRustWhitespaceAt(value, index)) return true
  }
  return false
}

/** Rust `str::eq_ignore_ascii_case`：只折叠 ASCII 大小写，非 ASCII 原样比较。 */
function asciiEqualsIgnoreCase(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (asciiLower(left.charCodeAt(index)) !== asciiLower(right.charCodeAt(index))) return false
  }
  return true
}

function asciiLower(code: number): number {
  return code >= 0x41 && code <= 0x5a ? code + 0x20 : code
}

/** Rust `str::trim_end_matches(pattern)`：反复剥掉结尾的 pattern。 */
function trimEndMatches(value: string, pattern: string): string {
  let result = value
  while (result.endsWith(pattern)) result = result.slice(0, result.length - pattern.length)
  return result
}

/**
 * Rust `str::parse::<u16>()`：可带一个 `+`、只认 ASCII 数字，范围 0-65535；
 * 溢出 / 空串 / 其它字符都是 `null`。
 */
function parsePort(raw: string): number | null {
  if (!/^\+?[0-9]+$/.test(raw)) return null
  const value = Number(raw)
  if (!Number.isInteger(value) || value > 65535) return null
  return value
}

/** `normalizeHttpProxy` 的 `Result::ok()` 版本：非法值静默当作"未配置"。 */
function normalizeProxyOrNull(raw: string): string | null {
  try {
    return normalizeHttpProxy(raw)
  } catch {
    return null
  }
}
