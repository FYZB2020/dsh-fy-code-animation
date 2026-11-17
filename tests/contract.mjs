/**
 * 兼容性冒烟：用 mock ctx 直接加载插件入口，验证 6 个工具、2 个技能、3 条路由都能注册。
 * 不启动 DSH，不装依赖，纯 node 跑。用法：node tests/contract.mjs
 */
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

const seen = { tools: [], skills: [], routes: [], effects: [] }
let failed = 0

function check(name, ok, extra) {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failed += 1
    console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`)
  }
}

const disposers = []
const ctx = {
  effect(fn, name) {
    seen.effects.push(name || 'anonymous')
    const d = fn()
    if (typeof d === 'function') disposers.push(d)
    return d
  },
  inject(deps, cb) {
    // 模拟宿主：webServer 存在时立刻回调
    if (deps.includes('webServer')) cb(webServerScope)
    return () => {}
  },
  tools: {
    register(t) {
      if (!t || !t.name) throw new Error('tool without name')
      seen.tools.push(t.name)
    },
  },
  skills: {
    register(p) {
      if (!p || !p.name) throw new Error('skill without name')
      seen.skills.push(p.name)
    },
  },
}

const webServerScope = {
  effect(fn) {
    const d = fn()
    if (typeof d === 'function') disposers.push(d)
    return d
  },
  webServer: {
    register(route) {
      if (!route || !route.path || !route.handler) throw new Error('bad route')
      seen.routes.push(`${route.kind} ${route.path}`)
      return () => {}
    },
  },
}

console.log('加载 lib/index.js …')
const mod = await import(pathToFileURL(path.join(root, 'lib/index.js')).href)

check('默认导出 name = code-animation', mod.name === 'code-animation', `实际 ${mod.name}`)
check('inject 含 tools', Array.isArray(mod.inject) && mod.inject.includes('tools'))

if (typeof mod.apply !== 'function') {
  console.log('  FAIL apply 不是函数 —— 宿主会拒绝加载')
  process.exit(1)
}

await mod.apply(ctx)

const wantTools = [
  'codeanim_status',
  'codeanim_switch',
  'codeanim_setup',
  'codeanim_style',
  'codeanim_new',
  'codeanim_render',
]
for (const t of wantTools) check(`注册工具 ${t}`, seen.tools.includes(t))
check('工具数量 = 6', seen.tools.length === 6, `实际 ${seen.tools.length}`)
check('注册技能 fy-code-animation', seen.skills.includes('fy-code-animation'))
check('注册技能 code-animation-prompts', seen.skills.includes('code-animation-prompts'))
check('注册 4 条路由', seen.routes.length === 4, seen.routes.join(' | '))
check('路由含 /code-animation/state', seen.routes.some((r) => r.includes('/code-animation/state')))

console.log('\n摘要：')
console.log('  tools :', seen.tools.join(', '))
console.log('  skills:', seen.skills.join(', '))
console.log('  routes:', seen.routes.join(' | '))

for (const d of disposers) {
  try {
    d()
  } catch {}
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
