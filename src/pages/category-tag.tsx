import { useCallback, useEffect, useState, type JSX } from 'react'

import { reorderWithChanges } from '../../shared/domain/list-order'
import type { CategoryDto, TagDto } from '../../shared/types/category'
import { PageLayout } from '../components/page-layout'
import { notify } from '../components/toast'
import { CategoryColumn } from './category-column'
import { CategoryTagModals, type DeleteTarget } from './category-tag-modals'
import { TagColumn } from './tag-column'

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
        <p role="alert" className="m0-error ct-error" data-testid="tag-page-error">
          {error}
        </p>
      ) : null}

      <div className="ct-main">
        <CategoryColumn
          categories={categories}
          selectedName={selectedCategory}
          hasLedger={Boolean(ledgerId)}
          onSelect={setSelectedCategory}
          onAdd={openCategoryModal}
          onDelete={(name) => setDeleteTarget({ kind: 'category', name })}
          onMove={(from, to) => void moveCategory(from, to)}
        />
        <TagColumn
          tags={tags}
          selectedCategory={selectedCategory}
          hasLedger={Boolean(ledgerId)}
          onAdd={openTagModal}
          onDelete={(name) => setDeleteTarget({ kind: 'tag', name })}
          onMove={(from, to) => void moveTag(from, to)}
        />
      </div>

      <CategoryTagModals
        categoryOpen={categoryModalOpen}
        categoryName={categoryName}
        categoryError={categoryError}
        categoryDisabled={!categoryName.trim() || !ledgerId}
        tagOpen={tagModalOpen}
        tagName={tagName}
        tagError={tagError}
        tagDisabled={!tagName.trim() || !selectedCategory}
        deleteTarget={deleteTarget}
        onCategoryNameChange={setCategoryName}
        onCategoryClose={closeCategoryModal}
        onCategoryConfirm={() => void confirmCategory()}
        onTagNameChange={setTagName}
        onTagClose={closeTagModal}
        onTagConfirm={() => void confirmTag()}
        onDeleteCancel={() => setDeleteTarget(null)}
        onDeleteConfirm={() => void confirmDelete()}
      />
    </PageLayout>
  )
}
