// 把两个上游仓库裁剪后装进插件包：
//   code-animation-prompts 保留技能与 341 画风库，丢掉示例 MP4（约 63 MB）与 promo gif；
//   fy-code-animation 全量保留（约 665 KB 文本）。
// 同时生成 style-library/_manifest.json（含 sha256），供同步与校验使用。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const plugin = path.resolve(here, '..')

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : fallback
}

const capsSrc = arg('--caps')
const fySrc = arg('--fy')

if (!capsSrc || !fySrc) {
  console.error('用法: node scripts/vendor.mjs --caps <code-animation-prompts 仓库根> --fy <fy-code-animation 仓库根>')
  process.exit(2)
}

const SKIP_EXT = new Set(['.mp4', '.mov', '.webm', '.gif', '.zip', '.7z'])
const SKIP_DIRS = new Set(['.git', 'node_modules', 'docs', '__pycache__'])

function copyTree(src, dst, stats) {
  fs.mkdirSync(dst, { recursive: true })
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue
    const s = path.join(src, ent.name)
    const d = path.join(dst, ent.name)
    if (ent.isDirectory()) {
      copyTree(s, d, stats)
    } else if (ent.isFile()) {
      if (SKIP_EXT.has(path.extname(ent.name).toLowerCase())) {
        stats.skipped.push({ path: s, bytes: fs.statSync(s).size })
        continue
      }
      fs.copyFileSync(s, d)
      stats.copied += 1
      stats.bytes += fs.statSync(d).size
    }
  }
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true })
}

function sha256(file) {
  const h = crypto.createHash('sha256')
  h.update(fs.readFileSync(file))
  return h.digest('hex')
}

function walk(dir, base = dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, base, out)
    else if (ent.isFile()) out.push({ path: path.relative(base, p).split(path.sep).join('/'), bytes: fs.statSync(p).size })
  }
  return out
}

const stats = { copied: 0, bytes: 0, skipped: [] }

// 1) 技能：code-animation-prompts
const capsSkillSrc = path.join(capsSrc, 'skills', 'code-animation-prompts')
const capsSkillDst = path.join(plugin, 'skills', 'code-animation-prompts')
if (!fs.existsSync(capsSkillSrc)) {
  console.error(`找不到 ${capsSkillSrc}`)
  process.exit(2)
}
rmrf(capsSkillDst)
copyTree(capsSkillSrc, capsSkillDst, stats)
// 库不重复放技能里：唯一的库在插件根 style-library/，技能内只留说明指针
rmrf(path.join(capsSkillDst, 'assets', 'library'))
fs.mkdirSync(path.join(capsSkillDst, 'assets'), { recursive: true })
fs.writeFileSync(
  path.join(capsSkillDst, 'assets', 'library.txt'),
  '画风库不在技能目录内：插件根 style-library/ 是唯一副本（安装后同步到 %USERPROFILE%\\.dsh\\code-animation\\style-library）。\n用 codeanim_style 工具检索，不要按 assets/library/ 相对路径找文件。\n',
  'utf8',
)

// 2) 技能：fy-code-animation
rmrf(path.join(plugin, 'skills', 'fy-code-animation'))
copyTree(fySrc, path.join(plugin, 'skills', 'fy-code-animation'), stats)

// 3) 画风库：只保留 风格提示词/ 与库根小文件
const libSrc = path.join(capsSkillSrc, 'assets', 'library')
const libDst = path.join(plugin, 'style-library')
rmrf(libDst)
fs.mkdirSync(libDst, { recursive: true })
copyTree(path.join(libSrc, '风格提示词'), path.join(libDst, '风格提示词'), stats)
for (const f of ['_统计.json', '说明.md', '风格挑选.html']) {
  const s = path.join(libSrc, f)
  if (fs.existsSync(s)) fs.copyFileSync(s, path.join(libDst, f))
}

// 4) 清单
const files = walk(libDst)
const manifest = {
  builtAt: new Date().toISOString(),
  note: '由 scripts/vendor.mjs 生成；示例 MP4 与 promo gif 已裁剪，画风 md/jpg 全量保留。',
  sources: {
    'code-animation-prompts': 'https://github.com/XiaoyeCodes/code-animation-prompts',
    'fy-code-animation': 'https://github.com/Akillll-DuoHe/fy-code-animation',
  },
  counts: {
    styles: files.filter((f) => f.path.startsWith('风格提示词/') && f.path.endsWith('.md')).length,
    stills: files.filter((f) => f.path.startsWith('风格提示词/') && f.path.endsWith('.jpg')).length,
    files: files.length,
    bytes: files.reduce((a, b) => a + b.bytes, 0),
  },
  skipped: stats.skipped.map((s) => ({ path: path.basename(s.path), bytes: s.bytes })),
  files: files.map((f) => ({ ...f, sha256: sha256(path.join(libDst, f.path)) })),
}
fs.writeFileSync(path.join(libDst, '_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

const sizeMB = (n) => (n / 1024 / 1024).toFixed(1) + ' MB'
console.log(`copied ${stats.copied} files, ${sizeMB(stats.bytes)}`)
console.log(`style library: ${manifest.counts.styles} styles / ${manifest.counts.stills} stills / ${sizeMB(manifest.counts.bytes)}`)
console.log(`trimmed: ${stats.skipped.length} media files, ${sizeMB(stats.skipped.reduce((a, b) => a + b.bytes, 0))}`)
