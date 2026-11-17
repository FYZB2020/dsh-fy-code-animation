# dsh-fy-code-animation

**开关一开，用代码把中文文案做成连贯的动画视频。**

DeepSeek Harness 插件。你只管文案和审美判断，剩下的交给助手：它写 HTML/Canvas 分镜、逐帧截图、编码成 MP4。**不需要显卡**，不按张收费，每一帧都是你自己机器上的 `renderAt(t)`。

[English →](./README.md)

---

## 一、这套东西是给谁用的

- 你要做 **30–90 秒的竖屏/横屏短片**：产品介绍、课程预告、数据解读、活动预告、知识口播的字幕版背景。
- 你**不想再拖时间轴**：分镜、关键帧、缓动曲线，交给代码 + 助手更省事，也更好改。
- 你要的是**有审美的动效**，不是 AI 糊图：画风库是 341 条人工整理过的完整提示词，其中 196 条配参考静帧，选之前能先看图。
- 你的机器很普通。这里 **不需要 8GB 显存**——渲染是 CPU + 无头浏览器；Chromium 下不动会自动改用你系统里的 Edge。
- 你希望成品**能被人接手**：每个项目就是 `index.html` + `task.json` + `notes.md` 三件套，可以 `git diff`，可以交给另一个助手继续改。

一句话：**它是「代码动画」的工具链，不是替你想内容的黑盒。**

## 二、装完你能得到什么

| 组成部分 | 内容 |
| --- | --- |
| **两套技能** | `fy-code-animation`（10 步创作顺序、任务卡契约、四档交付）＋ `code-animation-prompts`（341 画风库 + 渲染契约） |
| **六个工具** | `codeanim_status` `codeanim_switch` `codeanim_setup` `codeanim_style` `codeanim_new` `codeanim_render` |
| **341 条画风** | 10 个系列，196 条带参考静帧；附带离线挑选器（`风格挑选.html`），断网也能挑 |
| **一键依赖装配** | Python 3.10+ 探测 → venv → Playwright + imageio-ffmpeg → Chromium（失败自动退 Edge）→ FFmpeg。幂等、有日志、支持离线包 |
| **右下角面板** | 开关、依赖状态、画风条数、最近成片，每 4 秒刷新 |
| **可复现的渲染** | `<canvas>` + `window.renderAt(t)`，Playwright 逐帧截图，FFmpeg 以 `libx264 + yuv420p + crf18 + faststart` 编码 |

## 三、安装（三步）

### 第 1 步：装插件

在 DeepSeek Harness 里：

```
plugin_manager install_bundle target="dsh-fy-code-animation"
```

也可以在插件市场里点安装，或从本地目录装：

```bash
dsh plugin add "N:\path\to\dsh-fy-code-animation"
```

装完**必须重启一次 DSH**，`codeanim_*` 六个工具才会出现在工具表里。

### 第 2 步：装渲染依赖（每台机器一次）

对助手说「跑一下 codeanim_setup」，或先点一下右下角面板的开关。它会在 `~/.dsh/code-animation/` 下准备好：

```
env/            独立 venv（playwright + imageio-ffmpeg）
tools/ffmpeg/   自带 ffmpeg
style-library/  341 条画风 + 196 张静帧
projects/       你的项目
output/         成片
logs/           setup.log / render.log
```

需要什么、多大：

| 需要 | 体积 | 说明 |
| --- | --- | --- |
| Python 3.10+ | 多数机器已有 | 依次探测 `CODEANIM_PYTHON` → `py -3.12/3.11/3.10` → `python3` → `python` |
| Playwright + Chromium | ≈ 40 MB + 436 MB | 下载失败**不致命**，自动用本机 Edge |
| FFmpeg | ≈ 80 MB | 从 `imageio-ffmpeg` 取一份，不写系统 PATH |

逐步细节、镜像、完全断网装法：[docs/依赖.md](./docs/依赖.md)。

### 第 3 步：打开开关

说「开启动画模式」，或点右下角圆点，或调用 `codeanim_switch({ action: "on" })`。
关闭状态下技能照样能读，但**建项目/装依赖/渲染会被拒绝**——这是故意的，免得半配好的机器悄悄吐出坏片。

## 四、五分钟出第一条

```
codeanim_status                                  # 五步依赖 + 画风条数
codeanim_switch { action: "on" }
codeanim_style  { action: "search", query: "水墨" }
codeanim_style  { action: "show", id: "Z1" }     # 先把整条提示词读完再动手
codeanim_new    { name: "第一条", copy: "<150–300 字文案>", style: "Z1", duration: 12 }
# 打开 projects/<项目>/index.html，把骨架改成真正的分镜
codeanim_render { project: "projects/<项目>", duration: 12 }
```

成片在 `~/.dsh/code-animation/output/`；**同名绝不覆盖**，自动加 `-YYYYMMDD-HHmmss`。

