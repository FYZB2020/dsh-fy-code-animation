// 一键停用/启用本插件在某个 DSH profile 里的加载（用于「启用后打不开」的紧急回滚）。
//
// 用法（node 或 Electron 当 node 都行）：
//   node scripts/toggle-profile.mjs --profile desktop --off
//   node scripts/toggle-profile.mjs --profile desktop --on
//   node scripts/toggle-profile.mjs --status
//
// 只改 profile 的 package.json 里 dsh.profile.bundles 数组；
// 不删依赖、不碰 node_modules，随时可以再打开。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BUNDLE = 'dsh-fy-code-animation'

function args() {
  const out = { profile: 'desktop', mode: 'status' }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--profile' || a === '-p') out.profile = argv[++i] || out.profile
    else if (a === '--on' || a === 'enable') out.mode = 'on'
    else if (a === '--off' || a === 'disable') out.mode = 'off'
    else if (a === '--status') out.mode = 'status'
    else if (/^--profile=/.test(a)) out.profile = a.slice('--profile='.length)
  }
  return out
}

function profileDir(name) {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'profiles', name)
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson(file, value) {
  const tmp = file + '.tmp-' + process.pid
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, file)
}

const { profile, mode } = args()
const dir = profileDir(profile)
const file = path.join(dir, 'package.json')
if (!fs.existsSync(file)) {
  console.error(`找不到 profile：${dir}`)
  process.exit(2)
}

const pkg = readJson(file)
pkg.dsh = pkg.dsh || {}
pkg.dsh.profile = pkg.dsh.profile || {}
const bundles = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : []
const has = bundles.includes(BUNDLE)

if (mode === 'status') {
  console.log(`profile: ${dir}`)
  console.log(`依赖: ${pkg.dependencies?.[BUNDLE] || '（无）'}`)
  console.log(`启用: ${has ? '是' : '否'}`)
  process.exit(0)
}

if (mode === 'on') {
  if (has) {
    console.log(`已经是启用状态：${file}`)
    process.exit(0)
  }
  bundles.push(BUNDLE)
  pkg.dsh.profile.bundles = bundles
  if (!pkg.dependencies) pkg.dependencies = {}
  if (!pkg.dependencies[BUNDLE]) pkg.dependencies[BUNDLE] = 'link:' + process.cwd().replace(/\\/g, '/')
  writeJson(file, pkg)
  console.log(`已启用 ${BUNDLE}（下次启动 DSH 生效）`)
  process.exit(0)
}

if (!has) {
  console.log(`本来就是停用状态：${file}`)
  process.exit(0)
}
pkg.dsh.profile.bundles = bundles.filter((b) => b !== BUNDLE)
writeJson(file, pkg)
console.log(`已停用 ${BUNDLE}（重启 DSH 后不会再加载；依赖保留，可再 --on 打开）`)
