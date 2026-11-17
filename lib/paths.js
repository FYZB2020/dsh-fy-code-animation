// 所有路径都在这里集中解析：插件随包资源（只读）与运行时目录（可写）分开。
// 运行时目录默认 %USERPROFILE%\.dsh\code-animation，可用 CODEANIM_HOME 覆盖，
// 这样测试、便携包和别的工作站都能落到不同位置。
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/** 插件包根目录（随包资源所在处）。 */
export const pluginDir = path.resolve(here, '..')

export function homeDir() {
  return process.env.USERPROFILE || process.env.HOME || os.homedir()
}

export function dshHome() {
  return process.env.DSH_HOME || path.join(homeDir(), '.dsh')
}

export function rootDir() {
  return process.env.CODEANIM_HOME || path.join(dshHome(), 'code-animation')
}

/** 运行时目录布局。每次调用都重新计算，方便测试里改 CODEANIM_HOME。 */
export function layout() {
  const root = rootDir()
  return {
    root,
    env: path.join(root, 'env'),
    envPython: process.platform === 'win32' ? path.join(root, 'env', 'Scripts', 'python.exe') : path.join(root, 'env', 'bin', 'python'),
    tools: path.join(root, 'tools'),
    ffmpegDir: path.join(root, 'tools', 'ffmpeg', 'bin'),
    ffmpeg: path.join(root, 'tools', 'ffmpeg', 'bin', 'ffmpeg.exe'),
    offline: path.join(root, 'offline'),
    skills: path.join(root, 'skills'),
    styleLibrary: path.join(root, 'style-library'),
    projects: path.join(root, 'projects'),
    output: path.join(root, 'output'),
    logs: path.join(root, 'logs'),
    bin: path.join(root, 'bin'),
    cache: path.join(root, 'cache'),
    state: path.join(root, 'state.json'),
    deps: path.join(root, 'deps.json'),
    sync: path.join(root, '_sync.json'),
    setupLog: path.join(root, 'logs', 'setup.log'),
    setupLock: path.join(root, 'logs', 'setup.lock'),
  }
}

/** 随包资源。 */
export function vendor() {
  return {
    skills: path.join(pluginDir, 'skills'),
    fy: path.join(pluginDir, 'skills', 'fy-code-animation'),
    caps: path.join(pluginDir, 'skills', 'code-animation-prompts'),
    styleLibrary: path.join(pluginDir, 'style-library'),
    templates: path.join(pluginDir, 'templates'),
    manifest: path.join(pluginDir, 'style-library', '_manifest.json'),
    capsCatalog: path.join(pluginDir, 'skills', 'code-animation-prompts', 'references', 'catalog.json'),
    capsRenderer: path.join(pluginDir, 'skills', 'code-animation-prompts', 'scripts', 'render_video.py'),
    fyDoctor: path.join(pluginDir, 'skills', 'fy-code-animation', 'scripts', 'doctor.py'),
    fyStyleLib: path.join(pluginDir, 'skills', 'fy-code-animation', 'scripts', 'style_library.py'),
    fyValidate: path.join(pluginDir, 'skills', 'fy-code-animation', 'scripts', 'validate_task.py'),
  }
}

export function ensureDirs() {
  const l = layout()
  for (const dir of [l.root, l.tools, l.ffmpegDir, l.skills, l.styleLibrary, l.projects, l.output, l.logs, l.bin, l.cache]) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return l
}

/** 相对路径转成便于展示的 ~ 形式。 */
export function pretty(p) {
  const home = homeDir()
  const s = String(p || '')
  return s.startsWith(home) ? '~' + s.slice(home.length) : s
}
