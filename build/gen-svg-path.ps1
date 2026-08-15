# ============================================
# 生成 SVG 图标文字路径（把 "Tr" 转成矢量 <path>，与 ICO 字形一致）
# 输出：electron/assets/Transactions.svg（完整图标，路径已按墨迹包围盒像素级居中）
# 并打印 <path> 元素，供粘贴到 AboutSetting.vue
# 用法：powershell -File build/gen-svg-path.ps1
# ============================================

Add-Type -AssemblyName System.Drawing

$canvas = 1024.0
$emSize = $canvas * 0.62   # 与 gen-icon.ps1 的 0.62em 一致，保持字形比例
$origin = New-Object System.Drawing.PointF(0, 0)
$format = [System.Drawing.StringFormat]::GenericTypographic

$fontFamily = New-Object System.Drawing.FontFamily('Segoe UI')
$gp = New-Object System.Drawing.Drawing2D.GraphicsPath
$gp.AddString('Tr', $fontFamily, [int][System.Drawing.FontStyle]::Bold, [single]$emSize, $origin, $format)

$pts = $gp.PathPoints
$tys = $gp.PathTypes

# 字形墨迹包围盒（原始坐标）
$minX = [float]::MaxValue; $maxX = [float]::MinValue
$minY = [float]::MaxValue; $maxY = [float]::MinValue
foreach ($p in $pts) {
    if ($p.X -lt $minX) { $minX = $p.X }
    if ($p.X -gt $maxX) { $maxX = $p.X }
    if ($p.Y -lt $minY) { $minY = $p.Y }
    if ($p.Y -gt $maxY) { $maxY = $p.Y }
}
$inkW = $maxX - $minX
$inkH = $maxY - $minY
$pctW = [math]::Round($inkW / $canvas * 100)
$pctH = [math]::Round($inkH / $canvas * 100)
Write-Host "Tr 字形墨迹: ${inkW}x${inkH}（占画布 ${pctW}% x ${pctH}%）"

$tx = 512.0 - ($minX + $maxX) / 2.0
$ty = 512.0 - ($minY + $maxY) / 2.0
Write-Host "居中平移: tx=$tx ty=$ty"

# 转换为 SVG path 命令
# PathPointType 掩码：0x07=类型（0 Start / 1 Line / 3 CubicBezier），0x10=DashMode（忽略），0x80=CloseSubpath
$sb = New-Object System.Text.StringBuilder
$bez = New-Object System.Collections.Generic.List[System.Drawing.PointF]
$unknown = 0
for ($i = 0; $i -lt $pts.Length; $i++) {
    $t = $tys[$i] -band 0x07
    $close = ($tys[$i] -band 0x80) -ne 0
    $p = $pts[$i]
    switch ($t) {
        0 { [void]$sb.Append("M" + [math]::Round($p.X, 2) + " " + [math]::Round($p.Y, 2) + " ") }
        1 { [void]$sb.Append("L" + [math]::Round($p.X, 2) + " " + [math]::Round($p.Y, 2) + " ") }
        3 {
            $bez.Add($p)
            if ($bez.Count -eq 3) {
                [void]$sb.Append("C" + [math]::Round($bez[0].X, 2) + " " + [math]::Round($bez[0].Y, 2) + " " +
                    [math]::Round($bez[1].X, 2) + " " + [math]::Round($bez[1].Y, 2) + " " +
                    [math]::Round($bez[2].X, 2) + " " + [math]::Round($bez[2].Y, 2) + " ")
                $bez.Clear()
            }
        }
        default { $unknown++; Write-Host "警告: 未知 PathPointType=$t (index=$i)" }
    }
    if ($close) { [void]$sb.Append("Z ") }
}
if ($bez.Count -gt 0) { Write-Host "警告: 存在未闭合的贝塞尔三元组 $($bez.Count) 个" }
if ($unknown -gt 0) { Write-Host "警告: 共 $unknown 个未知类型点被跳过" }
$pathD = $sb.ToString().Trim()
Write-Host "path 长度: $($pathD.Length) 字符"

# ---- 像素级自校验：把路径按平移变换画到 1024 画布，验证墨迹包围盒中心 == (512,512) ----
$mat = New-Object System.Drawing.Drawing2D.Matrix
$mat.Translate([single]$tx, [single]$ty)
$gp.Transform($mat)

$bmp = New-Object System.Drawing.Bitmap([int]$canvas, [int]$canvas, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Transparent)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$g.FillPath($brush, $gp)

# 与 ICO 验证同标准：墨迹包围盒中心（非质心，字形左右不对称时质心偏离属正常）
$inkMinX = [int]$canvas; $inkMaxX = -1; $inkMinY = [int]$canvas; $inkMaxY = -1; $cnt = 0
for ($y = 0; $y -lt $canvas; $y++) {
    for ($x = 0; $x -lt $canvas; $x++) {
        $p = $bmp.GetPixel($x, $y)
        if ($p.A -gt 40) {
            if ($x -lt $inkMinX) { $inkMinX = $x }
            if ($x -gt $inkMaxX) { $inkMaxX = $x }
            if ($y -lt $inkMinY) { $inkMinY = $y }
            if ($y -gt $inkMaxY) { $inkMaxY = $y }
            $cnt++
        }
    }
}
if ($cnt -gt 0) {
    $cx = [math]::Round(($inkMinX + $inkMaxX) / 2.0, 1)
    $cy = [math]::Round(($inkMinY + $inkMaxY) / 2.0, 1)
    Write-Host ("自校验: 墨迹包围盒 x[{0}..{1}] y[{2}..{3}]  中心=({4},{5}) 期望=(512,512) 偏差=({6},{7})" -f
        $inkMinX, $inkMaxX, $inkMinY, $inkMaxY, $cx, $cy, ($cx - 512), ($cy - 512))
} else {
    Write-Host "自校验失败: 画布上未检测到墨迹"
}
$g.Dispose(); $bmp.Dispose(); $brush.Dispose()

# ---- 组装完整 SVG ----
$svg = @"
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg
   width="1024"
   height="1024"
   viewBox="0 0 1024 1024"
   version="1.1"
   xmlns="http://www.w3.org/2000/svg">
  <!-- Background: DeepSeek blue #3964FE -->
  <rect
     x="0"
     y="0"
     width="1024"
     height="1024"
     rx="200"
     ry="200"
     fill="#3964FE" />
  <!-- Letter Tr: Segoe UI Bold 矢量路径（与 ICO 字形一致），已按墨迹包围盒居中 -->
  <path
     transform="translate($tx $ty)"
     fill="#FFFFFF"
     d="$pathD" />
</svg>
"@

$svgPath = Join-Path (Split-Path $PSScriptRoot) "electron\assets\Transactions.svg"
[System.IO.File]::WriteAllText($svgPath, $svg, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "已写入: $svgPath"

# 输出 <path> 元素供粘贴到 AboutSetting.vue
$pathEl = "<path transform=""translate($tx $ty)"" fill=""#FFFFFF"" d=""$pathD"" />"
$pathEl | Out-File -FilePath (Join-Path $env:TEMP "tr-svg-path.txt") -Encoding UTF8
Write-Host "path 元素已保存到: $(Join-Path $env:TEMP 'tr-svg-path.txt')"
