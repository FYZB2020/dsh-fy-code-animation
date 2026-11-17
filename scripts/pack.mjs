// 打便携包：把插件目录 + 安装脚本压成一个 zip，复制到任意装了 DSH 的 Windows 电脑即可。
// 用法：node scripts/pack.mjs [--out <目录>]
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pluginDir } from '../lib/paths.js'

const args = process.argv.slice(2)
const outArg = args.indexOf('--out')
const outDir = path.resolve(outArg >= 0 ? args[outArg + 1] : 'N:\\DSHreb\\deliver')
const pkg = JSON.parse(fs.readFileSync(path.join(pluginDir, 'package.json'), 'utf8'))
const folder = path.basename(pluginDir)
fs.mkdirSync(outDir, { recursive: true })

const stage = path.join(outDir, `_stage-${Date.now()}`)
const target = path.join(stage, folder)
fs.mkdirSync(target, { recursive: true })

const SKIP = new Set(['node_modules', '.git', '.cache', 'output', 'env'])
function copy(src, dst, rel = '') {
  for (const name of fs.readdirSync(src)) {
    if (SKIP.has(name)) continue
    const s = path.join(src, name)
    const d = path.join(dst, name)
    const st = fs.statSync(s)
    if (st.isDirectory()) {
      fs.mkdirSync(d, { recursive: true })
      copy(s, d, rel + '/' + name)
    } else {
      fs.copyFileSync(s, d)
    }
  }
}
copy(pluginDir, target)

const installCmd = `@echo off
chcp 65001 >nul
setlocal
set "HERE=%~dp0"
echo.
echo  == 代码动画插件 · 安装 ==
echo  插件目录：%HERE%${folder}
echo.
set "DSH="
if exist "%LOCALAPPDATA%\\Programs\\DeepSeek Harness\\resources\\runtime\\cli\\bin\\dsh.cmd" set "DSH=%LOCALAPPDATA%\\Programs\\DeepSeek Harness\\resources\\runtime\\cli\\bin\\dsh.cmd"
if not defined DSH if exist "%PROGRAMFILES%\\DeepSeek Harness\\resources\\runtime\\cli\\bin\\dsh.cmd" set "DSH=%PROGRAMFILES%\\DeepSeek Harness\\resources\\runtime\\cli\\bin\\dsh.cmd"
if not defined DSH (
  echo [x] 没找到 DeepSeek Harness 的 dsh.cmd。
  echo     请先安装 DSH，或手动执行： dsh plugin add "%HERE%${folder}"
  pause
  exit /b 1
)
echo  使用 CLI：%DSH%
call "%DSH%" plugin add "%HERE%${folder}"
if errorlevel 1 (
  echo.
  echo [x] 安装失败。可把整个 ${folder} 目录拷到电脑上，然后在 DSH 里让助手"安装这个插件"。
  pause
  exit /b 1
)
echo.
echo [ok] 已登记插件。接下来：
echo   1. 重启 DeepSeek Harness；
echo   2. 让助手执行"开启动画模式"，或点右下角面板的开关；
echo   3. 首次使用会自动装 Python 依赖（Playwright / FFmpeg），也可让助手跑 codeanim_setup。
echo.
pause
`
const readme = `代码动画插件（dsh-fy-code-animation ${pkg.version}）便携包
=====================================================

一、这台电脑要有 DeepSeek Harness（Windows）。
二、双击 安装.cmd —— 它会把插件登记到 DSH。
三、重启 DSH，在对话里说"开启动画模式"，或点右下角"代码动画"面板的开关。
四、首次使用会自动准备依赖（Python venv + Playwright + Chromium/Edge + FFmpeg）。
   网络不好时让助手执行 codeanim_setup，或参考插件内 docs/依赖.md。
五、出片命令示例：让助手用 codeanim_style 搜画风 → codeanim_new 建项目 → codeanim_render 渲染。

出问题：
* 双击 停用本插件.cmd 可以不改任何文件就回滚（只在 profile 的 bundles 里摘掉本插件），重启即恢复。
* 双击 启用本插件.cmd 再打开。
* 面板没出现：在 DSH 里按 Ctrl+R。

插件自带：341 条画风提示词 + 196 张参考静帧 + 两套技能（fy-code-animation / code-animation-prompts）。
许可：免费使用与分享，禁止包装成付费课程或付费 skill 出售。
`

function toggleCmd(mode, label) {
  return `@echo off
chcp 65001 >nul
setlocal
set "MJS=%~dp0${folder}\\scripts\\toggle-profile.mjs"
set "NODE="
where node >nul 2>nul && set "NODE=node"
if not defined NODE (
  if exist "%LOCALAPPDATA%\\Programs\\DeepSeek Harness\\DeepSeek Harness.exe" (
    set "ELECTRON_RUN_AS_NODE=1"
    set "NODE=%LOCALAPPDATA%\\Programs\\DeepSeek Harness\\DeepSeek Harness.exe"
  )
)
if not defined NODE (
  if exist "%PROGRAMFILES%\\DeepSeek Harness\\DeepSeek Harness.exe" (
    set "ELECTRON_RUN_AS_NODE=1"
    set "NODE=%PROGRAMFILES%\\DeepSeek Harness\\DeepSeek Harness.exe"
  )
)
if not defined NODE (
  echo [x] 没找到 node，也没找到 DeepSeek Harness。
  pause
  exit /b 1
)
"%NODE%" "%MJS%" --profile desktop --${mode}
echo.
echo ${label}完成后重启 DeepSeek Harness 即可。
pause
`
}

fs.writeFileSync(path.join(stage, '安装.cmd'), installCmd.replace(/\n/g, '\r\n'), 'utf8')
fs.writeFileSync(path.join(stage, '使用说明.txt'), readme.replace(/\n/g, '\r\n'), 'utf8')
fs.writeFileSync(path.join(stage, '停用本插件.cmd'), toggleCmd('off', '停用').replace(/\n/g, '\r\n'), 'utf8')
fs.writeFileSync(path.join(stage, '启用本插件.cmd'), toggleCmd('on', '启用').replace(/\n/g, '\r\n'), 'utf8')

const zip = path.join(outDir, `${folder}-${pkg.version}-portable.zip`)
if (fs.existsSync(zip)) fs.rmSync(zip, { force: true })
const ps = `Compress-Archive -Path '${stage.replace(/'/g, "''")}\\*' -DestinationPath '${zip.replace(/'/g, "''")}' -CompressionLevel Optimal -Force`
const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true })
if (r.status !== 0 || !fs.existsSync(zip)) {
  console.error('打包失败：', r.stderr || r.stdout)
  process.exit(1)
}
const mb = (fs.statSync(zip).size / 1048576).toFixed(2)
console.log(`[pack] ${zip} (${mb} MB)`)
fs.rmSync(stage, { recursive: true, force: true })
