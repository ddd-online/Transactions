/** 事件名清单：主进程与渲染进程共用，禁止在别处写字符串字面量。 */
export const WORKSPACE_CHANGED = 'workspace-changed'
export const WINDOW_STATE_CHANGED = 'window-state-changed'
export const DEVTOOLS_STATE_CHANGED = 'devtools:state-changed'
export const UPDATE_DOWNLOAD_PROGRESS = 'update:download-progress'
export const UPDATE_DOWNLOAD_COMPLETE = 'update:download-complete'
export const UPDATE_DOWNLOAD_ERROR = 'update:download-error'
export const IMPORT_PROGRESS = 'import:progress'

export const ALL = [
  WORKSPACE_CHANGED,
  WINDOW_STATE_CHANGED,
  DEVTOOLS_STATE_CHANGED,
  UPDATE_DOWNLOAD_PROGRESS,
  UPDATE_DOWNLOAD_COMPLETE,
  UPDATE_DOWNLOAD_ERROR,
  IMPORT_PROGRESS,
] as const
