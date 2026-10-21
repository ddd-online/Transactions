/**
 * 应用更新流程的**状态词表与状态机**（纯逻辑，主进程与渲染进程共用）。
 *
 * 更新器状态机。「检查 → 下载 → 安装」这条链路的状态
 * 只有一个持有者：**主进程**（只有它能做 I/O）。它推进这里的状态机、把 {@link UpdateSnapshot}
 * 发给界面；界面只渲染快照，自己不再拼状态、不再判断"失败还是最新"。因此本模块里**没有** I/O：
 * 既不知道 HTTP，也不知道文件系统。
 *
 * 与 `proxy` 同规格：词表与用户可见文案放领域层，主进程与渲染进程共用同一份，两侧不会漂移。
 * 字符串取值是**跨进程契约**（事件载荷 / 命令返回），改名即破坏既有。
 *
 * ## 状态图（合法迁移）
 *
 * ```text
 * idle ──检查开始──▶ checking ──成功且有新版──▶ available ──开始下载──▶ downloading ──完成──▶ downloaded
 *  ▲                    │                          ▲                        │
 *  │                    ├─成功且无新版─▶ no-update  │                        ├─失败─▶ failed
 *  │                    └─失败────────▶ failed ─────┘（重试 / 检查开始）      │
 *  └───────────────────────────────────────────────────取消 / 失败──────────┘
 * ```
 *
 * 读法：`checking` 只能到 `available` / `no-update` / `failed`；`downloading` 能到
 * `downloaded` / `failed` / `available`（取消）；终态 `downloaded` / `no-update` 只在
 * "重新检查"时离开；`failed` 只由"重新检查"离开。
 *
 * 规则是**宽进**的：{@link applyUpdateEvent} 接受任何事件序列，只按"当前状态允不允许"取舍 ——
 * 乱序到达的进度事件会被丢弃，幂等的重复事件不改变结果，状态因此不会倒退。
 *
 * ## 与 版的差异（表达方式，不是规则）
 *
 * * `UpdateEvent` 在 里没有 序列化 派生；这里的判别标签（`type`）是 TS 侧新增的。
 * * `applyUpdateEvent` **不可变**：的 `UpdateEvent::apply(self, &snapshot)` 消费事件并
 *   克隆快照，这里返回新快照、绝不改写入参。
 * * `Option<T>` 在快照里是 `error?: string`（`undefined` = 的 `None`，`JSON.stringify`
 *   会像 `skip_serializing_if` 一样丢掉这个键），工具函数的入参用 `string | null`。
 */

// ---------------------------------------------------------------- 状态词表

/** 还没检查过（按钮显示「检查更新」）。界面**本地**也用它表示"查不到可更新内容"。 */
export const UPDATE_STATUS_IDLE = 'idle' as const

/** 正在检查。主进程在 `update_check` 一进门就切到它。 */
export const UPDATE_STATUS_CHECKING = 'checking' as const

/** 查到了更新的版本，可以下载。 */
export const UPDATE_STATUS_AVAILABLE = 'available' as const

/** 查完了，当前已是最新；**与"检查失败"是两回事**（后者是 {@link UPDATE_STATUS_FAILED}）。 */
export const UPDATE_STATUS_NO_UPDATE = 'no-update' as const

/** 正在下载。 */
export const UPDATE_STATUS_DOWNLOADING = 'downloading' as const

/** 下载完成，安装包在 `%TEMP%` 里等着安装。 */
export const UPDATE_STATUS_DOWNLOADED = 'downloaded' as const

/** 失败：检查失败或下载失败，原因在快照的 `error` 里。 */
export const UPDATE_STATUS_FAILED = 'failed' as const

/**
 * 更新流程的状态词表。
 *
 * **序列化取值就是契约**（界面 `switch` 的分支、既有字符串比较的对象）：
 * `idle` / `checking` / `available` / `no-update` / `downloading` / `downloaded` / `failed`。
 */
export type UpdateStatus =
  | typeof UPDATE_STATUS_IDLE
  | typeof UPDATE_STATUS_CHECKING
  | typeof UPDATE_STATUS_AVAILABLE
  | typeof UPDATE_STATUS_NO_UPDATE
  | typeof UPDATE_STATUS_DOWNLOADING
  | typeof UPDATE_STATUS_DOWNLOADED
  | typeof UPDATE_STATUS_FAILED

