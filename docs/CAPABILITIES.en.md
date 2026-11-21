# Capabilities: what you get, and what is still on you

[中文](./能力清单.md)

## 1. What each upstream project contributes

### A. code-animation-prompts (style library + renderer)

| Asset | Size | Inside this plugin |
| --- | --- | --- |
| Style briefs | **341** Markdown files, 10 series | `style-library/风格提示词/` (14.2 MB, single copy) |
| Reference stills | **341** jpg | same folder; `show` reports if a still exists |
| Offline picker | `风格挑选.html` | `codeanim_style({ action: "open_picker" })` |
| Runnable sample | `starter/index.html` + 3 sample MP4s (60 MB) | only `index.html` kept; sample videos dropped |
| Renderer | `render_video.py` (Playwright frames + FFmpeg) | copied to `~/.dsh/code-animation/bin/` with an Edge fallback |
| Skill | `SKILL.md` for search / composition / render contract | registered as `code-animation-prompts` |

Series: AG 26, M 40, K 38, Z 15, H 12, L 59, V 15, X 31, R 7, O 98.

### B. fy-code-animation (method + contract)

| Asset | Content | Inside this plugin |
| --- | --- | --- |
| 10-step order | read → segment → choose style → read the full brief and record its SHA → resolve conflicts → storyboard → four music options + SFX table → licensed music generation → land on actual audio → review/fix | skill `fy-code-animation`, mirrored into `notes.md` |
| Task card | `task.json` (phase/scenes/events/music/evidence) + `validate_task.py` | `codeanim_new` writes it and validates on the spot |
| Four tiers | `card` / `still` / `audition` / `final` | default `card`; upgrade via fy's actions whitelist |
| Capability routing | 15 modules + 16 recipes + 53 implementations | travels with the skill; search when needed |
| Style search | `style_library.py` (build/list/search/get/selection) | plus a pure-JS path so search needs no Python |
| Health check | `doctor.py` | replaced by `codeanim_status` / `node scripts/doctor.mjs` |

## 2. What the plugin turns them into

- **A switch**: while off, skills are readable but actions are refused; on, you can build/install/render. Three entries: panel, tool, or one sentence.
- **Six tools**: status, switch, setup, style, new, render.
- **One dependency path**: Python → venv → playwright → Chromium/Edge → FFmpeg. Idempotent, logged, offline-capable.
- **One portable package**: ~15.6 MB zip, optional offline dependency pack.
- **A panel**: bottom-right, shows switch / dependencies / last render, polls every 4 s.

## 3. What you still have to bring

The plugin solves the toolchain, not the content. In order of importance:

1. **Script (required)** — 150–300 Chinese characters, short sentences, visual. `codeanim_new` only splits on punctuation; it will not write for you.
2. **Style decision (required)** — pick one of 341 and **read the full brief** (fy hard rule); `codeanim_style search/show` exists for this.
3. **Storyboard and pacing (required)** — what moves in each scene, when type lands, how long the pause is. You get a runnable skeleton, not finished art direction.
4. **Fonts (recommended)** — Source Han Sans / Noto Sans SC for Chinese titles; the template already falls back Source Han Sans → Noto Sans SC → Microsoft YaHei.
5. **Voice-over (optional)** — any local TTS or the `dreamina-canvas` CLI; a clip without audio is fine (`audio` is optional, `apad` only pads silence).
6. **Music / SFX (optional)** — `text_to_music`, `text_to_sound_effect`, or the `suno-v6-prompt` skill to write prompts.
7. **Remotion (not needed)** — fy supports it, v1 does not enable the Node/Remotion branch; everything is HTML/Canvas + `render_video.py`.
8. **Delivery (as needed)** — 1080×1920 for vertical; subtitles/covers can come from the office skills.

## 4. Known limits (read before you promise anything)

- **B6 is not a library entry** — it exists only in upstream `示例/`, so it does not count as #342. Sample videos are not bundled.
- **Every entry has a still** — `show` reports `imageExists:true`. Stills guide style choice; they do not guarantee the final frame.
- **L series (Lemo) misses dependency files** — `DEMO.md/paper.js/draw.js/sheet.js/film.js` are absent upstream, so `dependency_audit_complete` stays false. Use them as text-only styles.
- **X7 is ambiguous** — one entry in the library, one in examples; always search by `id`.
- **Licence** — free to use and share, **not** to resell as a paid course or paid skill; third-party styles keep their own licences (`style-library/第三方许可/`).
- **Render speed** — 1080p30 ≈ 6–8 s of wall clock per output second (12 s clip ≈ 73 s measured). 4K or 60 fps scales linearly.

## 5. First clip in five minutes

```
codeanim_status → codeanim_switch on
codeanim_style search "水墨"        # or 粒子 / 工程 / 霓虹
codeanim_style show Z1              # read the brief
codeanim_new { name: "第一条", copy: "<~150 chars>", style: "Z1", duration: 12 }
# open projects/<project>/index.html and rewrite 3–5 scenes per Z1
codeanim_render { project: "<project>" }
```
