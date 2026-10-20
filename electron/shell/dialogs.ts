import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'

import { dialog } from 'electron'

import type { DialogOpenResponse } from '../../shared/types/config'

export interface OpenDirectoryRequest {
  title?: string
  defaultPath?: string
}

function isDirectory(path: string | undefined): path is string {
  if (!path) return false
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * 选择目录（工作空间 / 日记导入导出）。
 *
 * `TRANSACTIONS_TEST_DIALOG_DIR` 是**测试缝**：E2E 里不能去驱动系统原生文件框，
 * 生产构建不设置这个变量，走的仍是原生对话框。
 */
export async function openDirectory(request: OpenDirectoryRequest): Promise<DialogOpenResponse> {
  const override = process.env.TRANSACTIONS_TEST_DIALOG_DIR
  if (override) {
    return { canceled: false, filePaths: [override] }
  }

  const fallback = isDirectory(request.defaultPath)
    ? request.defaultPath
    : existsSync(homedir())
      ? homedir()
      : undefined

  const result = await dialog.showOpenDialog({
    title: request.title ?? '选择工作空间',
    defaultPath: fallback,
    properties: ['openDirectory', 'createDirectory'],
  })
  return {
    canceled: result.canceled,
    filePaths: result.filePaths,
  }
}