/**
 * 全部状态（顺序与状态图一致，`idle` 是缺省值）。
 *
 * 界面遍历它渲染"每个状态都有文案"；`idle` 同时是 `缺省字段` 的兜底值。
 */
export const UPDATE_STATUSES = [
  UPDATE_STATUS_IDLE,
  UPDATE_STATUS_CHECKING,
  UPDATE_STATUS_AVAILABLE,
  UPDATE_STATUS_NO_UPDATE,
  UPDATE_STATUS_DOWNLOADING,
  UPDATE_STATUS_DOWNLOADED,
  UPDATE_STATUS_FAILED,
] as const

/** 用户主动取消时后端给出的固定文案（下载线程用它把"取消"与"真失败"分开）。 */
export const CANCELLED = 'cancelled'

// ---------------------------------------------------------------- 用户可见文案
//
// 都在这里：界面的 `switch` 与通知标题引用它们，单元测试断言"每个状态都有文案"。
// 改动即改文案契约。

/** 还没检查过时那颗按钮。 */
export const LABEL_IDLE = '检查更新'
/** 检查进行中。 */
export const LABEL_CHECKING = '正在检查更新…'
/** 已是最新版本。 */
export const LABEL_NO_UPDATE = '已是最新版本'
/** 状态兜底文案（`available` 那一档的正文由页面自己拼版本号）。 */
export const LABEL_AVAILABLE = '发现新版本'
/** 下载中的百分比之外没有额外文案（进度条 + 百分比 + 速度已经说清了）。 */
export const LABEL_DOWNLOADING = ''
/** 下载完成。 */
export const LABEL_DOWNLOADED = '下载完成'
/** 失败且后端没给原因时的兜底文案。 */
export const LABEL_FAILED = '检查失败，请稍后重试'

/** 通知标题：检查更新失败。 */
export const NOTIFY_CHECK_FAILED = '检查更新失败'
/** 通知标题：下载更新失败。 */
export const NOTIFY_DOWNLOAD_FAILED = '下载更新失败'
/** 通知标题：安装更新失败。 */
export const NOTIFY_INSTALL_FAILED = '安装更新失败'
/** 通知文案：安装包已拉起，应用即将退出。 */
export const NOTIFY_INSTALLING = '正在启动安装程序'

/**
 * 状态对应的用户可见文案（与 {@link NOTIFY_CHECK_FAILED} 等通知标题同源）。
 *
 * 单元测试遍历所有取值断言"每个状态都有文案"，因为界面的 `switch` 用它们渲染 ——
 * 漏一个就是空白分支。
 */
export function updateStatusLabel(status: UpdateStatus): string {
  switch (status) {
    case UPDATE_STATUS_IDLE:
      return LABEL_IDLE
    case UPDATE_STATUS_CHECKING:
      return LABEL_CHECKING
    case UPDATE_STATUS_AVAILABLE:
      return LABEL_AVAILABLE
    case UPDATE_STATUS_NO_UPDATE:
      return LABEL_NO_UPDATE
    case UPDATE_STATUS_DOWNLOADING:
      return LABEL_DOWNLOADING
    case UPDATE_STATUS_DOWNLOADED:
      return LABEL_DOWNLOADED
    case UPDATE_STATUS_FAILED:
      return LABEL_FAILED
  }
}

/**
 * 状态不是终态时可以离开它（重新检查 / 下载）。
 *
 * 界面据此决定按钮可不可用：下载中与已下载时不让再点「检查更新」（重复检查会把下载途中的
 * 进度冲掉）。
 */
export function allowsNewCheck(status: UpdateStatus): boolean {
  return status !== UPDATE_STATUS_DOWNLOADING && status !== UPDATE_STATUS_DOWNLOADED
}

/**
 * 是否要展示发行说明（release notes）：有更新、正在下载、下好了、失败时都保留展示。
 */
export function showsReleaseBody(status: UpdateStatus): boolean {
  return (
    status === UPDATE_STATUS_AVAILABLE ||
    status === UPDATE_STATUS_DOWNLOADING ||
    status === UPDATE_STATUS_DOWNLOADED ||
    status === UPDATE_STATUS_FAILED
  )
}

