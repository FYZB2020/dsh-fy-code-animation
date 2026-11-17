// 渲染：把 HTML 项目交给官方 render_video.py（Playwright 逐帧 + FFmpeg 编码），
// 并在渲染后用 ffmpeg -i 回读真实分辨率/时长/帧率，避免"看起来成功"。
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { layout, ensureDirs, pretty } from './paths.js'
import { append as logAppend } from './log.js'

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** 输出重名自动加时间戳，绝不覆盖已有成片。 */
export function uniqueOutput(name, dir = layout().output) {
  fs.mkdirSync(dir, { recursive: true })
  const safe = String(name || 'animation').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'animation'
  const base = safe.endsWith('.mp4') ? safe.slice(0, -4) : safe
  let target = path.join(dir, base + '.mp4')
  if (fs.existsSync(target)) target = path.join(dir, `${base}-${stamp()}.mp4`)
  let i = 2
  while (fs.existsSync(target)) {
    target = path.join(dir, `${base}-${stamp()}-${i}.mp4`)
    i += 1
  }
  return target
}

/** ffmpeg -i 解析元数据（没有 ffprobe 也能拿到时长/分辨率/帧率）。 */
export function probe(file) {
  const l = layout()
  const ff = fs.existsSync(l.ffmpeg) ? l.ffmpeg : 'ffmpeg'
  const r = spawnSync(ff, ['-hide_banner', '-i', file], { encoding: 'utf8', windowsHide: true, timeout: 60_000 })
  const text = `${r.stderr || ''}\n${r.stdout || ''}`
  const dur = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  const video = text.match(/Stream #\d+:\d+.*?Video:.*?(\d{2,5})x(\d{2,5})/)
  const fps = text.match(/(\d+(?:\.\d+)?)\s*fps/)
  return {
    exists: fs.existsSync(file),
    bytes: fs.existsSync(file) ? fs.statSync(file).size : 0,
    duration: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : null,
    width: video ? Number(video[1]) : null,
    height: video ? Number(video[2]) : null,
    fps: fps ? Number(fps[1]) : null,
  }
}

export function validateArgs(a = {}) {
  const width = Number(a.width || 1920)
  const height = Number(a.height || 1080)
  const fps = Number(a.fps || 30)
  const duration = Number(a.duration || 12)
  if (!Number.isFinite(width) || width <= 0 || width % 2 !== 0) throw new Error('width 必须是正偶数')
  if (!Number.isFinite(height) || height <= 0 || height % 2 !== 0) throw new Error('height 必须是正偶数')
  if (!Number.isFinite(fps) || fps < 1 || fps > 120) throw new Error('fps 必须在 1–120')
  if (!Number.isFinite(duration) || duration <= 0 || duration > 300) throw new Error('duration 必须在 0–300 秒')
  return { width, height, fps, duration }
}

function chromiumChannel() {
  try {
    const d = JSON.parse(fs.readFileSync(layout().deps, 'utf8'))
    return (d.chromium && d.chromium.channel) || null
  } catch {
    return null
  }
}

/**
 * 渲染一个 HTML。返回 { ok, output, meta, log }；失败不抛，交给调用方展示。
 */
export function render(html, opts = {}) {
  const l = ensureDirs()
  const dims = validateArgs(opts)
  const renderer = opts.renderer || path.join(l.bin, 'render_video.py')
  if (!fs.existsSync(renderer)) return { ok: false, error: `找不到渲染器：${pretty(renderer)}（先跑 codeanim_setup）` }
  if (!fs.existsSync(html)) return { ok: false, error: `找不到 HTML：${html}` }
  const python = l.envPython
  if (!fs.existsSync(python)) return { ok: false, error: 'venv 未就绪（先跑 codeanim_setup）' }
  const ffmpegOk = fs.existsSync(l.ffmpeg)
  if (!ffmpegOk) return { ok: false, error: 'FFmpeg 未就绪（先跑 codeanim_setup）' }

  const output = opts.output ? path.resolve(opts.output) : uniqueOutput(opts.name, l.output)
  if (fs.existsSync(output)) return { ok: false, error: `输出已存在，拒绝覆盖：${output}` }
  fs.mkdirSync(path.dirname(output), { recursive: true })

  const args = [renderer, path.resolve(html), '--output', output, '--duration', String(dims.duration), '--fps', String(dims.fps), '--width', String(dims.width), '--height', String(dims.height)]
  if (opts.audio && fs.existsSync(opts.audio)) args.push('--audio', path.resolve(opts.audio))

  const frames = Math.ceil(dims.duration * dims.fps)
  const env = {
    ...process.env,
    PATH: `${l.ffmpegDir}${path.delimiter}${process.env.PATH || ''}`,
  }
  if (opts.channel) env.CODEANIM_BROWSER_CHANNEL = opts.channel
  else {
    const ch = chromiumChannel()
    if (ch) env.CODEANIM_BROWSER_CHANNEL = ch
  }
  const started = Date.now()
  logAppend('render', `start ${html} -> ${output} (${dims.width}x${dims.height}@${dims.fps}, ${dims.duration}s / ${frames} frames)`)
  const spawnOnce = (channelOverride) => {
    const e = { ...env }
    if (channelOverride) e.CODEANIM_BROWSER_CHANNEL = channelOverride
    return spawnSync(python, args, {
      encoding: 'utf8',
      windowsHide: true,
      timeout: opts.timeout || Math.max(300_000, frames * 250 + 180_000),
      maxBuffer: 32 * 1024 * 1024,
      env: e,
    })
  }
  let r = spawnOnce(null)
  const launchFailed = !r.ok || r.error || !fs.existsSync(output)
  if (launchFailed && !env.CODEANIM_BROWSER_CHANNEL) {
    // 自带 Chromium 启动失败时，退回本机 Edge（不需要下载浏览器）
    const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    if (fs.existsSync(edge)) {
      try {
        if (fs.existsSync(output)) fs.rmSync(output, { force: true })
      } catch {
        /* ignore */
      }
      logAppend('render', 'launch failed, retry with CODEANIM_BROWSER_CHANNEL=msedge')
      r = spawnOnce('msedge')
    }
  }
  const log = `${r.stdout || ''}\n${r.stderr || ''}`.trim()
  const ms = Date.now() - started
  const produced = (() => {
    try {
      const s = fs.statSync(output)
      return s.size > 4096
    } catch {
      return false
    }
  })()
  if (!produced) {
    logAppend('render', `FAIL ${ms}ms exit=${r.status} ${log.slice(-1500)} ${r.error ? String(r.error.message) : ''}`)
    return {
      ok: false,
      error: `渲染失败（${Math.round(ms / 1000)}s）：${(r.stderr || r.error || `退出码 ${r.status}`).toString().slice(-1200)}`,
      log: log.slice(-4000),
      output,
    }
  }
  const meta = probe(output)
  logAppend('render', `done ${ms}ms ${meta.width}x${meta.height} ${meta.duration}s ${meta.bytes} bytes -> ${output}`)
  return { ok: true, output, meta, log: log.slice(-4000), ms }
}

export function findHtml(dir) {
  const candidates = ['index.html', 'index.htm']
  for (const c of candidates) {
    const p = path.join(dir, c)
    if (fs.existsSync(p)) return p
  }
  try {
    const html = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.html'))
    if (!html.length) return null
    return path.join(dir, html.sort((a, b) => a.length - b.length)[0])
  } catch {
    return null
  }
}
