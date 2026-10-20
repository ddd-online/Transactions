import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace } from '../../electron/db'
import {
  addImage,
  deleteImage,
  deleteKeyEventByDate,
  listImages,
  queryDatesByYear,
  queryKeyEventByDate,
  queryKeyEventsByYear,
  upsertKeyEvent,
} from '../../electron/services/key-event'
import { assetsRoot } from '../../electron/services/assets'
import { AppError } from '../../shared/errors'

const directories: string[] = []

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-key-event-test-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const JPEG_1X1 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]).toString('base64')
const PNG_URI = `data:image/png;base64,${PNG_1X1}`
const JPEG_URI = `data:image/jpeg;base64,${JPEG_1X1}`

describe('key event service', () => {
  it('upserts, truncates the title by code point, and keeps the original id', () => {
    const workspace = openWorkspace(workspaceDirectory())
    upsertKeyEvent(workspace.db, 'l1', '2026-01-01', '中'.repeat(300), '正文', 'red')
    const first = queryKeyEventByDate(workspace.db, 'l1', '2026-01-01')
    expect(Array.from(first.title)).toHaveLength(200)
    expect(first.content).toBe('正文')
    expect(first.color).toBe('red')

    upsertKeyEvent(workspace.db, 'l1', '2026-01-01', '新标题', '新正文', 'blue')
    const second = queryKeyEventByDate(workspace.db, 'l1', '2026-01-01')
    expect(second.id).toBe(first.id)
    expect(second.createdAt).toBe(first.createdAt)
    expect(second.title).toBe('新标题')
    expect(second.content).toBe('新正文')
  })

  it('keeps ledgers and years apart', () => {
    const workspace = openWorkspace(workspaceDirectory())
    upsertKeyEvent(workspace.db, 'l1', '2026-01-01', 'A', '', '')
    upsertKeyEvent(workspace.db, 'l2', '2026-01-01', 'B', '', '')
    upsertKeyEvent(workspace.db, 'l1', '2025-12-31', 'C', '', '')

    expect(queryKeyEventsByYear(workspace.db, 'l1', '2026')).toHaveLength(1)
    expect(queryKeyEventsByYear(workspace.db, 'l1', '2025')).toHaveLength(1)
    expect(queryDatesByYear(workspace.db, 'l2', '2026')).toEqual(['2026-01-01'])
    expect(queryKeyEventByDate(workspace.db, 'l2', '2026-01-01').title).toBe('B')
  })

  it('reports a missing event as 404', () => {
    const workspace = openWorkspace(workspaceDirectory())
    try {
      queryKeyEventByDate(workspace.db, 'l1', '2026-01-01')
      throw new Error('应当抛错')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).status).toBe(404)
    }
  })

  it('adds images in sort order and deletes files with the record', () => {
    const workspace = openWorkspace(workspaceDirectory())
    upsertKeyEvent(workspace.db, 'l1', '2026-01-01', 'A', '', '')

    const first = addImage(workspace.db, workspace.directory, 'l1', '2026-01-01', PNG_URI, JPEG_URI)
    const second = addImage(workspace.db, workspace.directory, 'l1', '2026-01-01', PNG_URI, JPEG_URI)
    expect(first.sortOrder).toBe(1)
    expect(second.sortOrder).toBe(2)
    expect(listImages(workspace.db, 'l1', '2026-01-01')).toHaveLength(2)
    expect(existsSync(join(assetsRoot(workspace.directory), first.filePath))).toBe(true)

    deleteImage(workspace.db, workspace.directory, first.id)
    expect(listImages(workspace.db, 'l1', '2026-01-01')).toHaveLength(1)
    expect(existsSync(join(assetsRoot(workspace.directory), first.filePath))).toBe(false)
  })

  it('deletes the event with all image records and files', () => {
    const workspace = openWorkspace(workspaceDirectory())
    upsertKeyEvent(workspace.db, 'l1', '2026-01-01', 'A', '', '')
    const image = addImage(workspace.db, workspace.directory, 'l1', '2026-01-01', PNG_URI, JPEG_URI)
    deleteKeyEventByDate(workspace.db, workspace.directory, 'l1', '2026-01-01')
    expect(listImages(workspace.db, 'l1', '2026-01-01')).toEqual([])
    expect(existsSync(join(assetsRoot(workspace.directory), image.filePath))).toBe(false)
    expect(() => queryKeyEventByDate(workspace.db, 'l1', '2026-01-01')).toThrow(AppError)
  })
})
