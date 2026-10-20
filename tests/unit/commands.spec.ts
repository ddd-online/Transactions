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

  it('validates import requests', () => {
    expect(commandSchemas.legacy_import_probe.safeParse({ workspaceDir: 'D:\\old' }).success).toBe(
      true,
    )
    expect(commandSchemas.legacy_import_probe.safeParse({}).success).toBe(false)
    expect(
      commandSchemas.legacy_import_start.safeParse({ sourceDir: 'a', targetDir: 'b' }).success,
    ).toBe(true)
    expect(commandSchemas.legacy_import_start.safeParse({ sourceDir: 'a' }).success).toBe(false)
  })
})
