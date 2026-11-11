import { useEffect, useState, type JSX } from 'react'

import { Input, Modal } from 'antd'

import type { StockReviewSettingDto } from '../../shared/types/stock'
import { Button } from '../components/button'
import { notify } from '../components/toast'

/** 模板回写：`dailyTemplate` 省略 = 只改本轮复盘模板，每日模板保持原样。 */
export interface StockReviewTemplateWrite {
  template: string
  dailyTemplate?: string
}

export interface StockSettingsTemplatesProps {
  /** 载入 / 换账本后的生效模板；模块据此重铺草稿 */
  settings: StockReviewSettingDto | null
  /** 落库留在页面；返回 `null` 表示失败（页面已提示），草稿保持原样 */
  onSave: (write: StockReviewTemplateWrite) => Promise<StockReviewSettingDto | null>
}

/** 本轮 / 每日复盘模板：各自一行入口、一张编辑弹窗，草稿与恢复默认都归这里。 */
export function StockSettingsTemplates({
  settings,
  onSave,
}: StockSettingsTemplatesProps): JSX.Element {
  const [template, setTemplate] = useState('')
  const [dailyTemplate, setDailyTemplate] = useState('')
  const [templateOpen, setTemplateOpen] = useState(false)
  const [dailyTemplateOpen, setDailyTemplateOpen] = useState(false)

  useEffect(() => {
    if (!settings) return
    setTemplate(settings.template)
    setDailyTemplate(settings.dailyTemplate)
  }, [settings])

  /** 保存 / 恢复默认走同一条回写：成功后把服务端生效的那份铺回草稿。 */
  const apply = async (write: StockReviewTemplateWrite): Promise<boolean> => {
    const saved = await onSave(write)
    if (!saved) return false
    setTemplate(saved.template)
    setDailyTemplate(saved.dailyTemplate)
    return true
  }

  const saveTemplate = async (): Promise<void> => {
    if (!(await apply({ template }))) return
    setTemplateOpen(false)
    notify('复盘模板已保存')
  }

  const saveDailyTemplate = async (): Promise<void> => {
    if (!(await apply({ template, dailyTemplate }))) return
    setDailyTemplateOpen(false)
    notify('每日复盘模板已保存')
  }

  const resetTemplate = async (): Promise<void> => {
    await apply({ template: '' })
  }

  const resetDailyTemplate = async (): Promise<void> => {
    await apply({ template, dailyTemplate: '' })
  }

  return (
    <>
      <section className="stock-setting-row">
        <div className="stock-setting-row__info">
          <h2>本轮复盘模板</h2>
          <p>最多 200 字；留空用内置模板。</p>
        </div>
        <div className="stock-setting-row__actions">
          <Button
            variant="secondary"
            testId="stock-template-open"
            onClick={() => setTemplateOpen(true)}
          >
            修改
          </Button>
        </div>
      </section>

      <section className="stock-setting-row">
        <div className="stock-setting-row__info">
          <h2>每日复盘模板</h2>
          <p>最多 200 字；留空用内置模板。</p>
        </div>
        <div className="stock-setting-row__actions">
          <Button
            variant="secondary"
            testId="stock-daily-template-open"
            onClick={() => setDailyTemplateOpen(true)}
          >
            修改
          </Button>
        </div>
      </section>

      <Modal
        open={templateOpen}
        title="本轮复盘模板"
        width={720}
        centered
        footer={null}
        onCancel={() => setTemplateOpen(false)}
      >
        <div className="stock-modal-form">
          <Input.TextArea
            className="stock-template-input"
            data-testid="stock-template"
            rows={8}
            value={template}
            onChange={(event) => setTemplate(event.target.value)}
          />
          <div className="stock-modal-actions stock-template-actions">
            <Button variant="secondary" testId="stock-template-reset" onClick={() => void resetTemplate()}>
              恢复默认
            </Button>
            <span className="stock-template-actions__spacer" />
            <Button variant="secondary" onClick={() => setTemplateOpen(false)}>
              取消
            </Button>
            <Button variant="primary" testId="stock-template-save" onClick={() => void saveTemplate()}>
              保存
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={dailyTemplateOpen}
        title="每日复盘模板"
        width={720}
        centered
        footer={null}
        onCancel={() => setDailyTemplateOpen(false)}
      >
        <div className="stock-modal-form">
          <Input.TextArea
            className="stock-template-input"
            data-testid="stock-daily-template"
            rows={6}
            value={dailyTemplate}
            onChange={(event) => setDailyTemplate(event.target.value)}
          />
          <div className="stock-modal-actions stock-template-actions">
            <Button variant="secondary" testId="stock-daily-template-reset" onClick={() => void resetDailyTemplate()}>
              恢复默认
            </Button>
            <span className="stock-template-actions__spacer" />
            <Button variant="secondary" onClick={() => setDailyTemplateOpen(false)}>
              取消
            </Button>
            <Button variant="primary" testId="stock-daily-template-save" onClick={() => void saveDailyTemplate()}>
              保存
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
