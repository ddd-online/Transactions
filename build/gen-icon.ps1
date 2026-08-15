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
    $path = New-RoundedRectPath 0 0 $s $s $r
    $bgBrush = New-Object System.Drawing.SolidBrush($bg)
    $g.FillPath($bgBrush, $path)

    $fontSize = $s * 0.68
    $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $fgBrush = New-Object System.Drawing.SolidBrush($fg)

    # Near 对齐绘制 + 测量：避免 Center 对齐把墨迹平移到测量矩形中央
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Near
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Near
    $sf.Trimming = [System.Drawing.StringTrimming]::None
    $sf.FormatFlags = $sf.FormatFlags -bor [System.Drawing.StringFormatFlags]::NoWrap
    $drawRect = New-Object System.Drawing.RectangleF(0, 0, $s, $s)

    # 第 1 遍：在原点绘制，用于测量真实像素墨迹包围盒
    # （GDI+ 的 MeasureCharacterRanges 与光栅化结果存在偏差，直接量像素最可靠）
    $g.DrawString('T', $font, $fgBrush, $drawRect, $sf)

    $minX = $s; $maxX = -1; $minY = $s; $maxY = -1
    for ($y = 0; $y -lt $s; $y++) {
        for ($x = 0; $x -lt $s; $x++) {
            $p = $bmp.GetPixel($x, $y)
            if ($p.A -gt 40 -and $p.R -gt 200 -and $p.G -gt 200 -and $p.B -gt 200) {
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }

    if ($maxX -ge 0 -and $maxY -ge 0) {
        # 计算居中偏移（整数像素）
        $dx = [single][math]::Round(($s - ($maxX - $minX + 1)) / 2.0 - $minX)
        $dy = [single][math]::Round(($s - ($maxY - $minY + 1)) / 2.0 - $minY)
        # 第 2 遍：清掉墨迹，按偏移重绘，实现像素级居中
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.FillPath($bgBrush, $path)
        $g.DrawString('T', $font, $fgBrush, (New-Object System.Drawing.RectangleF($dx, $dy, $s, $s)), $sf)
    } else {
        Write-Warn "警告: $($s)px 尺寸未检测到字形墨迹，使用默认居中"
    }

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
