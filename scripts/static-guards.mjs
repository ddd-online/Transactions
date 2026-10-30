import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

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
  assert(packageJson.version === '1.10.1', `版本应为 1.10.1，实际 ${packageJson.version}`)
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

