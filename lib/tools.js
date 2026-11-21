// 六个工具：状态、开关、装依赖、查画风、建项目、出片。
// 定义用纯 JSON Schema（不依赖 @deepseek-ai/dsh-tools），宿主校验不过只会打日志。
import fs from 'node:fs'
import path from 'node:path'
import { layout, ensureDirs, pretty } from './paths.js'
import { readState, writeState, isEnabled, setEnabled, disabledMessage } from './state.js'
import { syncWorkspace, rebuildStyleIndex } from './sync.js'
import * as deps from './deps.js'
import * as styles from './styles.js'
import * as projects from './projects.js'
import * as render from './render.js'
import { append as logAppend } from './log.js'

const OUTPUT = {
  schema: {
    type: 'object',
    properties: { text: { type: 'string' }, data: { type: 'object', additionalProperties: true } },
    required: ['text'],
    additionalProperties: true,
  },
  render: (_a, v) => [{ type: 'text', text: (v && v.text) || '' }],
}

function gate(action) {
  if (isEnabled()) return null
  return { text: disabledMessage(action), data: { enabled: false, blocked: true } }
}

/** 启动时同步被推迟了，工具入口自己补一次（幂等、未变化时只做几次 stat）。 */
function ensureSynced() {
  try {
    syncWorkspace(false)
  } catch (e) {
    console.error(`[code-animation] 同步失败：${e && e.message}`)
  }
}

/** 等一个耗时操作时用的文本摘要。 */
function fmtStep(s) {
  const label = s.key || s.label || '?'
  if (s.ok) return `✓ ${label}（${Math.round((s.ms || 0) / 1000)}s）`
  return `✗ ${label}：${String(s.error || s.stderr || (s.detail && JSON.stringify(s.detail)) || '失败').slice(0, 300)}`
}

export function toolStatus() {
  const l = ensureDirs()
  const st = readState()
  const det = deps.status()
  let styleN = 0
  try {
    styleN = styles.styleCount()
  } catch {
    styleN = 0
  }
  const sync = syncWorkspace(false)
  const lines = [
    `动画模式：${st.enabled ? '已开启' : '关闭'}`,
    `依赖：${det.ready ? '就绪' : '未就绪'}`,
    ...Object.entries(det.steps).map(([k, v]) => `- ${k}: ${v.ok ? '✓' : '✗'} ${v.detail || ''}`.trim()),
    `画风库：${styleN} 条（${pretty(l.styleLibrary)}）`,
    `运行时：${pretty(l.root)}`,
    `默认规格：${st.defaults.width}×${st.defaults.height} @ ${st.defaults.fps}fps，${st.defaults.duration}s`,
    st.lastProject ? `最近项目：${pretty(st.lastProject)}` : '最近项目：无',

    sync.synced ? `技能/画风库已同步（${sync.styleCount} 条）` : '技能/画风库：已是最新',
  ]
  return { text: lines.join('\n'), data: { enabled: st.enabled, ready: det.ready, steps: det.steps, styles: styleN, root: l.root, state: st } }
}

export function toolSwitch(args = {}) {
  const action = String(args.action || (args.enabled === false ? 'off' : 'toggle')).toLowerCase()
  const st = readState()
  const target = action === 'on' ? true : action === 'off' ? false : !st.enabled
  setEnabled(target, `switch ${action} via tool`)
  if (target) {
    syncWorkspace(true)
    const det = deps.status()
    const tail = det.ready
      ? '依赖已就绪，可以直接 codeanim_new 建项目。'
      : '依赖还没装好：下一步跑 codeanim_setup（或首次安装时让它自己在后台装完）。'
    return { text: `动画模式已开启。\n${tail}`, data: { enabled: true, ready: det.ready, steps: det.steps } }
  }
  return { text: '动画模式已关闭。技能仍可查看，但 codeanim_new / setup / render 会被拦住。', data: { enabled: false } }
}

export function toolSetup(args = {}) {
  const g = gate('安装依赖')
  if (g) return g
  const steps = Array.isArray(args.steps) && args.steps.length ? args.steps : deps.ALL_STEPS
  const done = []
  const res = deps.setup({
    steps,
    offline: args.offline !== false,
    onStep: (key, v) => {
      done.push({ key, ...(v || {}) })
      logAppend('setup', fmtStep({ key, ...(v || {}) }))
    },
  })
  const ready = Boolean(res.ok || (res.status && res.status.ready))
  if (ready) {
    syncWorkspace(true)
    rebuildStyleIndex(layout().envPython)
  }
  const lines = [ready ? '依赖安装完成，可以出片了。' : '依赖还没装完，看下面哪一步失败。', ...done.map(fmtStep)]
  if (!ready) lines.push('', '重试同一命令即可（幂等）；失败信息已写 logs/setup.log。')
  return { text: lines.join('\n'), data: { ready, steps: done, deps: res.deps || null } }
}

