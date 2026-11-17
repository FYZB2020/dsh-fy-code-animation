# Changelog

All notable changes to `dsh-fy-code-animation` (Posterwright-style semver: 1.x stays inside DSH 0.2.x).

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
