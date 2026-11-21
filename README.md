# dsh-fy-code-animation

**Turn a Chinese script into a finished MP4 — with code, not a timeline.**

A DeepSeek Harness plugin. You keep the script; the agent writes HTML/Canvas animation, renders it frame by frame, and hands back an MP4. No GPU, no monthly credits, no per-frame fee: every frame is `renderAt(t)` on your own machine.

[中文说明 →](./README.zh.md)

## Who this is for

- You already write product posts, course trailers, data explainers or vertical short videos — and you are tired of dragging keyframes.
- You want **motion graphics with taste**, not AI slop: the style library is 341 hand-curated prompts with 341 reference stills, each one a full Markdown brief you actually read before rendering.
- Your machine is ordinary. `8 GB VRAM` is not a requirement here — rendering is CPU + headless browser, and the plugin falls back to your installed Edge if Chromium will not download.
- You want the output to be **editable**: every project is a folder with `index.html`, `task.json` and `notes.md`. Hand it to a human, a different agent, or `git diff` it.

## What it does

| Piece | What you get |
| --- | --- |
| **Two skills** | `fy-code-animation` (10-step creation order, task-card contract, four delivery tiers) and `code-animation-prompts` (style library + renderer contract) |
| **Six tools** | `codeanim_status` `codeanim_switch` `codeanim_setup` `codeanim_style` `codeanim_new` `codeanim_render` |
| **341 styles** | 10 series, all of them with a reference still, plus an offline picker (`风格挑选.html`) that works without network |
| **Dependency installer** | Python 3.10+ probe → venv → Playwright + imageio-ffmpeg → Chromium (auto-fallback to Edge) → FFmpeg. Idempotent, logged, offline-capable |
| **A panel** | Bottom-right floating switch: mode on/off, dependency status, style count, last render — polls every 4 s |
| **Deterministic output** | `window.renderAt(t)` on an `<canvas>`; Playwright screenshots each frame, FFmpeg encodes with `libx264 + yuv420p + crf18 + faststart` |

## Install

### 1. Install the plugin

```bash
# inside DeepSeek Harness
plugin_manager install_bundle target="dsh-fy-code-animation"
```

or from the plugin market, or from a folder:

```bash
dsh plugin add "N:\path\to\dsh-fy-code-animation"
```

### 2. Install the render dependencies (once per machine)

Ask the agent to run `codeanim_setup`, or press the switch in the panel once. It fills `~/.dsh/code-animation/`:

```
env/            isolated venv (playwright + imageio-ffmpeg)
tools/ffmpeg/   bundled ffmpeg binary
style-library/  341 prompts + 341 stills
projects/       your projects
output/         finished MP4s
logs/           setup.log / render.log
```

What it needs, and how big it is:

| Need | Size | Notes |
| --- | --- | --- |
| Python 3.10+ | already on most systems | probed as `CODEANIM_PYTHON` → `py -3.12/3.11/3.10` → `python3` → `python` |
| Playwright + Chromium | ≈ 40 MB + 436 MB | download failure is **not fatal** — falls back to local Edge |
| FFmpeg | ≈ 80 MB | taken from `imageio-ffmpeg`, never written into system PATH |

Full step-by-step, mirrors and offline install: [docs/DEPENDENCIES.en.md](./docs/DEPENDENCIES.en.md) · [中文](./docs/依赖.md)

### 3. Turn it on

Say “开启动画模式 / start animation mode”, or click the bottom-right dot, or call `codeanim_switch({ action: "on" })`.
When it is off the skills stay readable but building/rendering is refused — that is deliberate, so a half-configured machine cannot silently produce broken MP4s.

## Quick start (about 5 minutes)

```
codeanim_status                                  # five dependency checks, style count
codeanim_switch { action: "on" }
codeanim_style  { action: "search", query: "水墨" }
codeanim_style  { action: "show", id: "Z1" }     # read the whole brief before rendering
codeanim_new    { name: "第一条", copy: "<150–300 字文案>", style: "Z1", duration: 12 }
# edit projects/<name>-<timestamp>/index.html into a real storyboard
codeanim_render { project: "projects/<name>-<timestamp>", duration: 12 }
```

Output lands in `~/.dsh/code-animation/output/`; an existing name never gets overwritten — a `-YYYYMMDD-HHmmss` suffix is appended.

## The render contract

