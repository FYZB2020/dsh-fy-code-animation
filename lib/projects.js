// 建项目：把中文文案切成场景、算出可校验的时间线、生成 task.json 与可渲染的 index.html。
// task.json 必须过 fy 的 validate_task.py，所以这里的时间线严格按它的规则算。
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { layout, ensureDirs, pretty, vendor } from './paths.js'
import { readState } from './state.js'
import { detectPython } from './deps.js'
import * as styles from './styles.js'

const SENT_SPLIT = /(?<=[。！？!?；;\n])/

function slug(name) {
  const s = String(name || '').trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '')
  return (s || 'animation').slice(0, 48)
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function splitSentences(copy) {
  return String(copy || '')
    .split(SENT_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 把句子合并成场景：每场不超过 maxChars 字，最多 2 句。 */
export function groupScenes(copy, opts = {}) {
  const sentences = splitSentences(copy)
  const maxChars = Number(opts.maxChars || 34)
  const maxSentences = Number(opts.maxSentences || 2)
  const scenes = []
  let cur = []
  let chars = 0
  const flush = () => {
    if (!cur.length) return
    scenes.push({ text: cur.join(''), weight: chars })
    cur = []
    chars = 0
  }
  for (const s of sentences) {
    if (cur.length && (chars + s.length > maxChars || cur.length >= maxSentences)) flush()
    cur.push(s)
    chars += s.length
  }
  flush()
  return scenes.length ? scenes : [{ text: String(copy || '').slice(0, 60), weight: 20 }]
}

function round2(n) {
  return Math.round(n * 100) / 100
}

/** 按字数分配时长，并给出满足 validate_task.py 的 last_text_at / read_seconds。 */
export function buildTimeline(scenes, duration) {
  const total = scenes.reduce((a, b) => a + Math.max(6, b.weight || 6), 0) || 1
  const out = []
  let t = 0
  scenes.forEach((s, i) => {
    const share = Math.max(6, s.weight || 6) / total
    let dur = round2(Math.max(2.2, duration * share))
    if (i === scenes.length - 1) dur = round2(Math.max(1.2, duration - t))
    const start = round2(t)
    const end = round2(t + dur)
    const read = round2(Math.min(3.0, Math.max(0.3, dur * 0.45)))
    let last = round2(end - read)
    if (last < start) last = start
    out.push({ id: `S${String(i + 1).padStart(2, '0')}`, start, end, text: s.text, read, last })
    t = end
  })
  return out
}

export function buildTask({ name, copy, timeline, style, phase = 'card', width, height, fps }) {
  const scenes = timeline.map((s) => ({
    id: s.id,
    start: s.start,
    end: s.end,
    time_basis: 'planned',
    meaning: s.text,
    operation: '按画风做入场与逐字显现，句尾留读秒',
    last_text_at: s.last,
    read_seconds: s.read,
    evidence: [],
  }))
  const events = timeline.map((s, i) => ({
    id: `E${String(i + 1).padStart(2, '0')}`,
    scene_id: s.id,
    at: s.last,
    time_basis: 'planned',
    role: 'last_text_landed',
  }))
  return {
    schema_version: 1,
    task_id: name,
    phase,
    actions: phase === 'card' ? ['read', 'write_plan', 'logic_check'] : ['read', 'write_plan', 'logic_check'],
    fps,
    width,
    height,
    source: { path: 'input/copy.txt', status: 'placeholder_replace_before_production' },
    style: {
      arrangement: 'single',
      decision_status: style && style.id ? 'selected' : 'pending',
      selection: style && style.id ? [{ id: style.id, name: style.name || '', series: style.series || '' }] : [],
    },
    music: { status: 'planned', actual_sync: false, file: null },
    scenes,
    events,
    evidence: { logic: [], viewed: [], heard: [], author_accepted: false },
  }
}

function fillTemplate(html, vars) {
  let out = html
  for (const [k, v] of Object.entries(vars)) out = out.split(`__${k}__`).join(String(v))
  return out
}

export function validateTask(taskPath, python) {
  const script = path.join(layout().skills, 'fy-code-animation', 'scripts', 'validate_task.py')
  if (!fs.existsSync(script)) return { ok: null, skipped: '技能未同步，跳过校验' }
  let cmd = null
  let pre = []
  if (python) {
    cmd = python
  } else if (fs.existsSync(layout().envPython)) {
    cmd = layout().envPython
  } else {
    const py = detectPython()
    if (py.ok) {
      cmd = py.python
      pre = py.pre || []
    }
  }
  if (!cmd) return { ok: null, skipped: '没有 Python 3.10+，跳过校验' }
  const r = spawnSync(cmd, [...pre, script, taskPath], { encoding: 'utf8', windowsHide: true, timeout: 60_000 })
  const text = `${r.stdout || ''}${r.stderr || ''}`.trim()
  return { ok: r.status === 0, code: r.status, output: text }
}

/**
 * 建项目。返回 { ok, dir, html, task, validation, timeline }。
 */
export function createProject(opts = {}) {
  const st = readState()
  const l = ensureDirs()
  const dims = {
    width: Number(opts.width || st.defaults.width),
    height: Number(opts.height || st.defaults.height),
    fps: Number(opts.fps || st.defaults.fps),
    duration: Number(opts.duration || st.defaults.duration),
  }
  const name = String(opts.name || 'animation').trim() || 'animation'
  const dir = path.join(l.projects, `${slug(name)}-${stamp()}`)
  fs.mkdirSync(path.join(dir, 'input'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true })

  const copy = String(opts.copy || opts.text || '').trim()
  const groups = groupScenes(copy, { maxChars: opts.maxChars })
  const timeline = buildTimeline(groups, dims.duration)

  let styleEntry = null
  let styleMd = ''
  if (opts.style) {
    const s = styles.show(opts.style)
    if (s.ok) {
      styleEntry = s.entry
      styleMd = s.md
    }
  }
  const accent = opts.accent || '#e8b04b'
  const task = buildTask({ name, copy, timeline, style: styleEntry, phase: opts.phase || 'card', ...dims })

  const template = fs.readFileSync(path.join(vendor().templates, 'index.html'), 'utf8')
  const timelineForHtml = timeline.map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text,
    note: '',
    kicker: `SCENE ${s.id.slice(1)}`,
  }))
  const html = fillTemplate(template, {
    TITLE: name.replace(/[<>&]/g, ''),
    ACCENT: accent,
    META: `${dims.width}×${dims.height} · ${dims.fps}FPS`,
    DURATION: dims.duration,
    TIMELINE: JSON.stringify(timelineForHtml, null, 2),
  })

  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8')
  fs.writeFileSync(path.join(dir, 'input', 'copy.txt'), copy || '（把文案粘贴到这里，然后重新跑 codeanim_new）', 'utf8')
  fs.writeFileSync(path.join(dir, 'task.json'), JSON.stringify(task, null, 2), 'utf8')

  const notes = [
    `# ${name}`,
    '',
    `- 目录：${dir}`,
    `- 规格：${dims.width}×${dims.height} @ ${dims.fps}fps，${dims.duration}s（${Math.ceil(dims.duration * dims.fps)} 帧）`,
    `- 阶段：${task.phase}`,
    styleEntry ? `- 画风：${styleEntry.id} ${styleEntry.name}（${styleEntry.series}）` : '- 画风：未选（先 codeanim_style search 再回来填）',
    '',
    '## 下一步（按 fy-code-animation 的固定顺序）',
    '1. 把真实文案写进 input/copy.txt，重跑 codeanim_new 生成时间线；',
    '2. 用 codeanim_style show <ID> 完整阅读画风原文，别只抄标题；',
    '3. 分镜与音乐/音效表落进 task.json，phase 推进到 still → audition → final；',
    '4. `codeanim_render` 出片，检查任意帧是否可重现。',
    '',
    styleMd ? '## 画风原文（节选）\n\n' + styleMd.slice(0, 4000) : '',
  ].join('\n')
  fs.writeFileSync(path.join(dir, 'notes.md'), notes, 'utf8')

  const validation = validateTask(path.join(dir, 'task.json'), opts.python)
  return {
    ok: true,
    dir,
    prettyDir: pretty(dir),
    html: path.join(dir, 'index.html'),
    task: path.join(dir, 'task.json'),
    timeline,
    validation,
    dims,
  }
}