export function toolStyle(args = {}) {
  ensureSynced()
  const action = String(args.action || 'search').toLowerCase()
  if (action === 'open_picker' || action === 'picker') {
    const p = styles.pickerPath()
    return p
      ? { text: `离线挑选器：${p}\n也可以直接在 DSH 的「动画」面板里点「打开画风库」。`, data: { path: p } }
      : { text: '没找到 风格挑选.html（先 codeanim_setup 同步画风库）。', data: {} }
  }
  if (action === 'show') {
    const r = styles.show(args.id || args.query)
    if (!r.ok) return { text: r.error, data: {} }
    const head = `#${r.entry.id} ${r.entry.name}（系列 ${r.entry.series} / 静帧 ${r.entry.imageExists ? '有' : '无'}）`
    const body = r.md ? r.md : '（这条只有目录信息，没有正文 md）'
    return { text: `${head}\n\n${body}`, data: { entry: r.entry, mdPath: r.mdPath } }
  }
  if (action === 'list') {
    const r = styles.list(args.series)
    const text = r.groups.map((g) => `${g.series}（${g.count}）：` + g.items.map((e) => e.id).join(' ')).join('\n')
    return { text: `共 ${r.total} 条\n${text}`, data: { groups: r.groups.map((g) => ({ series: g.series, count: g.count })) } }
  }
  const r = styles.search(args.query || args.q || '', { series: args.series, limit: args.limit })
  const text = r.hits.length
    ? r.hits.map((e) => `${e.id}\t${e.name}\t${e.series}\t${e.md ? '' : '[无正文]'}\n    ${e.description.slice(0, 60)}`).join('\n')
    : '没有命中。换个说法，或先用 list 看系列。'
  return { text: `「${r.query}」命中 ${r.hits.length} 条：\n${text}`, data: { hits: r.hits } }
}

export function toolNew(args = {}) {
  const g = gate('建项目')
  if (g) return g
  ensureSynced()
  const r = projects.createProject(args)
  writeState({ lastProject: r.dir })
  const v = r.validation
  const vText = v.ok === true ? '✓ task.json 通过 fy 校验' : v.ok === false ? `✗ task.json 校验失败：\n${v.output}` : `（${v.skipped}）`
  const lines = [
    `项目已建：${r.prettyDir}`,
    `规格：${r.dims.width}×${r.dims.height} @ ${r.dims.fps}fps，${r.dims.duration}s`,
    `场景：${r.timeline.length} 个（${r.timeline.map((s) => `${s.id} ${s.start}-${s.end}s`).join('，')}）`,
    vText,
    '',
    `下一步：改 ${path.join(r.dir, 'input', 'copy.txt')} → 再跑 codeanim_new；分镜确定后 codeanim_render。`,
  ]
  return { text: lines.join('\n'), data: { dir: r.dir, html: r.html, task: r.task, timeline: r.timeline, validation: v } }
}

export function toolRender(args = {}) {
  const g = gate('渲染')
  if (g) return g
  ensureSynced()
  const st = readState()
  const target = args.project || args.html || st.lastProject
  if (!target) return { text: '没有可渲染的项目：先 codeanim_new，或传 project/html 路径。', data: {} }
  const abs = path.resolve(target)
  let html = abs
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) html = render.findHtml(abs)
  if (!html || !fs.existsSync(html)) return { text: `找不到 HTML：${target}`, data: {} }
  const r = render.render(html, {
    name: args.name || path.basename(path.dirname(html)),
    output: args.output,
    audio: args.audio,
    duration: args.duration || st.defaults.duration,
    fps: args.fps || st.defaults.fps,
    width: args.width || st.defaults.width,
    height: args.height || st.defaults.height,
  })
  if (!r.ok) return { text: `渲染失败：${r.error}`, data: { error: r.error, log: r.log } }
  writeState({ lastOutput: r.output })
  const m = r.meta || {}
  return {
    text: [
      `成片：${r.output}`,
      `实测：${m.width}×${m.height}，${m.fps}fps，${m.duration}s，${(m.bytes / 1024 / 1024).toFixed(1)} MB`,
      `耗时：${Math.round((r.ms || 0) / 1000)}s`,
    ].join('\n'),
    data: { output: r.output, meta: m },
  }
}

