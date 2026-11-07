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

export function workspaceNotOpened(): AppError {
  return new AppError('未打开工作空间', {
    code: ERR_CODE_WORKSPACE_NOT_OPENED,
    status: 500,
  })
}

/** 旧版工作空间（`tbl_billadm_*` 表结构）：数据导入已移除，只能拒绝打开。 */
export function legacyWorkspace(): AppError {
  return new AppError(
    '这是旧版工作空间（表名带 tbl_billadm_ 前缀），当前版本不再支持打开它；请新建一个工作空间',
    { code: ERR_CODE_DEFAULT, status: 409 },
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
