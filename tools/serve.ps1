# 最好的我 · 本地预览服务器
# 用法：powershell -ExecutionPolicy Bypass -File tools\serve.ps1 -Port 8080
param([int]$Port = 8080)

$ErrorActionPreference = 'Stop'

$dir = (Resolve-Path (Join-Path $PSScriptRoot '..\app')).Path

# 找一个真能跑的 Python 3，避开 Windows 商店的占位别名
$cands = @()
$bundled = 'C:\Users\14615\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
if (Test-Path $bundled) { $cands += $bundled }
$cmd = Get-Command python -ErrorAction SilentlyContinue
if ($cmd) { $cands += $cmd.Source }

$py = $null
foreach ($c in $cands) {
  try {
    $v = & $c -c "import sys;print(sys.version_info[0])" 2>$null
    if ("$v".Trim() -eq '3') { $py = $c; break }
  } catch { }
}
if (-not $py) { Write-Error '找不到可用的 Python 3，无法启动本地服务器'; exit 1 }

$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
  Select-Object -ExpandProperty IPAddress

Write-Host ""
Write-Host "  最好的我 · 本地预览" -ForegroundColor Cyan
Write-Host "  目录：$dir"
Write-Host "  Python：$py" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  这台电脑：  http://localhost:$Port/" -ForegroundColor Green
foreach ($ip in $ips) {
  Write-Host "  iPad/手机： http://${ip}:$Port/" -ForegroundColor Green
}
Write-Host ""
Write-Host "  iPhone/iPad 需与电脑在同一个 Wi-Fi。关闭此窗口即停止。" -ForegroundColor DarkGray
Write-Host ""

$proc = Start-Process -FilePath $py `
  -ArgumentList @('-m', 'http.server', "$Port", '--bind', '0.0.0.0', '--directory', "$dir") `
  -PassThru
try { Wait-Process -Id $proc.Id -ErrorAction Stop } catch { }
