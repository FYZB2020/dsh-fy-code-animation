// 把插件随包的技能与画风库同步到运行时目录，让 fy 的脚本能在可写位置落 index。
// 幂等：签名没变就跳过；签名变了整目录覆盖（随包资源永远优先）。
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { layout, ensureDirs, vendor, pluginDir } from './paths.js'
import { append as logAppend } from './log.js'

const SYNC_VERSION = 3

function pluginVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(pluginDir, 'package.json'), 'utf8')).version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function signature() {
  const v = vendor()
  const st = (p) => {
    try {
      const s = fs.statSync(p)
      return `${s.size}:${Math.round(s.mtimeMs)}`
    } catch {
      return '0'
    }
  }
  return [SYNC_VERSION, pluginVersion(), st(v.styleLibrary), st(v.fy), st(v.caps)].join('|')
}

function readSync() {
  try {
    return JSON.parse(fs.readFileSync(layout().sync, 'utf8'))
  } catch {
    return null
  }
}

export function styleCount(dir = layout().styleLibrary) {
  // 注意：风格 md 在系列子目录里，必须递归数
  const root = path.join(dir, '风格提示词')
  let n = 0
  const walk = (d) => {
    let ents = []
    try {
      ents = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of ents) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.md')) n += 1
    }
  }
  walk(root)
  return n
}

/** 同步一次；返回 { synced, reason, styleCount }。*/
export function syncWorkspace(force = false) {
  const l = ensureDirs()
  const sig = signature()
  const prev = readSync()
  if (!force && prev && prev.signature === sig && fs.existsSync(path.join(l.styleLibrary, '风格提示词'))) {
    return { synced: false, reason: 'up-to-date', styleCount: prev.styleCount || styleCount() }
  }
  const v = vendor()
  try {
    fs.mkdirSync(l.skills, { recursive: true })
    fs.mkdirSync(l.styleLibrary, { recursive: true })
    for (const [src, dst] of [
      [v.fy, path.join(l.skills, 'fy-code-animation')],
      [v.caps, path.join(l.skills, 'code-animation-prompts')],
    ]) {
      if (!fs.existsSync(src)) throw new Error(`随包缺少 ${src}`)
      fs.rmSync(dst, { recursive: true, force: true })
      fs.cpSync(src, dst, { recursive: true, force: true })
    }
    // 画风库：整体覆盖，保留库根的挑选器与统计
    fs.rmSync(l.styleLibrary, { recursive: true, force: true })
    fs.cpSync(v.styleLibrary, l.styleLibrary, { recursive: true, force: true })

    // 让 fy 不用问用户就能找到库
    const cfg = path.join(l.skills, 'fy-code-animation', 'adapters', 'style-library.config.json')
    fs.mkdirSync(path.dirname(cfg), { recursive: true })
    fs.writeFileSync(cfg, JSON.stringify({ root: l.styleLibrary }, null, 2), 'utf8')

    const doc = { signature: sig, syncedAt: new Date().toISOString(), version: pluginVersion(), styleCount: styleCount(), root: l.root }
    fs.writeFileSync(l.sync, JSON.stringify(doc, null, 2), 'utf8')
    logAppend('sync', `synced ${doc.styleCount} styles -> ${l.styleLibrary}`)
    return { synced: true, reason: 'copied', styleCount: doc.styleCount }
  } catch (e) {
    logAppend('sync', `FAIL ${e.message}`)
    return { synced: false, reason: 'error', error: e.message, styleCount: styleCount() }
  }
}

/** 让 fy 的 style-index.json 与运行时库对齐（需要 Python；失败不影响检索工具）。 */
export function rebuildStyleIndex(python, env = {}) {
  const l = layout()
  const script = path.join(l.skills, 'fy-code-animation', 'scripts', 'style_library.py')
  if (!python || !fs.existsSync(script)) return { ok: false, error: '缺少 style_library.py 或解释器' }
  const r = spawnSync(python, [script, 'build', '--root', l.styleLibrary], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 300_000,
    env: { ...process.env, ...env, FY_STYLE_LIBRARY_ROOT: l.styleLibrary },
  })
  const ok = !r.error && r.status === 0
  logAppend('sync', `style-index build -> ${ok ? 'ok' : 'FAIL'} ${String(r.stderr || '').slice(0, 300)}`)
  return { ok, stdout: String(r.stdout || '').trim(), stderr: String(r.stderr || '').trim() }
}
