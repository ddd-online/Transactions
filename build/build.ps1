#Requires -Version 5.1
<#
  构建发布产物：类型检查 + 单测 + 静态护栏 → electron-vite build → NSIS/便携版。

  用法：
    pwsh -File build/build.ps1
    pwsh -File build/build.ps1 -SkipTests
    pwsh -File build/build.ps1 -E2E

  产物断言是最后一步：退出码为 0 但安装包没生成，视为失败。
#>
[CmdletBinding()]
param(
    [switch]$SkipTests,
    [switch]$E2E
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    $package = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
    $version = [string]$package.version

    if (-not $SkipTests) {
        Write-Host "[build] 类型检查 / 单测 / 静态护栏"
        pnpm test
        if ($LASTEXITCODE -ne 0) { throw "pnpm test 失败（exit $LASTEXITCODE）" }
    }

    Write-Host "[build] electron-vite build"
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw "pnpm build 失败（exit $LASTEXITCODE）" }

    Write-Host "[build] electron-builder --win --x64"
    pnpm exec electron-builder --win --x64
    if ($LASTEXITCODE -ne 0) { throw "electron-builder 失败（exit $LASTEXITCODE）" }

    $setup = Join-Path $root "output\Transactions-$version-setup.exe"
    $portable = Join-Path $root "output\Transactions-$version-portable.exe"
    $unpacked = Join-Path $root 'output\win-unpacked\Transactions.exe'
    foreach ($path in @($setup, $portable, $unpacked)) {
        if (-not (Test-Path -LiteralPath $path)) {
            throw "缺少构建产物: $path"
        }
    }

    if ($E2E) {
        Write-Host "[build] 打包产物冒烟"
        $env:TRANSACTIONS_PACKAGED_EXE = $unpacked
        pnpm exec playwright test tests/e2e/packaged.spec.ts
        if ($LASTEXITCODE -ne 0) { throw "打包产物冒烟失败（exit $LASTEXITCODE）" }

        Write-Host "[build] 便携版启动冒烟"
        pwsh -File (Join-Path $root 'build\smoke-portable.ps1') -Portable $portable
        if ($LASTEXITCODE -ne 0) { throw "便携版启动冒烟失败（exit $LASTEXITCODE）" }
    }

    Write-Host "[build] 完成"
    Get-Item -LiteralPath $setup, $portable | ForEach-Object {
        $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        Write-Host ("  {0}  {1:N1} MB  sha256={2}" -f $_.Name, ($_.Length / 1MB), $hash)
    }
}
finally {
    Pop-Location
}


