// 插件状态（唯一真相源）：state.json 里的 enabled 开关决定 new/setup/render 是否放行。
// 读写都走原子替换，避免半截 JSON 把插件搞挂；坏文件一律回落默认值，不抛异常。
import fs from 'node:fs'
import path from 'node:path'
import { layout, ensureDirs, rootDir } from './paths.js'

export const DEFAULT_STATE = Object.freeze({
  version: 1,
  enabled: false,
  defaults: { width: 1920, height: 1080, fps: 30, duration: 12 },
  lastProject: null,
  lastOutput: null,
  notes: [],
  updatedAt: null,
})

function merge(base, patch) {
  const out = { ...base }
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = { ...base[k], ...v }
    } else if (v !== undefined) {
      out[k] = v
    }
  }
  return out
}

export function readState() {
  const file = layout().state
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_STATE }
    return merge(DEFAULT_STATE, parsed)
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export function writeState(patch) {
  ensureDirs()
  const l = layout()
  const next = merge(readState(), { ...patch, updatedAt: new Date().toISOString() })
  const tmp = l.state + '.tmp-' + process.pid
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8')
  fs.renameSync(tmp, l.state)
  return next
}

export function isEnabled() {
  return readState().enabled === true
}

/** 开关；返回写入后的状态。 */
export function setEnabled(on, reason) {
  const next = writeState({ enabled: Boolean(on) })
  if (reason) appendNote(reason)
  return next
}

export function appendNote(text) {
  const st = readState()
  const notes = Array.isArray(st.notes) ? st.notes.slice(-50) : []
  notes.push({ at: new Date().toISOString(), text: String(text).slice(0, 500) })
  return writeState({ notes })
}

/** 开关关着时给出统一、可执行的中文拒绝文案。 */
export function disabledMessage(action) {
  return [
    `动画模式是关着的，${action}没有执行。`,
    '请在 DSH 右下角「动画」面板打开开关，或让我调用 codeanim_switch({ action: "on" })。',
    `状态文件：${path.join(rootDir(), 'state.json')}`,
  ].join('\n')
}
