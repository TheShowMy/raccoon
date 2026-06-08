const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist')
const isWin = process.platform === 'win32'

function rmrf(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function cp(src, dst) {
  fs.copyFileSync(src, dst)
}

function mkdir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// 1. 清理并创建 dist 目录
rmrf(dist)
mkdir(dist)

// 2. 复制后端二进制
const backendBinary = isWin
  ? path.join(root, 'target', 'release', 'raccoon.exe')
  : path.join(root, 'target', 'release', 'raccoon')

if (!fs.existsSync(backendBinary)) {
  console.error('❌ 后端二进制不存在:', backendBinary)
  console.error('请先运行 npm run build:backend')
  process.exit(1)
}

const binaryName = isWin ? 'raccoon.exe' : 'raccoon'
cp(backendBinary, path.join(dist, binaryName))
fs.chmodSync(path.join(dist, binaryName), 0o755)

// 3. 复制前端构建产物
const frontendDist = path.join(root, 'frontend', 'dist')
if (!fs.existsSync(frontendDist)) {
  console.error('❌ 前端构建产物不存在:', frontendDist)
  console.error('请先运行 npm run build:frontend')
  process.exit(1)
}

const frontendOut = path.join(dist, 'frontend')
mkdir(frontendOut)

function copyDir(src, dst) {
  mkdir(dst)
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const dstPath = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath)
    } else {
      cp(srcPath, dstPath)
    }
  }
}

copyDir(frontendDist, frontendOut)

// 4. 复制 Coordinator 扩展
const extSrc = path.join(root, 'pi-extensions')
if (fs.existsSync(extSrc)) {
  const extOut = path.join(dist, 'pi-extensions')
  mkdir(extOut)
  copyDir(extSrc, extOut)
} else {
  console.warn('⚠️ pi-extensions 目录不存在，Coordinator 扩展将不可用')
}

// 5. 复制图标
const iconSrc = path.join(root, 'assets', 'raccoon-icon.png')
if (fs.existsSync(iconSrc)) {
  cp(iconSrc, path.join(dist, 'raccoon-icon.png'))
}

// 6. 创建各平台启动脚本

// macOS: start.command（双击启动）
const macScript = `#!/bin/bash
cd "$(dirname "$0")"
./raccoon
`
fs.writeFileSync(path.join(dist, 'start.command'), macScript)
fs.chmodSync(path.join(dist, 'start.command'), 0o755)

// Linux/macOS: start.sh
const shScript = `#!/bin/bash
set -e
cd "$(dirname "$0")"
./raccoon
`
fs.writeFileSync(path.join(dist, 'start.sh'), shScript)
fs.chmodSync(path.join(dist, 'start.sh'), 0o755)

// Windows CMD: start.bat
const batScript = `@echo off
cd /d "%~dp0"
start raccoon.exe
`
fs.writeFileSync(path.join(dist, 'start.bat'), batScript)

// Windows PowerShell: start.ps1
const psScript = `#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
.\\raccoon.exe
`
fs.writeFileSync(path.join(dist, 'start.ps1'), psScript)

// 6. 输出总结
console.log('✅ 打包完成!')
console.log('')
console.log('输出目录:', dist)
console.log('')
console.log('启动方式:')
console.log('  macOS:   双击 dist/start.command')
console.log('  Linux:   ./dist/start.sh')
console.log('  Windows: 双击 dist/start.bat 或运行 dist/start.ps1')
