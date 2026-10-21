<#
.SYNOPSIS
  便携版启动冒烟：启动 output\Transactions-*-portable.exe，等到主窗口出现后结束进程。

.DESCRIPTION
  本机若全局设置了 ELECTRON_RUN_AS_NODE=1（DSH / Electron 开发环境常见），
  Electron 会把 exe 当 Node 跑，窗口不会出现。脚本在启动前清掉该变量。

  只按本次启动新增的进程判断，避免误杀同名应用。
#>
param(
  [string]$Portable,
  [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $Portable) {
  $Portable = Get-ChildItem (Join-Path $repo 'output') -Filter 'Transactions-*-portable.exe' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $Portable -or -not (Test-Path $Portable)) {
  throw "未找到便携版产物: $Portable"
}

$oldRunAsNode = $env:ELECTRON_RUN_AS_NODE
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$before = @(Get-Process Transactions -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$started = Get-Date
$wrapper = Start-Process -FilePath $Portable -PassThru
$app = $null
try {
  for ($i = 0; $i -lt $TimeoutSeconds; $i++) {
    Start-Sleep -Seconds 1
    $app = Get-Process Transactions -ErrorAction SilentlyContinue |
      Where-Object { $_.Id -notin $before -and $_.StartTime -ge $started.AddSeconds(-3) -and $_.MainWindowTitle -ne '' } |
      Select-Object -First 1
    if ($app) { break }
  }
  if (-not $app) {
    throw "便携版在 ${TimeoutSeconds}s 内未出现主窗口: $Portable"
  }
  Write-Output "portable ok: pid=$($app.Id) title=$($app.MainWindowTitle)"
}
finally {
  if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue }
  Get-Process Transactions -ErrorAction SilentlyContinue |
    Where-Object { $_.Id -notin $before } |
    Stop-Process -Force -ErrorAction SilentlyContinue
  if (-not $wrapper.HasExited) { Stop-Process -Id $wrapper.Id -Force -ErrorAction SilentlyContinue }
  if ($oldRunAsNode) { $env:ELECTRON_RUN_AS_NODE = $oldRunAsNode }
}