// ---------------------------------------------------------------- 数据形状

/**
 * 一次更新检查的结果（`check-finished` 事件的载荷）。
 *
 * **不是命令的返回值**：`update_check` 返回的是推进后的 {@link UpdateSnapshot}（主进程是
 * 状态机的唯一持有者）。这个形状只描述"GitHub 那边查到了什么"，字段名是跨进程契约。
 *
 * 它**不会 reject**：网络失败时它带着 `error` 字段 —— 状态机据此进 `failed`，
 * 而不是"已是最新"（`hasUpdate === false` 且没有 `error` 才是最新）。
 */
export interface UpdateInstallResponse {
  ok: boolean
  error?: string
}

export interface UpdateCheckResponse {
  hasUpdate: boolean
  latestVersion: string
  downloadUrl: string
  /** 形如 `sha256:...`（GitHub release asset 的 digest）。 */
  digest: string
  /** release notes（Markdown；按纯文本渲染）。 */
  body: string
  /** 检查失败原因（网络 / 解析问题），成功时为 `undefined`（的 `None`）。 */
  error?: string
}

/** {@link UpdateCheckResponse} 的缺省值（`UpdateCheckResponse::default()`）。 */
export function defaultUpdateCheckResponse(): UpdateCheckResponse {
  return {
    hasUpdate: false,
    latestVersion: '',
    downloadUrl: '',
    digest: '',
    body: '',
  }
}

/**
 * 界面渲染更新状态所需的**全部**信息（事件载荷与 `update_download_status` 的返回）。
 *
 * 事件从前各自只带一小块（`percent` / `filePath` / `message`），界面得把它们拼成状态 ——
 * 那份"拼"的规则正是本模块取代的东西。现在是完整快照：界面只持有"最后一次快照"。
 *
 * 字段名是跨进程契约（camelCase，与 {@link UpdateCheckResponse} 相同）。
 */
export interface UpdateSnapshot {
  /** 当前状态。 */
  status: UpdateStatus
  /** 可更新版本号（`available` / `downloading` / `downloaded` 时非空）。 */
  latestVersion: string
  /** 安装包地址（同上）。 */
  downloadUrl: string
  /** GitHub asset 的 `digest`（形如 `sha256:...`；下载时用来校验）。 */
  digest: string
  /** 发行说明（按纯文本渲染；{@link showsReleaseBody} 决定展示与否）。 */
  releaseBody: string
  /** 失败原因（`failed` 时非空，直接展示给用户）；成功时**没有这个键**（`None`）。 */
  error?: string
  /** 下载进度百分比 0..=100（`downloading` 时有效；是 `u32`，这里只保证上界 100）。 */
  percent: number
  /** 已格式化的下载速度（例如 `2.0 KB/s`；与百分比同源，界面不要再换算）。 */
  speed: string
}

/** {@link UpdateSnapshot} 的缺省值：`idle` + 空字段（`UpdateSnapshot::default()`）。 */
export function defaultUpdateSnapshot(): UpdateSnapshot {
  return {
    status: UPDATE_STATUS_IDLE,
    latestVersion: '',
    downloadUrl: '',
    digest: '',
    releaseBody: '',
    percent: 0,
    speed: '',
  }
}

/**
 * 已发现的更新（检查成功、且版本比当前新）。
 *
 * 里它没有 序列化 派生（只在本模块内部传递），所以字段名保持原样，不做 camelCase。
 */
export interface AvailableUpdate {
  version: string
  url: string
  digest: string
  body: string
}

// ---------------------------------------------------------------- 事件与状态机

/**
 * 状态机的事件：主进程与界面都只通过它推进状态。
 *
 * 事件**自带完整结果**（检查的返回、下载的成败、进度），因此不需要第二个数据源 ——
 * 界面拿到的快照永远是完整的。
 *
 * `type` 的取值是 TS 侧的判别标签（的 `UpdateEvent` 不跨进程序列化）。
 */
