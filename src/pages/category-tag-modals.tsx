import type { JSX } from 'react'
import { Input, Modal } from 'antd'

import { Button } from '../components/button'
import { ConfirmDialog } from '../components/confirm-dialog'

const NAME_MAX_LENGTH = 20

/** 删除确认的目标：分类或标签，只带名字。 */
export type DeleteTarget = { kind: 'category' | 'tag'; name: string }

export interface CategoryTagModalsProps {
  categoryOpen: boolean
  categoryName: string
  categoryError: string
  /** 「确认」的禁用条件：名称为空或没有工作空间 */
  categoryDisabled: boolean
  tagOpen: boolean
  tagName: string
  tagError: string
  /** 「确认」的禁用条件：名称为空或没选分类 */
  tagDisabled: boolean
  deleteTarget: DeleteTarget | null
  onCategoryNameChange: (name: string) => void
  onCategoryClose: () => void
  onCategoryConfirm: () => void
  onTagNameChange: (name: string) => void
  onTagClose: () => void
  onTagConfirm: () => void
  onDeleteCancel: () => void
  onDeleteConfirm: () => void
}

/** 新增分类 / 新增标签两张弹窗与删除确认。 */
export function CategoryTagModals({
  categoryOpen,
  categoryName,
  categoryError,
  categoryDisabled,
  tagOpen,
  tagName,
  tagError,
  tagDisabled,
  deleteTarget,
  onCategoryNameChange,
  onCategoryClose,
  onCategoryConfirm,
  onTagNameChange,
  onTagClose,
  onTagConfirm,
  onDeleteCancel,
  onDeleteConfirm,
}: CategoryTagModalsProps): JSX.Element {
  return (
    <>
      <Modal
        open={categoryOpen}
        title="新增分类"
        width={400}
        centered
        destroyOnHidden
        footer={null}
        onCancel={onCategoryClose}
      >
        <div className="ct-modal-form">
          <Input
            data-testid="category-name"
            placeholder="输入分类名称"
            maxLength={NAME_MAX_LENGTH}
            aria-invalid={Boolean(categoryError)}
            aria-describedby={categoryError ? 'category-error' : undefined}
            value={categoryName}
            onChange={(event) => onCategoryNameChange(event.target.value)}
            onPressEnter={onCategoryConfirm}
          />
          {categoryError ? (
            <p role="alert" id="category-error" className="m0-error" data-testid="category-error">
              {categoryError}
            </p>
          ) : null}
        </div>
        <div className="tr-modal-footer">
          <Button variant="secondary" testId="category-cancel" onClick={onCategoryClose}>
            取消
          </Button>
          <Button
            variant="primary"
            testId="category-create"
            disabled={categoryDisabled}
            onClick={onCategoryConfirm}
          >
            确认
          </Button>
        </div>
      </Modal>

      <Modal
        open={tagOpen}
        title="新增标签"
        width={400}
        centered
        destroyOnHidden
        footer={null}
        onCancel={onTagClose}
      >
        <div className="ct-modal-form">
          <Input
            data-testid="tag-name"
            placeholder="输入标签名称"
            maxLength={NAME_MAX_LENGTH}
            aria-invalid={Boolean(tagError)}
            aria-describedby={tagError ? 'tag-error' : undefined}
            value={tagName}
            onChange={(event) => onTagNameChange(event.target.value)}
            onPressEnter={onTagConfirm}
          />
          {tagError ? (
            <p role="alert" id="tag-error" className="m0-error" data-testid="tag-error">
              {tagError}
            </p>
          ) : null}
        </div>
        <div className="tr-modal-footer">
          <Button variant="secondary" testId="tag-cancel" onClick={onTagClose}>
            取消
          </Button>
          <Button
            variant="primary"
            testId="tag-create"
            disabled={tagDisabled}
            onClick={onTagConfirm}
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
        onCancel={onDeleteCancel}
        onConfirm={onDeleteConfirm}
      />
    </>
  )
}
