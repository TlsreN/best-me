# 把一个风格稿渲染成预览图
# 用法：powershell -ExecutionPolicy Bypass -File tools\render-style.ps1 -Name S01-清爽白卡片
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [int]$Width = 1420,
  [int]$Height = 1100
)

$ErrorActionPreference = 'Stop'

$dir = (Resolve-Path (Join-Path $PSScriptRoot '..\docs\design\styles')).Path
$html = Join-Path $dir "$Name.html"
if (-not (Test-Path $html)) {
  Write-Error "找不到风格稿：$html"
  exit 1
}

$edge = @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:LocalAppData\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $edge) { Write-Error '找不到 Microsoft Edge，无法渲染'; exit 1 }

$png = Join-Path $dir "$Name.png"
$uri = ([uri]$html).AbsoluteUri

# Edge 会往 stderr 写无关日志，这里先放松错误策略
$ErrorActionPreference = 'Continue'
& $edge --headless --disable-gpu --no-sandbox --hide-scrollbars `
  --force-device-scale-factor=1 --virtual-time-budget=3000 `
  --window-size="$Width,$Height" --screenshot="$png" $uri 2>$null | Out-Null
$ErrorActionPreference = 'Stop'

Start-Sleep -Milliseconds 400
if (-not (Test-Path $png)) { Write-Error '渲染失败，没有生成图片'; exit 1 }

"已更新预览图：$png"
"尺寸：${Width}x${Height}，$([math]::Round((Get-Item $png).Length / 1KB, 1)) KB"
