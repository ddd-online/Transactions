import { describe, expect, it } from 'vitest'

import {
  LABEL_AVAILABLE,
  LABEL_CHECKING,
  LABEL_DOWNLOADED,
  LABEL_DOWNLOADING,
  LABEL_FAILED,
  LABEL_IDLE,
  LABEL_NO_UPDATE,
  NOTIFY_CHECK_FAILED,
  NOTIFY_DOWNLOAD_FAILED,
  NOTIFY_INSTALLING,
  NOTIFY_INSTALL_FAILED,
  UPDATE_STATUSES,
  UPDATE_STATUS_AVAILABLE,
  UPDATE_STATUS_CHECKING,
  UPDATE_STATUS_DOWNLOADED,
  UPDATE_STATUS_DOWNLOADING,
  UPDATE_STATUS_FAILED,
  UPDATE_STATUS_IDLE,
  UPDATE_STATUS_NO_UPDATE,
  allowsNewCheck,
  applyUpdateEvent,
  availableInfo,
  backToAvailable,
  defaultUpdateCheckResponse,
  defaultUpdateSnapshot,
  digestMatches,
  formatSpeed,
  isDownloaded,
  isDownloading,
  isNewerVersion,
  normalizeDigest,
  showsReleaseBody,
  updateStatusLabel,
  type UpdateCheckResponse,
  type UpdateSnapshot,
  type UpdateStatus,
} from '../../shared/domain/update'

/** 测试里反复出现的安装包地址（与 Rust 测试里的 `x.exe` 一致）。 */
const DOWNLOAD_URL = 'https://github.com/ddd-online/Transactions/x.exe'

/** 造一份"检查成功、有新版本"的快照（状态机的起点）。 */
function available(): UpdateSnapshot {
  return applyUpdateEvent(defaultUpdateSnapshot(), {
    type: 'check-finished',
    result: {
      hasUpdate: true,
      latestVersion: '0.29.0',
      downloadUrl: DOWNLOAD_URL,
      digest: 'sha256:AB',
      body: '更新说明',
    },
  })
}

/** 下载中的快照。 */
function downloading(): UpdateSnapshot {
  return applyUpdateEvent(available(), {
    type: 'download-started',
    url: DOWNLOAD_URL,
    digest: 'sha256:AB',
  })
}

/** 一次失败检查的返回（`error` 有值 = 没查成功，而不是"已是最新"）。 */
function failedCheck(message: string): UpdateCheckResponse {
  return { ...defaultUpdateCheckResponse(), error: message }
}

/**
 * 模拟 Rust `#[serde(default)]` 的快照反序列化：缺字段回落到默认值、`error` 缺省为
 * `undefined`。真正的解码归外壳（IPC 信封），这里只用来断言"缺字段的旧载荷不会炸"。
 */
function decodeSnapshot(raw: unknown): UpdateSnapshot {
  const fallback = defaultUpdateSnapshot()
  if (typeof raw !== 'object' || raw === null) return fallback
  const record = raw as Record<string, unknown>
  return {
    status: isUpdateStatus(record.status) ? record.status : fallback.status,
    latestVersion:
      typeof record.latestVersion === 'string' ? record.latestVersion : fallback.latestVersion,
    downloadUrl:
      typeof record.downloadUrl === 'string' ? record.downloadUrl : fallback.downloadUrl,
    digest: typeof record.digest === 'string' ? record.digest : fallback.digest,
    releaseBody:
      typeof record.releaseBody === 'string' ? record.releaseBody : fallback.releaseBody,
    error: typeof record.error === 'string' ? record.error : undefined,
    percent: typeof record.percent === 'number' ? record.percent : fallback.percent,
    speed: typeof record.speed === 'string' ? record.speed : fallback.speed,
  }
}

/** 状态取值集合的运行时成员检查（serde 反序列化会拒绝词表外的词）。 */
function isUpdateStatus(value: unknown): value is UpdateStatus {
  return typeof value === 'string' && (UPDATE_STATUSES as readonly string[]).includes(value)
}

