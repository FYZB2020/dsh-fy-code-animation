# Changelog

## 1.2.1 — 2026-11-21

### Changed
- Previews are now **code, not diffusion**: every one of the 341 styles compiles to a
  Canvas scene (`window.renderAt(t)`, deterministic per id + seed) that is captured
  headless at 1280×720. The FLUX takes are kept only as `style-library/_alt-flux/`
  plates for use as cut-out material, never as previews.
- Same pipeline is mirrored into `dsh-creative-video` 1.1.0.

All notable changes to `dsh-fy-code-animation` (Posterwright-style semver: 1.x stays inside DSH 0.2.x).

## 1.2.0 — 2026-11-21

Every style in the library now has a reference still. The 145 entries that used to be text-only were rendered by code — a Canvas scene per style, drawn frame-by-frame and captured with Playwright (1280×720 JPEG); the FLUX takes were kept aside as `style-library/_alt-flux/` plates, then wired into all three metadata surfaces.

### Added
- 145 new reference stills under `style-library/风格提示词/…`, so `withStill` is now **341/341**.
- Stills are generated per style from its own brief: the prompt builder reads the English alias in the heading, the "长什么样" line for long cards, and the whole note for short cards, then composes a 16:9 key frame. Presenter-flavoured styles (口播/字幕/主持/访谈/出镜/念白/旁白) keep a person; every other M-series style gets a neutral subject so 39 thumbs don't all become the same talking head.

### Changed
- `style-library/_manifest.json`, `style-library/_统计.json`, `style-library/风格挑选.html` and `skills/code-animation-prompts/references/catalog.json` all report 341/341.
- Docs updated in both languages: README, STYLE-LIBRARY, CAPABILITIES, DEPENDENCIES, MAINTAINING, SKILL.md and attribution now say "every style has a still" instead of "145 are text-only".
- `dsh-creative-video` mirrors the same library, so it received the identical 145 images and metadata.

## 1.1.0 — 2026-11-17

Compatibility pass against DeepSeek Harness **0.2.2-rc.3**, plus the documentation and packaging work needed for a public release.

### Added
- `tests/contract.mjs` — loads `lib/index.js` against a mock host and asserts the plugin registers 6 tools, 2 skills and 4 routes. This is the compatibility gate for future DSH versions.
- `dsh.compatibility` in `package.json` (`>=0.2.0-rc.1 <0.3.0-0`, verified release `0.2.2-rc.3`) so the plugin manager and the market can report compatibility.
- `README.zh.md` (Chinese, audience-first) alongside a rewritten English `README.md`.
- `docs/STYLE-LIBRARY.md` / `docs/STYLE-LIBRARY.zh.md` — how the 341-style library and its 196 reference stills work, and how much a preview can tell you.
- English documentation set: `docs/USAGE.en.md`, `docs/DEPENDENCIES.en.md`, `docs/PORTING.en.md`, `docs/CAPABILITIES.en.md`.
- `repository` / `homepage` / `bugs` / `author` metadata and 9 extra npm keywords (`dsh-bundle`, `dshmarket`, `code-to-video`, `html-to-video`, …).

### Changed
- `package.json` version `1.0.3` → `1.1.0`; `files` no longer ships the non-existent `references/` folder, now ships `README.zh.md` and `CHANGELOG.md`.
- `README.md` is now English; the previous Chinese README lives on as `README.zh.md` and gained install steps, the render contract, measured speeds, limits and troubleshooting.
- Chinese docs now link to their English counterparts; English docs link back.

### Fixed
- Documentation said "three local routes"; the plugin has registered **four** since 1.0.2 (`state`, `toggle`, `picker`, `library`). Corrected in `lib/index.js` header and the docs.
- Verified `ctx.skills.register` / `ctx.tools.register` / `ctx.webServer.register` / `ctx.effect` still match the 0.2.2 host API — no code change was required, but nothing asserted it before.

## 1.0.3 — 2026-11-15
- Panel collapses to a 46 px dot; expanded state remembered; auto-collapse after 12 s idle.

## 1.0.2 — 2026-11-14
- Fixed the boot crash introduced in 1.0.1: the client bundle now exports a cordis plugin (`apply`), otherwise the host throws `invalid plugin, expect function or object with an "apply" method`.
- Added `scripts/toggle-profile.mjs` for emergency enable/disable without the GUI.

## 1.0.1 — 2026-11-14
- Panel, state/toggle/picker/library routes, offline style picker.

## 1.0.0 — 2026-11-13
- First release: two skills, six tools, one-command dependency setup, 341-style library, portable packaging.
