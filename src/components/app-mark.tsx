import type { JSX } from 'react'

/** 内置「Tr」标志；侧栏与关于页共用同一份 markup。 */
export function AppMark({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={`app-mark${className ? ` ${className}` : ''}`} viewBox="0 0 1024 1024" aria-hidden="true">
      <rect className="app-mark__plate" x="0" y="0" width="1024" height="1024" rx="200" ry="200" />
      <path
        className="app-mark__glyph"
        transform="translate(220.909996509552 49.1699676513672)"
        d="M363.01 322.09 L236.22 322.09 L236.22 685.1 L135.78 685.1 L135.78 322.09 L9.61 322.09 L9.61 240.56 L363.01 240.56 Z M572.57 456.01 C560.79 449.6 547.05 446.4 531.34 446.4 C510.05 446.4 493.42 454.2 481.43 469.81 C469.44 485.41 463.45 506.64 463.45 533.51 L463.45 685.1 L365.49 685.1 L365.49 367.66 L463.45 367.66 L463.45 426.56 L464.69 426.56 C480.19 383.57 508.09 362.08 548.39 362.08 C558.72 362.08 566.78 363.32 572.57 365.8 Z"
      />
    </svg>
  )
}
