// 文件规模预算与允许清单：纯数据 + 纯函数，不碰 fs。
// 脚本（scripts/static-guards.mjs）负责读文件、算行数；这里只负责判断。
//
// 行数口径全仓库唯一：countLines()。别用 PowerShell 的 Measure-Object ——
// 它在最后一行没有换行时会少数几十行。
//
// 允许清单就是剩余工作清单：只减不增。拆到预算内必须删条目，规则 3 会红。

export const BUDGETS = {
  page: 450,
  renderer: 500,
  command: 300,
  stylesheet: 1200,
}

// 清单只装「已经超预算、本轮还没拆完」的文件，cap 登记当前行数。
// 拆完一个就删一条，绝不为了过护栏加条目、抬 cap 或调大 BUDGETS。
export const FILE_SIZE_ALLOWLIST = {
  // 1690 行：按领域拆注册函数（记账 / 图表 / 标签与模板 / 事件 / 日记 / 待办 / 股票 / 设置与更新）
  'electron/ipc/commands.ts': {
    cap: 1690,
    hint: '按领域拆注册函数（记账 / 图表 / 标签与模板 / 事件 / 日记 / 待办 / 股票 / 设置与更新）',
  },
  // 780 行：启动与工作空间 / 账本导航与功能开关 / 退出流程 / 外壳渲染
  'src/App.tsx': {
    cap: 780,
    hint: '启动与工作空间 / 账本导航与功能开关 / 退出流程 / 外壳渲染',
  },
  // 558 行：分类栏 / 标签栏 / 拖拽排序 / 弹窗
  'src/pages/category-tag.tsx': {
    cap: 558,
    hint: '分类栏 / 标签栏 / 拖拽排序 / 弹窗',
  },
  // 599 行：曲线列表 / 曲线条件表单 / 新建与改名
  'src/pages/chart-editor.tsx': {
    cap: 599,
    hint: '曲线列表 / 曲线条件表单 / 新建与改名',
  },
  // 967 行：图表网格 / 曲线合计条 / 范围选择
  'src/pages/charts.tsx': {
    cap: 967,
    hint: '图表网格 / 曲线合计条 / 范围选择',
  },
  // 908 行：筛选条 / 表格 / 批量动作
  'src/pages/records.tsx': {
    cap: 908,
    hint: '筛选条 / 表格 / 批量动作',
  },
  // 459 行：备份动作 / 备份列表 / 最近工作空间
  'src/pages/settings-data.tsx': {
    cap: 459,
    hint: '备份动作 / 备份列表 / 最近工作空间',
  },
  // 498 行：各分栏面板（通用 / 功能 / 日记 / 关于）
  'src/pages/settings.tsx': {
    cap: 498,
    hint: '各分栏面板（通用 / 功能 / 日记 / 关于）',
  },
  // 654 行：轮次列表与分页 / 单轮详情
  'src/pages/stock-history.tsx': {
    cap: 654,
    hint: '轮次列表与分页 / 单轮详情',
  },
  // 588 行：天梯导出页的排版与渲染
  'src/pages/stock-ladder-page.ts': {
    cap: 588,
    hint: '天梯导出页的排版与渲染',
  },
  // 465 行：天梯表格 / 行 / 汇总
  'src/pages/stock-ladder.tsx': {
    cap: 465,
    hint: '天梯表格 / 行 / 汇总',
  },
  // 499 行：只读台账 / 编辑弹窗 / 落差计算
  'src/pages/stock-ledger.tsx': {
    cap: 499,
    hint: '只读台账 / 编辑弹窗 / 落差计算',
  },
  // 1173 行：持仓表 / 成交录入弹窗（含费用表单）/ 资金记录弹窗 / 复盘入口
  'src/pages/stock-positions.tsx': {
    cap: 1173,
    hint: '持仓表 / 成交录入弹窗（含费用表单）/ 资金记录弹窗 / 复盘入口',
  },
  // 545 行：费率表单 / 复盘模板 / 危险操作
  'src/pages/stock-settings.tsx': {
    cap: 545,
    hint: '费率表单 / 复盘模板 / 危险操作',
  },
  // 767 行：指标条 / 曲线 / 明细表 / 分页
  'src/pages/stock-statistics.tsx': {
    cap: 767,
    hint: '指标条 / 曲线 / 明细表 / 分页',
  },
  // 503 行：模板列表 / 新建弹窗
  'src/pages/templates.tsx': {
    cap: 503,
    hint: '模板列表 / 新建弹窗',
  },
  // 1092 行：卡片列 / 事项编辑 / 进度记录 / 历史视图
  'src/pages/todo.tsx': {
    cap: 1092,
    hint: '卡片列 / 事项编辑 / 进度记录 / 历史视图',
  },
  // 1341 行：外壳 / 侧栏 / 工具栏 / 遮罩
  'src/styles/app.css': {
    cap: 1341,
    hint: '外壳 / 侧栏 / 工具栏 / 遮罩',
  },
  // 1253 行：图库 / 编辑器 / 图片块
  'src/styles/key_event.css': {
    cap: 1253,
    hint: '图库 / 编辑器 / 图片块',
  },
  // 4939 行：基类 / 账户 / 持仓 / 记录 / 统计 / 设置 / 天梯
  'src/styles/stock.css': {
    cap: 4939,
    hint: '基类 / 账户 / 持仓 / 记录 / 统计 / 设置 / 天梯',
  },
}

