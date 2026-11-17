// 体检：依赖、技能同步、画风库、渲染器、最近项目一次看全。
// 用法：node scripts/doctor.mjs [--json]
import fs from 'node:fs'
import { layout } from '../lib/paths.js'
import { status, ALL_STEPS } from '../lib/deps.js'
import { styleCount } from '../lib/styles.js'
import { readState } from '../lib/state.js'
import { syncWorkspace } from '../lib/sync.js'

const wantJson = process.argv.includes('--json')
const l = layout()
const st = status()
const state = readState()
const sync = syncWorkspace()
const report = {
  root: l.root,
  enabled: state.enabled,
  ready: st.ready && styleCount() > 0,
  steps: st.steps,
  styleCount: styleCount(),
  sync,
  artifacts: {
    venv: fs.existsSync(l.envPython),
    renderer: fs.existsSync(`${l.bin}\\render_video.py`),
    ffmpeg: fs.existsSync(l.ffmpeg),
    picker: fs.existsSync(`${l.styleLibrary}\\风格挑选.html`),
  },
  lastProject: state.lastProject || null,
  lastOutput: state.lastOutput || null,
  next: [] ,
}
if (!st.steps.python.ok) report.next.push('安装 Python 3.10+（或设置 CODEANIM_PYTHON 指向 python.exe）')
if (!st.steps.venv.ok) report.next.push(`codeanim_setup steps=["venv"]`)
if (!st.steps.playwright.ok) report.next.push(`codeanim_setup steps=["pip"]`)
if (!st.steps.chromium.ok) report.next.push('codeanim_setup steps=["chromium"]（下载不动会自动用本机 Edge）')
if (!st.steps.ffmpeg.ok) report.next.push('codeanim_setup steps=["ffmpeg"]')
if (!report.ready) report.next.push(`codeanim_setup steps=[${ALL_STEPS.join(',')}]`)
if (!state.enabled) report.next.push('codeanim_switch action="on"')

if (wantJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(`代码动画插件 · 体检`)
  console.log(`运行时目录: ${report.root}`)
  console.log(`动画模式: ${report.enabled ? '开启' : '关闭'}`)
  for (const [k, v] of Object.entries(st.steps)) console.log(`${v.ok ? '✅' : '❌'} ${k}: ${typeof v.detail === 'string' ? v.detail : JSON.stringify(v.detail)}`)
  console.log(`${report.styleCount ? '✅' : '❌'} 画风库: ${report.styleCount} 条`)
  console.log(`技能同步: ${sync.changed ? '已更新' : '已是最新'}`)
  if (report.next.length) {
    console.log('\n下一步:')
    for (const n of report.next) console.log(` - ${n}`)
  }
}