Any HTML you hand to `codeanim_render` must expose:

```js
window.renderAt = (t) => { /* draw the frame at t seconds, synchronously */ }
```

- `t` is seconds, `0 <= t < duration`; the same `t` must always produce the same frame.
- With `?export=1` the page must **not** start its own animation loop — the renderer drives time.
- Anything else (CSS animation, `requestAnimationFrame` autoplay, random seeds) breaks frame accuracy.

## Tools

| Tool | Params | Notes |
| --- | --- | --- |
| `codeanim_status` | — | switch, five dependency steps, style count, last project/render |
| `codeanim_switch` | `action: on/off/toggle` | off = read-only skills |
| `codeanim_setup` | `steps?: ["python","venv","pip","chromium","ffmpeg","verify"]` | idempotent; `setup.log` has timings |
| `codeanim_style` | `action: search/show/list/open_picker`, `query`, `id`, `series`, `limit` | pure JS search, no Python needed |
| `codeanim_new` | `name`, `copy`, `style?`, `duration?`, `width?`, `height?`, `fps?` | splits the script into scenes, writes `task.json` **and validates it with fy's `validate_task.py`** |
| `codeanim_render` | `project?`, `output?`, `name?`, `duration?`, `width?`, `height?`, `fps?`, `audio?` | reads back ffmpeg metadata instead of trusting exit code 0 |

Style series: `AG` code samples 26 · `M` motion 40 · `K` cartoon 38 · `Z` Chinese 15 · `H` layout 12 · `L` Lemo-Opuscar 59 · `V` mg-styles 15 · `X` code-video 31 · `R` reference 7 · `O` Oscar 98.
Details and preview behaviour: [docs/STYLE-LIBRARY.md](./docs/STYLE-LIBRARY.md) · [中文](./docs/STYLE-LIBRARY.zh.md)

## Speed and limits (measured, not marketing)

- 1080p30 ≈ **6–8 seconds of wall clock per second of video** on an ordinary desktop (12 s clip ≈ 73 s). 4K or 60 fps scales linearly.
- Every style now ships a reference still. Stills are style references, not a promise of final render quality.
- Built-in audio generation: none. Pass `audio` to `codeanim_render` (`apad` pads silence, never loops).
- Remotion branch is intentionally not enabled in v1; everything is HTML/Canvas + `render_video.py`.
- The style library and both skills are third-party work — free to use and share, **not** to be resold as a paid course or paid skill. See [LICENSE.md](./LICENSE.md) and `style-library/第三方许可/`.

## Move it to another machine

```bash
node scripts/pack.mjs --out N:\deliver          # → portable zip ≈15.6 MB
node scripts/build-offline-pack.mjs --zip       # → offline deps ≈330–500 MB
```

See [docs/PORTING.en.md](./docs/PORTING.en.md) · [中文](./docs/移植.md).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Panel missing | press **Ctrl+R**; after editing `lib/client.js` a reload is mandatory |
| Plugin enabled but the app will not boot | `node scripts/toggle-profile.mjs --profile desktop --off`, then restart DSH |
| Chromium download stalls | ignore it — Edge is used automatically; or `codeanim_setup({ steps: ["chromium"] })` |
| pip fails | `codeanim_setup({ steps: ["pip"] })` (PyPI → Tsinghua mirror fallback) |
| Want it fully silent | create an empty file named `DISABLE` in `~/.dsh/code-animation/` |
| Logs | `~/.dsh/code-animation/logs/setup.log`, `render.log`, `plugin.log` |

## Compatibility

- DeepSeek Harness `>=0.2.0-rc.1 <0.3.0-0` (declared in `package.json → dsh.compatibility`; verified on `0.2.2-rc.3`).
- Node `>=20`, Windows 10/11 (Edge fallback path is Windows-specific; Chromium path is portable).
- `node tests/contract.mjs` proves the plugin registers 6 tools, 2 skills and 4 routes against a mock host; `node tests/harness.mjs` runs the style library + project pipeline end to end.

## Credits

- Styles, renderer and `code-animation-prompts` skill: [XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)
- Method, task-card contract and `fy-code-animation` skill: [Akillll-DuoHe/fy-code-animation](https://github.com/Akillll-DuoHe/fy-code-animation)
- Third-party style sets keep their own licences (`style-library/第三方许可/`).

Plugin code: MIT.
