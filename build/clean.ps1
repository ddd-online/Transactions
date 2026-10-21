#Requires -Version 5.1
<#
  清理构建产物（只删仓库内的 out/、output/ 与既有 dist/）。
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
foreach ($name in @('out', 'output', 'dist')) {
    $path = Join-Path $root $name
    if (Test-Path -LiteralPath $path) {
        $resolved = (Resolve-Path -LiteralPath $path).Path
        if (-not $resolved.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "拒绝删除仓库外路径: $resolved"
        }
        Write-Host "[clean] 删除 $resolved"
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
Write-Host '[clean] 完成'

