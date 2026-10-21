import { useCallback, useEffect, useState, type JSX } from 'react'
import { Input, Select } from 'antd'

import { Button } from '../components/button'
import { Icon } from '../components/icon'
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
        <Select
          data-testid="tag-type"
          value={type}
          style={{ width: 110 }}
          onChange={setType}
          options={[
            { value: 'expense', label: '支出' },
            { value: 'income', label: '收入' },
            { value: 'transfer', label: '转账' },
          ]}
        />
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
            <Input
              data-testid="category-name"
              placeholder="新分类"
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
            />
            <Button
              variant="text"
              testId="category-create"
              disabled={!ledgerId}
              onClick={() => void createCategory()}
            >
              新建分类
            </Button>
          </div>
          <ul className="m0-tag-list">
            {categories.map((category, index) => (
              <li key={category.name} data-testid="category-item">
                <span>
                  {category.name} · {category.recordCount} 笔
                </span>
                <span className="m0-actions">
                  <Button
                    variant="text"
                    size="sm"
                    aria-label="上移"
                    disabled={index === 0}
                    onClick={() => void moveCategory(category.name, index - 1)}
                  >
                    <Icon name="Up" size={12} />
                  </Button>
                  <Button
                    variant="text"
                    size="sm"
                    aria-label="下移"
                    disabled={index === categories.length - 1}
                    onClick={() => void moveCategory(category.name, index + 1)}
                  >
                    <Icon name="Down" size={12} />
                  </Button>
                  <Button
                    variant="text-danger"
                    size="sm"
                    testId="category-delete"
                    onClick={() => void deleteCategory(category.name)}
                  >
                    删除
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="m0-subtitle">标签</h3>
          <div className="m0-actions">
            <span className="tr-select-wrap" data-testid="tag-category">
              <Select
                value={tagCategory}
                style={{ width: 140 }}
                showSearch
                optionFilterProp="label"
                onChange={setTagCategory}
                options={categories.map((category) => ({
                  value: category.name,
                  label: category.name,
                }))}
              />
            </span>
            <Input
              data-testid="tag-name"
              placeholder="新标签"
              value={tagName}
              onChange={(event) => setTagName(event.target.value)}
            />
            <Button
              variant="text"
              testId="tag-create"
              disabled={!ledgerId}
              onClick={() => void createTag()}
            >
              新建标签
            </Button>
          </div>
          <ul className="m0-tag-list">
            {tags.map((tag) => (
              <li key={`${tag.categoryTransactionType}-${tag.name}`} data-testid="tag-item">
                <span>
                  {tag.name} · {tag.categoryTransactionType} · {tag.recordCount} 笔
                </span>
                <Button
                  variant="text-danger"
                  size="sm"
                  testId="tag-delete"
                  onClick={() => void deleteTag(tag)}
                >
                  删除
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PageLayout>
  )
}

