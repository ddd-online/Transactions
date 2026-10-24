import { describe, expect, it } from 'vitest'

import { COMMAND_NAMES, commandSchemas } from '../../shared/commands'

describe('command catalog', () => {
  it('has unique names', () => {
    expect(new Set(COMMAND_NAMES).size).toBe(COMMAND_NAMES.length)
  })

  it('validates required request fields', () => {
    expect(commandSchemas.workspace_open.safeParse({ workspaceDir: 'D:\\ws' }).success).toBe(true)
    expect(commandSchemas.workspace_open.safeParse({}).success).toBe(false)
    expect(commandSchemas.app_info.safeParse({ field: 'version' }).success).toBe(true)
    expect(commandSchemas.app_info.safeParse({ field: 'other' }).success).toBe(false)
    expect(commandSchemas.window_control.safeParse({ action: 'close' }).success).toBe(true)
    expect(commandSchemas.window_control.safeParse({ action: 'hide' }).success).toBe(false)
  })

  it('accepts undefined for no-argument commands', () => {
    expect(commandSchemas.config_get.safeParse(undefined).success).toBe(true)
    expect(commandSchemas.workspace_get.safeParse(undefined).success).toBe(true)
    expect(commandSchemas.debug_write_asset.safeParse(undefined).success).toBe(true)
  })

  it('validates ledger requests', () => {
    expect(commandSchemas.ledger_list.safeParse({ id: 'all' }).success).toBe(true)
    expect(commandSchemas.ledger_list.safeParse({}).success).toBe(false)
    expect(commandSchemas.ledger_create.safeParse({ name: '账本' }).success).toBe(true)
    expect(commandSchemas.ledger_create.safeParse({}).success).toBe(true)
    expect(commandSchemas.ledger_get.safeParse({ id: 'l1' }).success).toBe(true)
    expect(commandSchemas.ledger_update.safeParse({ id: 'l1', name: '新名' }).success).toBe(true)
    expect(commandSchemas.ledger_delete.safeParse({ id: 'l1' }).success).toBe(true)
  })

  it('validates config requests', () => {
    expect(commandSchemas.config_set_close_behavior.safeParse({ behavior: 'tray' }).success).toBe(
      true,
    )
    expect(
      commandSchemas.config_set_feature.safeParse({ feature: 'stock', enabled: false }).success,
    ).toBe(true)
    expect(
      commandSchemas.config_set_feature.safeParse({ feature: 'stock', enabled: false, ledgerId: 'l1' })
        .success,
    ).toBe(true)
    expect(commandSchemas.config_set_proxy.safeParse({ mode: 'auto', url: '' }).success).toBe(true)
    expect(commandSchemas.config_set_appearance.safeParse({ appearance: 'dark' }).success).toBe(true)
    expect(
      commandSchemas.config_set_chart_summary_collapsed.safeParse({ collapsed: true }).success,
    ).toBe(true)
  })

  it('validates transaction requests', () => {
    const dto = { ledgerId: 'l1', price: 100, transactionType: 'expense', category: '餐饮美食' }
    expect(commandSchemas.tr_create.safeParse(dto).success).toBe(true)
    expect(commandSchemas.tr_batch_create.safeParse([dto, dto]).success).toBe(true)
    expect(commandSchemas.tr_query.safeParse({ ledgerId: 'l1' }).success).toBe(true)
    expect(commandSchemas.tr_delete.safeParse({ id: 't1' }).success).toBe(true)
    expect(commandSchemas.tr_link.safeParse({ transaction_id: 't1', date: '2026-01-01' }).success).toBe(
      true,
    )
    expect(commandSchemas.tr_linked_by_date.safeParse({ ledger_id: 'l1', date: '2026-01-01' }).success).toBe(
      true,
    )
    expect(commandSchemas.tr_chart_data.safeParse({ ledgerId: 'l1', lines: [] }).success).toBe(true)
  })

  it('validates chart requests', () => {
    expect(
      commandSchemas.chart_create.safeParse({ ledgerId: 'l1', title: '支出趋势', lines: [] })
        .success,
    ).toBe(true)
    expect(commandSchemas.chart_list.safeParse({ ledgerId: 'l1' }).success).toBe(true)
    expect(commandSchemas.chart_delete.safeParse({ chartId: 'c1' }).success).toBe(true)
    expect(
      commandSchemas.chart_update.safeParse({ chartId: 'c1', title: 'x', sortOrder: 0 }).success,
    ).toBe(true)
  })

  it('validates diary requests', () => {
    expect(commandSchemas.diary_list_dates.safeParse({ ledger_id: 'l1' }).success).toBe(true)
    expect(commandSchemas.diary_get.safeParse({ ledger_id: 'l1', date: '2026-01-01' }).success).toBe(
      true,
    )
    expect(
      commandSchemas.diary_upsert.safeParse({ ledger_id: 'l1', date: '2026-01-01', content: 'x' })
        .success,
    ).toBe(true)
    expect(commandSchemas.diary_import_scan.safeParse({ directory: 'D:\\diary' }).success).toBe(true)
    expect(
      commandSchemas.diary_export.safeParse({ ledger_id: 'l1', directory: 'D:\\out', year: 2026 })
        .success,
    ).toBe(true)
  })

  it('validates key event requests', () => {
    expect(commandSchemas.key_event_list_by_year.safeParse({ ledger_id: 'l1', year: '2026' }).success).toBe(true)
    expect(commandSchemas.key_event_get.safeParse({ ledger_id: 'l1', date: '2026-01-01' }).success).toBe(true)
    expect(
      commandSchemas.key_event_image_add.safeParse({
        ledger_id: 'l1',
        date: '2026-01-01',
        data: 'data:image/png;base64,AA==',
        thumb: 'data:image/jpeg;base64,AA==',
      }).success,
    ).toBe(true)
    expect(commandSchemas.key_event_image_delete.safeParse({ id: 'img-1' }).success).toBe(true)
  })

  it('validates todo requests', () => {
    expect(commandSchemas.todo_cards.safeParse({ ledger_id: 'l1' }).success).toBe(true)
    expect(
      commandSchemas.todo_card_create.safeParse({ ledger_id: 'l1', title: '主题' }).success,
    ).toBe(true)
    expect(
      commandSchemas.todo_item_create.safeParse({ ledger_id: 'l1', card_id: 'c1', title: '事项' })
        .success,
    ).toBe(true)
    expect(commandSchemas.todo_item_status.safeParse({ ledger_id: 'l1', id: 'i1', status: 'done' }).success).toBe(
      true,
    )
    expect(commandSchemas.todo_progress_done.safeParse({ id: 'p1', done: true }).success).toBe(true)
  })

  it('validates stock account requests', () => {
    expect(commandSchemas.stock_account_summary.safeParse({ ledger_id: 'l1' }).success).toBe(true)
    expect(
      commandSchemas.stock_principal_add.safeParse({ ledger_id: 'l1', amount: 100 }).success,
    ).toBe(true)
    expect(
      commandSchemas.stock_fee_settings_put.safeParse({ ledger_id: 'l1', commission_rate: 0.001 })
        .success,
    ).toBe(true)
    expect(
      commandSchemas.stock_fund_records.safeParse({ ledger_id: 'l1', page: 1, pageSize: 10 })
        .success,
    ).toBe(true)
  })

  it('validates stock position requests', () => {
    expect(commandSchemas.stock_overview.safeParse({ ledger_id: 'l1' }).success).toBe(true)
    expect(commandSchemas.stock_positions.safeParse({ ledger_id: 'l1' }).success).toBe(true)
    expect(
      commandSchemas.stock_position_review.safeParse({ ledger_id: 'l1', code: '600519' }).success,
    ).toBe(true)
    expect(
      commandSchemas.stock_position_tag.safeParse({ ledger_id: 'l1', code: '600519', tag: '打板' })
        .success,
    ).toBe(true)
  })

  it('validates stock history requests', () => {
    expect(commandSchemas.stock_history.safeParse({ ledger_id: 'l1' }).success).toBe(true)
    expect(
      commandSchemas.stock_history_detail.safeParse({ ledger_id: 'l1', stock_code: '600519' })
        .success,
    ).toBe(true)
    expect(
      commandSchemas.stock_statistics.safeParse({
        ledger_id: 'l1',
        recent: '20',
        strategy: 'grouped',
        group_size: 5,
      }).success,
    ).toBe(true)
  })

  it('validates stock trade create requests', () => {
    expect(
      commandSchemas.stock_trade_create.safeParse({
        ledger_id: 'l1',
        stock_code: '600519',
        stock_name: '贵州茅台',
        trade_type: 'open',
        fills: [{ price: 1500.5, lots: 1 }],
      }).success,
    ).toBe(true)
    expect(
      commandSchemas.stock_trade_create.safeParse({
        ledger_id: 'l1',
        stock_code: '510300',
        trade_type: 'open',
        price: 3.9,
        lots: 10,
      }).success,
    ).toBe(true)
  })

  it('validates stock lifecycle requests', () => {
    expect(commandSchemas.stock_reset.safeParse({ ledger_id: 'l1' }).success).toBe(true)
    expect(
      commandSchemas.stock_archive.safeParse({ ledger_id: 'l1', name: '归档账本' }).success,
    ).toBe(true)
  })

  it('validates stock trade edit requests', () => {
    expect(
      commandSchemas.stock_trade_update.safeParse({ ledger_id: 'l1', id: 't1', price: 5, lots: 1 })
        .success,
    ).toBe(true)
    expect(
      commandSchemas.stock_trade_order_delete.safeParse({ ledger_id: 'l1', order_id: 'o1' })
        .success,
    ).toBe(true)
    expect(
      commandSchemas.stock_trade_impact.safeParse({
        ledger_id: 'l1',
        action: 'delete_order',
        order_id: 'o1',
      }).success,
    ).toBe(true)
    expect(commandSchemas.stock_operation_rollback.safeParse({ ledger_id: 'l1' }).success).toBe(true)
  })

  it('validates stock review requests', () => {
    expect(
      commandSchemas.stock_day_review.safeParse({
        ledger_id: 'l1',
        code: '600000',
        date: '2026-01-05',
        review: '观察',
      }).success,
    ).toBe(true)
    expect(
      commandSchemas.stock_round_review.safeParse({
        ledger_id: 'l1',
        round_id: 'r1',
        review: '复盘',
      }).success,
    ).toBe(true)
    expect(commandSchemas.stock_name.safeParse({ stock_code: '600000' }).success).toBe(true)
  })

  it('validates update requests', () => {
    expect(commandSchemas.update_check.safeParse({}).success).toBe(true)
    expect(
      commandSchemas.update_download.safeParse({
        url: 'https://github.com/x/a.exe',
        digest: 'sha256:aa',
      }).success,
    ).toBe(true)
    expect(commandSchemas.update_download_status.safeParse({}).success).toBe(true)
    expect(commandSchemas.update_install.safeParse({}).success).toBe(true)
  })

  it('validates template requests', () => {
    expect(
      commandSchemas.template_create.safeParse({
        ledger_id: 'l1',
        template_name: '午餐',
        transaction_type: 'expense',
        category: '餐饮美食',
        tags: ['三餐'],
      }).success,
    ).toBe(true)
    expect(commandSchemas.template_list.safeParse({ ledger_id: 'l1' }).success).toBe(true)
    expect(commandSchemas.template_delete.safeParse({ id: 't1' }).success).toBe(true)
    expect(
      commandSchemas.template_update_sort.safeParse({ id: 't1', sortOrder: 2 }).success,
    ).toBe(true)
  })

  it('validates stock trade list requests', () => {
    expect(
      commandSchemas.stock_trades.safeParse({ ledger_id: 'l1', stock_code: '600000' }).success,
    ).toBe(true)
  })

  it('validates shell/icon/devtools requests', () => {
    expect(commandSchemas.workspace_set.safeParse({ workspaceDir: 'D:/ws' }).success).toBe(true)
    expect(commandSchemas.workspace_icon_set.safeParse({ data: '' }).success).toBe(true)
    expect(commandSchemas.file_save_image.safeParse({ relativePath: 'a.png' }).success).toBe(true)
    expect(commandSchemas.devtools_toggle.safeParse({ enabled: true }).success).toBe(true)
  })

  it('validates import requests', () => {
    expect(commandSchemas.source_import_probe.safeParse({ workspaceDir: 'D:\\old' }).success).toBe(
      true,
    )
    expect(commandSchemas.source_import_probe.safeParse({}).success).toBe(false)
    expect(
      commandSchemas.source_import_start.safeParse({ sourceDir: 'a', targetDir: 'b' }).success,
    ).toBe(true)
    expect(commandSchemas.source_import_start.safeParse({ sourceDir: 'a' }).success).toBe(false)
  })
})


