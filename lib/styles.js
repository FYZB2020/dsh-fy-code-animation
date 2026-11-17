// 画风库：直接读 catalog.json，不依赖 Python —— 即使依赖没装好，检索也能用。
// 条目里的 file/image 以 assets/library/ 开头，运行时映射到 <runtime>/style-library。
import fs from 'node:fs'
import path from 'node:path'
import { layout, vendor } from './paths.js'

let cache = null
let cacheKey = ''

function catalogPath() {
  const l = layout()
  const synced = path.join(l.skills, 'code-animation-prompts', 'references', 'catalog.json')
  if (fs.existsSync(synced)) return synced
  return vendor().capsCatalog
}

export function loadCatalog() {
  const p = catalogPath()
  const key = p + ':' + (fs.existsSync(p) ? fs.statSync(p).mtimeMs : 0)
  if (cache && cacheKey === key) return cache
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
  const entries = (raw.entries || []).map((e) => ({
    id: e.id,
    name: e.name,
    series: e.series,
    category: e.category || '',
    description: e.description || '',
    fit: e.fit || '',
    tags: Array.isArray(e.tags) ? e.tags : [],
    file: e.file || '',
    image: e.image || '',
  }))
  cache = { total: raw.total || entries.length, withStill: raw.with_still || 0, series: raw.series || [], entries }
  cacheKey = key
  return cache
}

/** 把 catalog 里的 assets/library/xxx 映射到运行时库。 */
export function resolveAsset(rel) {
  const l = layout()
  const clean = String(rel || '').replace(/^assets\/library\//, '').replace(/^\/+/, '')
  return path.join(l.styleLibrary, clean)
}

function haystack(e) {
  return [e.id, e.name, e.series, e.category, e.description, e.fit, e.tags.join(' ')].join(' ').toLowerCase()
}

function score(e, tokens) {
  const name = String(e.name || '').toLowerCase()
  const id = String(e.id || '').toLowerCase()
  const tags = e.tags.join(' ').toLowerCase()
  const desc = (e.description + ' ' + e.fit + ' ' + e.category).toLowerCase()
  let s = 0
  for (const t of tokens) {
    if (!t) continue
    if (id === t) s += 40
    if (name === t) s += 36
    if (name.includes(t)) s += 18
    if (tags.includes(t)) s += 12
    if (id.includes(t)) s += 10
    if (desc.includes(t)) s += 5
  }
  return s
}

/**
 * 检索。tokens 用空格分隔；中文会额外按 2 字切片补齐，避免整句匹配不上。
 */
export function search(query, opts = {}) {
  const { entries } = loadCatalog()
  const q = String(query || '').trim()
  const limit = Math.max(1, Math.min(Number(opts.limit || 8), 50))
  let pool = entries
  if (opts.series) {
    const s = String(opts.series).toUpperCase()
    pool = pool.filter((e) => String(e.series).toUpperCase() === s)
  }
  const tokens = q.toLowerCase().split(/[\s,，、/]+/).filter(Boolean)
  if (q.length >= 4 && tokens.length <= 2) {
    for (let i = 0; i + 2 <= q.length; i += 2) tokens.push(q.slice(i, i + 2).toLowerCase())
  }
  if (!tokens.length) {
    return { query: q, total: pool.length, hits: pool.slice(0, limit).map((e) => ({ ...e, score: 0, md: existsMd(e) })) }
  }
  const hits = pool
    .filter((e) => tokens.some((t) => haystack(e).includes(t)))
    .map((e) => ({ ...e, score: score(e, tokens), md: existsMd(e) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit)
  return { query: q, total: hits.length, hits }
}

export function existsMd(e) {
  try {
    return fs.existsSync(resolveAsset(e.file))
  } catch {
    return false
  }
}

export function show(id) {
  const key = String(id || '').trim().toUpperCase()
  const { entries } = loadCatalog()
  const e = entries.find((x) => String(x.id).toUpperCase() === key)
  if (!e) return { ok: false, error: `没有编号 ${id}` }
  const mdPath = resolveAsset(e.file)
  let md = ''
  let mdExists = false
  try {
    md = fs.readFileSync(mdPath, 'utf8')
    mdExists = true
  } catch {
    md = ''
  }
  const imgPath = resolveAsset(e.image)
  return {
    ok: true,
    entry: { ...e, filePath: mdPath, mdExists, imageExists: fs.existsSync(imgPath) },
    md,
    mdExists,
    mdPath,
    imagePath: fs.existsSync(imgPath) ? imgPath : null,
  }
}

export function list(series) {
  const { entries } = loadCatalog()
  const groups = new Map()
  for (const e of entries) {
    const k = String(e.series || '?')
    if (series && k.toUpperCase() !== String(series).toUpperCase()) continue
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(e)
  }
  return { total: entries.length, groups: [...groups.entries()].map(([id, items]) => ({ series: id, count: items.length, items })) }
}

export function pickerPath() {
  const l = layout()
  const p = path.join(l.styleLibrary, '风格挑选.html')
  return fs.existsSync(p) ? p : null
}

export function styleCount() {
  try {
    const { entries } = loadCatalog()
    return entries.length
  } catch {
    return 0
  }
}
