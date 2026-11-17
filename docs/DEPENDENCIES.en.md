# Dependencies

[中文](./依赖.md)

## Summary

| Purpose | Needs | Size | How |
| --- | --- | --- | --- |
| Style search / project creation / task validation | Python 3.10+ | usually present | any 3.10+ on the system; install one if missing |
| Rendering (frames) | Playwright + Chromium | ≈ 40 MB + 436 MB | installed by `codeanim_setup`; falls back to local Edge |
| Encoding | FFmpeg | ≈ 80 MB | taken from `imageio-ffmpeg` into `tools/ffmpeg/bin` |

The plugin itself is ~15.6 MB (341 styles + 196 stills + two skills). It does **not** bundle Python or a browser.

## What the automatic setup does

`codeanim_setup` (or the `postinstall` background task) runs these steps, all idempotent:

1. **python** — tries `CODEANIM_PYTHON` → bundled offline tool → `py -3.12/3.11/3.10` → `python3` → `python` → Anaconda; accepts ≥ 3.10 only.
2. **venv** — creates an isolated venv at `~/.dsh/code-animation/env`; the system Python is untouched.
3. **pip** — installs `playwright` + `imageio-ffmpeg`; PyPI first, Tsinghua mirror on failure; prefers `offline/wheels` when present.
4. **chromium** — `python -m playwright install chromium`; falls back to `cdn.npmmirror.com`; if that still fails it **degrades to local Edge** (`channel: "msedge"`, no browser download).
5. **ffmpeg** — checks PATH first, then copies the `imageio_ffmpeg` binary to `tools/ffmpeg/bin/ffmpeg.exe`; only that folder is prepended to PATH at render time, never the system PATH.
6. **verify** — re-checks all five and writes `deps.json`.

## Measured on the author's machine (2026-11-07)

```
python     ok 3.11.1 (py -3.11)
venv       ok <home>\.dsh\code-animation\env
playwright ok 1.64.1
chromium   ok ms-playwright\chromium-1248\chrome-win64\chrome.exe
ffmpeg     ok ffmpeg 9.0.2-essentials_build (gyan.dev)
```

Timings: venv 37 s, pip 33 s, chromium can be long on first download (here it hit a local cache), ffmpeg copy < 2 s.

## When it gets stuck

- **Chromium download slow/failing** — ignore it, local Edge (bundled with Windows 10/11) is used automatically. `deps.json` will show `chromium: { channel: "msedge" }`.
- **playwright install times out** — `codeanim_setup({ steps: ["chromium"] })`, or set `PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright`.
- **pip fails** — `codeanim_setup({ steps: ["pip"] })`; the mirror lives in `lib/deps.js` as `PYPI_MIRROR`.
- **Fully offline** — on a connected machine run `node scripts/build-offline-pack.mjs --zip`, unpack to `~/.dsh/code-animation/offline/` on the target, then `codeanim_setup`.
- **Details** — `~/.dsh/code-animation/logs/setup.log` and `render.log` (UTF-8; use `-Encoding UTF8` in PowerShell).

## Why it never touches the system

- No system PATH writes, no global packages, no registry edits.
- Player compatibility is pinned at `libx264 + yuv420p + crf18 + faststart`.
- Moving machines = copy the plugin + run setup once; behaviour is identical.
