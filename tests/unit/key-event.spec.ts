import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

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
import type { PreparedEventImage } from '../../electron/services/image-import'
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

const PNG_BYTES = Buffer.from(PNG_1X1, 'base64')
const JPEG_BYTES = Buffer.from(JPEG_1X1, 'base64')
const HEIC_BYTES = readFileSync(resolve(__dirname, '../../fixtures/heic/flat-64.heic'))

/** 绕过渲染层/主进程的转码：服务层只关心「已经准备好的字节」。 */
function prepared(): PreparedEventImage {
  return {
    display: { ext: 'png', bytes: PNG_BYTES },
    thumb: { ext: 'jpg', bytes: JPEG_BYTES },
  }
}

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

    const first = addImage(workspace.db, workspace.directory, 'l1', '2026-01-01', prepared())
    const live = addImage(workspace.db, workspace.directory, 'l1', '2026-01-01', {
      ...prepared(),
      original: { ext: 'heic', bytes: HEIC_BYTES },
      motion: { ext: 'mov', bytes: Buffer.from('fake-motion') },
    })
    expect(first.sortOrder).toBe(1)
    expect(live.sortOrder).toBe(2)
    expect(listImages(workspace.db, 'l1', '2026-01-01')).toHaveLength(2)
    expect(live.originalPath).toMatch(/\.heic$/)
    expect(live.motionPath).toMatch(/\.mov$/)
    for (const path of [first.filePath, live.filePath, live.thumbPath, live.originalPath, live.motionPath]) {
      expect(existsSync(join(assetsRoot(workspace.directory), path))).toBe(true)
    }

    deleteImage(workspace.db, workspace.directory, first.id)
    deleteImage(workspace.db, workspace.directory, live.id)
    expect(listImages(workspace.db, 'l1', '2026-01-01')).toHaveLength(0)
    for (const path of [first.filePath, first.thumbPath, live.filePath, live.originalPath, live.motionPath]) {
      expect(existsSync(join(assetsRoot(workspace.directory), path))).toBe(false)
    }
  })

  it('deletes the event with all image records and files', () => {
    const workspace = openWorkspace(workspaceDirectory())
    upsertKeyEvent(workspace.db, 'l1', '2026-01-01', 'A', '', '')
    const image = addImage(workspace.db, workspace.directory, 'l1', '2026-01-01', prepared())
    deleteKeyEventByDate(workspace.db, workspace.directory, 'l1', '2026-01-01')
    expect(listImages(workspace.db, 'l1', '2026-01-01')).toEqual([])
    expect(existsSync(join(assetsRoot(workspace.directory), image.filePath))).toBe(false)
    expect(() => queryKeyEventByDate(workspace.db, 'l1', '2026-01-01')).toThrow(AppError)
  })
})
