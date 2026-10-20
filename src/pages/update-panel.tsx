import { useCallback, useEffect, useState, type JSX } from 'react'

import {
  allowsNewCheck,
  showsReleaseBody,
  updateStatusLabel,
  type UpdateSnapshot,
} from '../../shared/domain/update'

export interface UpdatePanelProps {
  snapshot: UpdateSnapshot | null
  onSnapshot: (snapshot: UpdateSnapshot) => void
}

/** 关于软件 / 检查更新：只渲染主进程给的完整快照。 */
export function UpdatePanel({ snapshot, onSnapshot }: UpdatePanelProps): JSX.Element {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const current = await window.api.invoke('update_download_status', {})
        onSnapshot(current)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      }
    })()
  }, [onSnapshot])

  const check = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      onSnapshot(await window.api.invoke('update_check', {}))
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : String(checkError))
    } finally {
      setBusy(false)
    }
  }, [onSnapshot])

  const download = useCallback(async (): Promise<void> => {
    if (!snapshot) return
    setBusy(true)
    setError('')
    try {
      onSnapshot(
        await window.api.invoke('update_download', {
          url: snapshot.downloadUrl,
          digest: snapshot.digest,
        }),
      )
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : String(downloadError))
    } finally {
      setBusy(false)
    }
  }, [onSnapshot, snapshot])

  const cancel = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      onSnapshot(await window.api.invoke('update_cancel', {}))
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : String(cancelError))
    } finally {
      setBusy(false)
    }
  }, [onSnapshot])

  const install = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.api.invoke('update_install', {})
      if (!result.ok) setError(result.error ?? '安装失败')
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : String(installError))
    } finally {
      setBusy(false)
    }
  }, [])

  const status = snapshot?.status ?? 'idle'

  return (
    <section className="m0-card m0-card--wide">
      <div className="m0-card-head">
        <h2>关于与更新</h2>
        <span className="m0-muted" data-testid="update-status">
          {updateStatusLabel(status)}
          {snapshot?.latestVersion ? ` · ${snapshot.latestVersion}` : ''}
        </span>
      </div>

      {snapshot?.status === 'downloading' ? (
        <>
          <div className="m0-progress">
            <div className="m0-progress-fill" style={{ width: `${snapshot.percent}%` }} />
          </div>
          <p className="m0-muted" data-testid="update-progress">
            {snapshot.percent}% · {snapshot.speed}
          </p>
        </>
      ) : null}

      {snapshot && showsReleaseBody(snapshot.status) && snapshot.releaseBody ? (
        <pre className="m0-release-body">{snapshot.releaseBody}</pre>
      ) : null}

      {snapshot?.error ? (
        <p className="m0-error" data-testid="update-error">
          {snapshot.error}
        </p>
      ) : null}
      {error ? (
        <p className="m0-error" data-testid="update-error">
          {error}
        </p>
      ) : null}

      <div className="m0-actions">
        {allowsNewCheck(status) ? (
          <button
            type="button"
            className="m0-primary"
            data-testid="update-check"
            disabled={busy}
            onClick={() => void check()}
          >
            检查更新
          </button>
        ) : null}
        {status === 'available' ? (
          <button
            type="button"
            className="m0-primary"
            data-testid="update-download"
            disabled={busy || !snapshot?.downloadUrl}
            onClick={() => void download()}
          >
            下载更新
          </button>
        ) : null}
        {status === 'downloading' ? (
          <button
            type="button"
            className="m0-link"
            data-testid="update-cancel"
            onClick={() => void cancel()}
          >
            取消下载
          </button>
        ) : null}
        {status === 'downloaded' ? (
          <button
            type="button"
            className="m0-primary"
            data-testid="update-install"
            disabled={busy}
            onClick={() => void install()}
          >
            安装并重启
          </button>
        ) : null}
      </div>
    </section>
  )
}


