# ============================================
# 重新生成应用图标 Transactions.ico
# 风格：DeepSeek 蓝圆角方块 + 白色粗体 T（与前端 DSH 换肤一致）
# 输出：多尺寸（16/24/32/48/64/128/256）PNG 内嵌 ICO，供托盘 / exe / 安装器使用
# 用法：powershell -File build/gen-icon.ps1
# ============================================
param(
    [string]$OutPath = "$PSScriptRoot\..\electron\assets\Transactions.ico"
)

Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

$bg = [System.Drawing.Color]::FromArgb(255, 57, 100, 254)  # #3964FE DeepSeek 蓝
$fg = [System.Drawing.Color]::White
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngs = New-Object System.Collections.Generic.List[byte[]]

foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    $r = [Math]::Max(2.0, $s * 0.195)  # 与 1024 图标的 rx=200 一致（约 19.5%）
    $bgBrush = New-Object System.Drawing.SolidBrush($bg)
    $g.FillPath($bgBrush, (New-RoundedRectPath 0 0 $s $s $r))

    $fontSize = $s * 0.68
    $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $fgBrush = New-Object System.Drawing.SolidBrush($fg)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    # 大写字母光学居中：上移约 10% 行高抵消 descender 空间
    $rect = [System.Drawing.RectangleF]::new(
        [single]0,
        [single](-$s * 0.10),
        [single]$s,
        [single]$s)
    $g.DrawString('T', $font, $fgBrush, $rect, $sf)

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngs.Add($ms.ToArray())

    $sf.Dispose(); $font.Dispose(); $fgBrush.Dispose(); $bgBrush.Dispose(); $g.Dispose(); $bmp.Dispose(); $ms.Dispose()
}

# 组装 ICO：ICONDIR + ICONDIRENTRY × N + PNG 数据
$count = $pngs.Count
$out = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($out)
$bw.Write([UInt16]0)          # reserved
$bw.Write([UInt16]1)          # type: icon
$bw.Write([UInt16]$count)     # image count

$offset = 6 + 16 * $count
for ($i = 0; $i -lt $count; $i++) {
    $s = $sizes[$i]
    $dim = if ($s -ge 256) { 0 } else { $s }
    $len = $pngs[$i].Length
    $bw.Write([Byte]$dim)                       # width（0 = 256）
    $bw.Write([Byte]$dim)                       # height
    $bw.Write([Byte]0)                          # color count
    $bw.Write([Byte]0)                          # reserved
    $bw.Write([UInt16]1)                        # planes
    $bw.Write([UInt16]32)                       # bit count
    $bw.Write([UInt32]$len)                     # bytes in resource
    $bw.Write([UInt32]$offset)                  # image offset
    $offset += $len
}
foreach ($png in $pngs) { $bw.Write($png) }
$bw.Flush()

$resolvedDir = (Resolve-Path (Split-Path $OutPath)).Path
$finalPath = Join-Path $resolvedDir (Split-Path $OutPath -Leaf)
[System.IO.File]::WriteAllBytes($finalPath, $out.ToArray())
$bw.Dispose(); $out.Dispose()

Write-Host "已生成图标: $finalPath ($((Get-Item $finalPath).Length) bytes, $count 个尺寸)"
