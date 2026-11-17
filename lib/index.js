// 插件入口：注册两个技能、六个工具、一个设置面板和四条本地路由。
// 设计原则：宿主缺哪个能力就跳过哪个，绝不让插件因为一个可选依赖把 DSH 拖垮。
import fs from 'node:fs'
import path from 'node:path'
import { layout, ensureDirs, vendor, pluginDir, pretty } from './paths.js'
import { readState, setEnabled } from './state.js'
import { syncWorkspace } from './sync.js'
import { createTools, toolStatus } from './tools.js'
import * as deps from './deps.js'

export const name = 'code-animation'
export const inject = ['tools']

function readSkill(dir, fallbackName) {
  const file = path.join(dir, 'SKILL.md')
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    const body = fm ? raw.slice(fm[0].length).trim() : raw
    const nameLine = fm && fm[1].match(/^name:\s*(.+)$/m)
    const descLine = fm && fm[1].match(/^description:\s*(.+)$/m)
    return {
      name: (nameLine ? nameLine[1] : fallbackName).trim(),
      description: (descLine ? descLine[1] : '').trim(),
      content: body,
    }
  } catch {
    return null
  }
}

function runtimeNote() {
  const l = layout()
  return [
    '',
    '---',
    '',
    '## 运行时（dsh-fy-code-animation 插件提供）',
    '',
    `- 开关：用户说“开启动画模式/开始做动画”时调用 \`codeanim_switch({ action: "on" })\`；关闭状态会拦住建项目、装依赖、渲染。`,
    '- 先看 `codeanim_status`：它给出依赖是否就绪、画风库条数、最近项目。',
    `- 画风库只有一份，在 \`${pretty(l.styleLibrary)}\`（运行时）。**不要**按 \`assets/library/\` 相对路径找文件；检索一律用 \`codeanim_style\`。`,
    '- 本技能的可写副本在 `' + pretty(l.skills) + '\\fy-code-animation` 与 `' + pretty(l.skills) + '\\code-animation-prompts`；fy 的 `adapters/style-library.config.json` 已经指向运行时库。',
    '- 建项目用 `codeanim_new`（会生成过 fy 校验的 task.json + 可渲染 index.html），出片用 `codeanim_render`。',
    '- 官方渲染器的要求不变：HTML 必须暴露 `window.renderAt(t)`，任意 t 可重现，`?export=1` 时不自己播放。',
  ].join('\n')
}

function registerSkills(ctx) {
  const l = ensureDirs()
  const pairs = [
    ['fy-code-animation', path.join(l.skills, 'fy-code-animation'), path.join(vendor().fy, 'SKILL.md')],
    ['code-animation-prompts', path.join(l.skills, 'code-animation-prompts'), path.join(vendor().caps, 'SKILL.md')],
  ]
  const registered = []
  for (const [fallback, dir, fallbackFile] of pairs) {
    const sk = readSkill(fs.existsSync(path.join(dir, 'SKILL.md')) ? dir : path.dirname(fallbackFile), fallback)
    if (!sk) continue
    const payload = {
      name: sk.name || fallback,
      description: sk.description || '代码动画（HTML/Canvas 逐帧渲染成视频）',
      whenToUse: '用户要做代码动画/动态海报/文字动效视频，或提到画风库、Remotion、逐帧渲染时。',
      content: sk.content + runtimeNote(),
      resourceBase: { kind: 'directory', path: dir },
      source: 'bundled',
    }
    try {
      ctx.skills.register(payload)
      registered.push(payload.name)
    } catch (e) {
      console.error(`[code-animation] 注册技能 ${fallback} 失败：${e && e.message}`)
      // 兜底：落盘到 ~/.dsh/skills，目录扫描也能发现
      try {
        const alt = path.join(process.env.DSH_HOME || path.join(process.env.USERPROFILE || '.', '.dsh'), 'skills', payload.name)
        fs.mkdirSync(alt, { recursive: true })
        fs.writeFileSync(path.join(alt, 'SKILL.md'), `---\nname: ${payload.name}\ndescription: ${payload.description}\n---\n\n${payload.content}`, 'utf8')
      } catch (e2) {
        console.error(`[code-animation] 技能落盘兜底也失败：${e2 && e2.message}`)
      }
    }
  }
  return registered
}

