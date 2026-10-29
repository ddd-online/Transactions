#Requires -Version 5.1
<#
  发布：校验版本 / 工作树 / 产物 → 创建 GitHub Release 并上传安装包。

  用法：
    pwsh -File build/release.ps1 -Tag v1.0.0
    pwsh -File build/release.ps1 -Tag v1.0.0 -Repo ddd-online/Transactions

  只上传普通 .exe 资产；应用内更新读取 release 的 tag_name 与 asset.digest，
  所以不生成 latest.yml，也不需要签名密钥。
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Tag,
    [string]$Repo = 'ddd-online/Transactions',
    [switch]$Draft
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    if ($Tag -notmatch '^v\d+\.\d+\.\d+$') {
        throw "Tag 必须形如 v1.0.0: $Tag"
    }
    $version = $Tag.Substring(1)
    $package = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
    if ([string]$package.version -ne $version) {
        throw "package.json 版本 $($package.version) 与 Tag $Tag 不一致"
    }

    $status = git status --porcelain
    if ($status) {
        throw "工作树不干净，先提交再发布：`n$status"
    }

    $setup = Join-Path $root "output\Transactions-$version-setup.exe"
    if (-not (Test-Path -LiteralPath $setup)) {
        throw "缺少发布产物: $setup（先运行 build/build.ps1）"
    }

    $notes = Join-Path $root 'build\release_notes.md'
    if (-not (Test-Path -LiteralPath $notes)) { throw "缺少发布说明: $notes" }

    # 发布正文只能是本次版本这一节：应用内「关于 / 更新」显示的就是 release 正文，
    # 历史条目留在各自版本的 release 里。文件本身原则上只留一版（静态护栏盯着），
    # 这里再切一次 —— 万一文件攒进了历史，也不会把整份年表当正文发出去。
    $allNotes = Get-Content -LiteralPath $notes -Raw
    $sectionPattern = '(?ms)^##\s*\[' + [regex]::Escape($version) + '\][^\n]*\n.*?(?=^##\s*\[|\z)'
    $section = [regex]::Match($allNotes, $sectionPattern)
    if (-not $section.Success) {
        throw "发布说明里没有 $version 这一节: $notes"
    }
    $releaseBody = Join-Path ([System.IO.Path]::GetTempPath()) "transactions-release-$version.md"
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($releaseBody, $section.Value.TrimEnd() + "`n", $utf8)

    Write-Host "[release] 校验产物摘要"
    $hash = (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Host ("  {0} sha256={1}" -f (Split-Path -Leaf $setup), $hash)
    Write-Host ("[release] 正文只含 {0} 一节（{1} 行）" -f $version, ($section.Value.TrimEnd() -split "`n").Count)

    $arguments = @(
        'release', 'create', $Tag,
        $setup,
        '--repo', $Repo,
        '--title', "Transactions $version",
        '--notes-file', $releaseBody
    )
    if ($Draft) { $arguments += '--draft' }

    Write-Host "[release] gh $($arguments -join ' ')"
    gh @arguments
    if ($LASTEXITCODE -ne 0) { throw "gh release create 失败（exit $LASTEXITCODE）" }

    Write-Host "[release] 完成：https://github.com/$Repo/releases/tag/$Tag"
}
finally {
    Pop-Location
}

