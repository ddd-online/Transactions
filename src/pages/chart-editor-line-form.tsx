import { useMemo, type JSX } from 'react'
import { Input, Select } from 'antd'

import { tagNamesForCategory } from '../../shared/domain/tag-names'
import type { ChartLine } from '../../shared/domain/models'
import type { CategoryDto, TagDto } from '../../shared/types/category'
import { Button } from '../components/button'
import { Switch } from '../components/switch'
import { LINE_TYPES, TAG_POLICIES, categoryOptionsFor } from './chart-options'

/** 曲线条件的草稿：空串 / 空数组表示那一项「不限」。 */
export interface LineForm {
  label: string
  transactionType: string
  category: string
  tags: string[]
  tagPolicy: string
  description: string
  includeOutlier: boolean
}

export const EMPTY_LINE_FORM: LineForm = {
  label: '',
  transactionType: 'expense',
  category: '',
  tags: [],
  tagPolicy: 'any',
  description: '',
  includeOutlier: true,
}

export function lineFormOf(line: ChartLine): LineForm {
  const condition = line.conditions[0]
  return {
    label: line.label,
    transactionType: line.transactionType,
    category: condition?.category ?? '',
    tags: condition ? [...condition.tags] : [],
    tagPolicy: condition?.tagPolicy === 'all' ? 'all' : 'any',
    description: condition?.description ?? '',
    includeOutlier: line.includeOutlier,
  }
}

/** 表单 → 一条曲线：三项条件都没填就是「不限」。 */
export function chartLineOf(form: LineForm): ChartLine {
  const category = form.category.trim()
  const tags = form.tags.map((tag) => tag.trim()).filter((tag) => tag !== '')
  const description = form.description.trim()
  return {
    label: form.label.trim(),
    transactionType: form.transactionType,
    includeOutlier: form.includeOutlier,
    conditions:
      category === '' && tags.length === 0 && description === ''
        ? []
        : [
            {
              transactionType: form.transactionType,
              category,
              tags,
              tagPolicy: form.tagPolicy,
              tagNot: false,
              description,
            },
          ],
  }
}

export interface ChartLineFormProps {
  form: LineForm
  /** `null` 表示新增曲线 */
  lineIndex: number | null
  error: string
  saving: boolean
  categories: CategoryDto[]
  tags: TagDto[]
  onChange: (next: LineForm) => void
  onSubmit: () => void
  onCancel: () => void
}

/** 曲线条件表单：名称 / 交易类型 / 分类 / 标签 / 匹配方式 / 描述 / 离群值。 */
export function ChartLineForm({
  form,
  lineIndex,
  error,
  saving,
  categories,
  tags,
  onChange,
  onSubmit,
  onCancel,
}: ChartLineFormProps): JSX.Element {
  const categoryOptions = useMemo(
    () => categoryOptionsFor(categories, form.transactionType),
    [categories, form.transactionType],
  )
  const tagOptions = useMemo(
    () =>
      tagNamesForCategory(tags, form.category, form.transactionType).map((name) => ({
        value: name,
        label: name,
      })),
    [form.category, form.transactionType, tags],
  )

  /** 换交易类型：分类与标签都跟着失效（标签按 `分类:类型` 归档）。 */
  const changeLineType = (transactionType: string): void => {
    onChange({ ...form, transactionType, category: '', tags: [] })
  }

  const changeLineCategory = (category: string): void => {
    const valid = new Set(tagNamesForCategory(tags, category, form.transactionType))
    onChange({
      ...form,
      category,
      tags: form.tags.filter((tag) => valid.has(tag)),
    })
  }

  return (
    <div className="tr-modal-form" data-testid="chart-line-dialog">
      <div className="tr-modal-field">
        <span className="tr-modal-label">曲线名称</span>
        <Input
          aria-label="曲线名称"
          data-testid="chart-line-label"
          placeholder="例如：餐饮支出"
          value={form.label}
          maxLength={40}
          onChange={(event) => onChange({ ...form, label: event.target.value })}
          onPressEnter={onSubmit}
        />
      </div>

      <div className="tr-modal-row">
        <div className="tr-modal-field">
          <span className="tr-modal-label">交易类型</span>
          <Select
            aria-label="交易类型"
            data-testid="chart-line-type"
            value={form.transactionType}
            options={LINE_TYPES}
            onChange={(value: string) => changeLineType(value)}
          />
        </div>
        <div className="tr-modal-field">
          <span className="tr-modal-label">分类</span>
          <Select
            aria-label="分类"
            data-testid="chart-line-category"
            value={form.category || undefined}
            placeholder="不限分类"
            allowClear
            options={categoryOptions}
            onChange={(value: string | undefined) => changeLineCategory(value ?? '')}
          />
        </div>
      </div>

      <div className="tr-modal-row">
        <div className="tr-modal-field">
          <span className="tr-modal-label">标签</span>
          <Select
            aria-label="标签"
            data-testid="chart-line-tags"
            mode="multiple"
            allowClear
            placeholder="不限标签"
            value={form.tags}
            options={tagOptions}
            onChange={(value: string[]) => onChange({ ...form, tags: value })}
          />
        </div>
        <div className="tr-modal-field">
          <span className="tr-modal-label">标签匹配</span>
          <Select
            aria-label="标签匹配"
            data-testid="chart-line-policy"
            value={form.tagPolicy}
            options={TAG_POLICIES}
            onChange={(value: string) => onChange({ ...form, tagPolicy: value })}
          />
        </div>
      </div>

      <div className="tr-modal-field">
        <span className="tr-modal-label">描述包含</span>
        <Input
          aria-label="描述包含"
          data-testid="chart-line-description"
          placeholder="输入关键词"
          value={form.description}
          onChange={(event) => onChange({ ...form, description: event.target.value })}
        />
      </div>

      <Switch
        checked={form.includeOutlier}
        testId="chart-line-outlier"
        label="包含离群值"
        onChange={(checked) => onChange({ ...form, includeOutlier: checked })}
      />

      {error ? (
        <p role="alert" className="m0-error" data-testid="chart-line-error">
          {error}
        </p>
      ) : null}
      <div className="tr-modal-footer">
        <Button variant="secondary" testId="chart-line-cancel" onClick={onCancel}>
          取消
        </Button>
        <Button
          variant="primary"
          testId="chart-line-submit"
          loading={saving}
          disabled={saving}
          onClick={onSubmit}
        >
          {lineIndex === null ? '添加' : '保存'}
        </Button>
      </div>
    </div>
  )
}
