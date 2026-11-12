import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { countLines, evaluateFileSizes } from './file-size-budget.mjs'

const root = process.cwd()
const failures = []
const passes = []

function read(path) {
  return readFileSync(join(root, path), 'utf8')
}

function check(name, fn) {
  try {
    const message = fn()
    passes.push(`${name}${message ? `：${message}` : ''}`)
  } catch (error) {
    failures.push(`${name}：${error instanceof Error ? error.message : String(error)}`)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function walk(directory) {
  const results = []
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'out' || entry.name === 'output' || entry.name === 'artifacts') continue
      results.push(...walk(path))
    } else {
      results.push(path)
    }
  }
  return results
}

const packageJson = JSON.parse(read('package.json'))
const eventSource = read('shared/events.ts')
const eventNames = [...eventSource.matchAll(/= '([^']+)'/g)].map((match) => match[1])

check('命令/配置目录存在', () => {
  assert(read('shared/commands.ts').includes('commandSchemas'), '缺少 shared/commands.ts 的命令目录')
  assert(read('shared/errors.ts').includes('ERR_CODE_WORKSPACE_NOT_OPENED'), '缺少错误码')
  return `${eventNames.length} 个事件名`
})

check('渲染进程安全基线', () => {
  const window = read('electron/shell/window.ts')
  assert(window.includes('sandbox: true'), 'window.ts 必须 sandbox: true')
  assert(window.includes('contextIsolation: true'), 'window.ts 必须 contextIsolation: true')
  assert(window.includes('nodeIntegration: false'), 'window.ts 必须 nodeIntegration: false')
  const preload = read('electron/preload.ts')
  assert(preload.includes('contextBridge.exposeInMainWorld'), 'preload 必须走 contextBridge')
  assert(!/require\(['"]node:fs/.test(preload), 'preload 不得直接碰文件系统')
  return 'sandbox + contextIsolation + nodeIntegration=false'
})

check('自定义协议与 CSP', () => {
  const protocols = read('electron/shell/protocols.ts')
  assert(protocols.includes('registerSchemesAsPrivileged'), '缺少协议注册')
  assert(protocols.includes('app') && protocols.includes('trasset'), '缺少 app/trasset 协议')
  assert(/content-security-policy/i.test(protocols), '缺少 CSP')
  assert(protocols.includes('realpath'), 'trasset 必须做真实路径校验')
  return 'app:// + trasset:// + CSP'
})

check('开发端口一致（16000）', () => {
  const config = read('electron.vite.config.ts')
  assert(/port:\s*16000/.test(config), 'electron.vite.config.ts 必须使用 16000')
  assert(!/5173/.test(config), '不要回落到 Vite 默认端口')
  return '16000'
})

check('事件名不在业务代码里写字符串字面量', () => {
  const sources = walk('electron').concat(walk('src'))
  const offenders = []
  for (const file of sources) {
    if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue
    const text = read(file)
    for (const name of eventNames) {
      if (text.includes(`'${name}'`) || text.includes(`"${name}"`)) {
        offenders.push(`${file}: ${name}`)
      }
    }
  }
  assert(offenders.length === 0, offenders.join(', '))
  return `${sources.length} 个源文件`
})

check('资产路径只接受相对路径', () => {
  const assetPath = read('electron/shell/asset-path.ts')
  assert(assetPath.includes("segment === '..'"), '必须显式拒绝 .. 段')
  assert(assetPath.includes('isInside'), '必须提供 isInside 校验')
  return '.. / 绝对路径 / NUL 均被拒绝'
})

check('版本与产品名', () => {
  assert(packageJson.version === '1.29.0', `版本应为 1.29.0，实际 ${packageJson.version}`)
  assert(packageJson.productName === 'Transactions', 'productName 必须是 Transactions')
  assert(packageJson.main === 'output/out/main/index.js', 'main 必须指向 output/out/main/index.js')
  return packageJson.version
})

check('发布说明版本与构建脚本', () => {
  const notes = read('build/release_notes.md')
  const match = /^##\s*\[([^\]]+)\]\s*-\s*(\d{4}-\d{2}-\d{2})/m.exec(notes)
  assert(match, 'release_notes.md 首行必须是 ## [版本] - YYYY-MM-DD')
  assert(
    match[1] === packageJson.version,
    `release_notes.md 版本 ${match[1]} 与 package.json ${packageJson.version} 不一致`,
  )
  // GitHub release 正文与「关于 / 更新」的更新日志都直接读这份文件：
  // 它只能有当前版本一节，历史条目留在各自版本的 release 里（1.9.0 曾把年表整份发出去）。
  const sections = notes.match(/^##\s*\[/gm) ?? []
  assert(
    sections.length === 1,
    `release_notes.md 只能有当前版本一节，实际 ${sections.length} 节`,
  )
  for (const script of ['build/build.ps1', 'build/clean.ps1', 'build/release.ps1']) {
    assert(read(script).length > 0, `缺少构建脚本: ${script}`)
  }
  // 发布脚本必须按 tag 切出这一节再交给 gh，文件攒了历史也不能整份发出去
  const release = read('build/release.ps1')
  assert(release.includes("'--notes-file', $releaseBody"), 'release.ps1 必须用切出的单版本正文发布')
  return `v${packageJson.version}`
})

check('设计令牌没有悬空引用', () => {
  // 拼错一个令牌名不会报错：CSS 静默回退、颜色凭空消失。而令牌说改名就改名，
  // 引用处靠肉眼追必漏 —— 所以这里把 src 下每一处 var(--transactions-*) 与
  // tokens.css 里定义的名字对一遍。
  const tokensCss = read('src/styles/tokens.css')
  const defined = new Set(
    (tokensCss.match(/--transactions-[a-z0-9-]+(?=\s*:)/g) ?? []),
  )
  assert(defined.size > 100, `tokens.css 只解析出 ${defined.size} 个令牌，解析规则可能已过时`)

  const dangling = []
  for (const path of walk('src')) {
    if (!/\.(css|tsx)$/.test(path)) continue
    const source = read(path)
    for (const match of source.matchAll(/var\((--transactions-[a-z0-9-]+)/g)) {
      if (!defined.has(match[1])) dangling.push(`${path} → ${match[1]}`)
    }
  }
  assert(
    dangling.length === 0,
    `${dangling.length} 处引用了未定义的令牌（前 5 处：${dangling.slice(0, 5).join('；')}）`,
  )
  return `${defined.size} 个令牌，0 处悬空`
})

check('数据分栏与备份配置字段', () => {
  // 「数据」分栏是备份 / 恢复唯一的入口：分栏数与顺序一旦漂移，用户就找不到那条路。
  // 配置三项必须在读取归一化与写回序列化两侧都出现，否则升级后旧配置文件写回时会丢字段。
  const BACKUP_FIELDS = ['backupDir', 'autoBackup', 'recentWorkspaces']
  const EXPECTED_TABS = ['general', 'features', 'data', 'diary', 'about']

  const settings = read('src/pages/settings.tsx')
  const tabsBlock = /const TABS[^=]*=\s*\[([\s\S]*?)\n\]/.exec(settings)
  assert(tabsBlock, '找不到 src/pages/settings.tsx 里的 TABS 字面量')
  const tabs = [...tabsBlock[1].matchAll(/\['([a-z]+)',\s*'/g)].map((match) => match[1])
  assert(tabs.length === 5, `TABS 应为 5 项，实际 ${tabs.length} 项：${tabs.join(',')}`)
  assert(
    tabs.join(',') === EXPECTED_TABS.join(','),
    `TABS 顺序应为 ${EXPECTED_TABS.join(',')}，实际 ${tabs.join(',')}`,
  )

  const configTypes = read('shared/types/config.ts')
  // 读取归一化看 AppConfig、写回序列化看 ConfigSnapshot：两个接口都要有，缺一个升级后就丢字段
  for (const interfaceName of ['AppConfig', 'ConfigSnapshot']) {
    const body = new RegExp(
      `export interface ${interfaceName} \\{([\\s\\S]*?)\\n\\}`,
    ).exec(configTypes)
    assert(body, `找不到 shared/types/config.ts 的 ${interfaceName} 接口`)
    for (const field of BACKUP_FIELDS) {
      assert(
        new RegExp(`^\\s*${field}\\??:`, 'm').test(body[1]),
        `${interfaceName} 缺少 ${field} 字段`,
      )
    }
  }

  const configSource = read('electron/config.ts')
  for (const functionName of ['normalizeConfig', 'serializeConfig']) {
    const body = new RegExp(
      `function ${functionName}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`,
    ).exec(configSource)
    assert(body, `找不到 electron/config.ts 的 ${functionName} 函数体`)
    for (const field of BACKUP_FIELDS) {
      // 必须是 `字段:` 这种真赋值形状：`body.includes(field)` 会被注释里提一句蒙过去
      assert(
        new RegExp(`^\\s*${field}\\s*:`, 'm').test(body[1]),
        `${functionName} 的函数体缺少 ${field} 赋值（读取归一化与写回序列化两侧都要有，注释里提一句不算）`,
      )
    }
  }

  return `5 个分栏（${tabs.join(',')}）+ ${BACKUP_FIELDS.length} 个配置字段两侧齐全`
})

check('文件规模棘轮', () => {
  // 预算判据是唯一的结构抓手：清单外超预算失败，清单内超 cap 失败，拆进预算还留着条目也失败。
  // 行数口径用 countLines（scripts/file-size-budget.mjs），与允许清单登记的 cap 对齐。
  const files = []
  for (const path of walk('src').concat(walk('electron/ipc'))) {
    if (!/\.(ts|tsx|css)$/.test(path)) continue
    files.push({ path, lines: countLines(read(path)) })
  }
  const result = evaluateFileSizes(files)
  assert(result.failures.length === 0, result.failures.join('\n'))
  return result.listed === 0 ? '允许清单已清空' : `允许清单 ${result.listed} 条 / 0 条越界`
})

for (const message of passes) {
  console.log(`  ✓ ${message}`)
}
for (const message of failures) {
  console.error(`  ✗ ${message}`)
}

if (failures.length > 0) {
  console.error(`\n[static-guards] ${failures.length} 项失败`)
  process.exit(1)
}
console.log(`\n[static-guards] 全部通过（${passes.length} 项）`)