// 统一成 `/` 分隔、相对仓库根。调用方传进来的都是相对路径。
function normalizePath(path) {
  const normalized = path.replace(/\\/g, '/')
  return normalized.startsWith('./') ? normalized.slice(2) : normalized
}

// 预算类别只看路径：页面 / 其他渲染层 / 样式表 / 命令层。shared 与 electron/services 不设预算。
export function budgetKindOf(path) {
  const file = normalizePath(path)
  if (/^src\/pages\/.*\.(ts|tsx)$/.test(file)) return 'page'
  if (/^src\/.*\.(ts|tsx)$/.test(file)) return 'renderer'
  if (/^src\/styles\/[^/]+\.css$/.test(file)) return 'stylesheet'
  if (/^electron\/ipc\/.*\.ts$/.test(file)) return 'command'
  return null
}

export function countLines(text) {
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

export function evaluateFileSizes(files, options = {}) {
  const allowlist = options.allowlist ?? FILE_SIZE_ALLOWLIST
  const budgets = options.budgets ?? BUDGETS
  const failures = []
  const allowlistPaths = Object.keys(allowlist)
  const present = new Set(files.map((file) => normalizePath(file.path)))

  for (const path of allowlistPaths) {
    if (!present.has(normalizePath(path))) {
      failures.push(`${path}：允许清单里的文件不存在，删掉这条。`)
    }
  }

  let checked = 0
  for (const file of files) {
    const path = normalizePath(file.path)
    const kind = budgetKindOf(path)
    if (!kind) continue
    checked += 1
    const budget = budgets[kind]
    const entry = allowlist[path]
    if (!entry) {
      if (file.lines > budget) {
        failures.push(
          `${path}：${file.lines} 行，预算 ${budget} 行。拆成模块，或（本轮新出现的过渡）登记一条允许清单并写清打算怎么拆。`,
        )
      }
      continue
    }
    if (file.lines > entry.cap) {
      failures.push(
        `${path}：${file.lines} 行，超过登记值 ${entry.cap} 行。它只能变短，不能更长；拆完把 cap 调小或删条目。 计划拆法：${entry.hint}`,
      )
    } else if (file.lines <= budget) {
      failures.push(
        `${path}：${file.lines} 行，已在预算 ${budget} 行内，但允许清单里还留着条目。删掉这条，清单就是剩余工作清单。 计划拆法：${entry.hint}`,
      )
    }
  }

  return { failures, listed: allowlistPaths.length, checked }
}