const COMMON = { type: 'object', properties: {}, required: [], additionalProperties: true }

export function createTools() {
  return [
    {
      name: 'codeanim_status',
      description: '查看代码动画插件的状态：动画模式开关、依赖是否就绪（Python/venv/Playwright/Chromium/FFmpeg）、画风库条数、最近项目与成片。做动画前先看这个。',
      parameters: { ...COMMON },
      timeoutMs: 60_000,
      isConcurrencySafe: () => true,
      output: OUTPUT,
      async execute() { return toolStatus() },
    },
    {
      name: 'codeanim_switch',
      description: '开关动画模式。关闭时技能仍可读，但建项目/装依赖/渲染会被拒绝；打开后才允许动手。用户说“开始做动画/打开动画模式”时调用 action=on。',
      parameters: {
        type: 'object',
        properties: { action: { type: 'string', enum: ['on', 'off', 'toggle'], description: '开关动作，默认 toggle' } },
        required: [],
        additionalProperties: true,
      },
      timeoutMs: 120_000,
      isConcurrencySafe: () => false,
      output: OUTPUT,
      async execute(args) { return toolSwitch(args || {}) },
    },
    {
      name: 'codeanim_setup',
      description: '安装/修复出片依赖：Python 3.10+ 探测、venv、playwright + imageio-ffmpeg、Chromium、FFmpeg，并同步技能与画风库。幂等，可重复跑；失败会说明是哪一步。',
      parameters: {
        type: 'object',
        properties: {
          steps: { type: 'array', items: { type: 'string' }, description: '只跑这些步骤：python,venv,pip,chromium,ffmpeg,verify' },
        },
        required: [],
        additionalProperties: true,
      },
      timeoutMs: 3_600_000,
      isConcurrencySafe: () => false,
      output: OUTPUT,
      async execute(args) { return toolSetup(args || {}) },
    },
    {
      name: 'codeanim_style',
      description: '检索 341 条代码动画画风库（不依赖 Python）。action=search 搜关键词，show 看某条完整提示词正文，list 按系列列编号，open_picker 给出离线挑选器路径。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['search', 'show', 'list', 'open_picker'], description: '默认 search' },
          query: { type: 'string', description: '搜索词，如 水墨 / 工程 纸 制图' },
          id: { type: 'string', description: '画风编号，如 B3 / L36' },
          series: { type: 'string', description: '系列字母，如 Z / K / L' },
          limit: { type: 'number', description: '返回条数，默认 8' },
        },
        required: [],
        additionalProperties: true,
      },
      timeoutMs: 60_000,
      isConcurrencySafe: () => true,
      output: OUTPUT,
      async execute(args) { return toolStyle(args || {}) },
    },
    {
      name: 'codeanim_new',
      description: '建一个动画项目：把中文文案切成场景、算好可校验时间线，生成 task.json（过 fy validate_task.py）与可渲染的 index.html。需要动画模式已开启。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '项目名' },
          copy: { type: 'string', description: '中文文案全文' },
          style: { type: 'string', description: '画风编号，如 B3；不填则待定' },
          duration: { type: 'number', description: '总时长秒，默认 12' },
          width: { type: 'number', description: '宽，默认 1920' },
          height: { type: 'number', description: '高，默认 1080' },
          fps: { type: 'number', description: '帧率，默认 30' },
        },
        required: ['name'],
        additionalProperties: true,
      },
      timeoutMs: 120_000,
      isConcurrencySafe: () => false,
      output: OUTPUT,
      async execute(args) { return toolNew(args || {}) },
    },
    {
      name: 'codeanim_render',
      description: '把项目 HTML 渲成 MP4（Playwright 逐帧 + FFmpeg，libx264）。需要动画模式开启且依赖就绪；输出重名会自动加时间戳，绝不覆盖。',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: '项目目录或 HTML 路径，默认最近项目' },
          output: { type: 'string', description: '指定输出 mp4 路径（可选）' },
          name: { type: 'string', description: '输出文件名（不含目录）' },
          audio: { type: 'string', description: '音轨文件路径（可选）' },
          duration: { type: 'number', description: '秒，默认取项目默认值' },
          width: { type: 'number', description: '宽，默认 1920' },
          height: { type: 'number', description: '高，默认 1080' },
          fps: { type: 'number', description: '帧率，默认 30' },
        },
        required: [],
        additionalProperties: true,
      },
      timeoutMs: 1_800_000,
      isConcurrencySafe: () => false,
      output: OUTPUT,
      async execute(args) { return toolRender(args || {}) },
    },
  ]
}
