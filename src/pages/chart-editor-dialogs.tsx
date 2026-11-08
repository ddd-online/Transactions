import type { JSX } from 'react'
import { Input, Modal, Select } from 'antd'

import type { CategoryDto } from '../../shared/types/category'
import { Button } from '../components/button'
import { Segmented } from '../components/segmented'
import {
  CHART_TYPES,
  GRANULARITIES,
  GROUP_FIELDS,
  LINE_TYPES,
  categoryOptionsFor,
} from './chart-options'

export interface CreateChartDialogProps {
  open: boolean
  title: string
  /** 图表类型：line / pie */
  type: string
  granularity: string
  groupField: string
  groupType: string
  groupCategory: string
  categories: CategoryDto[]
  creating: boolean
  error: string
  onTitleChange: (title: string) => void
  onTypeChange: (type: string) => void
  onGranularityChange: (granularity: string) => void
  onGroupFieldChange: (field: string) => void
  onGroupTypeChange: (type: string) => void
  onGroupCategoryChange: (category: string) => void
  onCancel: () => void
  onCreate: () => void
}

/** 新增图表：名称 / 类型；饼图选分组字段，折线图选时间粒度。 */
export function CreateChartDialog({
  open,
  title,
  type,
  granularity,
  groupField,
  groupType,
  groupCategory,
  categories,
  creating,
  error,
  onTitleChange,
  onTypeChange,
  onGranularityChange,
  onGroupFieldChange,
  onGroupTypeChange,
  onGroupCategoryChange,
  onCancel,
  onCreate,
}: CreateChartDialogProps): JSX.Element {
  return (
    <Modal
      open={open}
      title="新增图表"
      width={400}
      centered
      destroyOnHidden
      footer={null}
      onCancel={onCancel}
    >
      <div className="tr-modal-form">
        <div className="tr-modal-field">
          <span className="tr-modal-label">图表名称</span>
          <Input
            aria-label="图表名称"
            data-testid="chart-title"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'chart-create-error' : undefined}
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            onPressEnter={onCreate}
          />
        </div>
        <div className="tr-modal-field">
          <span className="tr-modal-label">图表类型</span>
          <Segmented
            ariaLabel="图表类型"
            testId="chart-create-type"
            block
            value={type}
            options={CHART_TYPES}
            onChange={onTypeChange}
          />
        </div>
        {type === 'pie' ? (
          <>
            <div className="tr-modal-field">
              <span className="tr-modal-label">分组字段</span>
              <Select
                data-testid="chart-create-group"
                aria-label="分组字段"
                value={groupField}
                onChange={(value: string) => onGroupFieldChange(value)}
                options={GROUP_FIELDS}
              />
            </div>
            {groupField !== 'transactionType' ? (
              <div className="tr-modal-field">
                <span className="tr-modal-label">交易类型</span>
                <Select
                  data-testid="chart-create-group-type"
                  aria-label="交易类型"
                  value={groupType}
                  onChange={(value: string) => onGroupTypeChange(value)}
                  options={LINE_TYPES}
                />
              </div>
            ) : null}
            {groupField === 'tag' ? (
              <div className="tr-modal-field">
                <span className="tr-modal-label">分类</span>
                <Select
                  data-testid="chart-create-group-category"
                  aria-label="分类"
                  placeholder="选择分类"
                  value={groupCategory || undefined}
                  onChange={onGroupCategoryChange}
                  options={categoryOptionsFor(categories, groupType)}
                />
              </div>
            ) : null}
          </>
        ) : (
          <div className="tr-modal-field">
            <span className="tr-modal-label">时间粒度</span>
            <Select
              data-testid="chart-create-granularity"
              aria-label="时间粒度"
              value={granularity}
              onChange={onGranularityChange}
              options={GRANULARITIES}
            />
          </div>
        )}
        {error ? (
          <p role="alert" id="chart-create-error" className="m0-error" data-testid="chart-create-error">
            {error}
          </p>
        ) : null}
        <div className="tr-modal-footer">
          <Button variant="secondary" testId="chart-create-cancel" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="primary"
            testId="chart-create"
            loading={creating}
            disabled={creating}
            onClick={onCreate}
          >
            新增
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export interface RenameChartDialogProps {
  open: boolean
  title: string
  error: string
  renaming: boolean
  onTitleChange: (title: string) => void
  onCancel: () => void
  onRename: () => void
}

/** 重命名图表：只改标题，其余字段由页面按原样回写。 */
export function RenameChartDialog({
  open,
  title,
  error,
  renaming,
  onTitleChange,
  onCancel,
  onRename,
}: RenameChartDialogProps): JSX.Element {
  return (
    <Modal
      open={open}
      title="重命名图表"
      width={400}
      centered
      destroyOnHidden
      footer={null}
      onCancel={onCancel}
    >
      <div className="tr-modal-form">
        <div className="tr-modal-field">
          <span className="tr-modal-label">图表名称</span>
          <Input
            aria-label="图表名称"
            data-testid="chart-rename-input"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'chart-rename-error' : undefined}
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            onPressEnter={onRename}
          />
        </div>
        {error ? (
          <p
            role="alert"
            id="chart-rename-error"
            className="m0-error"
            data-testid="chart-rename-error"
          >
            {error}
          </p>
        ) : null}
        <div className="tr-modal-footer">
          <Button variant="secondary" testId="chart-rename-cancel" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="primary"
            testId="chart-rename-save"
            loading={renaming}
            disabled={renaming}
            onClick={onRename}
          >
            重命名
          </Button>
        </div>
      </div>
    </Modal>
  )
}
