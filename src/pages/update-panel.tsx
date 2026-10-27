import { Progress, Spin } from 'antd'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useCallback, useEffect, useState, type JSX } from 'react'

import {
  showsReleaseBody,
  updateStatusLabel,
  type UpdateSnapshot,
} from '../../shared/domain/update'
import { Button } from '../components/button'
import { Icon } from '../components/icon'

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
  const showError = snapshot?.error || error

  return (
    <section className="st-about-update">
      {status === 'checking' ? (
        <div className="st-update-row">
          <Spin size="small" />
          <span className="st-update-text" data-testid="update-status">
            {updateStatusLabel(status)}
          </span>
        </div>
      ) : null}

      {status === 'idle' ? (
        <div className="st-update-row">
          <span className="sr-only" data-testid="update-status">
            {updateStatusLabel(status)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            testId="update-check"
            disabled={busy}
            onClick={() => void check()}
          >
            检查更新
          </Button>
        </div>
      ) : null}

      {status === 'no-update' ? (
        <div className="st-update-row st-update-success">
          <span className="st-update-icon">
            <Icon name="CheckCircle" size={16} />
          </span>
          <span className="st-update-text" data-testid="update-status">
            {updateStatusLabel(status)}
            {snapshot?.latestVersion ? ` · ${snapshot.latestVersion}` : ''}
          </span>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void check()}>
            重新检查
          </Button>
        </div>
      ) : null}

      {status === 'available' ? (
        <div className="st-update-row st-update-available">
          <span className="st-update-text" data-testid="update-status">
            {updateStatusLabel(status)}
            {snapshot?.latestVersion ? ` ${snapshot.latestVersion}` : ''}
          </span>
          <Button
            variant="primary"
            size="sm"
            testId="update-download"
            disabled={busy || !snapshot?.downloadUrl}
            onClick={() => void download()}
          >
            下载更新
          </Button>
        </div>
      ) : null}

      {status === 'downloading' ? (
        <div className="st-update-row">
          <Progress
            className="st-update-progress"
            percent={snapshot?.percent ?? 0}
            size="small"
            showInfo={false}
          />
          <span className="st-update-text" data-testid="update-status">
            {snapshot?.percent ?? 0}% · {snapshot?.speed ?? ''}
          </span>
          <Button variant="text" size="sm" testId="update-cancel" onClick={() => void cancel()}>
            取消下载
          </Button>
        </div>
      ) : null}

      {status === 'downloaded' ? (
        <div className="st-update-row st-update-success">
          <span className="st-update-icon">
            <Icon name="CheckCircle" size={16} />
          </span>
          <span className="st-update-text" data-testid="update-status">
            {updateStatusLabel(status)}
          </span>
          <Button
            variant="primary"
            size="sm"
            testId="update-install"
            disabled={busy}
            onClick={() => void install()}
          >
            安装并重启
          </Button>
        </div>
      ) : null}

      {status === 'failed' ? (
        <div className="st-update-row st-update-error">
          <span className="st-update-icon">
            <Icon name="CloseCircle" size={16} />
          </span>
          <span className="st-update-text" data-testid="update-status">
            {updateStatusLabel(status)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            testId="update-check"
            disabled={busy}
            onClick={() => void check()}
          >
            重试
          </Button>
        </div>
      ) : null}

      {snapshot && showsReleaseBody(snapshot.status) && snapshot.releaseBody ? (
        <div className="st-release-body" data-testid="update-release-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ node: _node, ...props }) => (
                <a {...props} target="_blank" rel="noreferrer" />
              ),
            }}
          >
            {snapshot.releaseBody}
          </ReactMarkdown>
        </div>
      ) : null}

      {showError ? (
        <p className="m0-error" data-testid="update-error">
          {showError}
        </p>
      ) : null}
    </section>
  )
}

