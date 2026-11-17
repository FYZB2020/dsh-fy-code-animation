# Usage

[中文](./使用.md)

## The panel

Bottom-right of the harness there is a **46 px dot** (does not cover content). Click it to expand:

- **Collapsed**: green dot = animation mode on, grey = off. Hover shows status. Footprint is only 46×46.
- **Switch**: toggles animation mode and echoes back (e.g. "enabled 19:41:32").
- **画风库**: opens the 341-entry picker *inside* the panel — thumbnails, search, series filter, tick-and-copy list. Esc or 关闭 exits; no new tab.
- **刷新**: re-reads state, shows "refreshed HH:MM:SS".
- **Status line**: mode / dependencies ready / style count / last render.
- **Collapse**: the "–" in the title bar shrinks it back to a dot. State is remembered; it auto-collapses after 12 s idle (never while a modal is open).

The panel polls every 4 s. After upgrading the plugin or editing `lib/client.js`, press **Ctrl+R** once.

## Tools

### codeanim_status

No parameters. Returns switch state, five dependency steps, style count, last project/render, default format. **Always start here.**

### codeanim_switch

`{ action: "on" | "off" | "toggle" }`. While off, skills stay readable but building, installing and rendering are refused with an explanation. Three equivalent entries: panel switch, this tool, or just saying "start animation mode".

### codeanim_setup

`{ steps?: ["python","venv","pip","chromium","ffmpeg","verify"] }`. Idempotent — finished steps return immediately. `setup.log` records per-step duration and failure reason.

### codeanim_style

- `{ action: "search", query: "水墨", limit: 8 }` — pure JS, no Python
- `{ action: "show", id: "B3" }` — full Markdown brief plus whether a still exists
- `{ action: "list", series: "Z" }` — ids per series
- `{ action: "open_picker" }` — absolute path to the offline picker

Series: AG 26, M 40, K 38, Z 15, H 12, L 59, V 15, X 31, R 7, O 98.

### codeanim_new

`{ name, copy, style?, duration?, width?, height?, fps? }`

- Splits the script on 。？！；and newlines, then merges to ~34 characters per scene (max 2 sentences per scene).
- Distributes duration by character count; no scene shorter than 2.2 s; the last scene absorbs the remainder.
- Writes `task.json` (fy contract) and **runs fy's `validate_task.py` on the spot** — no project is created if it fails.
- Also writes a renderable `index.html` skeleton (character-by-character reveal, pure `renderAt(t)`).

### codeanim_render

`{ project?, output?, name?, duration?, fps?, width?, height?, audio? }`

- `project` may be a project folder or an HTML file; defaults to the most recent project.
- Width/height must be positive even numbers, fps 1–120, duration 0–300 s.
- After encoding it reads back ffmpeg metadata (resolution/duration/fps/size) instead of trusting exit code 0.
- If Chromium will not start it retries once with local Edge.
- Existing output names get a `-YYYYMMDD-HHmmss` suffix; nothing is overwritten.

## One full pass (about 3 minutes)

```
codeanim_status                          # deps OK, switch OFF
codeanim_switch { action: "on" }
codeanim_style  { action: "search", query: "粒子" }
codeanim_style  { action: "show", id: "B3" }        # read before rendering (fy hard rule)
codeanim_new    { name: "开场", copy: "文案……", style: "B3", duration: 12 }
# open projects/<project>/index.html and rewrite the storyboard per B3
codeanim_render { project: "projects/<project>", duration: 12 }
```

## Project layout

```
projects/<name>-<timestamp>/
  index.html      renderable storyboard (must expose window.renderAt(t); pure when ?export=1)
  input/copy.txt  the script
  task.json       task card (phase/scenes/events/music/evidence)
  notes.md        10-step order + style excerpt + todos
```

To take over by hand: edit copy and timeline in `index.html`, fill `scenes/events` in `task.json`, then `codeanim_render`.
`codeanim_new` only produces `phase: "card"`. For `still` / `audition` / `final`, follow fy's `templates/task.json` and its actions whitelist.

## When something breaks

1. Panel missing → press **Ctrl+R** (mandatory after editing `lib/client.js`).
2. "刷新" only reads state; use the switch to change mode.
3. **Plugin enabled but the app will not boot** (1.0.1 bug, fixed in 1.0.2):
   - The lesson: a client bundle must export `apply`, otherwise boot throws `invalid plugin, expect function or object with an "apply" method`.
   - Emergency rollback without the GUI: run `node scripts/toggle-profile.mjs --profile desktop --off`, then restart DSH.
   - Re-enable with `--on`.
4. Dependencies broken → run `codeanim_setup`; failure reason in `%USERPROFILE%\.dsh\code-animation\logs\setup.log`.
5. Want it fully silent → create an empty file named `DISABLE` in `%USERPROFILE%\.dsh\code-animation\`. The plugin then loads the shell only: no tools, skills or routes. Delete the file to restore.
