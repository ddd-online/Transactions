import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { groupPickedFiles, isHeicFile } from '../../src/pages/event-images'

const HEIC_STILL = readFileSync(resolve(__dirname, '../../fixtures/heic/gradient-512.heic'))

/** 文件名与 MIME 是分组的两条线索；内容只在 isHeicFile 里看。 */
function file(name: string, type = ''): File {
  return new File([new Uint8Array([0])], name, { type })
}

function names(files: File[]): string[] {
  return files.map((item) => item.name)
}

describe('groupPickedFiles', () => {
  it('空选择：三份结果都为空', () => {
    expect(groupPickedFiles([])).toEqual({ images: [], orphanMotions: [], unsupported: [] })
  })

  it('单张静态图：自成一组，没有实况视频', () => {
    const still = file('IMG_0001.jpg', 'image/jpeg')
    const picked = groupPickedFiles([still])
    expect(picked.images).toHaveLength(1)
    expect(picked.images[0].still.name).toBe('IMG_0001.jpg')
    expect(picked.images[0].motion).toBeUndefined()
    expect(picked.orphanMotions).toEqual([])
    expect(picked.unsupported).toEqual([])
  })

  it('HEIC 后缀不区分大小写，按静态图收下', () => {
    const still = file('IMG_0002.HEIC', 'image/heic')
    const picked = groupPickedFiles([still])
    expect(picked.images).toHaveLength(1)
    expect(picked.images[0].still.name).toBe('IMG_0002.HEIC')
  })

  it('实况照片：同名照片 + 视频配成一组，视频挂在 motion 上', () => {
    const still = file('IMG_0003.jpg', 'image/jpeg')
    const motion = file('IMG_0003.mov', 'video/quicktime')
    const picked = groupPickedFiles([still, motion])
    expect(picked.images).toHaveLength(1)
    expect(picked.images[0].still.name).toBe('IMG_0003.jpg')
    expect(picked.images[0].motion?.name).toBe('IMG_0003.mov')
    expect(picked.orphanMotions).toEqual([])
  })

  it('顺序按第一次出现的文件名主干排，不按照片/视频各自分组', () => {
    const picked = groupPickedFiles([
      file('B.jpg', 'image/jpeg'),
      file('A.jpg', 'image/jpeg'),
      file('B.mov', 'video/mp4'),
    ])
    expect(names(picked.images.map((image) => image.still))).toEqual(['B.jpg', 'A.jpg'])
    expect(picked.images[0].motion?.name).toBe('B.mov')
    expect(picked.images[1].motion).toBeUndefined()
  })

  it('只有视频没有同名照片：不做猜测，报成待配对的实况视频', () => {
    const picked = groupPickedFiles([file('IMG_0004.MOV', 'video/quicktime')])
    expect(picked.images).toEqual([])
    expect(picked.orphanMotions).toEqual(['IMG_0004.MOV'])
  })

  it('认不出的格式单独报出来，不挡住同批其它照片', () => {
    const picked = groupPickedFiles([file('readme.txt', 'text/plain'), file('IMG_0005.png')])
    expect(names(picked.images.map((image) => image.still))).toEqual(['IMG_0005.png'])
    expect(picked.unsupported).toEqual(['readme.txt'])
  })

  it('同名多张静态图只取第一张，不重复成组', () => {
    const picked = groupPickedFiles([file('IMG_0006.jpg'), file('IMG_0006.png')])
    expect(picked.images).toHaveLength(1)
    expect(picked.images[0].still.name).toBe('IMG_0006.jpg')
  })
})

describe('isHeicFile', () => {
  it('按字节判断：改过后缀的 HEIC 也认得出', async () => {
    const renamed = new File([HEIC_STILL], 'fake.jpg', { type: 'image/jpeg' })
    await expect(isHeicFile(renamed)).resolves.toBe(true)
  })

  it('普通 JPEG 的字节不误判成 HEIC', async () => {
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'photo.jpg', {
      type: 'image/jpeg',
    })
    await expect(isHeicFile(jpeg)).resolves.toBe(false)
  })
})
