// 离线自检：不装浏览器、不渲染，只验证同步、检索、建项目、校验、开关闸门。
// 用法：node tests/harness.mjs（CODEANIM_HOME 指到临时目录，别污染真实运行时）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const plugin = path.resolve(here, '..')

const ownsHome = !process.env.CODEANIM_HOME
if (ownsHome) {
  process.env.CODEANIM_HOME = path.join(os.tmpdir(), 'codeanim-harness-' + process.pid)
}

const results = []
function check(name, fn) {
  try {
    const detail = fn()
    results.push({ name, ok: true, detail })
    console.log(`PASS ${name}${detail ? ' — ' + detail : ''}`)
  } catch (e) {
    results.push({ name, ok: false, error: e.message })
    console.log(`FAIL ${name} — ${e.message}`)
  }
}

const { syncWorkspace } = await import(new URL('../lib/sync.js', import.meta.url))
const styles = await import(new URL('../lib/styles.js', import.meta.url))
const projects = await import(new URL('../lib/projects.js', import.meta.url))
const state = await import(new URL('../lib/state.js', import.meta.url))
const tools = await import(new URL('../lib/tools.js', import.meta.url))
const deps = await import(new URL('../lib/deps.js', import.meta.url))
const render = await import(new URL('../lib/render.js', import.meta.url))
const { layout } = await import(new URL('../lib/paths.js', import.meta.url))

check('同步技能与画风库', () => {
  const r = syncWorkspace(true)
  if (r.reason === 'error') throw new Error(r.error)
  if (r.styleCount !== 341) throw new Error(`期望 341 条，实际 ${r.styleCount}`)
  return `${r.styleCount} 条 -> ${layout().styleLibrary}`
})

check('catalog 可解析', () => {
  const c = styles.loadCatalog()
  if (c.total !== 341) throw new Error(`total=${c.total}`)
  if (c.withStill !== 196) throw new Error(`with_still=${c.withStill}`)
  return `${c.entries.length} entries`
})

check('检索「水墨」有命中', () => {
  const r = styles.search('水墨', { limit: 5 })
  if (!r.hits.length) throw new Error('0 hits')
  return r.hits.map((h) => h.id).join(',')
})

check('show B3 拿到正文', () => {
  const r = styles.show('B3')
  if (!r.ok) throw new Error(r.error)
  if (!r.mdExists || r.md.length < 100) throw new Error('正文缺失')
  return `${r.entry.name} / ${r.md.length} 字符`
})

check('系列列表', () => {
  const r = styles.list()
  if (r.groups.length < 10) throw new Error(`系列数 ${r.groups.length}`)
  return r.groups.map((g) => `${g.series}:${g.count}`).join(' ')
})

check('开关关闭时 codeanim_new 被拦', () => {
  state.setEnabled(false, 'harness')
  const r = tools.toolNew({ name: 'blocked', copy: '测试文案。' })
  if (!r.data || r.data.blocked !== true) throw new Error('没有被拦')
  return 'blocked ok'
})

check('建项目 + task.json 过校验', () => {
  state.setEnabled(true, 'harness')
  const copy = '代码动画不是把句子贴成卡片。先把全文读完，标出每句的气势词。再决定画风，检索后完整阅读原文。最后才动手分镜。'
  const r = tools.toolNew({ name: 'harness-demo', copy, style: 'B3', duration: 12 })
  if (!fs.existsSync(r.data.html)) throw new Error('index.html 没生成')
  const v = r.data.validation
  if (v.ok === false) throw new Error('校验失败：' + String(v.output).slice(0, 400))
  return `${r.data.timeline.length} 个场景；校验=${v.ok === true ? 'ok' : 'skipped'}; ${r.data.dir}`
})

check('时间线满足 validate 规则', () => {
  const r = projects.buildTimeline(projects.groupScenes('一句话。第二句比较长一些，用来测试分配。第三句收尾。'), 12)
  for (const s of r) {
    if (!(s.start < s.end)) throw new Error(`${s.id} start>=end`)
    if (s.last < s.start) throw new Error(`${s.id} last<start`)
    if (s.last + s.read > s.end + 1e-6) throw new Error(`${s.id} last+read>end`)
  }
  return r.map((s) => `${s.id}:${s.start}-${s.end}`).join(' ')
})

check('依赖探测有结构', () => {
  const st = deps.status()
  for (const k of ['python', 'venv', 'playwright', 'chromium', 'ffmpeg']) {
    if (!st.steps[k]) throw new Error(`缺 ${k}`)
  }
  return `ready=${st.ready} python=${st.steps.python.detail}`
})

check('渲染参数校验', () => {
  let threw = false
  try {
    render.validateArgs({ width: 1921, height: 1080 })
  } catch {
    threw = true
  }
  if (!threw) throw new Error('奇数宽没被拒绝')
  const ok = render.validateArgs({ width: 1080, height: 1920, fps: 30, duration: 8 })
  return `${ok.width}x${ok.height}@${ok.fps} ${ok.duration}s`
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
// 只有自己创建的临时目录才清理；测试别人已经配置好的运行时等于搞破坏
if (ownsHome) {
  try {
    fs.rmSync(process.env.CODEANIM_HOME, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch (e) {
    console.log(`(cleanup skipped: ${e.code || e.message})`)
  }
}
process.exitCode = failed.length ? 1 : 0
