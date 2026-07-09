import { defineStore } from 'pinia'
import { ref } from 'vue'

export type UpdateStatus =
    | 'idle'
    | 'checking'
    | 'available'
    | 'no-update'
    | 'downloading'
    | 'downloaded'
    | 'error'

export const useUpdateStore = defineStore('updateStore', () => {
    const status = ref<UpdateStatus>('idle')
    const latestVersion = ref<string>('')
    const downloadPercent = ref<number>(0)
    const downloadSpeed = ref<string>('')
    const errorMessage = ref<string>('')
    const filePath = ref<string>('')
    const releaseBody = ref<string>('')
    const downloadUrl = ref<string>('')

    let unsubProgress: (() => void) | null = null
    let unsubComplete: (() => void) | null = null
    let unsubError: (() => void) | null = null

    const cleanupListeners = () => {
        unsubProgress?.()
        unsubComplete?.()
        unsubError?.()
        unsubProgress = null
        unsubComplete = null
        unsubError = null
    }

    const checkForUpdate = async () => {
        status.value = 'checking'
        errorMessage.value = ''
        try {
            const result = await window.electronAPI.checkUpdate()
            if (result.error) {
                status.value = 'error'
                errorMessage.value = result.error
                return
            }
            if (result.hasUpdate) {
                status.value = 'available'
                latestVersion.value = result.latestVersion
                downloadUrl.value = result.downloadUrl
                releaseBody.value = result.body
            } else {
                status.value = 'no-update'
            }
        } catch (e: any) {
            status.value = 'error'
            errorMessage.value = e?.message || '检查更新失败'
        }
    }

    const downloadUpdate = async () => {
        if (!downloadUrl.value) return
        status.value = 'downloading'
        downloadPercent.value = 0
        downloadSpeed.value = ''

        cleanupListeners()

        unsubProgress = window.electronAPI.onDownloadProgress((data) => {
            downloadPercent.value = data.percent
            downloadSpeed.value = data.speed
        })

        unsubComplete = window.electronAPI.onDownloadComplete((data) => {
            filePath.value = data.filePath
            status.value = 'downloaded'
            cleanupListeners()
        })

        unsubError = window.electronAPI.onDownloadError((data) => {
            status.value = 'error'
            errorMessage.value = data.message
            cleanupListeners()
        })

        const result = await window.electronAPI.downloadUpdate(downloadUrl.value)
        if (!result.success && (status.value as UpdateStatus) !== 'error') {
            status.value = 'error'
            errorMessage.value = result.error || '下载失败'
            cleanupListeners()
        }
    }

    const installUpdate = async () => {
        const result = await window.electronAPI.installUpdate()
        if (!result.success) {
            status.value = 'error'
            errorMessage.value = result.error || '安装启动失败'
        }
        // On success, app.quit() is called, no state update needed
    }

    const reset = () => {
        cleanupListeners()
        status.value = 'idle'
        latestVersion.value = ''
        downloadPercent.value = 0
        downloadSpeed.value = ''
        errorMessage.value = ''
        filePath.value = ''
        releaseBody.value = ''
        downloadUrl.value = ''
    }

    return {
        status,
        latestVersion,
        downloadPercent,
        downloadSpeed,
        errorMessage,
        filePath,
        releaseBody,
        checkForUpdate,
        downloadUpdate,
        installUpdate,
        reset,
    }
})
