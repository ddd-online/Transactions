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
        <p className="page-boundary__text">可能是安装文件缺失或被安全软件拦下了。重新加载一般就好。</p>
        <Button
          variant="secondary"
          testId="page-boundary-retry"
          onClick={() => window.location.reload()}
        >
          重新加载
        </Button>
      </div>
    )
  }
}
