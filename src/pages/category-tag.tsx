import { useCallback, useEffect, useState, type JSX } from 'react'
import { PageLayout } from '../components/page-layout'

import type { CategoryDto, TagDto } from '../../shared/types/category'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

export interface CategoryTagPageProps {
  ledgerId: string
}

/** 记账 · 标签：分类与标签两栏，支持新建、删除、上下移动。 */
export function CategoryTagPage({ ledgerId }: CategoryTagPageProps): JSX.Element {
  const [type, setType] = useState('expense')
  const [categories, setCategories] = useState<CategoryDto[]>([])
  const [tags, setTags] = useState<TagDto[]>([])
  const [categoryName, setCategoryName] = useState('')
  const [tagName, setTagName] = useState('')
  const [tagCategory, setTagCategory] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setCategories([])
      setTags([])
      return
    }
    try {
      const [categoryRows, tagRows] = await Promise.all([
        window.api.invoke('category_list', { ledgerId, type }),
        window.api.invoke('tag_list', { ledgerId, categoryTransactionType: '' }),
      ])
      setCategories(categoryRows)
      setTags(tagRows)
      setTagCategory((current) => current || categoryRows[0]?.name || '')
      setError('')
    } catch (loadError) {
      setError(errorMessage(loadError))
    }
  }, [ledgerId, type])

  useEffect(() => {
    void load()
  }, [load])

  const createCategory = useCallback(async (): Promise<void> => {
    if (!categoryName.trim()) return
    setError('')
    try {
      await window.api.invoke('category_create', {
        ledgerId,
        name: categoryName.trim(),
        transactionType: type,
      })
      setCategoryName('')
      await load()
    } catch (createError) {
      setError(errorMessage(createError))
    }
  }, [categoryName, ledgerId, load, type])

  const deleteCategory = useCallback(
    async (name: string): Promise<void> => {
      setError('')
      try {
        await window.api.invoke('category_delete', {
          ledgerId,
          name,
          transactionType: type,
        })
        await load()
      } catch (deleteError) {
        setError(errorMessage(deleteError))
      }
    },
    [ledgerId, load, type],
  )

  const moveCategory = useCallback(
    async (name: string, sortOrder: number): Promise<void> => {
      setError('')
      try {
        await window.api.invoke('category_update_sort', {
          ledgerId,
          name,
          transactionType: type,
          sortOrder,
        })
        await load()
      } catch (sortError) {
        setError(errorMessage(sortError))
      }
    },
    [ledgerId, load, type],
  )

  const createTag = useCallback(async (): Promise<void> => {
    if (!tagName.trim() || !tagCategory) return
    setError('')
    try {
      await window.api.invoke('tag_create', {
        ledgerId,
        name: tagName.trim(),
        categoryTransactionType: `${tagCategory}:${type}`,
      })
      setTagName('')
      await load()
    } catch (createError) {
      setError(errorMessage(createError))
    }
  }, [ledgerId, load, tagCategory, tagName, type])

  const deleteTag = useCallback(
    async (tag: TagDto): Promise<void> => {
      setError('')
      try {
        await window.api.invoke('tag_delete', {
          ledgerId,
          name: tag.name,
          categoryTransactionType: tag.categoryTransactionType,
        })
        await load()
      } catch (deleteError) {
        setError(errorMessage(deleteError))
      }
    },
    [ledgerId, load],
  )

  return (
    <PageLayout>
      <div className="m0-card-head">
        <h2>记账 · 分类与标签</h2>
        <select
          className="m0-input"
          data-testid="tag-type"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="expense">支出</option>
          <option value="income">收入</option>
          <option value="transfer">转账</option>
        </select>
      </div>

      {error ? (
        <p className="m0-error" data-testid="tag-error">
          {error}
        </p>
      ) : null}

      <div className="m0-category-tag">
        <div>
          <h3 className="m0-subtitle">分类</h3>
          <div className="m0-actions">
            <input
              className="m0-input"
              data-testid="category-name"
              placeholder="新分类"
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
            />
            <button
              type="button"
              className="m0-link"
              data-testid="category-create"
              disabled={!ledgerId}
              onClick={() => void createCategory()}
            >
              新建分类
            </button>
          </div>
          <ul className="m0-tag-list">
            {categories.map((category, index) => (
              <li key={category.name} data-testid="category-item">
                <span>
                  {category.name} · {category.recordCount} 笔
                </span>
                <span className="m0-actions">
                  <button
                    type="button"
                    className="m0-link"
                    disabled={index === 0}
                    onClick={() => void moveCategory(category.name, index - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="m0-link"
                    disabled={index === categories.length - 1}
                    onClick={() => void moveCategory(category.name, index + 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="m0-link"
                    data-testid="category-delete"
                    onClick={() => void deleteCategory(category.name)}
                  >
                    删除
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="m0-subtitle">标签</h3>
          <div className="m0-actions">
            <select
              className="m0-input"
              data-testid="tag-category"
              value={tagCategory}
              onChange={(event) => setTagCategory(event.target.value)}
            >
              {categories.map((category) => (
                <option key={category.name} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
            <input
              className="m0-input"
              data-testid="tag-name"
              placeholder="新标签"
              value={tagName}
              onChange={(event) => setTagName(event.target.value)}
            />
            <button
              type="button"
              className="m0-link"
              data-testid="tag-create"
              disabled={!ledgerId}
              onClick={() => void createTag()}
            >
              新建标签
            </button>
          </div>
          <ul className="m0-tag-list">
            {tags.map((tag) => (
              <li key={`${tag.categoryTransactionType}-${tag.name}`} data-testid="tag-item">
                <span>
                  {tag.name} · {tag.categoryTransactionType} · {tag.recordCount} 笔
                </span>
                <button
                  type="button"
                  className="m0-link"
                  data-testid="tag-delete"
                  onClick={() => void deleteTag(tag)}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PageLayout>
  )
}