export type UpdateEvent =
  /** 开始检查更新。 */
  | { type: 'check-started' }
  /** 检查结束（`update_check` 的返回，成功与失败都在里面）。 */
  | { type: 'check-finished'; result: UpdateCheckResponse }
  /**
   * 主进程拒绝了这次下载请求（地址为空 / 不在白名单）。
   *
   * 这是一条**没有进度事件**的失败：落点与"下载中途失败"完全一致 —— 一个持有者、一条规则。
   * 落点保留手上的版本号与发行说明，所以用户仍看得见自己在更新什么。
   */
  | { type: 'download-rejected'; message: string }
  /** 开始下载（主进程已确认没有别的下载在跑）。 */
  | { type: 'download-started'; url: string; digest: string }
  /** 下载进度（百分比 0..=100 + 已格式化的速度串）。 */
  | { type: 'download-progress'; percent: number; speed: string }
  /** 下载完成（安装包已落盘并通过 SHA256 校验）。 */
  | { type: 'download-finished' }
  /** 下载失败（`message` 直接展示给用户）。 */
  | { type: 'download-failed'; message: string }
  /** 用户取消下载：临时文件已清理，回到可下载的状态。 */
  | { type: 'download-cancelled' }

/**
 * 按当前快照推进状态机，返回**新快照**；不允许的迁移等于**原样返回**（新对象，值不变）。
 *
 * 这是更新流程唯一的规则来源，两条纪律都体现在这里：
 *
 * * "检查失败 ≠ 已是最新"：`check-finished` 带 `error` 一律进 `failed`；
 * * "只有下载中收进度"：`downloading` 之外的进度 / 完成 / 失败事件被丢弃，状态不会倒退。
 *
 * 事件与状态的关系（与 一致，含几处"不设前置条件"的落点）：
 *
 * | 事件 | 生效条件 | 落点 |
 * |---|---|---|
 * | `check-started` | 无（任何状态都接受，含 `downloaded`） | `checking` |
 * | `check-finished` | 无 | `failed` / `available` / `no-update` |
 * | `download-started` | `url` 非空 | `downloading`（否则原样返回） |
 * | `download-progress` | 当前是 `downloading` | 只更新 `percent`（≤100）/ `speed` |
 * | `download-finished` | 当前是 `downloading` | `downloaded` + 100% |
 * | `download-failed` | 当前是 `downloading` | `failed` + `error` |
 * | `download-rejected` | 无（含"什么都不知道"的快照） | `failed` + `error`，保留版本信息 |
 * | `download-cancelled` | 无 | `available`，清掉进度与错误 |
 *
 * 入参快照不会被改写（返回的是浅拷贝）。
 */
export function applyUpdateEvent(snapshot: UpdateSnapshot, event: UpdateEvent): UpdateSnapshot {
  const next: UpdateSnapshot = { ...snapshot }
  switch (event.type) {
    case 'check-started': {
      next.status = UPDATE_STATUS_CHECKING
      next.error = undefined
      next.percent = 0
      next.speed = ''
      break
    }
    case 'check-finished': {
      const result = event.result
      next.error = result.error
      if (result.error !== undefined) {
        // ⚠ 网络失败不能落到 no-update（界面会显示"已是最新版本"）：
        next.status = UPDATE_STATUS_FAILED
        // 上一轮的"可更新"信息一并清掉：这一轮的结论是"没查成功"。
        next.latestVersion = ''
        next.downloadUrl = ''
        next.digest = ''
        next.releaseBody = result.body
      } else if (result.hasUpdate) {
        next.status = UPDATE_STATUS_AVAILABLE
        next.latestVersion = result.latestVersion
        next.downloadUrl = result.downloadUrl
        next.digest = result.digest
        next.releaseBody = result.body
      } else {
        next.status = UPDATE_STATUS_NO_UPDATE
        next.latestVersion = ''
        next.downloadUrl = ''
        next.digest = ''
        next.releaseBody = result.body
      }
      next.percent = 0
      next.speed = ''
      break
    }
    case 'download-started': {
      // 没有下载地址就不进下载态：否则界面会停在进度条上等一个永远不来的事件。
      if (event.url.length === 0) {
        return next
      }
      next.status = UPDATE_STATUS_DOWNLOADING
      next.downloadUrl = event.url
      next.digest = event.digest
      next.error = undefined
      next.percent = 0
      next.speed = ''
      break
    }
    case 'download-progress': {
      if (next.status !== UPDATE_STATUS_DOWNLOADING) {
        // 进度事件乱序/迟到（例如完成事件先到）：丢弃，状态不倒退
        return next
      }
      next.percent = Math.min(event.percent, 100)
      next.speed = event.speed
      break
    }
    case 'download-finished': {
      // 已经不在下载中（重复事件 / 取消之后迟到）→ 保持原状
      if (next.status !== UPDATE_STATUS_DOWNLOADING) {
        return next
      }
      next.status = UPDATE_STATUS_DOWNLOADED
      next.percent = 100
      next.speed = ''
      next.error = undefined
      break
    }
    case 'download-rejected': {
      next.status = UPDATE_STATUS_FAILED
      next.error = event.message
      next.percent = 0
      next.speed = ''
      break
    }
    case 'download-failed': {
      // 取消之后迟到的失败事件不该翻成 error
      if (next.status !== UPDATE_STATUS_DOWNLOADING) {
        return next
      }
      next.status = UPDATE_STATUS_FAILED
      next.error = event.message
      next.percent = 0
      next.speed = ''
      break
    }
    case 'download-cancelled': {
      next.status = UPDATE_STATUS_AVAILABLE
      next.error = undefined
      next.percent = 0
      next.speed = ''
      break
    }
  }
  return next
}

