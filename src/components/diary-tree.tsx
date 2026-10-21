import { Tree, type TreeDataNode } from 'antd'
import { memo, useLayoutEffect, useMemo, useRef, useState, type JSX, type Key } from 'react'

export interface DiaryTreeProps {
  nodes: TreeDataNode[]
  selectedDate: string
  expandedKeys: string[]
  onExpand: (keys: Key[]) => void
  onSelect: (keys: Key[]) => void
}

/**
 * 日记目录树：只负责渲染。
 *
 * 971 篇日记时，树必须在每次正文输入时保持不动；父级用 memo + 稳定的
 * treeData / selectedKeys 隔开输入状态。height 交给 AntD 的虚拟列表，
 * 展开全部节点也只挂载可视区附近的行。
 */
export const DiaryTree = memo(function DiaryTree({
  nodes,
  selectedDate,
  expandedKeys,
  onExpand,
  onSelect,
}: DiaryTreeProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(480)
  const selectedKeys = useMemo(() => [selectedDate], [selectedDate])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const measure = (): void => setHeight(Math.max(160, host.clientHeight))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="diary-tree-scroll" ref={hostRef}>
      <Tree
        className="diary-tree"
        blockNode
        virtual
        height={height}
        treeData={nodes}
        selectedKeys={selectedKeys}
        expandedKeys={expandedKeys}
        onExpand={onExpand}
        onSelect={onSelect}
      />
    </div>
  )
})
