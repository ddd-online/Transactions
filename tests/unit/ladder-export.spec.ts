/**
 * 天梯网页导出：一个 module、两条 adapter。
 *
 * 这里测的是**接口**：给日期与 HTML，拿到写出的路径；「打开」由 deps 递进来，
 * 所以不必起 Electron —— 生产那条 adapter 是 `shell.openPath`，这条是 recorder。
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { embedLadderPageFonts, exportLadderPage } from '../../electron/services/ladder-export'
import { AppError } from '../../shared/errors'

const directories: string[] = []

function directory(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix))
  directories.push(path)
  return path
}

afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true })
})

/** 一份带 `<head>` 的最小页面：字体内嵌就插在它前面。 */
const HTML = '<!doctype html><html><head><title>t</title></head><body>天梯</body></html>'

function fakeAssets(): string {
  const path = directory('tr-ladder-fonts-')
  for (const name of [
    'inter-latin-400-normal-abc123.woff2',
    'inter-latin-600-normal-def456.woff2',
    'inter-latin-700-normal-ghi789.woff2',
    'jetbrains-mono-latin-500-normal-jkl012.woff2',
  ]) {
    writeFileSync(join(path, name), Buffer.from(`font:${name}`))
  }
  return path
}

function recorder(): { openPath: (file: string) => Promise<string>; opened: string[] } {
  const opened: string[] = []
  return {
    opened,
    openPath: async (file: string) => {
      opened.push(file)
      return ''
    },
  }
}

describe('exportLadderPage', () => {
  it('writes one dated file, embeds the fonts and hands it to the opener', async () => {
    const tempDirectory = directory('tr-ladder-export-')
    const fonts = fakeAssets()
    const { openPath, opened } = recorder()

    const file = await exportLadderPage(
      { date: '2026-11-06', html: HTML },
      { tempDirectory, openPath, assetsDirectory: fonts },
    )

    expect(file).toBe(join(tempDirectory, 'transactions-ladder-2026-11-06.html'))
    expect(opened).toEqual([file])
    const written = readFileSync(file, 'utf8')
    expect(written).toContain('天梯')
    expect(written.match(/@font-face/g)).toHaveLength(4)
    expect(written).toContain('data:font/woff2;base64,')
    // 页面自己还是单文件：没有外部请求
    expect(written).not.toMatch(/https?:\/\//)
  })

  it('still writes a usable page when the font assets are missing', async () => {
    const tempDirectory = directory('tr-ladder-export-')
    const { openPath } = recorder()

    const file = await exportLadderPage(
      { date: '2026-11-06', html: HTML },
      { tempDirectory, openPath, assetsDirectory: join(tempDirectory, 'nope') },
    )

    expect(readFileSync(file, 'utf8')).toBe(HTML)
  })

  it('rejects a bad date before writing anything', async () => {
    const tempDirectory = directory('tr-ladder-export-')
    const { openPath, opened } = recorder()

    await expect(
      exportLadderPage({ date: '2026/11/06', html: HTML }, { tempDirectory, openPath }),
    ).rejects.toBeInstanceOf(AppError)
    expect(opened).toEqual([])
    expect(existsSync(join(tempDirectory, 'transactions-ladder-2026-11-06.html'))).toBe(false)
  })

  it('rejects an empty page', async () => {
    const tempDirectory = directory('tr-ladder-export-')
    const { openPath, opened } = recorder()

    await expect(
      exportLadderPage({ date: '2026-11-06', html: '' }, { tempDirectory, openPath }),
    ).rejects.toMatchObject({ message: '页面内容为空' })
    expect(opened).toEqual([])
  })

  it('keeps the file and surfaces why the browser did not take it', async () => {
    const tempDirectory = directory('tr-ladder-export-')
    const file = join(tempDirectory, 'transactions-ladder-2026-11-06.html')

    const failure = exportLadderPage(
      { date: '2026-11-06', html: HTML },
      {
        tempDirectory,
        openPath: async () => 'no browser',
        assetsDirectory: join(tempDirectory, 'nope'),
      },
    )

    await expect(failure).rejects.toMatchObject({ message: '打开网页失败：no browser' })
    // 打开失败时文件仍然写下来了：用户还能自己去临时目录里拿
    expect(existsSync(file)).toBe(true)
  })
})

describe('embedLadderPageFonts', () => {
  it('injects the four faces as base64 with the latin subset range', () => {
    const fonts = fakeAssets()
    const withFonts = embedLadderPageFonts(HTML, fonts)

    expect(withFonts).toContain("@font-face{font-family:'Inter';font-style:normal;font-weight:400")
    expect(withFonts).toContain("@font-face{font-family:'JetBrains Mono';font-style:normal;font-weight:500")
    expect(withFonts).toContain('unicode-range:U+0000-00FF,U+2000-206F')
    expect(withFonts.indexOf('<style>')).toBeLessThan(withFonts.indexOf('</head>'))
  })

  it('leaves the page alone when there is nothing to embed', () => {
    expect(embedLadderPageFonts(HTML, join(tmpdir(), 'tr-no-fonts-here'))).toBe(HTML)
  })
})