function registerTools(ctx) {
  const tools = createTools()
  ctx.effect(() => {
    for (const t of tools) {
      try {
        ctx.tools.register(t)
      } catch (e) {
        console.error(`[code-animation] 注册工具 ${t.name} 失败：${e && e.message}`)
      }
    }
    return () => {}
  }, 'code-animation.tools')
  return tools.map((t) => t.name)
}

function isLoopback(req) {
  const host = String(req.headers.host || '')
  const okHost = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)
  const origin = req.headers.origin
  if (!origin) return okHost
  try {
    const u = new URL(origin)
    return okHost && ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(u.hostname)
  } catch {
    return false
  }
}

function json(res, code, body) {
  const text = JSON.stringify(body)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(text)
}

function registerRoutes(ctx) {
  // deps.status() 会起几个 python 进程，面板每 4 秒轮询一次不能每次都真跑，
  // 这里缓存 15 秒；切换开关时主动失效，保证"刚装完就能看到就绪"。
  let statusAt = 0
  let statusDet = null
  function quickStatus() {
    const now = Date.now()
    if (!statusDet || now - statusAt > 15000) {
      try {
        statusDet = deps.status()
      } catch {
        statusDet = { ready: false, steps: {} }
      }
      statusAt = now
    }
    return statusDet
  }
  ctx.inject(['webServer'], (scope) => {
    scope.effect(() => {
      const disposers = []
      const reg = (route) => {
        try {
          disposers.push(scope.webServer.register(route))
          console.log(`[code-animation] route ok: ${route.kind} ${route.path}`)
          try { fs.appendFileSync(path.join(layout().logs, 'plugin.log'), `${new Date().toISOString()} route ok ${route.kind} ${route.path}\n`) } catch {}
        } catch (e) {
          console.error(`[code-animation] route failed: ${route.kind} ${route.path} -> ${e && e.message}`)
          try {
            fs.appendFileSync(path.join(layout().logs, 'plugin.log'), `${new Date().toISOString()} route failed ${route.kind} ${route.path}: ${e && e.message}\n`)
          } catch {}
        }
      }
      reg({
          name: 'code-animation.state',
          kind: 'exact',
          path: '/code-animation/state',
          handler: (req, res) => {
            if (!isLoopback(req)) return json(res, 403, { error: 'loopback only' })
            const st = readState()
            const det = quickStatus()
            json(res, 200, {
              enabled: st.enabled,
              ready: det.ready,
              steps: det.steps,
              defaults: st.defaults,
              lastProject: st.lastProject,
              lastOutput: st.lastOutput,
              styleCount: safeStyleCount(),
              root: layout().root,
            })
          },
        })
      reg({
          name: 'code-animation.toggle',
          kind: 'exact',
          path: '/code-animation/toggle',
          handler: (req, res) => {
            if (!isLoopback(req)) return json(res, 403, { error: 'loopback only' })
            if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })
            let body = ''
            req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy() })
            req.on('end', () => {
              let enabled
              try {
                enabled = JSON.parse(body || '{}').enabled
              } catch {
                return json(res, 400, { error: 'bad json' })
              }
              const st = setEnabled(Boolean(enabled), 'toggled from panel')
              if (st.enabled) syncWorkspace(false)
              statusAt = 0
              json(res, 200, { enabled: st.enabled })
            })
          },
        })
      reg({
          name: 'code-animation.picker',
          kind: 'exact',
          path: '/code-animation/picker',
          handler: (req, res) => {
            if (!isLoopback(req)) return json(res, 403, { error: 'loopback only' })
            const file = path.join(layout().styleLibrary, '风格挑选.html')
            try {
              // 挑选器里的相对路径（风格提示词/...）在本路由下会解析到
              // /code-animation/风格提示词/...，所以统一改写到 /code-animation/library/ 前缀，
              // 由下面的 prefix 路由把静帧和 markdown 从运行时库读出来。
              const html = fs
                .readFileSync(file, 'utf8')
                .replace(/"img":\s*"风格提示词\//g, '"img":"/code-animation/library/风格提示词/')
                .replace(/"file":\s*"风格提示词\//g, '"file":"/code-animation/library/风格提示词/')
              res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
              res.end(html)
            } catch {
              json(res, 404, { error: 'picker missing，先 codeanim_setup' })
            }
          },
        })
      reg({
          name: 'code-animation.library',
          kind: 'prefix',
          path: '/code-animation/library',
          handler: (req, res) => {
            if (!isLoopback(req)) return json(res, 403, { error: 'loopback only' })
            if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'GET only' })
            const MIME = {
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.png': 'image/png',
              '.webp': 'image/webp',
              '.gif': 'image/gif',
              '.md': 'text/markdown; charset=utf-8',
              '.txt': 'text/plain; charset=utf-8',
              '.json': 'application/json; charset=utf-8',
            }
            let file = null
            try {
              const pathname = new URL(String(req.url), 'http://localhost').pathname
              const rel = decodeURIComponent(pathname.slice('/code-animation/library/'.length))
              const rootDir = path.resolve(layout().styleLibrary)
              const abs = path.resolve(rootDir, rel)
              if (abs !== rootDir && !abs.startsWith(rootDir + path.sep)) {
                return json(res, 403, { error: 'outside library' })
              }
              if (!fs.statSync(abs).isFile()) return json(res, 404, { error: 'not a file' })
              file = abs
            } catch {
              return json(res, 404, { error: 'not found' })
            }
            const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
            res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=3600' })
            if (req.method === 'HEAD') return res.end()
            fs.createReadStream(file).on('error', () => res.end()).pipe(res)
          },
        })
      return () => {
        for (const d of disposers) {
          try {
            if (typeof d === 'function') d()
          } catch {}
        }
      }
    }, 'code-animation.routes')
  })
}