// ---------------------------------------------------------------- 快照查询

/**
 * 可下载的更新信息（`available` / `downloading` / `downloaded` 时非空）。
 *
 * 取消下载、下载失败之后要靠它回到"可更新"状态（见 {@link backToAvailable}），
 * 所以主进程在检查成功时把它记下来。
 */
export function availableInfo(snapshot: UpdateSnapshot): AvailableUpdate | null {
  if (snapshot.latestVersion.length === 0 || snapshot.downloadUrl.length === 0) return null
  return {
    version: snapshot.latestVersion,
    url: snapshot.downloadUrl,
    digest: snapshot.digest,
    body: snapshot.releaseBody,
  }
}

/**
 * 回到「发现新版本、等待下载」的依据；没有记下来的更新信息时退回缺省快照（`idle`）。
 */
export function backToAvailable(snapshot: UpdateSnapshot): UpdateSnapshot {
  const available = availableInfo(snapshot)
  if (available === null) return defaultUpdateSnapshot()
  return applyUpdateEvent(snapshot, {
    type: 'check-finished',
    result: {
      hasUpdate: true,
      latestVersion: available.version,
      downloadUrl: available.url,
      digest: available.digest,
      body: available.body,
    },
  })
}

/** 是否正处在"下载中"。 */
export function isDownloading(snapshot: UpdateSnapshot): boolean {
  return snapshot.status === UPDATE_STATUS_DOWNLOADING
}

/** 是否已经有下载好的安装包在等安装。 */
export function isDownloaded(snapshot: UpdateSnapshot): boolean {
  return snapshot.status === UPDATE_STATUS_DOWNLOADED
}

// ---------------------------------------------------------------- 纯函数（原先在主进程里）

/** `u64` 上界；超出的版本段按 `parse::<u64>()` 的失败处理（记 0）。 */
const U64_MAX = 0xffff_ffff_ffff_ffffn

/**
 * `str::parse::<u64>()`：可选一个 `+`、至少一位 ASCII 数字、不超 `u64` 上界；
 * 其它情况（空串、符号、空格、溢出）都是 `0`（对应 `unwrap_or(0)`）。
 *
 * 用 `BigInt` 而不是 `number`：`u64` 的取值超过 `Number.MAX_SAFE_INTEGER`，
 * 版本号段理论上可以写满 20 位数字，用 double 会静默改变比较结果。
 */
function parseU64Segment(text: string): bigint {
  let index = text.startsWith('+') ? 1 : 0
  if (index >= text.length) return 0n
  let value = 0n
  for (; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code < 0x30 || code > 0x39) return 0n
    value = value * 10n + BigInt(code - 0x30)
    if (value > U64_MAX) return 0n
  }
  return value
}

/** `str::trim_start_matches('v')`：剥掉**所有**前导 `v`（不是只剥一个）。 */
function trimLeadingVs(version: string): string {
  let start = 0
  while (start < version.length && version.charCodeAt(start) === 0x76) start += 1
  return version.slice(start)
}

/**
 * 版本比较（按点分段数值比较；`v` 前缀可有可无，段数不同按 0 补齐）。
 *
 * 留在领域层而不是外壳：它是"要不要提示有更新"的判据，是最该能被断言的一段。
 */
