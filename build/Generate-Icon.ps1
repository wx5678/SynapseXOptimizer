$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$output = Join-Path $PSScriptRoot 'icon.png'
$bitmap = New-Object Drawing.Bitmap 512, 512
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([Drawing.Color]::FromArgb(4, 4, 6))

$background = New-Object Drawing.Drawing2D.LinearGradientBrush((New-Object Drawing.Rectangle 0,0,512,512), [Drawing.Color]::FromArgb(40,32,55), [Drawing.Color]::FromArgb(3,3,5), 45)
$graphics.FillRectangle($background, 0, 0, 512, 512)

$path = New-Object Drawing.Drawing2D.GraphicsPath
$path.StartFigure()
$path.AddLine(1.5, 23, 1.5, 33)
$path.AddBezier(1.5, 33, 1.5, 38.5, 6, 43, 11.5, 43)
$path.AddLine(11.5, 43, 16.5, 43)
$path.AddBezier(16.5, 43, 22, 43, 26.5, 38.5, 26.5, 33)
$path.AddBezier(26.5, 33, 27.5, 29.667, 29.667, 27.5, 33, 26.5)
$path.AddBezier(33, 26.5, 38.5, 26.5, 43, 22, 43, 16.5)
$path.AddLine(43, 16.5, 43, 11.5)
$path.AddBezier(43, 11.5, 43, 6, 38.5, 1.5, 33, 1.5)
$path.AddLine(33, 1.5, 23, 1.5)
$path.AddBezier(23, 1.5, 15.667, 8.5, 8.5, 15.667, 1.5, 23)
$path.CloseFigure()

$brush = New-Object Drawing.SolidBrush ([Drawing.Color]::White)
$graphics.TranslateTransform(256, 256)
$graphics.ScaleTransform(4.35, 4.35)
foreach ($angle in 0, 90, 180, 270) {
    $state = $graphics.Save()
    $graphics.RotateTransform($angle)
    $graphics.FillPath($brush, $path)
    $graphics.Restore($state)
}

$bitmap.Save($output, [Drawing.Imaging.ImageFormat]::Png)
$brush.Dispose(); $path.Dispose(); $background.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
Write-Output $output
