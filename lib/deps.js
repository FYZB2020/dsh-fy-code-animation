// 依赖装配：Python ≥3.10 → venv → playwright/imageio-ffmpeg → Chromium → ffmpeg.exe。
// 每一步都幂等，可单独重跑；任何一步失败都留下可读日志，不抛到调用方（除显式 wait 场景）。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { layout, ensureDirs, vendor, pluginDir } from './paths.js'
import { append as logAppend } from './log.js'

const PYPI = 'https://pypi.org/simple'
const PYPI_MIRROR = 'https://pypi.tuna.tsinghua.edu.cn/simple'
const PLAYWRIGHT_MIRROR = 'https://cdn.npmmirror.com/binaries/playwright'
const MIN_PY = [3, 10]

/** 同步跑一个命令，永不抛错。 */
export function run(cmd, args = [], opts = {}) {
  const started = Date.now()
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    encoding: 'utf8',
    windowsHide: true,
    timeout: opts.timeout || 120_000,
    maxBuffer: 16 * 1024 * 1024,
  })
  return {
    ok: !res.error && res.status === 0,
    code: res.status,
    stdout: String(res.stdout || '').trim(),
    stderr: String(res.stderr || '').trim(),
    signal: res.signal || null,
    error: res.error ? String(res.error.message || res.error) : null,
    ms: Date.now() - started,
  }
}

export function which(cmd) {
  const r = run(process.platform === 'win32' ? 'where' : 'which', [cmd], { timeout: 10_000 })
  if (!r.ok) return null
  return r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || null
}

function pyVersion(python) {
  const r = run(python, ['-c', 'import sys;print("%d.%d.%d"%sys.version_info[:3])'], { timeout: 20_000 })
  if (!r.ok) return null
  const m = r.stdout.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  return { major: +m[1], minor: +m[2], patch: +m[3], text: `${m[1]}.${m[2]}.${m[3]}` }
}

function okVersion(v) {
  return v && (v.major > MIN_PY[0] || (v.major === MIN_PY[0] && v.minor >= MIN_PY[1]))
}

/** 候选解释器：环境变量 → 离线内置 → py 启动器 → python3/python → 常见 conda 路径。 */
export function pythonCandidates() {
  const l = layout()
  const out = []
  if (process.env.CODEANIM_PYTHON) out.push({ label: 'CODEANIM_PYTHON', cmd: process.env.CODEANIM_PYTHON, pre: [] })
  const embedded = process.platform === 'win32' ? path.join(l.tools, 'python', 'python.exe') : path.join(l.tools, 'python', 'bin', 'python3')
  out.push({ label: '离线内置', cmd: embedded, pre: [] })
  if (process.platform === 'win32') {
    out.push({ label: 'py -3.12', cmd: 'py', pre: ['-3.12'] })
    out.push({ label: 'py -3.11', cmd: 'py', pre: ['-3.11'] })
    out.push({ label: 'py -3.10', cmd: 'py', pre: ['-3.10'] })
  }
  out.push({ label: 'python3', cmd: 'python3', pre: [] })
  out.push({ label: 'python', cmd: 'python', pre: [] })
  const home = process.env.USERPROFILE || os.homedir()
  for (const p of [
    'D:\\anaconda3\\python.exe',
    path.join(home, 'anaconda3', 'python.exe'),
    path.join(home, 'miniconda3', 'python.exe'),
    'C:\\Python312\\python.exe',
    'C:\\Python311\\python.exe',
    'C:\\Python310\\python.exe',
  ]) {
    out.push({ label: p, cmd: p, pre: [] })
  }
  return out
}

