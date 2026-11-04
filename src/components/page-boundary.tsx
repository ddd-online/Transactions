import { Component, type ErrorInfo, type ReactNode } from 'react'

import { Button } from './button'

export interface PageBoundaryProps {
  children: ReactNode
}

interface PageBoundaryState {
  failed: boolean
}

/**
 * 分页级的错误边界。
 *
 * 页面是按需加载的（`App.tsx` 里的 `React.lazy`），一个 chunk 读失败 —— 安装包损坏、
 * 杀软把 `assets/*.js` 拦下、更新写到一半断电 —— 会让 `import()` reject，并在渲染期抛错。
 * 没有边界时 React 会卸载整棵树，窗口只剩自绘标题栏，用户唯一出路是强杀进程。
 * 有了它，坏掉的只有**这一页**：外壳、导航、账本菜单、底栏都还在，这一页换成一句话加一个按钮。
 *
 * 顺带接住页面自己的渲染异常：一个页面的 bug 不该让整个应用消失。
 *
 * 重试走整页 reload，不是原地重挂：`React.lazy` 会把被拒的那次 `import()` 缓存住，
 * 原地重挂只会拿到同一个错误。
 */
export class PageBoundary extends Component<PageBoundaryProps, PageBoundaryState> {
  state: PageBoundaryState = { failed: false }

  static getDerivedStateFromError(): PageBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('page render failed', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div className="page-boundary" role="alert" data-testid="page-boundary">
        <p className="page-boundary__title">这一页没有加载出来</p>
        <p className="page-boundary__text">
          可能是安装文件缺失或被安全软件拦下了。重新加载一般就好；如果反复出现，关掉应用重新打开。
        </p>
        {/* 两条路：先试重载（文件只是没读到的情况）；真的读不到时，关掉应用重开才是出路 ——
            否则这个按钮会把用户困在原地循环。 */}
        <div className="page-boundary__actions">
          <Button variant="primary" testId="page-boundary-retry" onClick={() => window.location.reload()}>
            重新加载
          </Button>
          <Button
            variant="secondary"
            testId="page-boundary-close"
            onClick={() => void window.api.invoke('window_control', { action: 'close' })}
          >
            关闭窗口
          </Button>
        </div>
      </div>
    )
  }
}
