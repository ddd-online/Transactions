import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'

import { dialog } from 'electron'

import type { DialogOpenResponse } from '../../shared/types/config'

export interface OpenDirectoryRequest {
  title?: string
  defaultPath?: string
}

export interface OpenFileRequest {
  title?: string
  defaultPath?: string
  /** 扩展名白名单（不带点），例如 `['db']` */
  extensions?: string[]
}

function isDirectory(path: string | undefined): path is string {
  if (!path) return false
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** 原生目录框的默认起点：给的目录存在就用，否则退回主目录。 */
function directoryFallback(defaultPath: string | undefined): string | undefined {
  if (isDirectory(defaultPath)) return defaultPath
  return existsSync(homedir()) ? homedir() : undefined
}

/**
 * 选择目录（工作空间 / 日记导入导出）。
 *
 * `TRANSACTIONS_TEST_DIALOG_DIR` 是**测试缝**：E2E 里不能去驱动系统原生文件框，
 * 生产构建不设置这个变量，走的仍是原生对话框。
 */
let testDialogIndex = 0

export async function openDirectory(request: OpenDirectoryRequest): Promise<DialogOpenResponse> {
  const queue = (process.env.TRANSACTIONS_TEST_DIALOG_DIRS ?? '')
    .split('|')
    .filter(Boolean)
  if (queue.length > 0) {
    const picked = queue[Math.min(testDialogIndex, queue.length - 1)]
    testDialogIndex += 1
    return { canceled: false, filePaths: [picked] }
  }
  const override = process.env.TRANSACTIONS_TEST_DIALOG_DIR
  if (override) {
    return { canceled: false, filePaths: [override] }
  }

  const result = await dialog.showOpenDialog({
    title: request.title ?? '选择工作空间',
    defaultPath: directoryFallback(request.defaultPath),
    properties: ['openDirectory', 'createDirectory'],
  })
  return {
    canceled: result.canceled,
    filePaths: result.filePaths,
  }
}

/**
 * 选择文件（「从备份恢复…」）。
 *
 * 测试缝与目录框同构：`TRANSACTIONS_TEST_DIALOG_FILES` 是 `|` 分隔的队列（多次打开按顺序取），
 * `TRANSACTIONS_TEST_DIALOG_FILE` 是单个覆盖；生产构建两个都不设置，走原生文件框。
 */
let testFileIndex = 0

export async function openFile(request: OpenFileRequest = {}): Promise<DialogOpenResponse> {
  const queue = (process.env.TRANSACTIONS_TEST_DIALOG_FILES ?? '')
    .split('|')
    .filter(Boolean)
  if (queue.length > 0) {
    const picked = queue[Math.min(testFileIndex, queue.length - 1)]
    testFileIndex += 1
    return { canceled: false, filePaths: [picked] }
  }
  const override = process.env.TRANSACTIONS_TEST_DIALOG_FILE
  if (override) {
    return { canceled: false, filePaths: [override] }
  }

  const extensions = (request.extensions ?? []).map((extension) =>
    extension.replace(/^\./, ''),
  )
  const result = await dialog.showOpenDialog({
    title: request.title ?? '选择备份文件',
    defaultPath: directoryFallback(request.defaultPath),
    properties: ['openFile'],
    ...(extensions.length > 0
      ? { filters: [{ name: '备份文件', extensions }] }
      : {}),
  })
  return {
    canceled: result.canceled,
    filePaths: result.filePaths,
  }
}
