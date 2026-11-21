# Maintaining dsh-fy-code-animation

Everything a future operator needs. 中文速查见文末。

---

## 1. Layout

| Path | What | Ships? |
| --- | --- | --- |
| `lib/` | Plugin entry (`index.js`), 6 tools, 4 local routes, project/render/state modules | yes |
| `skills/` | Two bundled skills: `fy-code-animation`, `code-animation-prompts` | yes |
| `style-library/` | 341 styles, 341 still frames, `_manifest.json`, `风格挑选.html` (469 KB) | yes |
| `templates/`, `docs/`, `tests/`, `scripts/` | Starter scene, docs, tests, release driver | yes |

The style library is byte-identical to `dsh-creative-video/style-library` (verified 542/542 by MD5). If you improve styles, **copy changes into both** or pick one as the source of truth.

**Never commit:** `node_modules/`, `dist/`, `*.tgz`, `*.zip`, offline packs, vendored `tools/`, `ffmpeg/`, `*.log`, `.env`, personal exports. `.gitignore` enforces this.

## 2. The compatibility gate

`tests/contract.mjs` is the thing that tells you the plugin still fits the running DSH:

- builds a mock `ctx` (`effect` / `inject` / `tools.register` / `skills.register` / `webServerScope.webServer.register`)
- imports `lib/index.js` through `pathToFileURL()` (**on Windows a bare path throws `ERR_UNSUPPORTED_ESM_URL_SCHEME`**)
- asserts: `name === 'code-animation'`, `inject` contains `tools`, **6 tools**, **2 skills**, **4 routes**
  (`/code-animation/state`, `/code-animation/toggle`, `/code-animation/picker`, prefix `/code-animation/library`)

Run it after every DSH update. If it fails, the plugin is not loaded by the host and no amount of docs will help.

`dsh.compatibility` in `package.json` should list the DSH builds you actually verified, e.g.

```json
"dsh": { "compatibility": { "dsh": ">=0.2.0-rc.1 <0.3.0-0",
          "dshReleases": { "0.2.2-rc.3": "compatible" } } }
```

## 3. Release

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release.ps1 -Bump patch -Message "fix: ..."
```

Runs `tests/contract.mjs` + `tests/harness.mjs`, then bumps, tags, pushes. Refuses to continue on failure.

`npm pack --dry-run` is the packaging gate: expect **≈732 files / ≈13.6 MB tarball**, `suspicious: none`. If the file count jumps, something personal got committed.

## 4. Credentials and network

- Push token lives in **Windows Credential Manager**; never in the repo.
- `git` uses `http.sslBackend=schannel` on this machine — the OpenSSL backend in Git 2.40 cannot verify current GitHub certificates.
- If `github.com` resolves to `127.0.0.1`, check `C:\Windows\System32\drivers\etc\hosts` (a stale local proxy entry) before suspecting the token.
- `github.com` is intermittently reset on this line. Keep the CONNECT proxy running and git pointed at it:

  ```powershell
  node N:\dshwork\_tools\github-proxy.cjs 8899
  git config --global http.proxy http://127.0.0.1:8899
  ```

  If the pinned edge IPs go stale the proxy re-probes its candidate list on its own.

## 5. Known limits (do not "fix" by promising more)

- All 341 styles now ship a still frame (preview coverage 341/341). Stills are style references, not a quality promise.
- L series lacks `DEMO.md` / `paper.js` / `draw.js` / `sheet.js` / `film.js`.
- B6 is not in the curated library; X7 is ambiguous.
- 1080p30 costs roughly 6–8 seconds of machine time per second of video.
- Remotion is disabled in v1. `audio` is optional; `apad` only pads silence.

---

## 中文速查

- **改完必跑**：`node tests/contract.mjs`（6 工具 / 2 技能 / 4 条路由）与 `node tests/harness.mjs`（画风库、项目、时间线、依赖探测）。宿主升级后先跑契约测试。
- **发布**：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release.ps1 -Bump patch -Message "改了啥"`，测试不过不推。
- **打包自检**：`npm pack --dry-run`，应约 732 文件 / 13.6 MB，`suspicious: none`。
- **画风库双份**：与 `dsh-creative-video/style-library` 逐字节相同，改一边要同步另一边。
- **绝不入库**：node_modules、dist、offline 包、vendored tools/ffmpeg、日志、.env。
- **凭据**：Windows 凭据管理器；git 用 schannel；hosts 里别留 `127.0.0.1 github.com`。
- **能力边界**：341/341 有静帧、L 系列缺文件、B6 未收录、1080p30 约 6–8 秒机时/秒成片、v1 无 Remotion。
