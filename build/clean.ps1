# clean.ps1 - 清理 Billadm 项目中的构建产物与临时文件

# 设置输出编码为 UTF-8（防止中文乱码）
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 获取脚本所在目录
$scriptDir = $PSScriptRoot

# 获取项目根目录（上一级）
$projectRoot = Split-Path -Parent $scriptDir

# 定义要清理的路径
$vueDistDir = Join-Path $projectRoot "app" "dist"
$kernelExe = Join-Path $projectRoot "kernel" "transactions.exe"
$electronDistDir = Join-Path $projectRoot "electron" "dist"
$electronLogsDir = Join-Path $projectRoot "electron" "logs"
$buildTargetDir = Join-Path $projectRoot "build" "target"
$electronKernelExe = Join-Path $projectRoot "electron" "transactions.exe"

# 颜色辅助函数（提升可读性）
function Write-Info { param($msg) Write-Host "📦 $msg" -ForegroundColor Cyan }
function Write-Step { param($msg) Write-Host "`n🧹 $msg" -ForegroundColor Magenta }
function Write-Success { param($msg) Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "⚠️  $msg" -ForegroundColor Yellow }

# 记录初始位置
$initialLocation = Get-Location

try {
    Write-Step "开始清理构建产物与临时文件..."

    $itemsToRemove = @(
        $vueDistDir,
        $kernelExe,
        $electronDistDir,
        $electronLogsDir,
        $buildTargetDir,
        $electronKernelExe
    )

    foreach ($item in $itemsToRemove) {
        if (Test-Path $item) {
            $itemName = Split-Path $item -Leaf
            Write-Warn "正在删除: $itemName"
            Remove-Item $item -Recurse -Force -ErrorAction Stop
            Write-Success "已删除: $itemName"
        }
        else {
            Write-Info "跳过（不存在）: $(Split-Path $item -Leaf)"
        }
    }

    Write-Host "`n✨ 清理完成！所有指定文件/目录已移除。" -ForegroundColor Green

}
catch {
    Write-Error "❌ 清理过程中发生错误：$($_.Exception.Message)"
    exit 1
}
finally {
    # 返回原始目录
    Set-Location $initialLocation
    Write-Host "`n↩️  已返回脚本所在目录: $scriptDir" -ForegroundColor DarkCyan
}