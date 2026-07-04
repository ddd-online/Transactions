import { ref } from 'vue'

const HEIC_EXTENSIONS = ['.heic', '.heif', '.HEIC', '.HEIF']

export interface UploadFileProgress {
  name: string
  percent: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  errorMessage?: string
}

export interface UploadProgress {
  files: UploadFileProgress[]
  total: number
  completed: number
  status: 'idle' | 'uploading' | 'done' | 'error'
  errorMessage?: string
}

export type UploadHandler = (
  date: string,
  data: string,
  filename: string,
  onProgress?: (percent: number) => void
) => Promise<void>

async function fileToBase64(file: File): Promise<string> {
  const isHeic = HEIC_EXTENSIONS.some(ext =>
    file.name.toLowerCase().endsWith(ext)
  )

  if (!isHeic) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('读取文件失败'))
      reader.readAsDataURL(file)
    })
  }

  try {
    const { heicTo } = await import('heic-to/csp')
    const jpegBlob = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality: 0.92,
    })
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('HEIC 转换失败'))
      reader.readAsDataURL(jpegBlob)
    })
  } catch (e) {
    throw new Error('HEIC 转换失败: ' + ((e as Error)?.message || String(e)))
  }
}

export function useImageUpload(uploadFn: UploadHandler) {
  const progress = ref<UploadProgress>({
    files: [],
    total: 0,
    completed: 0,
    status: 'idle',
  })

  const pendingFiles = ref<File[]>([])
  let currentFileIndex = 0
  let targetDate = ''

  const uploadCurrentFile = async () => {
    const files = pendingFiles.value
    if (currentFileIndex >= files.length) {
      const doneCount = progress.value.files.filter(f => f.status === 'done').length
      progress.value.completed = doneCount
      progress.value.total = doneCount
      progress.value.status = 'done'
      setTimeout(() => {
        progress.value.status = 'idle'
        pendingFiles.value = []
      }, 2000)
      return
    }

    const file = files[currentFileIndex]!
    progress.value.files[currentFileIndex] = {
      name: file.name,
      percent: 0,
      status: 'uploading',
    }

    try {
      const data = await fileToBase64(file)
      await uploadFn(
        targetDate,
        data,
        file.name,
        (percent: number) => {
          const entry = progress.value.files[currentFileIndex]
          if (entry) {
            entry.percent = percent
          }
        }
      )
      progress.value.files[currentFileIndex] = {
        name: file.name,
        percent: 100,
        status: 'done',
      }
      progress.value.completed++
      currentFileIndex++
      await uploadCurrentFile()
    } catch (err) {
      progress.value.files[currentFileIndex] = {
        name: file.name,
        percent: 0,
        status: 'error',
        errorMessage: (err as Error)?.message || '图片上传失败',
      }
      progress.value.status = 'error'
      progress.value.errorMessage = (err as Error)?.message || '图片上传失败'
    }
  }

  const addFiles = async (date: string, files: File[]) => {
    if (files.length === 0) return

    targetDate = date
    pendingFiles.value = files
    currentFileIndex = 0

    progress.value = {
      files: files.map(f => ({ name: f.name, percent: 0, status: 'pending' as const })),
      total: files.length,
      completed: 0,
      status: 'uploading',
    }

    await uploadCurrentFile()
  }

  const retry = async () => {
    progress.value.files[currentFileIndex] = {
      name: pendingFiles.value[currentFileIndex]!.name,
      percent: 0,
      status: 'pending',
    }
    progress.value.status = 'uploading'
    await uploadCurrentFile()
  }

  const skip = async () => {
    currentFileIndex++
    progress.value.status = 'uploading'
    await uploadCurrentFile()
  }

  const reset = () => {
    progress.value = { files: [], total: 0, completed: 0, status: 'idle' }
    pendingFiles.value = []
    currentFileIndex = 0
  }

  return {
    progress,
    addFiles,
    retry,
    skip,
    reset,
  }
}
