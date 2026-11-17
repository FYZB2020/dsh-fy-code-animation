// 离线依赖包（可选）：把这台电脑已经装好的依赖收进 offline/，再打成一个 zip。
// 目标机器完全断网时，解压到 ~/.dsh/code-animation/offline 即可跳过下载。
// 用法：node scripts/build-offline-pack.mjs [--out <目录>] [--zip]
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { layout, ensureDirs } from '../lib/paths.js'

const argv = process.argv.slice(2)
const outArg = argv.indexOf('--out')
const outDir = path.resolve(outArg >= 0 ? argv[outArg + 1] : 'N:\\DSHreb\\deliver')
const wantZip = argv.includes('--zip')
const l = ensureDirs()
const wheels = path.join(l.offline, 'wheels')
const browsers = path.join(l.offline, 'browsers')
fs.mkdirSync(wheels, { recursive: true })
fs.mkdirSync(browsers, { recursive: true })

if (!fs.existsSync(l.envPython)) {
  console.error('venv 不存在，先跑 codeanim_setup（或 node scripts/setup-console.mjs）')
  process.exit(1)
}

console.log('[offline] 下载 wheel →', wheels)
const pip = spawnSync(
  l.envPython,
  ['-m', 'pip', 'download', '--disable-pip-version-check', 'playwright', 'imageio-ffmpeg', '-d', wheels],
  { encoding: 'utf8', windowsHide: true, timeout: 900_000 },
)
if (pip.status !== 0) {
  console.error('pip download 失败：', (pip.stderr || '').slice(-800))
  process.exit(1)
}

const cache = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
if (cache && fs.existsSync(cache)) {
  for (const name of fs.readdirSync(cache)) {
    if (!/^chromium|^ffmpeg/.test(name)) continue
    const src = path.join(cache, name)
    const dst = path.join(browsers, name)
    if (!fs.existsSync(dst)) {
      console.log('[offline] 复制浏览器 →', name)
      fs.cpSync(src, dst, { recursive: true })
    }
  }
}

const size = (dir) => {
  let n = 0
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else n += fs.statSync(p).size
    }
  }
  walk(dir)
  return (n / 1048576).toFixed(1)
}
console.log(`[offline] ${l.offline} = ${size(l.offline)} MB`)

if (wantZip) {
  fs.mkdirSync(outDir, { recursive: true })
  const zip = path.join(outDir, 'dsh-fy-code-animation-offline-deps.zip')
  if (fs.existsSync(zip)) fs.rmSync(zip, { force: true })
  const ps = `Compress-Archive -Path '${l.offline.replace(/'/g, "''")}\\*' -DestinationPath '${zip.replace(/'/g, "''")}' -CompressionLevel Fastest -Force`
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true })
  if (r.status !== 0) {
    console.error('打包失败：', r.stderr)
    process.exit(1)
  }
  console.log(`[offline] ${zip} = ${(fs.statSync(zip).size / 1048576).toFixed(1)} MB`)
}
