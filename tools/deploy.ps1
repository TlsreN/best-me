# 把 app/ 发布到 GitHub Pages（gh-pages 分支）
# 用法：powershell -ExecutionPolicy Bypass -File tools\deploy.ps1 -Message "说明"
param([string]$Message = "deploy: app")

# git 会往 stderr 写正常进度，Stop 会把它当成错误，所以这里用 Continue 并自行判断退出码
$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
$src = Join-Path $root 'app'
$dir = Join-Path $env:TEMP 'bestme-pages'
$repo = 'https://github.com/TlsreN/best-me.git'

function Fail($msg) { Write-Host $msg -ForegroundColor Red; exit 1 }

if (-not (Test-Path (Join-Path $dir '.git'))) {
  if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
  git clone --branch gh-pages $repo $dir
  if ($LASTEXITCODE -ne 0) { Fail '克隆失败' }
} else {
  git -C $dir fetch origin gh-pages
  if ($LASTEXITCODE -ne 0) { Fail '拉取失败' }
  git -C $dir reset --hard origin/gh-pages
  if ($LASTEXITCODE -ne 0) { Fail '重置失败' }
}

# 清掉除 .git 外的所有文件，再把 app/ 原样铺到根目录
Get-ChildItem $dir -Force | Where-Object { $_.Name -ne '.git' } | Remove-Item -Recurse -Force
Copy-Item (Join-Path $src '*') $dir -Force

git -C $dir add -A
$changes = git -C $dir status --porcelain
if (-not $changes) {
  Write-Host '没有变化，跳过发布' -ForegroundColor DarkGray
  exit 0
}
git -C $dir commit -q -m $Message
git -C $dir push -q origin gh-pages
if ($LASTEXITCODE -ne 0) { Fail '推送失败' }

Write-Host ''
Write-Host '  已发布：https://tlsren.github.io/best-me/' -ForegroundColor Green
Write-Host '  生效通常需要 30–60 秒，之后刷新页面即可' -ForegroundColor DarkGray
Write-Host ''
