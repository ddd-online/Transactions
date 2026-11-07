import { describe, expect, it } from 'vitest'

import {
  AppError,
  ERR_CODE_DEFAULT,
  ERR_CODE_WORKSPACE_NOT_OPENED,
  errorMessage,
  isNotFoundError,
  toErrorEnvelope,
  workspaceNotOpened,
} from '../../shared/errors'

describe('isNotFoundError', () => {
  it('认出 AppError 的 404（「查无此行」是 DAO 的既有约定）', () => {
    expect(isNotFoundError(new AppError('查无此行', { status: 404 }))).toBe(true)
  })

  it('其它状态码不算「不存在」', () => {
    expect(isNotFoundError(new AppError('参数错', { status: 400 }))).toBe(false)
    expect(isNotFoundError(new AppError('服务错'))).toBe(false)
    expect(isNotFoundError(new AppError('冲突', { status: 409 }))).toBe(false)
  })

  it('非 AppError 一律不算（别的库的 404 / 裸对象 / 非错误值）', () => {
    expect(isNotFoundError(new Error('查无此行'))).toBe(false)
    expect(isNotFoundError({ status: 404 })).toBe(false)
    expect(isNotFoundError('404')).toBe(false)
    expect(isNotFoundError(null)).toBe(false)
    expect(isNotFoundError(undefined)).toBe(false)
  })
})

describe('error envelope', () => {
  it('AppError 带上自己的 code / status', () => {
    expect(toErrorEnvelope(new AppError('未打开工作空间', {
      code: ERR_CODE_WORKSPACE_NOT_OPENED,
      status: 500,
    }))).toEqual({
      code: ERR_CODE_WORKSPACE_NOT_OPENED,
      msg: '未打开工作空间',
      status: 500,
    })
  })

  it('普通 Error 与非错误值都归到默认 code / 500', () => {
    expect(toErrorEnvelope(new Error('炸了'))).toEqual({
      code: ERR_CODE_DEFAULT,
      msg: '炸了',
      status: 500,
    })
    expect(toErrorEnvelope('炸了')).toEqual({
      code: ERR_CODE_DEFAULT,
      msg: '炸了',
      status: 500,
    })
  })

  it('封出来的形状能被渲染层念回同一句话', () => {
    // 主进程往外封、渲染层往里读，是同一条错误的两个方向
    const error = new AppError('本轮的费用设置在建仓时确定，不可更改', { status: 400 })
    expect(errorMessage(toErrorEnvelope(error))).toBe(error.message)
    expect(errorMessage(error)).toBe(error.message)
    expect(errorMessage('炸了')).toBe('炸了')
  })

  it('"未打开工作空间" 用固定的 code', () => {
    const error = workspaceNotOpened()
    expect(error.code).toBe(ERR_CODE_WORKSPACE_NOT_OPENED)
    expect(error.status).toBe(500)
  })
})
