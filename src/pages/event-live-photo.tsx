import { useCallback, useEffect, useRef, useState, type JSX } from 'react'

import { Icon } from '../components/icon'
import { notify } from '../components/toast'

/**
 * 实况照片的动态层：主图上压一段视频 + 一个「实况」按钮。
 *
 * 点按钮播放，再点（或点视频本身）停止并回到静态照片，播完也自动回到照片。
 * 视频能不能解码取决于系统：Live Photo 的动态部分是 HEVC，Chromium 只能靠
 * Windows 的 HEVC 解码器（硬件/系统扩展）播放，播不了就明说，不装作在播。
 */
export interface LivePhotoProps {
  motionUrl: string
  /** `stage` 是详情里的主图，`preview` 是大图预览 */
  variant: 'stage' | 'preview'
  testId: string
}

export function LivePhoto({ motionUrl, variant, testId }: LivePhotoProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [playing, setPlaying] = useState(false)
  // 解码失败时 play() 的 rejection 和 video 的 error 事件会先后到，只提示一次。
  const notifiedRef = useRef(false)

  const stop = useCallback((): void => {
    const video = videoRef.current
    if (video) {
      video.pause()
      video.currentTime = 0
    }
    setPlaying(false)
  }, [])

  // 切换图片时容器不重建，必须手动把上一张的播放状态收掉。
  useEffect(() => {
    notifiedRef.current = false
    stop()
  }, [motionUrl, stop])

  const fail = useCallback((detail: string): void => {
    setPlaying(false)
    if (notifiedRef.current) return
    notifiedRef.current = true
    notify(`实况视频无法播放：${detail}`, 'error')
  }, [])

  const play = useCallback((): void => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = 0
    setPlaying(true)
    void video.play().catch((error: unknown) => {
      fail(error instanceof Error ? error.message : String(error))
    })
  }, [fail])

  const toggle = useCallback((): void => {
    if (playing) stop()
    else play()
  }, [play, playing, stop])

  return (
    <div
      className={`key-event-live key-event-live--${variant}${playing ? ' is-playing' : ''}`}
      data-testid={testId}
      data-playing={playing ? 'true' : 'false'}
    >
      <video
        ref={videoRef}
        className="key-event-live__video"
        src={motionUrl}
        preload="none"
        playsInline
        onClick={stop}
        onEnded={stop}
        onError={() => fail('这台电脑缺少 HEVC 解码器')}
      />
      <button
        type="button"
        className="key-event-live__badge"
        data-testid={`${testId}-toggle`}
        aria-pressed={playing}
        aria-label={playing ? '停止实况' : '播放实况'}
        title={playing ? '停止实况' : '播放实况'}
        onClick={toggle}
      >
        <Icon name={playing ? 'Close' : 'CaretRight'} size={11} />
        {playing ? '停止' : '实况'}
      </button>
    </div>
  )
}