export function detectPython() {
  const tried = []
  for (const c of pythonCandidates()) {
    const v = pyVersion(c.cmd === 'py' ? 'py' : c.cmd)
    // py 启动器要带版本旗标才能取到目标版本
    let ver = v
    if (c.cmd === 'py' && c.pre.length) {
      const r = run('py', [...c.pre, '-c', 'import sys;print("%d.%d.%d"%sys.version_info[:3])'], { timeout: 20_000 })
      const m = r.ok ? r.stdout.match(/(\d+)\.(\d+)\.(\d+)/) : null
      ver = m ? { major: +m[1], minor: +m[2], patch: +m[3], text: `${m[1]}.${m[2]}.${m[3]}` } : null
    }
    tried.push({ label: c.label, found: Boolean(ver), version: ver ? ver.text : null })
    if (okVersion(ver)) {
      return { ok: true, python: c.cmd, pre: c.pre, version: ver.text, label: c.label, tried }
    }
  }
  return { ok: false, tried, error: '找不到 Python 3.10+。装一个 3.10+ 的 Python，或设置 CODEANIM_PYTHON 指向它。' }
}

export function venvPython() {
  return layout().envPython
}

export function venvReady() {
  const p = venvPython()
  if (!fs.existsSync(p)) return false
  return okVersion(pyVersion(p))
}

function venvHasPip() {
  if (!venvReady()) return false
  const r = run(venvPython(), ['-m', 'pip', '--version'], { timeout: 120_000 })
  return r.ok
}

export function ensureVenv(py) {
  const l = ensureDirs()
  if (venvReady() && venvHasPip()) {
    const v = pyVersion(venvPython())
    return { ok: true, reused: true, path: venvPython(), version: v ? v.text : null }
  }
  if (fs.existsSync(l.env)) {
    logAppend('setup', 'venv 缺 pip 或已损坏，重建中')
    try {
      fs.rmSync(l.env, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
    } catch (e) {
      logAppend('setup', `旧 venv 删除失败：${e.message}`)
    }
  }
  let r = run(py.python, [...py.pre, '-m', 'venv', l.env], { timeout: 300_000 })
  logAppend('setup', `venv create -> ${r.ok ? 'ok' : 'FAIL'} (${r.ms}ms) ${r.stderr.slice(0, 400)}`)
  if (!r.ok) return { ok: false, error: `创建 venv 失败：${r.stderr || r.error || 'see log'}` }
  if (!venvHasPip()) {
    // 少数发行版的 venv 没带 ensurepip，补一次
    run(venvPython(), ['-m', 'ensurepip', '--upgrade'], { timeout: 300_000 })
  }
  if (!venvHasPip()) return { ok: false, error: 'venv 建好了但缺少 pip（可试 CODEANIM_PYTHON 指向官方 Python 3.10+）' }
  const v = pyVersion(venvPython())
  return { ok: okVersion(v), path: venvPython(), version: v ? v.text : null, error: okVersion(v) ? null : 'venv 里的 Python 版本低于 3.10' }
}

function pipInstallOnce(index) {
  const args = ['-m', 'pip', 'install', '--disable-pip-version-check', '--default-timeout=60', 'playwright', 'imageio-ffmpeg']
  if (index) args.push('-i', index)
  const r = run(venvPython(), args, { timeout: 900_000 })
  logAppend('setup', `pip install [${index || 'default'}] -> ${r.ok ? 'ok' : 'FAIL'} (${r.ms}ms) ${(r.stderr || '').slice(-600)}`)
  return r
}

export function ensurePipPackages() {
  if (!venvReady()) return { ok: false, error: 'venv 尚未就绪' }
  const check = run(venvPython(), ['-c', 'import playwright, imageio_ffmpeg; print("ok")'], { timeout: 60_000 })
  if (check.ok) return { ok: true, reused: true }
  const wheels = path.join(layout().offline, 'wheels')
  if (fs.existsSync(wheels)) {
    const off = run(venvPython(), ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-index', '--find-links', wheels, 'playwright', 'imageio-ffmpeg'], { timeout: 900_000 })
    logAppend('setup', `pip install [offline ${wheels}] -> ${off.ok ? 'ok' : 'FAIL'} ${(off.stderr || '').slice(-400)}`)
    if (off.ok) {
      const v = run(venvPython(), ['-c', 'import playwright, imageio_ffmpeg; print("ok")'], { timeout: 60_000 })
      if (v.ok) return { ok: true, offline: true }
    }
  }
  let r = pipInstallOnce(null)
  if (!r.ok) r = pipInstallOnce(PYPI_MIRROR)
  if (!r.ok) return { ok: false, error: `pip 安装失败：${(r.stderr || r.error || '').slice(-800)}` }
  const verify = run(venvPython(), ['-c', 'import playwright, imageio_ffmpeg; print("ok")'], { timeout: 60_000 })
  return verify.ok ? { ok: true } : { ok: false, error: '安装后仍无法 import playwright/imageio_ffmpeg' }
}

export function playwrightVersion() {
  if (!venvReady()) return null
  const r = run(venvPython(), ['-c', 'import importlib.metadata as m;print(m.version("playwright"))'], { timeout: 30_000 })
  return r.ok ? r.stdout.split(/\r?\n/).pop() : null
}

function chromiumCacheDirs() {
  const bases = []
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) bases.push(process.env.PLAYWRIGHT_BROWSERS_PATH)
  try {
    const off = path.join(layout().offline, 'browsers')
    if (fs.existsSync(off)) bases.push(off)
  } catch {
    /* ignore */
  }
  const local = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || os.homedir(), 'AppData', 'Local')
  bases.push(path.join(local, 'ms-playwright'))
  return bases
}