function safeStyleCount() {
  try {
    const catalog = path.join(layout().skills, 'code-animation-prompts', 'references', 'catalog.json')
    const p = fs.existsSync(catalog) ? catalog : vendor().capsCatalog
    return JSON.parse(fs.readFileSync(p, 'utf8')).total || 0
  } catch {
    return 0
  }
}

export function apply(ctx, config) {
  // 启动阶段只做零成本的事。经验教训：apply 里同步拷 15 MB + 同步起 Python 探测，
  // 会把宿主 boot 拖住十几秒；任何异常都可能连带整个界面起不来。
  try {
    ensureDirs()
    if (fs.existsSync(path.join(layout().root, 'DISABLE'))) {
      console.log('[code-animation] 检测到 DISABLE 文件，跳过挂载（删掉它再重启即可恢复）')
      return
    }
    let skills = []
    let tools = []
    try {
      skills = registerSkills(ctx)
    } catch (e) {
      console.error(`[code-animation] 技能注册异常：${e && e.message}`)
    }
    try {
      tools = registerTools(ctx)
    } catch (e) {
      console.error(`[code-animation] 工具注册异常：${e && e.message}`)
    }
    try {
      registerRoutes(ctx)
    } catch (e) {
      console.error(`[code-animation] 路由注册异常：${e && e.message}`)
    }
    console.log(`[code-animation] ready | skills=${skills.join(',')} | tools=${tools.length} | plugin=${pretty(pluginDir)}`)
    // 重活推迟到 boot 之后；每个工具入口也会自己补一次同步（幂等）。
    const timer = setTimeout(() => {
      try {
        syncWorkspace(false)
      } catch (e) {
        console.error(`[code-animation] 后台同步失败：${e && e.message}`)
      }
    }, 1500)
    if (timer && typeof timer.unref === 'function') timer.unref()
  } catch (e) {
    console.error(`[code-animation] apply 异常（已隔离，不影响宿主）：${e && e.stack ? e.stack : e}`)
  }
}
