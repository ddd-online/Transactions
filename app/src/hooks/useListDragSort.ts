import { watch, onMounted, onUnmounted, nextTick, type Ref } from 'vue'
import Sortable from 'sortablejs'

export interface DragSortOptions {
  /** CSS 选择器，指定拖拽手柄元素（如 '.drag-handle'） */
  handle: string
  /** 拖拽结束回调，返回旧索引和新索引 */
  onReorder: (oldIndex: number, newIndex: number) => void
  /** 动画时长 ms，默认 200 */
  animation?: number
}

/**
 * 为列表容器绑定 SortableJS 拖拽排序。
 * 组件挂载时初始化，卸载时自动销毁。
 * 当 enabled 从 false 变为 true 时自动重新初始化（处理异步数据加载）。
 *
 * @param containerRef - 列表容器 DOM 元素的 template ref
 * @param enabled - 响应式开关，为 false 时禁用拖拽
 * @param options - 拖拽配置
 */
export function useListDragSort(
  containerRef: Ref<HTMLElement | undefined | null>,
  enabled: Ref<boolean>,
  options: DragSortOptions
) {
  let sortable: Sortable | null = null

  const init = () => {
    const el = containerRef.value
    if (!el || !enabled.value) return
    destroy()

    sortable = Sortable.create(el, {
      animation: options.animation ?? 200,
      handle: options.handle,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      onEnd(evt) {
        if (evt.oldIndex !== undefined && evt.newIndex !== undefined && evt.oldIndex !== evt.newIndex) {
          options.onReorder(evt.oldIndex, evt.newIndex)
        }
      },
    })
  }

  const destroy = () => {
    if (sortable) {
      sortable.destroy()
      sortable = null
    }
  }

  // 挂载时尝试初始化
  onMounted(() => {
    init()
  })

  // 数据就绪后初始化（nextTick 确保 DOM 已更新）
  watch(enabled, async (val) => {
    if (val) {
      await nextTick()
      init()
    } else {
      destroy()
    }
  })

  onUnmounted(() => {
    destroy()
  })

  return { init, destroy }
}