export function chromiumInstalled() {
  const layouts = ['chrome-win64', 'chrome-win', 'chrome-win32']
  for (const base of chromiumCacheDirs()) {
    try {
      if (!fs.existsSync(base)) continue
      for (const name of fs.readdirSync(base)) {
        if (!name.startsWith('chromium')) continue
        for (const sub of layouts) {
          const exe = path.join(base, name, sub, 'chrome.exe')
          if (fs.existsSync(exe)) return exe
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null
}

export function ensureChromium() {
  const existing = chromiumInstalled()
  if (existing) return { ok: true, reused: true, exe: existing }
  const baseEnv = { PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT: '120000' }
  let r = run(venvPython(), ['-m', 'playwright', 'install', 'chromium'], { timeout: 900_000, env: baseEnv })
  logAppend('setup', `playwright install chromium -> ${r.ok ? 'ok' : 'FAIL'} (${r.ms}ms) ${(r.stderr || '').slice(-600)}`)
  if (!r.ok) {
    r = run(venvPython(), ['-m', 'playwright', 'install', 'chromium'], {
      timeout: 900_000,
      env: { ...baseEnv, PLAYWRIGHT_DOWNLOAD_HOST: PLAYWRIGHT_MIRROR },
    })
    logAppend('setup', `playwright install chromium (npmmirror) -> ${r.ok ? 'ok' : 'FAIL'} ${(r.stderr || '').slice(-600)}`)
  }
  const exe = chromiumInstalled()
  if (exe) return { ok: true, exe }
  // 最后一条路：用本机 Edge 的 channel 渲染（由 bin/render_video.py 读取 CODEANIM_BROWSER_CHANNEL）
  const edge = process.platform === 'win32' ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' : null
  if (edge && fs.existsSync(edge)) {
    logAppend('setup', 'chromium 下载失败，改用本机 Edge channel=msedge')
    return { ok: true, channel: 'msedge', exe: edge, degraded: true }
  }
  return { ok: false, error: `Chromium 安装失败：${(r.stderr || r.error || '').slice(-800)}` }
}

export function ensureFfmpeg() {
  const l = ensureDirs()
  if (fs.existsSync(l.ffmpeg)) {
    const r = run(l.ffmpeg, ['-version'], { timeout: 20_000 })
    if (r.ok) {
      const m = r.stdout.split(/\r?\n/)[0]
      return { ok: true, reused: true, path: l.ffmpeg, version: m }
    }
  }
  // 系统 PATH 里已有也能用，但我们仍优先自带一份，保证搬到别的机器行为一致
  const sys = which('ffmpeg')
  if (sys) {
    try {
      fs.copyFileSync(sys, l.ffmpeg)
      const r = run(l.ffmpeg, ['-version'], { timeout: 20_000 })
      if (r.ok) return { ok: true, path: l.ffmpeg, source: sys, version: r.stdout.split(/\r?\n/)[0] }
    } catch {
      /* fallthrough */
    }
  }
  if (!venvReady()) return { ok: false, error: 'venv 尚未就绪，无法取 imageio-ffmpeg' }
  const r = run(venvPython(), ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], { timeout: 120_000 })
  if (!r.ok) return { ok: false, error: `imageio_ffmpeg 取 ffmpeg 失败：${(r.stderr || '').slice(-400)}` }
  const src = r.stdout.split(/\r?\n/).filter(Boolean).pop()
  try {
    fs.mkdirSync(l.ffmpegDir, { recursive: true })
    fs.copyFileSync(src, l.ffmpeg)
    const v = run(l.ffmpeg, ['-version'], { timeout: 30_000 })
    logAppend('setup', `ffmpeg copied from ${src} -> ${v.ok ? 'ok' : 'FAIL'}`)
    return v.ok ? { ok: true, path: l.ffmpeg, source: src, version: v.stdout.split(/\r?\n/)[0] } : { ok: false, error: '复制后的 ffmpeg 无法运行' }
  } catch (e) {
    return { ok: false, error: `复制 ffmpeg 失败：${e.message}` }
  }
}

/**
 * 复制官方 render_video.py 到运行时 bin/，并让 launch 支持 CODEANIM_BROWSER_CHANNEL。
 * 不改随包文件：插件升级时随包文件会被替换，运行时副本才是可外科手术的那份。
 */
export function prepareRenderer() {
  const l = ensureDirs()
  const src = vendor().capsRenderer
  const dst = path.join(l.bin, 'render_video.py')
  try {
    let code = fs.readFileSync(src, 'utf8')
    if (!code.includes('__codeanim_launch_kwargs')) {
      const helper = [
        'def __codeanim_launch_kwargs():',
        '    import os',
        '    ch = os.environ.get("CODEANIM_BROWSER_CHANNEL", "").strip()',
        '    return {"channel": ch} if ch else {}',
        '',
        '',
      ].join('\n')
      code = helper + code
      // p.chromium.launch() / .launch(headless=True) 两种都兼容，且只替换一次
      code = code.replace(/\.chromium\.launch\(([^)]*)\)/g, (m, inner) => {
        const trimmed = String(inner || '').trim()
        return trimmed
          ? `.chromium.launch(**__codeanim_launch_kwargs(), ${trimmed})`
          : '.chromium.launch(**__codeanim_launch_kwargs())'
      })
    }
    fs.writeFileSync(dst, code, 'utf8')
    return { ok: true, path: dst }
  } catch (e) {
    return { ok: false, error: `准备 render_video.py 失败：${e.message}` }
  }
}

export function readDeps() {
  try {
    return JSON.parse(fs.readFileSync(layout().deps, 'utf8'))
  } catch {
    return null
  }
}

export function status() {
  const l = layout()
  const py = detectPython()
  const vReady = venvReady()
  const pw = vReady ? playwrightVersion() : null
  const ch = chromiumInstalled()
  const deps = readDeps() || {}
  const channel = deps.chromium && deps.chromium.channel ? deps.chromium.channel : ch ? null : deps.chromium && deps.chromium.channel
  const ff = fs.existsSync(l.ffmpeg) ? run(l.ffmpeg, ['-version'], { timeout: 20_000 }) : null
  const steps = {
    python: { ok: Boolean(py.ok), detail: py.ok ? `${py.version} (${py.label})` : '未找到 3.10+' },
    venv: { ok: vReady, detail: vReady ? l.env : '未创建' },
    playwright: { ok: Boolean(pw), detail: pw || '未安装' },
    chromium: { ok: Boolean(ch) || channel === 'msedge', detail: ch || (channel === 'msedge' ? '本机 Edge（降级）' : '未安装') },
    ffmpeg: { ok: Boolean(ff && ff.ok), detail: ff && ff.ok ? ff.stdout.split(/\r?\n/)[0] : '未就绪' },
  }
  const ready = Object.values(steps).every((s) => s.ok)
  return { ready, steps, python: py, root: l.root, depsUpdatedAt: deps.updatedAt || null }
}

export const ALL_STEPS = ['python', 'venv', 'pip', 'chromium', 'ffmpeg', 'verify']

/** 顺序执行装配；返回每步结果。调用方可据此渲染进度。 */
export function setup(opts = {}) {
  ensureDirs()
  const wanted = Array.isArray(opts.steps) && opts.steps.length ? opts.steps : ALL_STEPS
  const results = {}
  const rec = (k, v) => {
    results[k] = v
    const brief = v && v.ok ? 'ok' : `FAIL ${v && v.error ? v.error.slice(0, 200) : ''}`
    logAppend('setup', `step ${k} -> ${brief}`)
    if (typeof opts.onStep === 'function') {
      try {
        opts.onStep(k, v)
      } catch {
        /* ignore */
      }
    }
  }

  let py = null
  if (wanted.includes('python') || wanted.includes('venv') || wanted.includes('pip') || wanted.includes('chromium') || wanted.includes('ffmpeg')) {
    py = detectPython()
    rec('python', py)
  }
  if (py && py.ok && wanted.includes('venv')) rec('venv', ensureVenv(py))
  if (py && py.ok && wanted.includes('pip')) rec('pip', ensurePipPackages())
  if (py && py.ok && wanted.includes('chromium')) rec('chromium', ensureChromium())
  if (py && py.ok && wanted.includes('ffmpeg')) rec('ffmpeg', ensureFfmpeg())
  if (wanted.includes('verify') && venvReady()) {
    prepareRenderer()
    const st = status()
    rec('verify', { ok: st.ready, detail: st.steps })
  }

  const l = layout()
  const prev = readDeps() || {}
  const st = status()
  const now = new Date().toISOString()
  const pw = playwrightVersion()
  const doc = {
    updatedAt: now,
    root: l.root,
    python: st.python && st.python.ok ? { path: st.python.python, version: st.python.version, label: st.python.label } : prev.python || null,
    venv: venvReady() ? { path: l.env } : prev.venv || null,
    playwright: pw ? { version: pw } : prev.playwright || null,
    chromium: chromiumInstalled() ? { path: chromiumInstalled() } : results.chromium && results.chromium.channel ? { channel: results.chromium.channel } : prev.chromium || null,
    ffmpeg: fs.existsSync(l.ffmpeg) ? { path: l.ffmpeg } : prev.ffmpeg || null,
    ready: st.ready,
    steps: st.steps,
  }
  try {
    fs.writeFileSync(l.deps, JSON.stringify(doc, null, 2), 'utf8')
  } catch {
    /* ignore */
  }
  return { ok: st.ready, results, status: st, deps: doc }
}

export function acquireLock() {
  const l = ensureDirs()
  try {
    const raw = fs.readFileSync(l.setupLock, 'utf8')
    const prev = JSON.parse(raw)
    if (prev && prev.pid) {
      try {
        process.kill(prev.pid, 0)
        return { ok: false, holder: prev }
      } catch {
        /* 进程已消失：接管 */
      }
    }
  } catch {
    /* 无锁 */
  }
  fs.writeFileSync(l.setupLock, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), plugin: pluginDir }), 'utf8')
  return { ok: true }
}

export function releaseLock() {
  try {
    fs.unlinkSync(layout().setupLock)
  } catch {
    /* ignore */
  }
}

/** 把渲染需要的东西拼成可读清单，供 status 工具直接展示。 */
export function summaryText(st) {
  const rows = [
    ['Python 3.10+', st.steps.python],
    ['独立 venv', st.steps.venv],
    ['playwright', st.steps.playwright],
    ['Chromium', st.steps.chromium],
    ['FFmpeg', st.steps.ffmpeg],
  ]
  return rows.map(([k, v]) => `${v.ok ? '✅' : '❌'} ${k}: ${v.detail}`).join('\n')
}
