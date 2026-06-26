// app/src/backend/imageOptimizer.ts

export interface ImageUrls {
  full: string    // blob:... 全尺寸
  thumb: string   // blob:... 缩略图
}

/** 将 base64 data URI 转成 Blob */
export function base64ToBlob(base64: string): Blob {
  const parts = base64.split(',')
  const mime = parts[0]!.match(/:(.*?);/)![1]!
  const raw = atob(parts[1]!)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

/** 用 Canvas 从 Blob 生成缩略图（maxWidth 300，JPEG quality 0.75） */
export async function generateThumbnail(source: Blob, maxWidth = 300): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(source)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const ratio = Math.min(maxWidth / img.width, 1)  // 不放大
      const w = Math.round(img.width * ratio)
      const h = Math.round(img.height * ratio)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('Canvas toBlob failed'))
        },
        'image/jpeg',
        0.75,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image load failed for thumbnail generation'))
    }
    img.src = url
  })
}

/** base64 → { fullUrl, thumbUrl } */
export async function createImageUrls(base64: string): Promise<ImageUrls> {
  const blob = base64ToBlob(base64)
  const fullUrl = URL.createObjectURL(blob)

  let thumbUrl = fullUrl  // fallback
  try {
    const thumbBlob = await generateThumbnail(blob)
    thumbUrl = URL.createObjectURL(thumbBlob)
  } catch {
    // 缩略图生成失败，使用全尺寸 fallback
  }

  return { full: fullUrl, thumb: thumbUrl }
}

/** 释放 blob URLs */
export function revokeImageUrls(urls: ImageUrls): void {
  if (urls.full) URL.revokeObjectURL(urls.full)
  if (urls.thumb && urls.thumb !== urls.full) URL.revokeObjectURL(urls.thumb)
}
