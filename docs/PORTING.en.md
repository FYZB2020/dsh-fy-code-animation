# Move it to another machine

[中文](./移植.md)

## 1. Portable package (recommended)

```bash
node scripts/pack.mjs --out N:\deliver
# → dsh-fy-code-animation-<version>-portable.zip  ≈ 15.6 MB
```

The zip contains the plugin folder plus `安装.cmd` (install) and `使用说明.txt`. On the target machine:

1. Unpack anywhere (avoid `&` and `%` in the path).
2. Double-click `安装.cmd` — it calls `dsh plugin add <unpacked folder>`.
3. Restart DeepSeek Harness.
4. Say "开启动画模式", or click the bottom-right switch.
5. Before the first render, ask the agent to run `codeanim_setup` — dependencies are per machine and do **not** travel in the zip.

## 2. Copy the folder (no packaging)

Copy the whole `dsh-fy-code-animation` directory over, then in DSH:

```
plugin_manager install_bundle target="<absolute path on this machine>"
plugin_manager set_plugin target="include:code-animation" enabled=true
```

Or from the CLI: `dsh plugin add "<path>"`.
The dev setup uses `link:/path/to/dsh-fy-code-animation`; after editing code, run `set_plugin` again to hot-reload.

## 3. Do dependencies have to travel?

| Option | Size | When |
| --- | --- | --- |
| No dependency pack | 0 | target machine has network (default) |
| Offline dependency pack | ≈ 330–500 MB | target is offline / behind a firewall |

```bash
node scripts/build-offline-pack.mjs --zip
# → dsh-fy-code-animation-offline-deps.zip (wheels + chromium + ffmpeg)
```

Unpack to `~/.dsh/code-animation/offline/` on the target (giving `offline/wheels`, `offline/browsers`), then run `codeanim_setup`: pip uses local wheels, Chromium is taken from `offline/browsers`.

## 4. Where runtime data lives

`~/.dsh/code-animation/`:

```
env/            isolated venv (deletable, reinstalled on demand)
tools/ffmpeg/   bundled ffmpeg
skills/         synced copies of the two skills
style-library/  mirror of the 341-style library
projects/       projects
output/         finished MP4s
logs/           setup.log / render.log
state.json      switch state and last records
deps.json       dependency snapshot
```

Deleting the whole folder returns you to "just installed, not configured"; the plugin and its skills are unaffected.

## 5. Checklist for a new machine

- [ ] DeepSeek Harness installed (Windows)
- [ ] `安装.cmd` found `dsh.cmd` (otherwise run `dsh plugin add` manually)
- [ ] After restart the skill list shows `code-animation-prompts` and `fy-code-animation`
- [ ] The tool list shows all six `codeanim_*` tools
- [ ] `codeanim_status` reports five green steps and 341 styles
- [ ] Render a 3-second test clip to confirm encoding
