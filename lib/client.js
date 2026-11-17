/**
 * dsh-fy-code-animation — 浏览器侧面板。
 *
 * 宿主按 `window.__ModuleLoader__.load({ id, factory })` 的约定加载 client bundle
 * （与已装的 task-eta / catppuccin 一致）：没有构建步骤，不 import 任何东西。
 *
 * 关键契约：factory 必须返回一个 **cordis 插件对象**（name / inject / apply）。
 * 宿主把这个导出交给 Loader 的 ctx.plugin() 执行；如果只返回空对象，
 * boot 阶段会抛 `invalid plugin, expect function or object with an "apply" method`
 * 并让整个界面起不来（1.0.1 就是在这里崩的）。所以下面的 exports.apply 是必需的。
 *
 * 交互原则：每个按钮点下去必须立刻有可见反馈（面板底部状态行），
 * 不依赖新标签页——Electron 外壳默认会拦截 window.open / target=_blank。
 *
 * 1.0.3：面板默认收成右下角一个 46px 圆点（不挡内容），点开才是完整面板；
 *        展开状态记在 localStorage，闲置 12 秒自动收起，标题栏有「收起」。
 */

;(function () {
  if (typeof window === 'undefined') return
  if (window.__codeanimClientBooted) return
  window.__codeanimClientBooted = true

  const PICKER_URL = '/code-animation/picker'
  const OPEN_KEY = 'codeanim.panel.open'
  const IDLE_MS = 12000

  const CSS = `
  #codeanim-panel{box-sizing:border-box;position:fixed;right:16px;bottom:16px;z-index:2147483000;width:248px;
    font:12px/1.5 "Microsoft YaHei",system-ui,sans-serif;color:#e9e6df;pointer-events:auto;
    background:rgba(16,18,24,.94);border:1px solid rgba(255,255,255,.14);border-radius:12px;
    box-shadow:0 10px 32px rgba(0,0,0,.45);backdrop-filter:blur(10px);overflow:hidden;
    transition:opacity .15s ease, width .16s ease, height .16s ease, border-radius .16s ease}
  #codeanim-panel .ca-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.08)}
  #codeanim-panel .ca-title{font-weight:600;letter-spacing:.08em;flex:1}
  #codeanim-panel .ca-dot{width:7px;height:7px;border-radius:50%;background:#8a8f9c;box-shadow:0 0 8px rgba(0,0,0,0);transition:width .16s ease,height .16s ease}
  #codeanim-panel.on .ca-dot{background:#5fd18a;box-shadow:0 0 10px rgba(95,209,138,.8)}
  #codeanim-panel .ca-body{padding:10px 12px 12px}
  #codeanim-panel .ca-row{display:flex;justify-content:space-between;gap:8px;margin-bottom:6px;color:#9aa1b1}
  #codeanim-panel .ca-row b{color:#e9e6df;font-weight:500}
  #codeanim-panel .ca-btn{display:inline-block;margin-top:8px;padding:5px 9px;border-radius:7px;cursor:pointer;
    border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);color:#e9e6df;text-decoration:none;
    user-select:none}
  #codeanim-panel .ca-btn:hover{background:rgba(255,255,255,.11)}
  #codeanim-panel .ca-btn:active{transform:translateY(1px)}
  #codeanim-panel .ca-switch{position:relative;width:38px;height:20px;border-radius:999px;
    background:rgba(255,255,255,.14);cursor:pointer;flex:none;transition:background .15s}
  #codeanim-panel .ca-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;
    background:#fff;transition:transform .15s}
  #codeanim-panel.on .ca-switch{background:#3f9d68}
  #codeanim-panel.on .ca-switch::after{transform:translateX(18px)}
  #codeanim-panel .ca-fold{flex:none;width:20px;height:20px;line-height:18px;text-align:center;border-radius:6px;
    color:#9aa1b1;cursor:pointer;border:1px solid rgba(255,255,255,.14)}
  #codeanim-panel .ca-fold:hover{color:#e9e6df;background:rgba(255,255,255,.1)}
  #codeanim-panel .ca-hint{color:#767d8d;margin-top:8px;font-size:11px;min-height:16px}

  /* 收起态：只剩一个 46px 圆点，不再占右下角一大块 */
  #codeanim-panel.collapsed{width:46px;height:46px;border-radius:50%;cursor:pointer}
  #codeanim-panel.collapsed .ca-head{padding:0;height:46px;width:46px;justify-content:center;border-bottom:0;position:relative}
  #codeanim-panel.collapsed .ca-title,
  #codeanim-panel.collapsed .ca-switch,
  #codeanim-panel.collapsed .ca-fold,
  #codeanim-panel.collapsed .ca-body{display:none}
  #codeanim-panel .ca-fab{display:none}
  #codeanim-panel.collapsed .ca-fab{display:block;font-size:15px;line-height:1;color:#d7dbe4}
  #codeanim-panel.collapsed .ca-dot{position:absolute;top:7px;right:7px;width:9px;height:9px;box-shadow:none}
  #codeanim-panel.collapsed:hover{border-color:rgba(255,255,255,.34);background:rgba(22,25,34,.98)}

  #codeanim-modal{position:fixed;inset:0;z-index:2147483100;display:none;align-items:center;justify-content:center;
    background:rgba(6,8,12,.55);backdrop-filter:blur(3px)}
  #codeanim-modal.open{display:flex}
  #codeanim-modal .ca-modal-box{width:min(1200px,92vw);height:min(820px,88vh);display:flex;flex-direction:column;
    background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.5)}
  #codeanim-modal .ca-modal-head{display:flex;align-items:center;gap:10px;padding:10px 14px;
    background:#161922;color:#e9e6df;font:13px/1.4 "Microsoft YaHei",system-ui,sans-serif}
  #codeanim-modal .ca-modal-title{flex:1;font-weight:600;letter-spacing:.04em}
  #codeanim-modal .ca-modal-head .ca-btn{margin-top:0;padding:4px 10px;border-radius:7px;cursor:pointer;
    border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#e9e6df;
    text-decoration:none;user-select:none}
  #codeanim-modal .ca-modal-head .ca-btn:hover{background:rgba(255,255,255,.16)}
  #codeanim-modal iframe{flex:1;width:100%;border:0;background:#fff}
  `

  function el(tag, cls, text) {
    const n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }

  function hhmmss() {
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
  }

  function readOpenPref() {
    try { return window.localStorage.getItem(OPEN_KEY) === '1' } catch { return false }
  }
  function writeOpenPref(open) {
    try { window.localStorage.setItem(OPEN_KEY, open ? '1' : '0') } catch { /* 隐私模式忽略 */ }
  }

  /** 挂载右下角面板。幂等：重复调用不会插第二块。 */
  function mount() {
    if (typeof document === 'undefined') return
    if (document.getElementById('codeanim-panel')) return
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        try { mount() } catch (e) { console.error('[code-animation] panel mount failed: ' + e) }
      })
      return
    }

    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)

    // ---------- 面板 ----------
    const panel = el('div')
    panel.id = 'codeanim-panel'
    panel.title = '代码动画'

    const head = el('div', 'ca-head')
    const dot = el('span', 'ca-dot')
    const fab = el('span', 'ca-fab', '▶')
    const title = el('span', 'ca-title', '代码动画')
    const sw = el('span', 'ca-switch')
    sw.title = '开 / 关动画模式'
    const fold = el('span', 'ca-fold', '–')
    fold.title = '收起成小圆点（不挡页面）'
    head.append(dot, fab, title, sw, fold)

    const body = el('div', 'ca-body')
    const rowState = el('div', 'ca-row')
    rowState.append(el('span', null, '状态'), el('b', null, '读取中…'))
    const rowDeps = el('div', 'ca-row')
    rowDeps.append(el('span', null, '依赖'), el('b', null, '…'))
    const rowStyles = el('div', 'ca-row')
    rowStyles.append(el('span', null, '画风库'), el('b', null, '…'))
    const rowOut = el('div', 'ca-row')
    rowOut.append(el('span', null, '成片'), el('b', null, '无'))

    const actions = el('div')
    const pickerBtn = el('span', 'ca-btn', '画风库')
    pickerBtn.title = '在面板内打开 341 条风格挑选器'
    const refresh = el('span', 'ca-btn', '刷新')
    refresh.title = '重新读取插件状态'
    actions.append(pickerBtn, document.createTextNode(' '), refresh)

    const hint = el('div', 'ca-hint', '开关打开后，直接说“做一条 12 秒的动画”。')
    const feedback = el('div', 'ca-hint', '')
    body.append(rowState, rowDeps, rowStyles, rowOut, actions, hint, feedback)
    panel.append(head, body)
    document.body.appendChild(panel)

    // ---------- 展开 / 收起 ----------
    let idleTimer = null
    let expanded = readOpenPref()

    function scheduleIdle() {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        if (expanded && !modal.classList.contains('open')) setExpanded(false)
      }, IDLE_MS)
    }
    function setExpanded(open, persist) {
      expanded = !!open
      panel.classList.toggle('collapsed', !expanded)
      try { panel.classList.toggle('collapsed', !expanded) } catch { /* ignore */ }
      if (persist !== false) writeOpenPref(expanded)
      if (expanded) {
        scheduleIdle()
        load(false)
      } else if (idleTimer) {
        clearTimeout(idleTimer)
        idleTimer = null
      }
    }
    function bumpActivity() {
      if (expanded) scheduleIdle()
    }

    panel.addEventListener('click', (e) => {
      // 收起态整块点开；展开态点空白处不做事
      if (!expanded) {
        e.stopPropagation()
        setExpanded(true)
      }
      bumpActivity()
    })
    fold.addEventListener('click', (e) => {
      e.stopPropagation()
      setExpanded(false)
      feedback.textContent = ''
    })
    panel.addEventListener('pointermove', bumpActivity)
    panel.addEventListener('pointerdown', bumpActivity)

    // ---------- 画风库弹层 ----------
    const modal = el('div')
    modal.id = 'codeanim-modal'
    const box = el('div', 'ca-modal-box')
    const mHead = el('div', 'ca-modal-head')
    const mTitle = el('span', 'ca-modal-title', '画风库 · 341 条风格')
    const mOpen = el('a', 'ca-btn', '新标签打开')
    mOpen.href = PICKER_URL
    mOpen.target = '_blank'
    mOpen.rel = 'noreferrer'
    const mClose = el('span', 'ca-btn', '关闭')
    mHead.append(mTitle, mOpen, mClose)
    const frame = document.createElement('iframe')
    frame.setAttribute('title', '画风库挑选器')
    box.append(mHead, frame)
    modal.append(box)
    document.body.appendChild(modal)

    let frameTimer = null
    function openPicker() {
      feedback.textContent = '正在打开画风库…'
      frame.src = PICKER_URL + '?embed=1&t=' + Date.now()
      modal.classList.add('open')
      if (frameTimer) clearTimeout(frameTimer)
      frameTimer = setTimeout(() => {
        let ok = false
        try { ok = !!frame.contentDocument && !!frame.contentDocument.querySelector('script#data') } catch { ok = false }
        feedback.textContent = ok ? '画风库已载入（' + hhmmss() + '）' : '画风库没载入：点“新标签打开”试试'
      }, 1200)
    }
    function closePicker() {
      modal.classList.remove('open')
      frame.src = 'about:blank'
      bumpActivity()
    }
    mClose.addEventListener('click', closePicker)
    modal.addEventListener('click', (e) => { if (e.target === modal) closePicker() })
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) closePicker()
    })

    // ---------- 数据 ----------
    let busy = false
    let current = { enabled: false, ready: false, styleCount: 0, lastOutput: null }

    function render(s) {
      current = s
      panel.classList.toggle('on', !!s.enabled)
      rowState.lastChild.textContent = s.enabled ? '动画模式已开启' : '动画模式关闭'
      rowDeps.lastChild.textContent = s.ready ? '就绪' : '未就绪'
      rowStyles.lastChild.textContent = (s.styleCount || 0) + ' 条'
      rowOut.lastChild.textContent = s.lastOutput ? String(s.lastOutput).split(/[\\/]/).pop() : '无'
      hint.textContent = s.ready
        ? '可以直接建项目、渲染。'
        : '依赖未就绪：安装时会在后台装，也可手动跑 codeanim_setup。'
      panel.title = '代码动画 · ' + (s.enabled ? '已开启' : '已关闭') + (s.ready ? '' : ' · 依赖未就绪')
    }

    async function load(report) {
      if (report) feedback.textContent = '刷新中…'
      try {
        const r = await fetch('/code-animation/state', { cache: 'no-store' })
        if (!r.ok) throw new Error('HTTP ' + r.status)
        render(await r.json())
        if (report) feedback.textContent = '已刷新 ' + hhmmss()
      } catch (e) {
        rowState.lastChild.textContent = '插件未就绪'
        if (report) feedback.textContent = '刷新失败：' + (e && e.message ? e.message : '网络错误')
      }
    }

    async function toggle() {
      if (busy) return
      const want = !panel.classList.contains('on')
      busy = true
      feedback.textContent = want ? '正在开启…' : '正在关闭…'
      try {
        const r = await fetch('/code-animation/toggle', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: want }),
        })
        if (!r.ok) throw new Error('HTTP ' + r.status)
        render(await r.json())
        feedback.textContent = (want ? '已开启' : '已关闭') + ' ' + hhmmss()
      } catch (e) {
        feedback.textContent = '切换失败：' + (e && e.message ? e.message : '网络错误')
      }
      busy = false
      load(false)
    }

    sw.addEventListener('click', (e) => { e.stopPropagation(); toggle() })
    title.addEventListener('click', (e) => { e.stopPropagation(); toggle() })
    refresh.addEventListener('click', (e) => { e.stopPropagation(); load(true) })
    pickerBtn.addEventListener('click', (e) => { e.stopPropagation(); openPicker() })

    setExpanded(readOpenPref(), false)
    load(false)
    setInterval(() => load(false), 4000)
  }

  /** 造一个合法的 cordis 插件对象：Loader 会拿它去 ctx.plugin()。 */
  function createPlugin() {
    const module = { exports: {} }
    const exports = module.exports
    exports.name = 'code-animation-panel'
    exports.inject = []
    exports.apply = function apply() {
      try {
        mount()
      } catch (e) {
        // 面板挂了也不能连累宿主 boot：这里只记录。
        console.error('[code-animation] panel apply failed: ' + (e && e.message ? e.message : e))
      }
    }
    return module.exports
  }

  if (window.__ModuleLoader__ && typeof window.__ModuleLoader__.load === 'function') {
    window.__ModuleLoader__.load({ id: 'dsh-fy-code-animation', factory: createPlugin })
  } else {
    // 没有模块加载器时（例如直接开 html 调试）直接挂载。
    createPlugin().apply()
  }
})()
