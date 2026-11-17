// 安装后由 postinstall 分离启动：把依赖装完，输出同时进 logs/setup.log。
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const plugin = path.resolve(here, '..')

const { setup } = await import(new URL('../lib/deps.js', import.meta.url))
const { layout, pretty } = await import(new URL('../lib/paths.js', import.meta.url))
const { append } = await import(new URL('../lib/log.js', import.meta.url))

const l = layout()
console.log(`[code-animation] setup start ${new Date().toISOString()}`)
console.log(`[code-animation] root=${pretty(l.root)}`)
append('setup', '=== background setup start ===')

const res = setup({
  onStep: (key, v) => {
    const line = v && v.ok ? `ok ${key}` : `FAIL ${key}: ${(v && v.error) || ''}`
    console.log(`[code-animation] ${line}`)
    append('setup', line)
  },
})

const ready = Boolean(res.ok || (res.status && res.status.ready))
console.log(`[code-animation] setup done ready=${ready}`)
append('setup', `=== background setup done ready=${ready} ===`)
process.exitCode = ready ? 0 : 1