## 五、渲染契约（要自己写页面就必须遵守）

交给 `codeanim_render` 的 HTML 必须暴露：

```js
window.renderAt = (t) => { /* 同步画出第 t 秒那一帧 */ }
```

- `t` 是秒，`0 <= t < duration`；同一个 `t` 必须永远画出同一帧。
- 带 `?export=1` 时页面**不许自己播**——时间由渲染器驱动。
- 别用 CSS 动画、`requestAnimationFrame` 自动播放、随机种子，那会直接破坏逐帧一致性。

## 六、工具参数

| 工具 | 参数 | 说明 |
| --- | --- | --- |
| `codeanim_status` | — | 开关、五步依赖、画风条数、最近项目/成片 |
| `codeanim_switch` | `action: on/off/toggle` | 关闭＝技能只读 |
| `codeanim_setup` | `steps?: ["python","venv","pip","chromium","ffmpeg","verify"]` | 幂等，`setup.log` 记耗时与失败原因 |
| `codeanim_style` | `action: search/show/list/open_picker`、`query`、`id`、`series`、`limit` | 纯 JS 检索，不依赖 Python |
| `codeanim_new` | `name`、`copy`、`style?`、`duration?`、`width?`、`height?`、`fps?` | 切场景、算时间线，写 `task.json` 并**当场用 fy 的 `validate_task.py` 校验** |
| `codeanim_render` | `project?`、`output?`、`name?`、`duration?`、`width?`、`height?`、`fps?`、`audio?` | 渲染后回读 ffmpeg 元数据，不靠「进程退出 0」判断成功 |

系列分布：`AG` 代码样片 26 · `M` 动态 40 · `K` 卡通 38 · `Z` 中国风 15 · `H` 版式 12 · `L` Lemo 59 · `V` mg-styles 15 · `X` code-video 31 · `R` 参照 7 · `O` 奥斯卡 98。
画风库与预览怎么用：[docs/STYLE-LIBRARY.zh.md](./docs/STYLE-LIBRARY.zh.md)。

## 七、速度与已知限制（实测，不吹）

- 1080p30 大约 **每 1 秒成片耗 6–8 秒机时**（12 秒片 ≈ 73 秒）。4K 或 60fps 线性变慢。
- 341 条里有 **145 条没有静帧**，只有文字；`codeanim_style show` 会明确告诉你 `imageExists:false`。
- 内置**不做**配音/配乐；`codeanim_render` 的 `audio` 可以贴一条现成音轨（`apad` 只补静音，不循环）。
- v1 不启用 Remotion 分支，统一走 HTML/Canvas + `render_video.py`。
- 画风库与两套技能是第三方作品：免费使用与分享，**禁止**包装成付费课程或付费 skill 出售。见 `style-library/第三方许可/`。

## 八、搬到另一台电脑

```bash
node scripts/pack.mjs --out N:\deliver          # → 便携包 ≈15.6 MB
node scripts/build-offline-pack.mjs --zip       # → 离线依赖 ≈330–500 MB
```

详见 [docs/移植.md](./docs/移植.md)。

## 九、遇到问题

| 现象 | 处理 |
| --- | --- |
| 面板没出现 | 按一次 **Ctrl+R**；改过 `lib/client.js` 之后必须刷新 |
| 启用后 DSH 起不来 | `node scripts/toggle-profile.mjs --profile desktop --off`，然后重启 DSH |
| Chromium 下载卡住 | 不用管，会自动用本机 Edge；或 `codeanim_setup({ steps: ["chromium"] })` |
| pip 装不上 | `codeanim_setup({ steps: ["pip"] })`（PyPI 失败切清华镜像） |
| 想彻底静音 | 在 `~/.dsh/code-animation/` 建一个空的 `DISABLE` 文件 |
| 看日志 | `~/.dsh/code-animation/logs/setup.log`、`render.log`、`plugin.log` |

## 十、兼容性

- DeepSeek Harness `>=0.2.0-rc.1 <0.3.0-0`（写在 `package.json → dsh.compatibility`，在 `0.2.2-rc.3` 上实测通过）。
- Node `>=20`；Windows 10/11（Edge 降级这条是 Windows 专用，Chromium 路径跨平台）。
- 自检命令：`node tests/contract.mjs`（mock 宿主验证 6 工具 / 2 技能 / 4 路由）、`node tests/harness.mjs`（画风库 + 建项目 + 校验全链路）。

## 十一、来源与许可

- 画风库、渲染器、`code-animation-prompts` 技能：[XiaoyeCodes/code-animation-prompts](https://github.com/XiaoyeCodes/code-animation-prompts)
- 方法论、任务卡契约、`fy-code-animation` 技能：[Akillll-DuoHe/fy-code-animation](https://github.com/Akillll-DuoHe/fy-code-animation)
- 第三方画风各自保留原许可（`style-library/第三方许可/`）。

插件代码：MIT。
