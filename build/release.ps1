# release.ps1 - 一键将打包产物发布到 GitHub Release
# 用法: .\release.ps1 [-Body "发布说明"]

param(
    [string]$Body
)

# 设置输出编码为 UTF-8（防止中文乱码）
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 获取脚本所在目录
$scriptDir = $PSScriptRoot

# 获取项目根目录（上一级）
$projectRoot = Split-Path -Parent $scriptDir

# 定义全局路径
$electronDir = Join-Path $projectRoot "electron"
$buildTargetDir = Join-Path $scriptDir "target"

# 颜色辅助函数（与 build.ps1 / clean.ps1 风格一致）
function Write-Info { param($msg) Write-Host "📦 $msg" -ForegroundColor Cyan }
function Write-Step { param($msg) Write-Host "`n🛠️  $msg" -ForegroundColor Magenta }
function Write-Success { param($msg) Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "⚠️  $msg" -ForegroundColor Yellow }
function Write-ErrorCustom { param($msg) Write-Error "❌ $msg" }

# 记录初始位置
$initialLocation = Get-Location

try {
    # ==============================
    # 1. 读取版本号
    # ==============================
    Write-Step "读取版本号..."

    $packageJson = Join-Path $electronDir "package.json"
    if (-not (Test-Path $packageJson)) {
        Write-ErrorCustom "未找到 electron/package.json"
        exit 1
    }

    $package = Get-Content $packageJson -Raw | ConvertFrom-Json
    $version = $package.version
    if (-not $version) {
        Write-ErrorCustom "electron/package.json 中未找到 version 字段"
        exit 1
    }

    Write-Success "版本号: $version"

    # ==============================
    # 2. 定位产物文件
    # ==============================
    Write-Step "定位构建产物..."

    $exePattern = "Transactions-*-v$version.exe"
    $exePath = Get-ChildItem -Path $buildTargetDir -Filter $exePattern -ErrorAction SilentlyContinue | Select-Object -First 1

    if (-not $exePath) {
        Write-ErrorCustom "构建产物不存在: $buildTargetDir\$exePattern"
        Write-Host "   请先运行 .\build.ps1 完成构建" -ForegroundColor DarkGray
        exit 1
    }

    $exePath = $exePath.FullName
    $exeName = Split-Path $exePath -Leaf

    $fileSize = [math]::Round((Get-Item $exePath).Length / 1MB, 1)
    Write-Success "找到产物: $exeName ($fileSize MB)"

    # ==============================
    # 3. 检查 gh CLI
    # ==============================
    Write-Step "检查 GitHub CLI..."

    $ghPath = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $ghPath) {
        Write-ErrorCustom "未找到 GitHub CLI (gh)，请先安装: https://cli.github.com/"
        exit 1
    }

    $ghAuth = gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorCustom "GitHub CLI 未登录，请先运行: gh auth login"
        exit 1
    }

    Write-Success "GitHub CLI 就绪"

    # ==============================
    # 3.5 自动配置代理（gh CLI 不走系统代理，需手动设置环境变量）
    # ==============================
    if (-not $env:HTTPS_PROXY) {
        $sysProxy = (Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue).ProxyServer
        if ($sysProxy) {
            # 检查代理是否可用
            $proxyHost, $proxyPort = $sysProxy -split ':'
            $proxyPort = if ($proxyPort) { [int]$proxyPort } else { 1080 }
            $tcp = New-Object System.Net.Sockets.TcpClient
            $connected = $tcp.ConnectAsync($proxyHost, $proxyPort).Wait(1500)
            $tcp.Dispose()
            if ($connected) {
                $env:HTTPS_PROXY = "http://$sysProxy"
                $env:HTTP_PROXY = "http://$sysProxy"
                Write-Success "自动检测到系统代理: $sysProxy，已设置 HTTPS_PROXY / HTTP_PROXY"
            } else {
                Write-Warn "系统代理 $sysProxy 不可用，将直连 GitHub"
            }
        }
    } else {
        Write-Info "使用已有的 HTTPS_PROXY: $env:HTTPS_PROXY"
    }

    # ==============================
    # 4. 生成 Release Body
    # ==============================
    Write-Step "生成 Release Notes..."

    $tagName = "v$version"

    if ($Body) {
        # 使用传入的 body，将 \n 转义为实际换行符
        $releaseBody = $Body -replace '\\n', "`n"
        Write-Success "使用传入的发布说明"
    } else {
        # 先拉取远程 tag，确保本地有最新的 tag 列表
        Write-Info "拉取远程 tag..."
        git -C $projectRoot fetch --tags origin 2>$null

        $prevTag = git -C $projectRoot describe --tags --abbrev=0 2>$null

        if ($prevTag) {
            $commitLog = git -C $projectRoot log --oneline "$prevTag..HEAD" 2>$null
            if ($commitLog) {
                $releaseBody = "## Changes since $prevTag`n`n$commitLog"
                Write-Success "从上一条 tag ($prevTag) 生成了 changelog"
            } else {
                $releaseBody = "Transactions $tagName"
                Write-Info "与上一条 tag 无差异，使用默认 body"
            }
        } else {
            $releaseBody = "Transactions $tagName"
            Write-Info "未找到上一条 tag，使用默认 body"
        }
    }

    # ==============================
    # 5. 打印摘要并确认
    # ==============================
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "  GitHub Release 发布摘要" -ForegroundColor White
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Tag:        " -NoNewline
    Write-Host $tagName -ForegroundColor Yellow
    Write-Host "  Release:    " -NoNewline
    Write-Host "Transactions $tagName" -ForegroundColor Yellow
    Write-Host "  产物:       " -NoNewline
    Write-Host $exeName -ForegroundColor Yellow
    Write-Host "  文件大小:   " -NoNewline
    Write-Host "$fileSize MB" -ForegroundColor Yellow
    Write-Host "----------------------------------------" -ForegroundColor Cyan
    Write-Host "  Body 预览:" -ForegroundColor White
    Write-Host "----------------------------------------" -ForegroundColor Cyan
    Write-Host $releaseBody -ForegroundColor DarkGray
    Write-Host "========================================" -ForegroundColor Cyan

    $confirmation = Read-Host "`n确认发布？[Y/N]"
    if ($confirmation -ne 'Y' -and $confirmation -ne 'y') {
        Write-Warn "已取消发布"
        exit 0
    }

    # ==============================
    # 6. 创建 GitHub Release
    # ==============================
    Write-Step "正在创建 GitHub Release..."

    Set-Location $projectRoot

    gh release create $tagName $exePath `
        --title "Transactions $tagName" `
        --notes $releaseBody

    if ($LASTEXITCODE -ne 0) {
        Write-ErrorCustom "创建 GitHub Release 失败，退出码: $LASTEXITCODE"
        exit $LASTEXITCODE
    }

    Write-Success "GitHub Release $tagName 发布成功！"
    Write-Host "`n🎉 一键发布完成！" -ForegroundColor Green

} finally {
    Set-Location $initialLocation
    Write-Host "`n↩️  已返回脚本所在目录: $scriptDir" -ForegroundColor DarkCyan
}
