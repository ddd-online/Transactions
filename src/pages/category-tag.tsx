import { useCallback, useEffect, useState, type JSX } from 'react'
import { Input, Modal } from 'antd'

import { reorderWithChanges } from '../../shared/domain/list-order'
import type { CategoryDto, TagDto } from '../../shared/types/category'
import { Button } from '../components/button'
import { ConfirmDialog } from '../components/confirm-dialog'
import { Icon } from '../components/icon'
import { PageLayout } from '../components/page-layout'
import { notify } from '../components/toast'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

const TRANSACTION_TYPES: Array<[string, string]> = [
  ['expense', '支出'],
  ['income', '收入'],
  ['transfer', '转账'],
]

const NAME_MAX_LENGTH = 20

type DeleteTarget = { kind: 'category' | 'tag'; name: string }

export interface CategoryTagPageProps {
  ledgerId: string
}

/** 记账 · 标签：分类与标签两栏联动，支持新增、删除、拖拽排序。 */
export function CategoryTagPage({ ledgerId }: CategoryTagPageProps): JSX.Element {
  const [type, setType] = useState('expense')
  const [categories, setCategories] = useState<CategoryDto[]>([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [tags, setTags] = useState<TagDto[]>([])
  const [error, setError] = useState('')

  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const [tagModalOpen, setTagModalOpen] = useState(false)
  const [tagName, setTagName] = useState('')
  const [tagError, setTagError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  const [dragCategory, setDragCategory] = useState<number | null>(null)
  const [overCategory, setOverCategory] = useState<number | null>(null)
  const [dragTag, setDragTag] = useState<number | null>(null)
  const [overTag, setOverTag] = useState<number | null>(null)

  const loadCategories = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setCategories([])
      return
    }
    try {
      const rows = await window.api.invoke('category_list', { ledgerId, type })
      setCategories(rows)
      setSelectedCategory((current) =>
        current && rows.some((category) => category.name === current) ? current : '',
      )
      setError('')
    } catch (loadError) {
      setError(errorMessage(loadError))
    }
  }, [ledgerId, type])

  const loadTags = useCallback(async (): Promise<void> => {
    if (!ledgerId || !selectedCategory) {
      setTags([])
      return
    }
    try {
      const rows = await window.api.invoke('tag_list', {
        ledgerId,
        categoryTransactionType: `${selectedCategory}:${type}`,
      })
      setTags(rows)
      setError('')
    } catch (loadError) {
      setError(errorMessage(loadError))
    }
  }, [ledgerId, selectedCategory, type])

  useEffect(() => {
    setSelectedCategory('')
    setTags([])
    void loadCategories()
  }, [loadCategories])

  useEffect(() => {
    void loadTags()
  }, [loadTags])

  const openCategoryModal = useCallback((): void => {
    setCategoryName('')
    setCategoryError('')
    setCategoryModalOpen(true)
  }, [])

  const closeCategoryModal = useCallback((): void => {
    setCategoryModalOpen(false)
    setCategoryName('')
    setCategoryError('')
  }, [])

  const confirmCategory = useCallback(async (): Promise<void> => {
    const name = categoryName.trim()
    if (!name) return
    if (categories.some((category) => category.name === name)) {
      setCategoryError('该分类已存在')
      return
    }
    try {
      await window.api.invoke('category_create', {
        ledgerId,
        name,
        transactionType: type,
      })
      setCategoryModalOpen(false)
      setCategoryName('')
      setCategoryError('')
      await loadCategories()
      setSelectedCategory(name)
      notify('分类已添加')
    } catch (createError) {
      setCategoryError(errorMessage(createError))
    }
  }, [categories, categoryName, ledgerId, loadCategories, type])

  const openTagModal = useCallback((): void => {
    if (!selectedCategory) return
    setTagName('')
    setTagError('')
    setTagModalOpen(true)
  }, [selectedCategory])

  const closeTagModal = useCallback((): void => {
    setTagModalOpen(false)
    setTagName('')
    setTagError('')
  }, [])

  const confirmTag = useCallback(async (): Promise<void> => {
    const name = tagName.trim()
    if (!name || !selectedCategory) return
    if (tags.some((tag) => tag.name === name)) {
      setTagError('该标签已存在')
      return
    }
    try {
      await window.api.invoke('tag_create', {
        ledgerId,
        name,
        categoryTransactionType: `${selectedCategory}:${type}`,
      })
      setTagModalOpen(false)
      setTagName('')
      setTagError('')
      await loadTags()
      notify('标签已添加')
    } catch (createError) {
      setTagError(errorMessage(createError))
    }
  }, [ledgerId, loadTags, selectedCategory, tagName, tags, type])

  const confirmDelete = useCallback(async (): Promise<void> => {
    const target = deleteTarget
    if (!target) return
    setError('')
    try {
      if (target.kind === 'category') {
        await window.api.invoke('category_delete', {
          ledgerId,
          name: target.name,
          transactionType: type,
        })
        if (selectedCategory === target.name) setSelectedCategory('')
        await loadCategories()
        notify('分类已删除')
      } else {
        if (!selectedCategory) return
        await window.api.invoke('tag_delete', {
          ledgerId,
          name: target.name,
          categoryTransactionType: `${selectedCategory}:${type}`,
        })
        await loadTags()
        notify('标签已删除')
      }
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    } finally {
      setDeleteTarget(null)
    }
  }, [deleteTarget, ledgerId, loadCategories, loadTags, selectedCategory, type])

  const moveCategory = useCallback(
    async (from: number, to: number): Promise<void> => {
      setDragCategory(null)
      setOverCategory(null)
      const result = reorderWithChanges(
        categories,
        from,
        to,
        (category) => category.name,
        (category) => category.sortOrder,
      )
      if (!result) return
      const [next, changed] = result
      setCategories(next.map((category, index) => ({ ...category, sortOrder: index })))
      try {
        await Promise.all(
          changed.map(([index, name]) =>
            window.api.invoke('category_update_sort', {
              ledgerId,
              name,
              transactionType: type,
              sortOrder: index,
            }),
          ),
        )
      } catch (sortError) {
        setError(errorMessage(sortError))
        await loadCategories()
      }
    },
    [categories, ledgerId, loadCategories, type],
  )

  const moveTag = useCallback(
    async (from: number, to: number): Promise<void> => {
      setDragTag(null)
      setOverTag(null)
      if (!selectedCategory) return
      const result = reorderWithChanges(
        tags,
        from,
        to,
        (tag) => tag.name,
        (tag) => tag.sortOrder,
      )
      if (!result) return
      const [next, changed] = result
      setTags(next.map((tag, index) => ({ ...tag, sortOrder: index })))
      try {
        await Promise.all(
          changed.map(([index, name]) =>
            window.api.invoke('tag_update_sort', {
              ledgerId,
              name,
              categoryTransactionType: `${selectedCategory}:${type}`,
              sortOrder: index,
            }),
          ),
        )
      } catch (sortError) {
        setError(errorMessage(sortError))
        await loadTags()
      }
    },
    [ledgerId, loadTags, selectedCategory, tags, type],
  )

  const emptyHint = (text: string): JSX.Element => (
    <div className="ct-column-empty">
      <span>{text}</span>
    </div>
  )

  return (
    <PageLayout
      toolbar={
        <nav className="ct-type-nav">
          {TRANSACTION_TYPES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              data-testid={`tag-type-${value}`}
              className={`ct-type-card ct-type-card--${value}${type === value ? ' is-active' : ''}`}
              onClick={() => setType(value)}
            >
              <span className="ct-type-card-label">{label}</span>
            </button>
          ))}
        </nav>
      }
      contentClassName="ct-page-content"
    >
      {error ? (
        <p className="m0-error ct-error" data-testid="tag-page-error">
          {error}
        </p>
      ) : null}

      <div className="ct-main">
        <section className="ct-column ct-column--categories">
          <div className="ct-column-header">
            <span className="ct-column-title">分类</span>
            <span className="ct-column-count">{categories.length}</span>
            <Button
              variant="primary"
              size="sm"
              className="ct-add-btn"
              testId="category-open-create"
              disabled={!ledgerId}
              icon={
                <span className="ct-add-btn-icon">
                  <Icon name="Plus" size={14} />
                </span>
              }
              onClick={openCategoryModal}
            >
              新增分类
            </Button>
          </div>
          <div className="ct-column-body-wrap">
            {!ledgerId
              ? emptyHint('请先选择工作空间')
              : categories.length === 0
                ? emptyHint('暂无分类')
                : (
                    <div className="ct-column-body">
                      {categories.map((category, index) => (
                        <div
                          key={category.name}
                          className={`ct-drag-item ui-drag-item${dragCategory === index ? ' is-dragging' : ''}${overCategory === index ? ' is-over' : ''}`}
                          data-testid="category-item"
                          draggable
                          onDragStart={() => setDragCategory(index)}
                          onDragOver={(event) => {
                            event.preventDefault()
                            setOverCategory(index)
                          }}
                          onDrop={() => {
                            if (dragCategory !== null) void moveCategory(dragCategory, index)
                          }}
                          onDragEnd={() => {
                            setDragCategory(null)
                            setOverCategory(null)
                          }}
                        >
                          <div
                            className={`ct-list-item${selectedCategory === category.name ? ' is-active' : ''}`}
                            onClick={() => setSelectedCategory(category.name)}
                          >
                            <span className="ui-drag-handle" title="拖动排序">
                              <Icon name="DragHandle" size={16} />
                            </span>
                            <div className="ct-item-main">
                              <span className="ct-item-name">{category.name}</span>
                              {category.recordCount !== 0 ? (
                                <span className="ct-item-badge">{category.recordCount}</span>
                              ) : null}
                            </div>
                            <div className="ct-item-actions">
                              <button
                                type="button"
                                className="tr-icon-btn is-danger"
                                data-testid="category-delete"
                                aria-label={`删除分类 ${category.name}`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setDeleteTarget({ kind: 'category', name: category.name })
                                }}
                              >
                                <Icon name="Trash" size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
          </div>
        </section>

        <section className="ct-column ct-column--tags">
          <div className="ct-column-header">
            <span className="ct-column-title">{selectedCategory || '标签'}</span>
            <span className="ct-column-count">{tags.length}</span>
            <Button
              variant="secondary"
              size="sm"
              className="ct-add-btn"
              testId="tag-open-create"
              disabled={!ledgerId || !selectedCategory}
              icon={
                <span className="ct-add-btn-icon">
                  <Icon name="Plus" size={14} />
                </span>
              }
              onClick={openTagModal}
            >
              新增标签
            </Button>
          </div>
          <div className="ct-column-body-wrap">
            {!selectedCategory
              ? emptyHint('选择分类查看标签')
              : tags.length === 0
                ? emptyHint('暂无标签')
                : (
                    <div className="ct-column-body">
                      {tags.map((tag, index) => (
                        <div
                          key={tag.name}
                          className={`ct-drag-item ui-drag-item${dragTag === index ? ' is-dragging' : ''}${overTag === index ? ' is-over' : ''}`}
                          data-testid="tag-item"
                          draggable
                          onDragStart={() => setDragTag(index)}
                          onDragOver={(event) => {
                            event.preventDefault()
                            setOverTag(index)
                          }}
                          onDrop={() => {
                            if (dragTag !== null) void moveTag(dragTag, index)
                          }}
                          onDragEnd={() => {
                            setDragTag(null)
                            setOverTag(null)
                          }}
                        >
                          <div className="ct-list-item">
                            <span className="ui-drag-handle" title="拖动排序">
                              <Icon name="DragHandle" size={16} />
                            </span>
                            <div className="ct-item-main">
                              <span className="ct-item-name">{tag.name}</span>
                              {tag.recordCount !== 0 ? (
                                <span className="ct-item-badge">{tag.recordCount}</span>
                              ) : null}
                            </div>
                            <div className="ct-item-actions">
                              <button
                                type="button"
                                className="tr-icon-btn is-danger"
                                data-testid="tag-delete"
                                aria-label={`删除标签 ${tag.name}`}
                                onClick={() =>
                                  setDeleteTarget({ kind: 'tag', name: tag.name })
                                }
                              >
                                <Icon name="Trash" size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
          </div>
        </section>
      </div>

      <Modal
        open={categoryModalOpen}
        title="新增分类"
        width={400}
        centered
        destroyOnHidden
        footer={null}
        onCancel={closeCategoryModal}
      >
        <div className="ct-modal-form">
          <Input
            data-testid="category-name"
            placeholder="输入分类名称"
            maxLength={NAME_MAX_LENGTH}
            value={categoryName}
            onChange={(event) => setCategoryName(event.target.value)}
            onPressEnter={() => void confirmCategory()}
          />
          {categoryError ? (
            <p className="m0-error" data-testid="category-error">
              {categoryError}
            </p>
          ) : null}
        </div>
        <div className="tr-modal-footer">
          <Button variant="secondary" testId="category-cancel" onClick={closeCategoryModal}>
            取消
          </Button>
          <Button
            variant="primary"
            testId="category-create"
            disabled={!categoryName.trim() || !ledgerId}
            onClick={() => void confirmCategory()}
          >
            确认
          </Button>
        </div>
      </Modal>

      <Modal
        open={tagModalOpen}
        title="新增标签"
        width={400}
        centered
        destroyOnHidden
        footer={null}
        onCancel={closeTagModal}
      >
        <div className="ct-modal-form">
          <Input
            data-testid="tag-name"
            placeholder="输入标签名称"
            maxLength={NAME_MAX_LENGTH}
            value={tagName}
            onChange={(event) => setTagName(event.target.value)}
            onPressEnter={() => void confirmTag()}
          />
          {tagError ? (
            <p className="m0-error" data-testid="tag-error">
              {tagError}
            </p>
          ) : null}
        </div>
        <div className="tr-modal-footer">
          <Button variant="secondary" testId="tag-cancel" onClick={closeTagModal}>
            取消
          </Button>
          <Button
            variant="primary"
            testId="tag-create"
            disabled={!tagName.trim() || !selectedCategory}
            onClick={() => void confirmTag()}
          >
            确认
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget?.kind === 'tag' ? '删除标签' : '删除分类'}
        message={
          deleteTarget
            ? `确定删除${deleteTarget.kind === 'tag' ? '标签' : '分类'}「${deleteTarget.name}」？`
            : ''
        }
        confirmText="删除"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </PageLayout>
  )
}
