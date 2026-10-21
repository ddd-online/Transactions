import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MAX_LOG_SIZE = 5 * 1024 * 1024
const MAX_LOG_BACKUPS = 5

let appLogPath: string | null = null
let workspaceLogPath: string | null = null

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

function timestamp(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
    now.getHours(),
  )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function rotateIfNeeded(path: string): void {
  try {
    if (!existsSync(path) || statSync(path).size < MAX_LOG_SIZE) return
  } catch {
    return
  }
  const numbered = (index: number): string => `${path}.${index}`
  try {
    for (let index = MAX_LOG_BACKUPS - 1; index >= 1; index -= 1) {
      if (existsSync(numbered(index))) {
        renameSync(numbered(index), numbered(index + 1))
      }
    }
    renameSync(path, numbered(1))
  } catch {
    // 日志轮转失败不应影响业务
  }
}

function append(path: string, line: string): void {
  try {
    rotateIfNeeded(path)
    appendFileSync(path, `${line}\n`, 'utf8')
  } catch {
    // 日志不可写时静默（与既有行为一致）
  }
}

function write(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string): void {
  const line = `${timestamp()} ${level} ${message}`
  if (appLogPath) append(appLogPath, line)
  if (workspaceLogPath) append(workspaceLogPath, line)
  const target = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log
  target(line)
}

export function initLogging(appDirectory: string): void {
  const directory = join(appDirectory, 'logs')
  try {
    mkdirSync(directory, { recursive: true })
    appLogPath = join(directory, 'app.log')
  } catch {
    appLogPath = null
  }
}

export function appLogFile(): string | null {
  return appLogPath
}

export function setWorkspaceLog(directory: string | null): void {
  workspaceLogPath = directory ? join(directory, 'transactions.log') : null
}

export function logInfo(message: string): void {
  write('INFO', message)
}

export function logWarn(message: string): void {
  write('WARN', message)
}

export function logError(message: string): void {
  write('ERROR', message)
}

export function logDebug(message: string): void {
  write('DEBUG', message)
}

export function logStartup(isDev: boolean, configPath: string): void {
  logInfo(`--------- 启动 Transactions (Electron, dev=${isDev}) --------- 配置: ${configPath}`)
}
