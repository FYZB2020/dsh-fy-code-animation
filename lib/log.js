// 日志：统一写 ~/.dsh/code-animation/logs/<name>.log，供 codeanim_status / UI 面板读取。
import fs from 'node:fs'
import path from 'node:path'
import { layout, ensureDirs } from './paths.js'

const MAX_BYTES = 4 * 1024 * 1024

export function logPath(name = 'setup') {
  const l = layout()
  return name === 'setup' ? l.setupLog : path.join(l.logs, `${name}.log`)
}

export function append(name, line) {
  try {
    ensureDirs()
    const file = logPath(name)
    try {
      const st = fs.statSync(file)
      if (st.size > MAX_BYTES) fs.writeFileSync(file, '', 'utf8')
    } catch {
      /* 文件不存在：直接追加即可 */
    }
    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
    fs.appendFileSync(file, `[${stamp}] ${line}\n`, 'utf8')
  } catch {
    /* 日志失败不能影响主流程 */
  }
}

export function tail(name = 'setup', lines = 120) {
  try {
    const raw = fs.readFileSync(logPath(name), 'utf8')
    const arr = raw.split(/\r?\n/).filter(Boolean)
    return arr.slice(-Math.max(1, Math.min(2000, lines))).join('\n')
  } catch {
    return ''
  }
}
