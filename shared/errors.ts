/** 失败种类（界面按 code 分支，不比文案）。 */
export const ERR_CODE_DEFAULT = -1
export const ERR_CODE_WORKSPACE_NOT_OPENED = -2

export interface ErrorEnvelope {
  code: number
  msg: string
  status: number
}

export class AppError extends Error {
  readonly code: number
  readonly status: number

  constructor(msg: string, options?: { code?: number; status?: number }) {
    super(msg)
    this.name = 'AppError'
    this.code = options?.code ?? ERR_CODE_DEFAULT
    this.status = options?.status ?? 500
  }
}

/**
 * 「查无此行」：既有 DAO 以 **404** 表示目标不存在。
 *
 * 回滚据此区分"跳过"与真错误 —— 一条指向空气的操作记录要能被弹掉，否则它会永远卡在栈顶。
 * 这是**错误语义**（挨着错误信封），不是某条业务规则：两个 writer 与交易历史读层都从这里读。
 */
export function isNotFoundError(error: unknown): boolean {
  return error instanceof AppError && error.status === 404
}

export function workspaceNotOpened(): AppError {
  return new AppError('未打开工作空间', {
    code: ERR_CODE_WORKSPACE_NOT_OPENED,
    status: 500,
  })
}

/**
 * 失败是不是「工作空间没打开」。
 *
 * 工作空间打开失败之后，页面级的查询（例如账本列表）一定也会失败；那不是一条新的错误，
 * 调用方据此跳过它，避免用一句更笼统的话盖掉真正的失败原因（库损坏 / 目录已不存在）。
 * 与 {@link isNotFoundError} 同一个写法：错误语义只在这一处判断。
 */
export function isWorkspaceNotOpenedError(error: unknown): boolean {
  if (error instanceof AppError) return error.code === ERR_CODE_WORKSPACE_NOT_OPENED
  // 渲染层拿到的是 preload 原样抛出的 IPC 错误信封（普通对象，没有类身份），只能认 code。
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === ERR_CODE_WORKSPACE_NOT_OPENED
  )
}

/** 旧版工作空间（`tbl_billadm_*` 表结构）：数据导入已移除，只能拒绝打开。 */
export function legacyWorkspace(): AppError {
  return new AppError(
    '这是旧版工作空间（表名带 tbl_billadm_ 前缀），当前版本不再支持打开它；请新建一个工作空间',
    { code: ERR_CODE_DEFAULT, status: 409 },
  )
}

/**
 * 工作空间数据库坏了：说清是哪个文件、坏在哪，并直接指向设置里的恢复入口。
 *
 * 不自动修复、不静默建空库 —— 一句 SQLite 原文会让人以为「换个工作空间」就没事了，
 * 而这恰恰是数据最容易被再盖一次的时机。
 */
export function corruptWorkspace(databasePath: string, detail: string): AppError {
  return new AppError(
    `工作空间数据库已损坏：${databasePath}（${detail}）。请到「设置 → 数据 → 从备份恢复」用备份还原。`,
    { code: ERR_CODE_DEFAULT, status: 500 },
  )
}

export function toErrorEnvelope(error: unknown): ErrorEnvelope {
  if (error instanceof AppError) {
    return { code: error.code, msg: error.message, status: error.status }
  }
  if (error instanceof Error) {
    return { code: ERR_CODE_DEFAULT, msg: error.message, status: 500 }
  }
  return { code: ERR_CODE_DEFAULT, msg: String(error), status: 500 }
}

/**
 * 渲染层把一次 IPC 失败翻成一句话：信封里的 `msg` 优先，其次是 Error 的 message。
 *
 * 与 `toErrorEnvelope` 是同一条错误的两个方向 —— 主进程往外封、渲染层往里读；
 * 两处各写一份时，封装的形状一变就有一边开始念错东西。
 */
export function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}