export function isNewerVersion(latest: string, current: string): boolean {
  const toParts = (version: string): bigint[] =>
    trimLeadingVs(version)
      .split('.')
      .map(parseU64Segment)

  const latestParts = toParts(latest)
  const currentParts = toParts(current)
  const length = Math.max(latestParts.length, currentParts.length)
  for (let index = 0; index < length; index += 1) {
    const left = index < latestParts.length ? latestParts[index] : 0n
    const right = index < currentParts.length ? currentParts[index] : 0n
    if (left > right) return true
    if (left < right) return false
  }
  return false
}

/** `str::to_ascii_lowercase`：只折叠 ASCII 大小写，非 ASCII 原样保留。 */
function asciiLowercase(value: string): string {
  let result = ''
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    result += String.fromCharCode(code >= 0x41 && code <= 0x5a ? code + 0x20 : code)
  }
  return result
}

/**
 * 规范化 GitHub 的 `digest` 字段：`sha256:ABCD…` → 小写十六进制串。
 * 缺失、空串或只有前缀时返回 `null`，表示**跳过校验**。
 *
 * 与 `trim_start_matches("sha256:")` 一致：前缀会被**反复**剥掉
 *（`sha256:sha256:AB` → `ab`），且前缀本身大小写敏感（`SHA256:AB` → `sha256:ab`）。
 */
export function normalizeDigest(digest: string | null): string | null {
  if (digest === null) return null
  let value = digest
  while (value.startsWith('sha256:')) value = value.slice('sha256:'.length)
  const normalized = asciiLowercase(value)
  return normalized.length === 0 ? null : normalized
}

/** 下载完成后是否需要放行：没有 digest 就放行，有就必须逐字符相等（忽略大小写与前缀）。 */
export function digestMatches(expected: string | null, actualHex: string): boolean {
  const normalized = normalizeDigest(expected)
  if (normalized === null) return true
  return normalized === asciiLowercase(actualHex)
}

// ---------------------------------------------------------------- 速度格式化

const KIB = 1024
const MIB = 1_048_576

/** `f64::round`：四舍五入、远离零。JS `Math.round` 对负数半值朝 +∞，不能直接用。 */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/** `format!("{value}")` 的 `-0` 表现（JS 的 `String(-0)` 会吞掉负号）。 */
function formatF64(value: number): string {
  return Object.is(value, -0) ? '-0' : String(value)
}

/**
 * `format!("{value:.1}")`：保留一位小数、**四舍六入五成双**（ties-to-even）。
 *
 * JS 的 `toFixed` 对半值远离零（`(1.25).toFixed(1) === "1.3"`，是 `1.2`），
 * 所以半值单独按偶数位取。这里的入参都 ≥ 1（KB/s、MB/s 两档），
 * 而能构成十进制半值的只可能是 `x.25` / `x.75` 这类二进制精确值，`×4` 判断可靠。
 */
function formatFixedOne(value: number): string {
  const magnitude = Math.abs(value)
  if (Number.isInteger(magnitude * 4) && !Number.isInteger(magnitude * 2)) {
    const floor = Math.floor(magnitude * 10)
    const even = floor % 2 === 0 ? floor : floor + 1
    const text = `${Math.trunc(even / 10)}.${even % 10}`
    return value < 0 ? `-${text}` : text
  }
  return value.toFixed(1)
}

/**
 * 速度格式化（按 1024 进制给出 B/s、KB/s、MB/s）。
 *
 * 展示契约：界面**直接显示**这个串，不再换算，所以它算用户可见文案。
 *
 * 与 的已知差异只在极端值：`{:.1}` 对 ±∞ 输出 `inf` / `-inf`，`toFixed` 输出
 * `Infinity` / `-Infinity`；`{}` 对 ≥ 1e21 的整数输出完整数字，JS 会转成 `1e+21`。
 * 下载速度不会落在这些区间。
 */
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond >= MIB) {
    return `${formatFixedOne(bytesPerSecond / MIB)} MB/s`
  }
  if (bytesPerSecond >= KIB) {
    return `${formatFixedOne(bytesPerSecond / KIB)} KB/s`
  }
  return `${formatF64(roundHalfAwayFromZero(bytesPerSecond))} B/s`
}