describe('update', () => {
  /**
   * 「检查失败 ≠ 已是最新」：网络失败时必须落到 `failed`，而不是 `no-update`。
   *
   * 这条规则从前住在页面的渲染函数里（`hasUpdate == false` 且有 `error`）——
   * 界面若看漏了就会把"请求超时"显示成"已是最新版本"。
   */
  it('check_failure_is_not_reported_as_up_to_date', () => {
    const failed = applyUpdateEvent(defaultUpdateSnapshot(), {
      type: 'check-finished',
      result: failedCheck('请求 GitHub API 失败: timeout'),
    })

    expect(failed.status).toBe(UPDATE_STATUS_FAILED)
    expect(failed.error).toBe('请求 GitHub API 失败: timeout')

    // 反面：真的查完了、没有新版 → no-update，且不该带 error
    const noUpdate = applyUpdateEvent(defaultUpdateSnapshot(), {
      type: 'check-finished',
      result: defaultUpdateCheckResponse(),
    })
    expect(noUpdate.status).toBe(UPDATE_STATUS_NO_UPDATE)
    expect(noUpdate.error).toBeUndefined()
  })

  /** 一次完整的"检查 → 下载 → 完成"：每一步的展示字段都要对得上。 */
  it('happy_path_walks_from_idle_to_downloaded', () => {
    const start = defaultUpdateSnapshot()
    expect(start.status).toBe(UPDATE_STATUS_IDLE)

    const checking = applyUpdateEvent(start, { type: 'check-started' })
    expect(checking.status).toBe(UPDATE_STATUS_CHECKING)
    expect(updateStatusLabel(checking.status)).toBe('正在检查更新…')

    const found = applyUpdateEvent(checking, {
      type: 'check-finished',
      result: {
        hasUpdate: true,
        latestVersion: '0.29.0',
        downloadUrl: 'https://github.com/x/y.exe',
        digest: 'sha256:AB',
        body: '更新说明',
      },
    })
    expect(found.status).toBe(UPDATE_STATUS_AVAILABLE)
    expect(found.latestVersion).toBe('0.29.0')
    expect(found.releaseBody).toBe('更新说明')

    const running = applyUpdateEvent(found, {
      type: 'download-started',
      url: 'https://github.com/x/y.exe',
      digest: 'sha256:AB',
    })
    expect(running.status).toBe(UPDATE_STATUS_DOWNLOADING)

    const midway = applyUpdateEvent(running, {
      type: 'download-progress',
      percent: 42,
      speed: '2.0 KB/s',
    })
    expect(midway.percent).toBe(42)
    expect(midway.speed).toBe('2.0 KB/s')

    const done = applyUpdateEvent(midway, { type: 'download-finished' })
    expect(done.status).toBe(UPDATE_STATUS_DOWNLOADED)
    expect(done.percent).toBe(100)
    expect(isDownloaded(done)).toBe(true)
    // 下载完成后仍带着版本信息（"重启后还能安装"依赖外壳重新问一次状态）
    expect(done.latestVersion).toBe('0.29.0')
  })

  /** 取消下载：回到「发现新版本」，且临时进度清干净。 */
  it('cancel_returns_to_available_with_clean_progress', () => {
    const running = applyUpdateEvent(downloading(), {
      type: 'download-progress',
      percent: 30,
      speed: '1.0 MB/s',
    })
    const cancelled = applyUpdateEvent(running, { type: 'download-cancelled' })

    expect(cancelled.status).toBe(UPDATE_STATUS_AVAILABLE)
    expect(cancelled.percent).toBe(0)
    expect(cancelled.speed).toBe('')
    expect(cancelled.latestVersion).toBe('0.29.0')
    expect(cancelled.downloadUrl).toBe(running.downloadUrl)
    // 可以立刻重新下载（与"取消后从头开始"一致）
    const again = applyUpdateEvent(cancelled, {
      type: 'download-started',
      url: running.downloadUrl,
      digest: running.digest,
    })
    expect(again.status).toBe(UPDATE_STATUS_DOWNLOADING)
    expect(again.percent).toBe(0)
  })

  /**
   * 进度事件与完成事件**乱序**到达（或者轮询到的旧快照随后又被事件覆盖）：
   * 结果只取决于"最后一个能生效的事件"，状态不会倒退。
   */
  it('late_progress_does_not_roll_back_a_finished_download', () => {
    const done = applyUpdateEvent(downloading(), { type: 'download-finished' })
    const late = applyUpdateEvent(done, {
      type: 'download-progress',
      percent: 90,
      speed: '9.0 MB/s',
    })

    // 迟到的进度不能把状态拉回下载中
    expect(late.status).toBe(UPDATE_STATUS_DOWNLOADED)
    // 完成后的百分比仍是 100
    expect(late.percent).toBe(100)
    expect(late.speed).toBe('')
  })

  /** 重复事件幂等：同一个事件应用两次与一次等价。 */
  it('repeated_events_are_idempotent', () => {
    const running = downloading()
    const once = applyUpdateEvent(running, {
      type: 'download-progress',
      percent: 50,
      speed: '1.5 MB/s',
    })
    const twice = applyUpdateEvent(once, {
      type: 'download-progress',
      percent: 50,
      speed: '1.5 MB/s',
    })
    expect(twice).toEqual(once)

    const done = applyUpdateEvent(once, { type: 'download-finished' })
    expect(applyUpdateEvent(done, { type: 'download-finished' })).toEqual(done)

    const failed = applyUpdateEvent(downloading(), {
      type: 'download-failed',
      message: '下载中断: broken pipe',
    })
    expect(
      applyUpdateEvent(failed, { type: 'download-failed', message: '下载中断: broken pipe' }),
    ).toEqual(failed)

    const cancelled = applyUpdateEvent(running, { type: 'download-cancelled' })
    expect(applyUpdateEvent(cancelled, { type: 'download-cancelled' })).toEqual(cancelled)
    expect(cancelled.status).toBe(UPDATE_STATUS_AVAILABLE)
  })

  /** 失败事件只在下载中生效：取消之后迟到的失败事件不能把界面翻成 error。 */
  it('failure_is_ignored_once_the_download_is_gone', () => {
    const afterCancel = applyUpdateEvent(downloading(), { type: 'download-cancelled' })
    const late = applyUpdateEvent(afterCancel, {
      type: 'download-failed',
      message: '下载中断',
    })
    expect(late.status).toBe(UPDATE_STATUS_AVAILABLE)
    expect(late.error).toBeUndefined()
  })

  /** 下载失败：留在可重试的位置（版本信息还在，"立即更新"能再点一次）。 */
  it('download_failure_keeps_the_update_retryable', () => {
    const failed = applyUpdateEvent(downloading(), {
      type: 'download-failed',
      message: '下载文件校验失败（SHA256 不匹配）',
    })

    expect(failed.status).toBe(UPDATE_STATUS_FAILED)
    expect(failed.error).toBe('下载文件校验失败（SHA256 不匹配）')
    expect(failed.percent).toBe(0)
    expect(failed.speed).toBe('')
    expect(availableInfo(failed)).toEqual({
      version: '0.29.0',
      url: DOWNLOAD_URL,
      digest: 'sha256:AB',
      body: '更新说明',
    })
  })

  /** 下载地址为空时不进"下载中"：否则界面会等一个永远不来的进度事件。 */
  it('download_started_without_a_url_stays_put', () => {
    const found = available()
    const stuck = applyUpdateEvent(found, {
      type: 'download-started',
      url: '',
      digest: '',
    })
    expect(stuck.status).toBe(UPDATE_STATUS_AVAILABLE)
  })

  /**
   * 外壳拒绝下载（地址为空 / 不在白名单）→ 落 `failed`，且**保留**手上的版本号与说明：
   * 用户还能看清自己在更新什么，也能直接再点一次（`failed` 允许重新检查 / 重试）。
   */
  it('rejected_download_request_lands_in_failed_and_keeps_what_it_knows', () => {
    const found = available()
    const rejected = applyUpdateEvent(found, {
      type: 'download-rejected',
      message: '下载地址不在白名单内',
    })
    expect(rejected.status).toBe(UPDATE_STATUS_FAILED)
    expect(rejected.error).toBe('下载地址不在白名单内')
    expect(rejected.latestVersion).toBe('0.29.0')
    expect(rejected.releaseBody).toBe(found.releaseBody)
    expect(showsReleaseBody(rejected.status)).toBe(true)

    // 连版本号都没有时同样是 `failed`：仍然可点（不是把用户丢在一个不能重试的界面里）
    const nothingKnown = applyUpdateEvent(defaultUpdateSnapshot(), {
      type: 'download-rejected',
      message: '无效的下载地址',
    })
    expect(nothingKnown.status).toBe(UPDATE_STATUS_FAILED)
    expect(allowsNewCheck(nothingKnown.status)).toBe(true)
  })

  /** 下载完成后重启进程（界面拿到的是一份新快照）：已下载的安装包仍可安装。 */
  it('a_fresh_snapshot_can_report_downloaded', () => {
    // 外壳重建快照：状态 downloaded，且版本信息还能从检查结果里补回来
    const restored: UpdateSnapshot = {
      ...available(),
      status: UPDATE_STATUS_DOWNLOADED,
      percent: 100,
    }
    expect(isDownloaded(restored)).toBe(true)
    expect(isDownloading(restored)).toBe(false)
    // 界面只看快照，不再自己判断"文件还在不在"（外壳发之前已经核对过文件）
    expect(updateStatusLabel(restored.status)).toBe('下载完成')
  })

  /** 下载中不允许再开一次检查（会把进度冲掉）；终态里 `downloaded` 也不允许。 */
  it('new_checks_are_refused_while_a_download_is_in_flight', () => {
    expect(allowsNewCheck(UPDATE_STATUS_IDLE)).toBe(true)
    expect(allowsNewCheck(UPDATE_STATUS_NO_UPDATE)).toBe(true)
    expect(allowsNewCheck(UPDATE_STATUS_FAILED)).toBe(true)
    expect(allowsNewCheck(UPDATE_STATUS_AVAILABLE)).toBe(true)
    expect(allowsNewCheck(UPDATE_STATUS_DOWNLOADING)).toBe(false)
    expect(allowsNewCheck(UPDATE_STATUS_DOWNLOADED)).toBe(false)
  })

  /**
   * 每个状态都有用户可见文案（界面 `switch` 的每个分支都靠它；`downloading` 那档
   * 正文由进度条与百分比承担、`available` 那档正文是页面拼的版本号，这两档允许是空串）。
   */
  it('every_status_has_its_own_label', () => {
    const expectedLabels: Record<UpdateStatus, string> = {
      [UPDATE_STATUS_IDLE]: LABEL_IDLE,
      [UPDATE_STATUS_CHECKING]: LABEL_CHECKING,
      [UPDATE_STATUS_AVAILABLE]: LABEL_AVAILABLE,
      [UPDATE_STATUS_NO_UPDATE]: LABEL_NO_UPDATE,
      [UPDATE_STATUS_DOWNLOADING]: LABEL_DOWNLOADING,
      [UPDATE_STATUS_DOWNLOADED]: LABEL_DOWNLOADED,
      [UPDATE_STATUS_FAILED]: LABEL_FAILED,
    }
    for (const status of UPDATE_STATUSES) {
      const label = updateStatusLabel(status)
      expect(label).toBe(expectedLabels[status])
      // 有正文的那几档不能是空串（空串 = 界面上会留一段空白）
      if (status !== UPDATE_STATUS_DOWNLOADING) {
        expect(label.length).toBeGreaterThan(0)
      }
    }
    // 按钮与通知文案不能为空
    for (const text of [
      LABEL_IDLE,
      LABEL_CHECKING,
      LABEL_NO_UPDATE,
      LABEL_AVAILABLE,
      LABEL_DOWNLOADED,
      LABEL_FAILED,
      NOTIFY_CHECK_FAILED,
      NOTIFY_DOWNLOAD_FAILED,
      NOTIFY_INSTALL_FAILED,
      NOTIFY_INSTALLING,
    ]) {
      expect(text.length).toBeGreaterThan(0)
    }
    // 三条通知各有各的名字（否则用户分不清是检查、下载还是安装挂了）
    expect(NOTIFY_CHECK_FAILED).not.toBe(NOTIFY_DOWNLOAD_FAILED)
    expect(NOTIFY_DOWNLOAD_FAILED).not.toBe(NOTIFY_INSTALL_FAILED)
    expect(NOTIFY_CHECK_FAILED).not.toBe(NOTIFY_INSTALL_FAILED)
  })

  /** 发行说明的展示条件（界面原来自己写 `matches!`，现在归状态）。 */
  it('release_notes_show_only_where_they_matter', () => {
    expect(showsReleaseBody(UPDATE_STATUS_IDLE)).toBe(false)
    expect(showsReleaseBody(UPDATE_STATUS_CHECKING)).toBe(false)
    expect(showsReleaseBody(UPDATE_STATUS_NO_UPDATE)).toBe(false)
    expect(showsReleaseBody(UPDATE_STATUS_AVAILABLE)).toBe(true)
    expect(showsReleaseBody(UPDATE_STATUS_DOWNLOADING)).toBe(true)
    expect(showsReleaseBody(UPDATE_STATUS_DOWNLOADED)).toBe(true)
    expect(showsReleaseBody(UPDATE_STATUS_FAILED)).toBe(true)
  })

  /** 状态词表就是字符串契约：`no-update` 是连字符（不是 `no_update`）。 */
  it('status_words_keep_the_documented_spelling', () => {
    const word = (status: UpdateStatus): string => JSON.stringify(status)
    expect(word(UPDATE_STATUS_IDLE)).toBe('"idle"')
    expect(word(UPDATE_STATUS_CHECKING)).toBe('"checking"')
    expect(word(UPDATE_STATUS_AVAILABLE)).toBe('"available"')
    expect(word(UPDATE_STATUS_NO_UPDATE)).toBe('"no-update"')
    expect(word(UPDATE_STATUS_DOWNLOADING)).toBe('"downloading"')
    expect(word(UPDATE_STATUS_DOWNLOADED)).toBe('"downloaded"')
    expect(word(UPDATE_STATUS_FAILED)).toBe('"failed"')
    // 缺省状态是 idle（`#[serde(default)]` 的兜底）
    expect(defaultUpdateSnapshot().status).toBe(UPDATE_STATUS_IDLE)
  })

  /** 快照的 JSON 形状是跨进程契约：字段名与"缺省值"都不能漂。 */
  it('snapshot_keeps_the_documented_wire_shape', () => {
    const snapshot = applyUpdateEvent(downloading(), {
      type: 'download-progress',
      percent: 42,
      speed: '2.0 KB/s',
    })
    const value = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>

    expect(value.status).toBe('downloading')
    expect(value.latestVersion).toBe('0.29.0')
    expect(value.downloadUrl).toBe(DOWNLOAD_URL)
    expect(value.digest).toBe('sha256:AB')
    expect(value.releaseBody).toBe('更新说明')
    expect(value.percent).toBe(42)
    expect(value.speed).toBe('2.0 KB/s')
    // 成功时不该带 error 字段（`skip_serializing_if = "Option::is_none"`）
    expect('error' in value).toBe(false)

    // 缺字段的载荷按默认值反序列化（兼容本进程 / 手写测试数据）
    const partial = decodeSnapshot(JSON.parse('{"status":"failed","error":"坏了"}'))
    expect(partial.status).toBe(UPDATE_STATUS_FAILED)
    expect(partial.error).toBe('坏了')
    expect(partial.percent).toBe(0)
    expect(partial.speed).toBe('')
  })

  it('version_comparison_orders_by_numeric_segments', () => {
    expect(isNewerVersion('0.29.0', '0.28.0')).toBe(true)
    expect(isNewerVersion('v0.29.0', '0.28.0')).toBe(true)
    expect(isNewerVersion('1.0.0', '0.28.0')).toBe(true)
    expect(isNewerVersion('0.28.1', '0.28.0')).toBe(true)
    expect(isNewerVersion('0.28.0', '0.28.0')).toBe(false)
    expect(isNewerVersion('0.1.9', '0.2.0')).toBe(false)
    // 段数不同按 0 补齐
    expect(isNewerVersion('0.28.0.1', '0.28.0')).toBe(true)
    expect(isNewerVersion('0.28', '0.28.0')).toBe(false)
  })

  /** digest 规范化：GitHub 返回大写十六进制 + `sha256:` 前缀。 */
  it('normalize_digest_strips_prefix_and_lowercases', () => {
    expect(normalizeDigest('sha256:ABCDEF')).toBe('abcdef')
    // 没有前缀也照收（按原样比较）
    expect(normalizeDigest('AbCdEf')).toBe('abcdef')
    // 缺失 / 空串 / 只有前缀 → 跳过校验
    expect(normalizeDigest(null)).toBeNull()
    expect(normalizeDigest('')).toBeNull()
    expect(normalizeDigest('sha256:')).toBeNull()
  })

  /** 校验语义：没有 digest 就放行；有就必须相等（大小写不敏感）。 */
  it('digest_matches_only_when_equal_or_absent', () => {
    expect(digestMatches(null, 'abc123')).toBe(true)
    expect(digestMatches('', 'abc123')).toBe(true)
    expect(digestMatches('sha256:ABC123', 'abc123')).toBe(true)
    expect(digestMatches('abc123', 'ABC123')).toBe(true)
    expect(digestMatches('sha256:abc123', 'abc124')).toBe(false)
    expect(digestMatches('sha256:abc123', '')).toBe(false)
  })

  /** 速度文案：界面直接展示它，所以格式是用户可见契约（例如 `2.0 KB/s`）。 */
  it('speed_formatting_is_stable', () => {
    expect(formatSpeed(512.0)).toBe('512 B/s')
    expect(formatSpeed(2048.0)).toBe('2.0 KB/s')
    expect(formatSpeed(3.0 * 1_048_576.0)).toBe('3.0 MB/s')
  })

  // ------------------------------------------------------------ 补充覆盖
  //
  // Rust 版的单测只直接断言了"允许的迁移"；下面三条把迁移表里**不生效**的分支、
  // 两个不设前置条件的事件，以及 `available_info` / `back_to_available` 的边界补上。

  /** 当前状态不允许的事件等于原样返回（宽进：不报错、不改值、不倒退）。 */
  it('events_the_current_state_does_not_allow_leave_the_snapshot_alone', () => {
    const found = available()
    expect(applyUpdateEvent(found, { type: 'download-progress', percent: 90, speed: '9.0 MB/s' })).toEqual(found)
    expect(applyUpdateEvent(found, { type: 'download-finished' })).toEqual(found)
    expect(applyUpdateEvent(found, { type: 'download-failed', message: '下载中断' })).toEqual(found)

    const done = applyUpdateEvent(downloading(), { type: 'download-finished' })
    expect(applyUpdateEvent(done, { type: 'download-finished' })).toEqual(done)
    expect(applyUpdateEvent(done, { type: 'download-progress', percent: 90, speed: '9.0 MB/s' })).toEqual(done)

    // 取消之后迟到的"完成"也不改状态（与迟到的失败同理）
    const cancelled = applyUpdateEvent(downloading(), { type: 'download-cancelled' })
    expect(applyUpdateEvent(cancelled, { type: 'download-finished' })).toEqual(cancelled)

    // `check-started` 不看当前状态：终态只能靠"重新检查"离开（按钮可用性由 allowsNewCheck 管）
    expect(applyUpdateEvent(done, { type: 'check-started' }).status).toBe(UPDATE_STATUS_CHECKING)

    // `download-cancelled` 同样不看前置条件：idle 上取消 → available（Rust 原样保留）
    const cancelledFromIdle = applyUpdateEvent(defaultUpdateSnapshot(), { type: 'download-cancelled' })
    expect(cancelledFromIdle.status).toBe(UPDATE_STATUS_AVAILABLE)
    expect(cancelledFromIdle.latestVersion).toBe('')
  })

  /** 回到"可下载"：有记下来的更新信息就重建 available，没有就退回 idle。 */
  it('back_to_available_restores_the_known_update_or_falls_back_to_idle', () => {
    const failed = applyUpdateEvent(downloading(), {
      type: 'download-failed',
      message: '下载文件校验失败（SHA256 不匹配）',
    })
    const restored = backToAvailable(failed)
    expect(restored.status).toBe(UPDATE_STATUS_AVAILABLE)
    expect(restored.latestVersion).toBe('0.29.0')
    expect(restored.downloadUrl).toBe(DOWNLOAD_URL)
    expect(restored.digest).toBe('sha256:AB')
    expect(restored.releaseBody).toBe('更新说明')
    expect(restored.error).toBeUndefined()
    expect(restored.percent).toBe(0)

    // 什么都不知道时退回缺省快照（`idle`），而不是伪造一个 available
    expect(backToAvailable(defaultUpdateSnapshot())).toEqual(defaultUpdateSnapshot())
    expect(backToAvailable({ ...defaultUpdateSnapshot(), latestVersion: '0.29.0' })).toEqual(
      defaultUpdateSnapshot(),
    )
  })

  /** 可下载信息要求版本号与地址**都**在：只记到一半不算。 */
  it('available_info_requires_both_version_and_url', () => {
    expect(availableInfo(defaultUpdateSnapshot())).toBeNull()
    expect(availableInfo({ ...available(), latestVersion: '' })).toBeNull()
    expect(availableInfo({ ...available(), downloadUrl: '' })).toBeNull()
    expect(availableInfo(available())).toEqual({
      version: '0.29.0',
      url: DOWNLOAD_URL,
      digest: 'sha256:AB',
      body: '更新说明',
    })
  })
})
