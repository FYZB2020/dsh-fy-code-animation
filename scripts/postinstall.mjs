// 安装后自动跑：同步技能/画风库 → 写状态 → 后台起一个分离进程装依赖。
// 只做本地操作，不阻塞插件安装；装失败也不影响 DSH 启动，面板里会显示未就绪。
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const plugin = path.resolve(here, '..')
process.env.CODEANIM_HOME = process.env.CODEANIM_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh', 'code-animation')

async function main() {
  const { ensureDirs, pretty } = await import(new URL('../lib/paths.js', import.meta.url))
  const { syncWorkspace } = await import(new URL('../lib/sync.js', import.meta.url))
  const { readState, writeState } = await import(new URL('../lib/state.js', import.meta.url))
  const l = ensureDirs()
  const sync = syncWorkspace(true)
  const st = readState()
  if (!st.installedAt) writeState({ installedAt: new Date().toISOString() })
  console.log(`[code-animation] 同步完成：${sync.styleCount} 条画风 -> ${pretty(l.styleLibrary)}`)

  const forced = String(process.env.CODEANIM_SKIP_AUTO_SETUP || '').toLowerCase()
  if (forced === '1' || forced === 'true') {
    console.log('[code-animation] CODEANIM_SKIP_AUTO_SETUP 已设置，跳过依赖安装。')
    return
  }
  const script = path.join(plugin, 'scripts', 'setup-console.mjs')
  if (!fs.existsSync(script)) return
  const logFile = l.setupLog
  fs.mkdirSync(path.dirname(logFile), { recursive: true })
  const fd = fs.openSync(logFile, 'a')
  const child = spawn(process.execPath, [script], {
    detached: true,
    stdio: ['ignore', fd, fd],
    env: { ...process.env, CODEANIM_HOME: l.root },
    windowsHide: true,
  })
  child.unref()
  console.log(`[code-animation] 依赖安装已在后台开始（PID ${child.pid}，日志 ${pretty(logFile)}）。`)
}

main().catch((e) => {
  console.error('[code-animation] postinstall 失败：', e && e.message)
  // 不让安装失败：依赖可以用 codeanim_setup 补
  process.exitCode = 0
})
