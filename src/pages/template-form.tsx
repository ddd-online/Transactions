import type { JSX } from 'react'
import { Checkbox, Input, Modal, Select } from 'antd'

import { Button } from '../components/button'
import { Segmented } from '../components/segmented'

const TYPE_OPTIONS = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '转账' },
]

const NAME_MAX_LENGTH = 20
const DESCRIPTION_MAX_LENGTH = 50

export interface TemplateFormProps {
  open: boolean
  name: string
  type: string
  category: string
  tags: string[]
  description: string
  /** 离群值开关 */
  outlier: boolean
  error: string
  saving: boolean
  categories: string[]
  tagNames: string[]
  hasLedger: boolean
  onNameChange: (name: string) => void
  onTypeChange: (type: string) => void
  onCategoryChange: (category: string | undefined) => void
  onTagsChange: (tags: string[]) => void
  onDescriptionChange: (description: string) => void
  onOutlierChange: (outlier: boolean) => void
  onClose: () => void
  onSubmit: () => void
}

/** 新建模板弹窗：类型 / 分类 / 标签 / 描述 / 离群值开关。 */
export function TemplateForm({
  open,
  name,
  type,
  category,
  tags,
  description,
  outlier,
  error,
  saving,
  categories,
  tagNames,
  hasLedger,
  onNameChange,
  onTypeChange,
  onCategoryChange,
  onTagsChange,
  onDescriptionChange,
  onOutlierChange,
  onClose,
  onSubmit,
}: TemplateFormProps): JSX.Element {
  return (
    <Modal
      open={open}
      title="新建模板"
      width={520}
      centered
      destroyOnHidden
      footer={null}
      onCancel={onClose}
    >
      <div className="tr-modal-form">
        <div className="tr-modal-field">
          <span className="tr-modal-label">模板名称</span>
          <Input
            aria-label="模板名称"
            data-testid="template-name"
            placeholder="请输入模板名称"
            maxLength={NAME_MAX_LENGTH}
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
          />
        </div>

        <div className="tr-modal-field">
          <span className="tr-modal-label">交易类型</span>
          <Segmented
            ariaLabel="交易类型"
            testId="template-type"
            value={type}
            onChange={onTypeChange}
            options={TYPE_OPTIONS}
          />
        </div>

        <div className="tr-modal-field">
          <span className="tr-modal-label">分类</span>
          <Select
            aria-label="分类"
            data-testid="template-category"
            value={category || undefined}
            placeholder="选择消费分类"
            allowClear
            showSearch
            optionFilterProp="label"
            popupMatchSelectWidth={false}
            onChange={onCategoryChange}
            options={categories.map((categoryName) => ({
              value: categoryName,
              label: categoryName,
            }))}
          />
        </div>

        <div className="tr-modal-field">
          <span className="tr-modal-label">标签</span>
          {tagNames.length === 0 ? (
            <span className="page-hint">该分类下暂无标签</span>
          ) : (
            <Checkbox.Group
              value={tags}
              options={tagNames.map((tagName) => ({ value: tagName, label: tagName }))}
              onChange={(values) => onTagsChange(values.map(String))}
            />
          )}
        </div>

        <div className="tr-modal-field">
          <span className="tr-modal-label">描述</span>
          <Input
            aria-label="描述"
            data-testid="template-description"
            placeholder="请输入描述"
            maxLength={DESCRIPTION_MAX_LENGTH}
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
          />
        </div>

        <div className="tr-modal-field">
          <span className="tr-modal-label">标记</span>
          <Checkbox
            data-testid="template-outlier"
            checked={outlier}
            onChange={(event) => onOutlierChange(event.target.checked)}
          >
            离群值
          </Checkbox>
        </div>

        {error ? (
          <p role="alert" className="m0-error" data-testid="template-modal-error">
            {error}
          </p>
        ) : null}

        <div className="tr-modal-footer">
          <Button variant="secondary" testId="template-cancel" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            testId="template-create"
            loading={saving}
            disabled={saving || !hasLedger}
            onClick={onSubmit}
          >
            保存
          </Button>
        </div>
      </div>
    </Modal>
  )
}
