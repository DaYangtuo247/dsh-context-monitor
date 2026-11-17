/*! dsh-context-monitor v0.1.0 — built by build.mjs from src/lib/data.js, src/lib/i18n.js, src/styles/00-text.scss, src/parts/01-context-lens.js. Edit src/, not this file. */
;(() => {
const BUNDLE = "dsh-context-monitor"
const parts = []
const part = (m) => { parts.push(m) }
/**
 * Shared helpers for the dsh-claude-* bundles (copied into each built client.js).
 * Every part gets one kit: React and createElement, a body portal, named style sheets, and the
 * settings controls used by every 设置 row of ours (settingsUI: Row, Select, Switch matching dsh's own rows).
 */
function makeKit(require, bundle) {
  const React = require('react')
  let ReactDOM = null
  try { ReactDOM = require('react-dom') } catch {}
  return {
    React,
    h: React.createElement,
    /** Popovers render into <body> so no transformed / contained ancestor can offset position:fixed. */
    portal: (el, target = document.body) => (ReactDOM && typeof ReactDOM.createPortal === 'function' ? ReactDOM.createPortal(el, target) : el),
    /** A lazily inserted <style data-plugin="bundle/name">; ensure() is idempotent, remove() undoes it. */
    sheet(name, css) {
      let tag = null
      return {
        ensure() {
          if (tag && document.head.contains(tag)) return
          tag = document.createElement('style')
          tag.dataset.plugin = `${bundle}/${name}`
          tag.textContent = css
          document.head.appendChild(tag)
        },
        remove() { if (tag) { tag.remove(); tag = null } },
      }
    },
    /** Settings rows and controls (made once per bundle on first use). */
    settingsUI() {
      if (!this._settingsUI) this._settingsUI = makeSettingsUI(this)
      return this._settingsUI
    },
  }
}

/** Row / Select / Switch for 设置 pages, styled like dsh's own preference rows. */
function makeSettingsUI(kit) {
    const { React, h, portal } = kit
    const { useState, useEffect, useRef, useLayoutEffect } = React
    const sheet = kit.sheet('settings-ui', `
  .dcf-row{display:flex;align-items:center;gap:8px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
  .dcf-row .txt{flex:1 1 auto;min-width:0}
  .dcf-row .lbl{font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}
  .dcf-row .desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
  .dap-sel{display:inline-flex;align-items:center;gap:12px;flex:none;height:36px;max-width:260px;padding:0 14px;border:0;border-radius:var(--dsw-radius-md,12px);
    background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;cursor:pointer;white-space:nowrap}
  .dap-sel:hover,.dap-sel[aria-expanded=true]{background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,var(--dsw-alias-bg-module-platform))}
  .dap-sel .v{overflow:hidden;text-overflow:ellipsis}
  .dap-sel svg{flex:none;width:14px;height:14px;color:var(--dsw-alias-label-secondary)}
  .dap-menu{box-sizing:border-box;position:fixed;z-index:1100;min-width:180px;max-height:min(360px,calc(100vh - 24px));overflow:auto;padding:6px;border-radius:var(--dsw-radius-lg,14px);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2));backdrop-filter:var(--dsw-menu-backdrop-filter);-webkit-backdrop-filter:var(--dsw-menu-backdrop-filter);box-shadow:var(--dsw-elevation-prominent,0 8px 28px rgba(0,0,0,.18));color:var(--dsw-alias-label-primary);font-size:13.5px;line-height:20px;animation:dap-in .14s cubic-bezier(.2,.8,.2,1) both}
  @keyframes dap-in{from{opacity:0;transform:translateY(-3px)}}
  .dap-menu button{display:flex;align-items:center;gap:10px;width:100%;min-height:32px;padding:6px 10px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;white-space:nowrap}
  .dap-menu button:hover,.dap-menu button.kbd{background:var(--dsw-alias-interactive-bg-hover)}
  .dap-menu button .l{flex:1 1 auto}
  .dap-menu button svg{flex:none;width:15px;height:15px}
  .dsu-switch{position:relative;flex:none;width:36px;height:22px;padding:0;border:0;border-radius:11px;background:var(--dsw-alias-bg-module-platform);cursor:pointer;transition:background-color .18s ease}
  .dsu-switch::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;corner-shape:round;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s cubic-bezier(.2,.8,.2,1)}
  .dsu-switch[aria-checked=true]{background:var(--dsw-alias-state-business-primary,#4d6bfe)}
  .dsu-switch[aria-checked=true]::after{transform:translateX(14px)}
  @media (prefers-reduced-motion: reduce){.dsu-switch,.dsu-switch::after{transition:none}}
  `)
    const zhUI = () => !/^en/i.test(document.documentElement.lang || '')
    const L = (o) => (zhUI() ? o.zh : o.en)
    const S = (z, e) => (zhUI() ? z : e)
    const sw = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }
    const chev = () => h('svg', { viewBox: '0 0 16 16', 'aria-hidden': true }, h('path', { d: 'M4.5 6.5 8 10l3.5-3.5', ...sw }))
    const check = () => h('svg', { viewBox: '0 0 16 16', 'aria-hidden': true }, h('path', { d: 'M3.5 8.4 6.6 11.4 12.5 4.8', ...sw, strokeWidth: 1.7 }))

    // ------------------------------------------------------------------ controls
    function Select({ value, options, onChange, box, label }) {
      const [open, setOpen] = useState(false)
      const [pos, setPos] = useState(null)
      const btn = useRef(null)
      const menu = useRef(null)
      const cur = options.find((o) => o.v === value) || options[0]
      useLayoutEffect(() => {
        if (!open) return
        const r = btn.current.getBoundingClientRect()
        const w = Math.max(r.width, 200)
        const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))
        const below = window.innerHeight - r.bottom
        setPos(below > 220 ? { left, top: r.bottom + 4, width: w } : { left, bottom: window.innerHeight - r.top + 4, width: w })
      }, [open])
      useEffect(() => {
        if (!open) return undefined
        const down = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false) }
        const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus() } }
        const scroll = (e) => { if (!menu.current?.contains(e.target)) setOpen(false) }
        document.addEventListener('mousedown', down, true)
        document.addEventListener('keydown', key, true)
        document.addEventListener('scroll', scroll, true)
        return () => { document.removeEventListener('mousedown', down, true); document.removeEventListener('keydown', key, true); document.removeEventListener('scroll', scroll, true) }
      }, [open])
      return h(React.Fragment, null,
        h('button', { ref: btn, type: 'button', className: `dap-sel${box ? ' box' : ''}`, 'aria-haspopup': 'listbox', 'aria-expanded': open, 'aria-label': label, onClick: () => setOpen((v) => !v) },
          h('span', { className: 'v' }, cur.label || L(cur)), chev()),
        open && pos ? portal(h('div', { ref: menu, className: 'dap-menu', role: 'listbox', style: { left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width } },
          options.map((o) => h('button', {
            key: String(o.v), type: 'button', role: 'option', 'aria-selected': o.v === value,
            onClick: () => { setOpen(false); onChange(o.v); btn.current?.focus() },
          }, h('span', { className: 'l', style: o.font ? { fontFamily: o.font } : undefined }, o.label || L(o)), o.v === value ? check() : null)))) : null)
    }

    function Row({ label, desc, children }) {
      return h('div', { className: 'dcf-row' },
        h('div', { className: 'txt' }, h('div', { className: 'lbl' }, label), desc ? h('div', { className: 'desc' }, desc) : null),
        children)
    }
    function Switch({ checked, onChange, label }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsu-switch', 'aria-checked': !!checked, 'aria-label': label, onClick: () => onChange(!checked) })
    }
    return { sheet, Row, Select, Switch, L, S }
}

/**
 * One feature registry per bundle (kit.js is copied into each client.js, so this singleton is
 * bundle-local): a bundle's settings surfaces list and flip only its own features, never another
 * plugin's. Each part declares itself with `feature:` metadata; gateFeature() below starts/stops
 * the part live. Choices persist in one localStorage key (feature ids are unique across bundles);
 * absent means on.
 */
let featureStoreInstance
function featureStore() {
  if (featureStoreInstance) return featureStoreInstance
  const KEY = 'dsh-claude-features.enabled'
  let enabled = {}
  try { enabled = JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch {}
  let rev = 0
  const meta = []
  const subs = new Set()
  const store = {
    declare(bundle, id, f) { if (f && !meta.some((m) => m.id === id)) meta.push({ bundle, id, ...f }) },
    list: () => meta.slice(),
    enabled: (id) => enabled[id] !== false,
    revision: () => rev,
    set(id, on) {
      enabled = { ...enabled, [id]: !!on }
      try { localStorage.setItem(KEY, JSON.stringify(enabled)) } catch {}
      rev++
      for (const fn of subs) fn(id)
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn) },
  }
  featureStoreInstance = store
  return store
}

/**
 * Run one feature part in its own cordis fiber so the settings tab can dispose and restart it.
 * Infrastructure parts (no `feature:`) stay on the plain synchronous path: dom-hub must be up
 * before anything subscribes to kit.dom. Fibers activate in declaration order (microtasks), so
 * parts that read each other's setup still see it.
 */
function gateFeature(ctx, store, mod) {
  let fiber = null
  let slotDisposers = []
  // slots.inject ties its effect to the slots service's own fiber, not ours, so a disposed feature
  // would leave its contribution mounted; collect the returned disposers and run them on stop.
  const slots = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'inject') return (key, cb) => { const d = ctx.slots.inject(key, cb); slotDisposers.push(d); return d }
      const v = ctx.slots[prop]
      return typeof v === 'function' ? v.bind(ctx.slots) : v
    },
  })
  const scope = ctx.extend({ slots })
  const start = () => {
    if (fiber || !store.enabled(mod.id)) return
    fiber = scope.plugin({ name: mod.id, inject: mod.inject, apply: (s) => mod.apply(s) })
  }
  const stop = () => {
    const f = fiber
    fiber = null
    for (const d of slotDisposers.splice(0)) { try { d() } catch {} }
    if (f) Promise.resolve(f.dispose()).catch(() => {})
  }
  start()
  const off = store.subscribe((id) => { if (id === mod.id) (store.enabled(mod.id) ? start() : stop()) })
  ctx.effect(() => () => { off(); stop() }, `feature: ${mod.id}`)
}

// ===== src/lib/data.js
"use strict";
// ------------------------------------------------------------------ data
const CATS = ['system', 'systemTools', 'mcpTools', 'skills', 'memory', 'injected', 'summary', 'user', 'assistantText', 'reasoning', 'toolCalls', 'toolResults', 'other'];
const CAT_COLOR = {
    system: '#8E99AB',
    systemTools: '#4E79A7',
    mcpTools: '#A0CBE8',
    skills: '#EDC948',
    memory: '#B6992D',
    injected: '#B07AA1',
    summary: '#9C755F',
    user: '#59A14F',
    assistantText: '#F28E2B',
    reasoning: '#FF9DA7',
    toolCalls: '#E15759',
    toolResults: '#499894',
    other: '#BAB0AC',
};
const GROUPS = [
    { key: 'system', color: '#8E99AB', cats: ['system'] },
    { key: 'systemTools', color: '#4E79A7', cats: ['systemTools'] },
    { key: 'mcpTools', color: '#A0CBE8', cats: ['mcpTools'] },
    { key: 'skills', color: '#EDC948', cats: ['skills'] },
    { key: 'memory', color: '#B6992D', cats: ['memory'] },
    { key: 'messages', color: '#9D7BD8', cats: ['user', 'assistantText', 'reasoning', 'toolCalls', 'toolResults', 'injected', 'summary', 'other'] },
];
function fmt(text, params) {
    return String(text).replace(/\{(\w+)\}/g, (_, k) => (params && params[k] !== undefined ? String(params[k]) : `{${k}}`));
}
function fmtK(n) {
    if (typeof n !== 'number' || !Number.isFinite(n))
        return '—';
    const a = Math.abs(n);
    if (a < 1000)
        return String(Math.round(n));
    if (a < 1e6)
        return `${(n / 1000).toFixed(a < 10000 ? 2 : 1).replace(/\.?0+$/, '')}k`;
    return `${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
}
function fmtInt(n) {
    return typeof n === 'number' && Number.isFinite(n) ? Math.round(n).toLocaleString() : '—';
}
function pct(part, whole, digits = 1) {
    if (!whole || !Number.isFinite(part))
        return '—';
    return `${(part / whole * 100).toFixed(digits)}%`;
}
function fmtTime(t) {
    if (!t)
        return '';
    const d = new Date(t);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
async function call(route, body) {
    const res = await fetch(`api/context-lens/${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body || {}),
    });
    if (!res.ok)
        throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (!payload || payload.ok !== true)
        throw new Error(payload?.error?.message || 'request failed');
    return payload.value;
}
/** Category totals plus the derived buffer / free figures for one breakdown. */
function summarize(data) {
    const byCat = {};
    for (const c of data?.categories || [])
        byCat[c.key] = c;
    const used = data?.measured?.totalTokens ?? 0;
    const win = data?.contextWindow ?? 0;
    const comp = data?.compaction;
    const buffer = comp && comp.auto && typeof comp.bufferTokens === 'number' ? comp.bufferTokens : 0;
    const free = win ? Math.max(0, win - used - buffer) : 0;
    const groups = GROUPS.map((g) => ({
        ...g,
        tokens: g.cats.reduce((s, k) => s + (byCat[k]?.tokens || 0), 0),
    }));
    return { byCat, used, win, buffer, free, groups, comp };
}

// ===== src/lib/i18n.js
"use strict";
/*!
 * Dictionaries for the context-lens strings.
 *
 * NS is the locale namespace registered in apply(); KIND is the slot id / view kind the tab uses
 * (both keep the historical `context-lens` name, so saved tabs and preferences carry over).
 */
const NS = 'context-lens';
const KIND = 'context-lens';
// ------------------------------------------------------------------ i18n
const zh = {
    'button.title': '上下文用量：{used} / {window}（点击查看明细）',
    'button.unknown': '上下文用量',
    'pop.title': '上下文',
    'pop.used': '已用',
    'pop.autoAt': '自动压缩阈值 {t}',
    'pop.autoOff': '自动压缩已关闭',
    'pop.noCompaction': '未检测到压缩插件',
    'pop.until': '距离自动压缩还有 {t}',
    'pop.over': '已超过自动压缩阈值',
    'pop.deferredName': '{name}（延迟）',
    'pop.deferredTip': '{n} 个按需加载的工具，尚未进入上下文；数值是全部加载后的估算',
    'ov.cat.memory': '{n} 个记忆文件（AGENTS.md / CLAUDE.md）',
    'pop.open': '查看上下文透视',
    'pop.empty': '这个会话还没有发出请求，暂无上下文数据。',
    'pop.src.meter-usage': '按实际用量校准',
    'pop.src.last-request': '按上次请求实际用量推算',
    'pop.src.estimate': '估算值（尚无实际用量）',
    'pop.raw': '压缩前约 {t}',
    'pop.autoAtBili': 'billion-context 提示阈值 {t}',
    'pop.untilShort': '距压缩 {t}',
    'pop.overShort': '已超压缩阈值',
    'pop.srcShort.meter-usage': '按实际用量',
    'pop.srcShort.last-request': '按上次请求推算',
    'pop.srcShort.estimate': '估算',
    'ov.engine': '压缩引擎',
    'ov.emergency': '紧急截断阈值',
    'ov.biliNote': 'billion-context 接管了压缩：请求发出前在代理层折叠历史；用量超过提示阈值时提醒模型主动压缩，超过紧急阈值时截断超大工具输出。',
    'ov.biliDefaults': '插件配置里没有自定义值，这里显示默认的 75% / 95%。',
    'ov.usedSource': '“已用”的来源',
    'ov.rawTotal': '原始上下文估算（压缩前）',
    'ov.saved': '请求时节省',
    'ov.lastReq': '上次请求（#{seq}，{time}）实际用量',
    'ov.calNote': '各分类按字符启发式估算后，统一乘以校准系数，使合计等于“已用”。请求时压缩（例如 billion-context 折叠工具结果）会让真实分布偏离这个比例。',
    loading: '正在读取…',
    failed: '读取失败：{msg}',
    retry: '重试',
    refresh: '刷新',
    auto: '自动刷新',
    expand: '展开侧栏',
    'tab.title': '上下文透视',
    'nav.overview': '概览',
    'flow.n.sessionStart': '会话开始',
    'flow.n.userPrompt': '用户输入',
    'flow.n.turnStart': '回合开始',
    'flow.n.stepStart': '模型请求',
    'flow.n.assistant': '模型输出',
    'flow.n.toolCall': '工具调用',
    'flow.n.toolExec': '[工具执行]',
    'flow.n.toolResult': '工具结果',
    'flow.n.subagent': '子智能体',
    'flow.n.todo': '待办更新',
    'flow.n.stepEnd': '步骤结束',
    'flow.n.turnEnd': '回合结束',
    'flow.n.compaction': '上下文压缩',
    'flow.n.goal': '目标 Goal',
    'flow.n.goalRound': '目标回合',
    'flow.n.inbox': '排队输入',
    'flow.n.context': '上下文注入',
    'flow.n.approval': '权限审批',
    'flow.n.modelSwitch': '模型 / 预设切换',
    'flow.n.plan': '计划模式',
    'flow.n.schedule': '定时任务',
    'flow.n.title': '会话标题',
    'flow.n.deliverables': '交付物',
    'flow.n.workspace': '工作区变更',
    'flow.d.sessionStart': '权限预设、沙箱、审批策略等会话初始化事件',
    'flow.d.userPrompt': '你发送的消息（以及定时任务触发的消息）',
    'flow.d.turnStart': '一个回合开始',
    'flow.d.stepStart': '一次模型请求开始（第 N 步）',
    'flow.d.assistant': '模型返回：思考、回复文字与工具调用',
    'flow.d.toolCall': '模型请求调用一个工具',
    'flow.d.toolExec': '在后台作业里执行的工具（bash 等），按作业计数；其他工具在调用时直接执行，不经过这里',
    'flow.d.toolResult': '工具执行结果回到上下文（含错误）',
    'flow.d.subagent': '调用子智能体及其结果',
    'flow.d.todo': '待办列表更新',
    'flow.d.stepEnd': '一步结束，若还有工具调用则回到模型请求',
    'flow.d.turnEnd': '回合结束：完成、中断或出错',
    'flow.d.compaction': '上下文压缩开始/结束/摘要',
    'flow.d.goal': '设置 / 编辑 / 暂停 / 完成目标',
    'flow.d.goalRound': '目标驱动自动开启的新一轮',
    'flow.d.inbox': '回合运行中追加的输入（插到下一步或下一回合）；空闲时发送的消息算作用户输入',
    'flow.d.context': '系统提示、运行时上下文、技能目录、时间等注入',
    'flow.d.approval': '工具调用等待你批准与审批结果',
    'flow.d.modelSwitch': '切换模型或智能体预设',
    'flow.d.plan': '进入或退出计划模式',
    'flow.d.schedule': '定时任务变更',
    'flow.d.title': '会话标题生成',
    'flow.d.deliverables': '展示给你的交付物',
    'flow.d.workspace': '本回合的工作区文件变更',
    'nav.flow': '执行流程',
    'live.on': '实时更新',
    'live.updated': '上次数据变化：{time}',
    'part.text': '文本',
    'part.reasoning': '思考',
    'part.tool-call': '工具调用',
    'part.image': '图片',
    'part.file': '文件',
    'ui.copy': '复制',
    'ui.copied': '已复制',
    'ui.footnotes': '脚注',
    'ui.copyValue': '复制值',
    'ui.copyJson': '复制 JSON',
    'ui.copyPath': '复制路径',
    'ui.copyPretty': '复制格式化 JSON',
    'ui.copyCompact': '复制紧凑 JSON',
    'ui.copyFailed': '复制失败',
    'ui.collapse': '折叠',
    'ui.expand': '展开',
    'ui.copyHint': '{action}',
    'ui.mode.md': '渲染',
    'ui.mode.json': 'JSON',
    'ui.mode.code': '输出',
    'ui.mode.raw': '原文',
    'ui.expandAll': '展开全部',
    'ui.collapseAll': '收起',
    'ui.chars': '字符',
    'ui.spilled': '输出过长：模型只看到首尾两段（中间是 [...]），完整内容在 {path}',
    'src.memory': '记忆文件 · AGENTS.md / CLAUDE.md',
    'ft.title': '文件结构',
    'ft.hint': 'dsh 为这个会话读取的文件和目录，状态是现在磁盘上的情况；点文件在右侧栏预览（用 dsh 自带的预览渲染）',
    'ft.preview': '在右侧栏预览',
    'ft.previewShort': '预览',
    'ft.jump': '在消息中查看 #{seq}',
    'ft.noSidebar': '右侧栏没有启用，不能预览文件',
    'ft.noViewer': '没有能打开这类文件的预览',
    'ft.openFailed': '打开文件预览失败',
    'ft.loaded': '已加载', 'ft.exists': '存在', 'ft.missing': '未创建', 'ft.onlyExisting': '只看已存在',
    'ft.skills': '{n} 个技能', 'ft.more': '还有 {n} 个', 'ft.less': '收起',
    'ft.r.projectRoot': '项目根目录（有 .git）',
    'ft.r.workdirRoot': '工作目录（没有 .git，当作项目根）',
    'ft.r.memProject': '项目规则，会话开头加载',
    'ft.r.memClaude': '兼容 Claude 的规则，与 AGENTS.md 相同只算一次',
    'ft.r.memLocal': '个人覆盖，追加在同级规则后，建议 gitignore',
    'ft.r.memNested': '这一级的规则，读写到这里后追加',
    'ft.r.git': '标记项目根，规则和技能从这里往下找',
    'ft.r.gitMissing': '没有 .git，只看工作目录这一级',
    'ft.r.projDsh': '项目级 dsh 目录',
    'ft.r.skillsProjectDsh': '项目技能，优先级最高',
    'ft.r.projAgents': '和其他 agent 工具共用的项目目录',
    'ft.r.skillsProjectAgents': '项目共享技能，其他 agent 工具也能用',
    'ft.r.subDir': '中间目录，也会找这一级的规则',
    'ft.r.cwdDir': '当前工作目录',
    'ft.r.dshHome': 'Harness 主目录（$DSH_HOME）',
    'ft.r.memGlobal': '全局规则，所有项目都加载',
    'ft.r.skillsUser': '个人技能，所有项目可用',
    'ft.r.patchGlobal': '对插件配置的修改，所有 profile 生效',
    'ft.r.profiles': '各个 profile',
    'ft.r.profile': '当前 profile',
    'ft.r.patchProfile': '这个 profile 的插件配置修改',
    'ft.r.env': '启动时读取的环境变量',
    'ft.r.sessions': '会话日志，按工作目录分组',
    'ft.r.agentsHome': '与其他 agent 工具共享（$DSH_AGENTS_HOME）',
    'ft.r.memShared': '共享的全局规则',
    'ft.r.skillsShared': '共享技能，所有项目可用',
    'ft.r.skillItem': '技能',
    'src.memoryNoneTree': '这个会话没有加载记忆文件。把 AGENTS.md 放到上面文件结构里标出的位置，新会话（或读写到该目录时）就会加载。',
    'src.memoryZero': '未加载',
    'src.memoryHintShort': 'AGENTS.md / CLAUDE.md：两个全局位置，加上从项目根到工作目录的每一级；.local 版本覆盖同名文件。',
    'src.memoryNoneFound': '有文件存在但还没加载：读写到该目录后会追加。',
    'src.where': '检索位置',
    'src.rootIs': '项目根 {root}',
    'src.cand.existsShort': '存在未加载',
    'src.runtimeHint': 'dsh 每次请求附带的环境信息，不属于记忆文件。',
    'rt.cwd': '工作目录', 'rt.sandbox': '文件沙箱', 'rt.approval': '审批策略', 'rt.harness': 'Harness 源码', 'rt.web': 'Web 地址', 'rt.time': '时间',
    'src.memoryCount': '已加载 {n} 个 · ≈{t}',
    'src.memoryHint': '记忆文件就是 AGENTS.md / CLAUDE.md（以及 .local 覆盖文件）：全局的 ~/.dsh/AGENTS.md、~/.agents/AGENTS.md，再加上从项目根到工作目录的每一级。读写到更深的目录后，会追加那一级的文件。',
    'src.mem.active': '生效中',
    'src.mem.removed': '已移除',
    'src.mem.replaced': '已被新基线替换',
    'src.mem.removedHint': '这个文件已不再生效。',
    'src.updates': '更新 {n} 次',
    'src.inMessages': '在消息中查看',
    'src.memoryNone': '这个会话没有记忆文件。把 AGENTS.md 放到下面任一位置，新会话（或读写到该目录时）就会加载。',
    'src.candidates': '检索位置（项目根：{root}）',
    'src.noRoot': '没有 .git，只查工作目录',
    'src.scope.user-global': '全局 · DSH_HOME',
    'src.scope.agents-global': '全局 · ~/.agents',
    'src.scope.project': '项目上级目录',
    'src.scope.cwd': '工作目录',
    'src.cand.loaded': '已加载',
    'src.cand.exists': '存在，未加载',
    'src.cand.missing': '不存在',
    'src.skills': '技能',
    'src.skillsSummary': '共 {n} 个 · 目录中 {c} 个（{ct}）· 已加载 {l} 个（{lt}）',
    'src.noRegistry': '技能注册表不可用，这里只显示会话里的技能目录和加载记录。',
    'src.skillSearch': '搜索技能名或描述',
    'src.f.all': '全部',
    'src.f.loaded': '已加载',
    'src.f.catalog': '在目录中',
    'src.f.hidden': '不在目录中',
    'src.loadedN': '已加载 ×{n}',
    'src.inCatalog': '在目录中',
    'src.userOnly': '仅 / 命令',
    'src.notInCatalog': '不在目录中',
    'src.catCostHint': '在技能目录中占用的 tokens',
    'src.k.path': '路径',
    'src.k.provider': '提供者',
    'src.k.source': '来源',
    'src.k.invocation': '调用方式',
    'src.inv.model': '模型可调用',
    'src.inv.user': '用户 / 命令',
    'src.k.whenToUse': '何时使用',
    'src.k.catalogDesc': '目录里的描述（已截断）',
    'src.loads': '加载记录（点击跳到消息）',
    'src.via.tool': 'skill 工具',
    'src.via.user': '用户 / 命令',
    'src.skillsNone': '没有匹配的技能。',
    'src.runtime': '运行时上下文',
    'flow.tip': '事件 {n} 次 · 当前占用上下文 {k} tokens',
    'flow.live': '当前状态',
    'flow.live.idle': '空闲',
    'flow.live.running': '运行中',
    'flow.live.tool': '工具执行中',
    'flow.live.approval': '等待你审批',
    'flow.idleHint': '等待你的下一条输入',
    'flow.stage': '所处阶段',
    'flow.where': '第 {t} 轮 · 第 {s} 步',
    'flow.stepFor': '本步已进行 {d}',
    'flow.jobs': '正在执行',
    'flow.approvals': '待审批',
    'flow.lastEvent': '最近事件',
    'flow.ago': '{d} 前',
    'flow.ctxNow': '当前上下文',
    'flow.threshold': '压缩阈值 {t}',
    'flow.ctxAt': '这一步请求时的上下文',
    'flow.ctxEst': '总量为该次请求实际上报的输入，分类按估算比例拆分',
    'flow.ctxEstNoUsage': '该次请求没有上报用量，总量与分类均为估算',
    'flow.request': '缓存命中 {c}（{r}）· 输出 {o}',
    'flow.path': '经过的阶段',
    'flow.status.done': '完成',
    'flow.status.error': '有工具错误',
    'flow.status.interrupted': '中断',
    'flow.status.running': '进行中',
    'flow.prev': '上一步',
    'flow.next': '下一步',
    'flow.backLive': '回到当前',
    'flow.trajectory': '轨迹',
    'flow.stepCount': '{n} 步',
    'flow.stepsTruncated': '较早的 {n} 步未显示',
    'flow.noSteps': '还没有模型请求',
    'flow.textOnly': '仅回复',
    'flow.legend.live': '高亮为当前所处阶段与本步已走过的路径；节点右侧：灰色 ×N 是发生次数，粗体是该阶段内容当前占用的上下文 tokens。点节点或下方某一步查看历史轨迹。',
    'flow.legend.sel': '正在查看第 {t} 轮第 {s} 步：编号为它依次经过的阶段，节点右侧为该次请求时各阶段占用的上下文。',
    'flow.box.turn': '每个回合',
    'flow.box.loop': '智能体循环',
    'flow.nextTurn': '下一回合',
    'flow.truncated': '较早的 {n} 个事件未显示',
    'flow.calls': '工具调用',
    'flow.goal': '当前目标',
    'flow.goal.phase': '状态',
    'flow.goal.rounds': '已开始轮次 / 上限',
    'flow.goal.blocked': '阻塞原因',
    'flow.phase.active': '进行中',
    'flow.phase.paused': '已暂停',
    'flow.phase.completed': '已完成',
    'flow.phase.blocked': '受阻',
    'flow.turns': '回合',
    'flow.trigger.user': '用户输入',
    'flow.trigger.goal': '目标驱动',
    'flow.trigger.schedule': '定时任务',
    'flow.trigger.none': '其他',
    'flow.running': '进行中',
    'flow.turnStats': '{s} 步 · {c} 次工具调用 · {e} 个错误',
    'nav.messages': '消息',
    'nav.tools': '工具',
    'nav.skills': '技能',
    'tools.desc': '说明',
    'tools.paramsN': '参数 · {n}',
    'tools.noParams': '没有参数',
    'tools.required': '必填',
    'tools.optional': '可选',
    'tools.invocations': '{n} 次调用，每次的调用与结果放在一起，按时间顺序',
    'tools.earlier': '显示更早的 {n} 次',
    'cmd.title': '命令执行',
    'cmd.hint': 'shell 调用单独列出：命令可能失败、耗时或在后台运行',
    'cmd.all': '全部', 'cmd.failed': '失败', 'cmd.slow': '慢', 'cmd.bg': '后台', 'cmd.running': '运行中',
    'cmd.summary': '摘要', 'cmd.runs': '运行记录', 'cmd.totalTime': '合计耗时', 'cmd.failRate': '失败 · {p}',
    'cmd.notable': '值得注意', 'cmd.slowest': '最慢', 'cmd.mostFailed': '失败最多', 'cmd.noneNotable': '没有失败，也没有慢命令',
    'cmd.programs': '程序 · {n}', 'cmd.filterPrograms': '过滤程序…', 'cmd.filter': '过滤命令…',
    'cmd.sort.latest': '最新', 'cmd.sort.slowest': '最慢',
    'cmd.times': '×{n}', 'cmd.records': '{n} 条记录',
    'cmd.inline': '内联', 'cmd.exit': '退出码 {n}',
    'cmd.empty': '没有符合条件的命令', 'cmd.none': '这个会话还没有执行过命令',
    'cmd.more': '再显示 {n} 条', 'cmd.clear': '清除筛选',
    'cmd.slowTip': '耗时 ≥ {s}s 算慢',
    'cmd.bgTip': '结果先返回、命令仍在后台运行（或调用时要求后台运行）',
    'cmd.inlineTip': '没有作业记录，命令在工具内直接执行',
    'cmd.meta.exit': '退出码', 'cmd.meta.job': '作业', 'cmd.meta.time': '耗时', 'cmd.meta.cwd': '目录', 'cmd.meta.out': '输出',
    'cmd.meta.ctx': '上下文', 'cmd.inCtx': '在上下文中', 'cmd.outCtx': '已不在上下文中',
    'cmd.command': '命令', 'cmd.stillRunning': '仍在运行',
    'pair.call': '调用',
    'pair.result': '结果',
    'pair.error': '出错',
    'pair.pending': '没有结果（执行中、被中断，或结果已被压缩出上下文）',
    'pair.noCall': '调用已不在上下文中（被压缩）',
    'pair.calls': '调用 {names}',
    'pair.of': '{name} 的结果 ← #{seq}',
    'tools.expandHint': '点击一行展开',
    'nav.memory': '记忆文件',
    'nav.trend': '趋势',
    'session.none': '当前对话还没有加载。',
    'g.system': '系统提示',
    'g.systemTools': '系统工具',
    'g.mcpTools': 'MCP 工具',
    'g.skills': '技能',
    'g.memory': '记忆文件',
    'g.messages': '消息',
    'g.buffer': '自动压缩缓冲',
    'g.free': '剩余空间',
    'c.system': '系统提示',
    'c.systemTools': '系统工具',
    'c.mcpTools': 'MCP 工具',
    'c.skills': '技能',
    'c.memory': '记忆文件',
    'c.injected': '注入上下文',
    'c.summary': '压缩摘要',
    'c.user': '用户消息',
    'c.assistantText': '助手回复',
    'c.reasoning': '思考过程',
    'c.toolCalls': '工具调用',
    'c.toolResults': '工具结果',
    'c.other': '其他',
    'ov.window': '上下文窗口',
    'ov.used': '已用',
    'ov.model': '模型',
    'ov.maxOut': '最大输出',
    'ov.events': '事件 / 上下文节点',
    'ov.categories': '分类明细',
    'ov.col.cat': '分类',
    'ov.col.tokens': 'Tokens',
    'ov.col.window': '占窗口',
    'ov.col.used': '占已用',
    'ov.col.count': '条数',
    'ov.col.raw': '原始估算',
    'ov.measure': '测量与校准',
    'ov.total': '当前总量（tokenMeter）',
    'ov.baseline': '基线来源',
    'ov.baseline.usage': '上次请求的实际用量',
    'ov.baseline.estimated': '启发式估算',
    'ov.baseline.none': '无',
    'ov.baselineTokens': '基线 tokens',
    'ov.delta': '基线之后新增',
    'ov.estSum': '分类估算合计',
    'ov.factor': '校准系数',
    'ov.usage': '上次请求用量',
    'ov.uncached': '未命中缓存输入',
    'ov.cacheRead': '缓存命中',
    'ov.cacheWrite': '缓存写入',
    'ov.output': '输出',
    'ov.hit': '缓存命中率',
    'ov.compaction': '自动压缩策略',
    'ov.auto': '自动压缩',
    'ov.on': '开启',
    'ov.off': '关闭',
    'ov.ratio': '阈值比例',
    'ov.headroom': '额外预留',
    'ov.threshold': '触发阈值',
    'ov.buffer': '缓冲区',
    'ov.remaining': '距离触发',
    'ov.retain': '保留最近上下文',
    'ov.summaryMax': '摘要最大输出',
    'ov.override': '模型专属策略',
    'ov.formula': '阈值 = min(窗口 × 比例, 窗口 − 最大输出 − 额外预留)',
    'ov.compactions': '本会话压缩事件',
    'ov.injected': '注入上下文来源',
    'ov.types': '事件类型统计',
    'msg.search': '搜索内容 / 工具名…',
    'msg.sort.order': '按顺序',
    'msg.sort.size': '按大小',
    'msg.all': '全部',
    'msg.more': '再显示 {n} 条',
    'msg.count': '{n} 个节点，{t}',
    'msg.parts': '{n} 个片段',
    'msg.truncated': '（内容过长，已截断）',
    'msg.turn': '第 {n} 轮',
    'msg.tool': '工具',
    'msg.trunc': '较早的 {n} 个节点未显示',
    'tools.defs': '工具定义（每次请求都会发送）',
    'tools.usage': '工具使用统计',
    'tools.deferred': '延迟加载的工具（按需加载，不占上下文）',
    'tools.col.name': '名称',
    'tools.col.kind': '类型',
    'tools.col.params': '参数',
    'tools.col.calls': '调用',
    'tools.col.callTok': '调用 tokens',
    'tools.col.results': '结果',
    'tools.col.resTok': '结果 tokens',
    'tools.col.max': '最大结果',
    'tools.system': '系统',
    'tools.none': '暂无',
    'trend.title': '上下文累积增长（按节点顺序）',
    'trend.scale.fit': '自适应',
    'trend.scale.window': '整个窗口',
    'trend.turns': '每轮新增 tokens',
    'trend.hint': '悬停查看节点，点击跳到消息列表。',
    'trend.threshold': '压缩阈值',
    'trend.window': '窗口上限',
    'trend.mode.nodes': '按节点',
    'trend.mode.turns': '按回合',
    'ov.trend': '上下文增长',
    'ov.cat.hint': '点击一行查看里面是什么',
    'ov.cat.tools': '{n} 个工具定义，按占用排序（悬停看完整说明）',
    'ov.cat.skills': '模型看到的技能目录条目；完整内容与加载记录见「技能」',
    'ov.cat.splitNote': '助手消息按内容拆分计入；数值是该条消息中属于此分类的部分',
    'ov.cat.empty': '暂无内容',
    'ov.cat.showAll': '在消息中查看全部 {n} 条 →',
    'ov.details': '计算口径与原始数据',
    'ov.bar.ofWin': '占窗口 {p}',
    'ov.bar.ofUsed': '占已用 {p}',
    'ov.bar.items': '{n} 条',
    'nav.sources': '来源',
    'ov.stat.turns': '轮次',
    'ov.stat.steps': '步数',
    'ov.stat.calls': '工具调用',
    'ov.stat.hit': '缓存命中',
    'ov.stat.left': '距压缩',
    'st.title': '上下文趋势',
    'st.count': '{n} 次请求 · 点击柱子查看该步',
    'st.ctx': '上下文',
    'st.delta': '比前步',
    'st.output': '输出',
    'st.cache': '缓存',
    'st.viewMsgs': '查看消息',
    'ov.flowDiagram': '执行流程图',
    'ov.flowDiagram.sub': '会话生命周期与当前所在阶段',
    'msg.pre': '会话开场',
    'msg.step': '第 {n} 步',
    'msg.stepsN': '{n} 步',
    'msg.itemsN': '{n} 条',
    'msg.allCats': '全部分类',
    'msg.earlier': '显示更早的 {n} 条',
    'msg.none': '没有匹配的消息',
    'k.system': '系统',
    'k.systemTools': '工具定义',
    'k.mcpTools': 'MCP',
    'k.skills': '技能',
    'k.memory': '记忆',
    'k.injected': '注入',
    'k.summary': '摘要',
    'k.user': '用户',
    'k.assistantText': '回复',
    'k.reasoning': '思考',
    'k.toolCalls': '调用',
    'k.toolResults': '结果',
    'k.other': '其他',
    'tools.callsN': '调用 {n} 次',
    'tools.defTok': '定义',
    'tools.useTok': '使用',
    'tools.definition': '工具定义',
    'tools.noDef': '这个工具不在本会话的工具定义里（可能是延迟加载或已移除）。',
    'tools.search': '搜索工具名 / 说明…',
    'tools.noUse': '本会话还没有调用过工具',
    'tools.defsShort': '工具定义',
    'tools.defsNote': '每次请求都会发送，按 tokens 排序',
    'tools.paramsShort': '{n} 参',
    'tools.showAllDefs': '显示全部 {n} 个',
    'tools.deferredN': '延迟加载 {n} 个（不占上下文）：',
    'tools.sum.defs': '工具定义',
    'tools.sum.defTok': '定义占用',
    'tools.sum.used': '用过的工具',
    'tools.sum.calls': '调用次数',
    'tools.sum.resTok': '结果占用',
    'tools.sum.cmds': '命令',
    'tools.pick': '点击左侧一个工具，查看它的调用记录和定义',
    'src.search': '搜索记忆文件 / 技能…',
    'src.memNoneShort': '这个会话没有加载记忆文件，可在「环境 → 文件结构」查看可放置的位置',
    'src.skillsShort': '{n} 个 · 已加载 {l}（{lt}）· 目录 {c}（{ct}）',
    'src.skillsZero': '这个会话没有可用技能',
    'src.env': '环境',
    'src.itemsN': '{n} 项',
    'src.treeSum': '已加载 {l} · 存在未加载 {e}',
    'src.sum.mem': '记忆文件',
    'src.sum.loaded': '已加载技能',
    'src.sum.catalog': '技能目录',
    'src.sum.all': '可见技能',
    'src.sum.rt': '运行时信息',
    'src.pick': '点击左侧一项查看内容',
    'msg.collapse': '收起',
    'nav.analyze': '分析',
    'az.title': '上下文分析',
    'az.i1': '用当前会话所用的模型，专门分析这个会话的上下文，找出 agent 的缺陷和浪费，给出改进建议',
    'az.i2': '和当前对话完全独立：不会写入会话，也不影响它的上下文',
    'az.i3': '默认关闭；只有你点“发送”时才调用模型，每次发送都会消耗 token',
    'az.i4': '一次提问约发送 {k} 输入 token 给 {m}（会话内容会发给模型提供方）',
    'az.noLlm': '当前环境没有可用的模型服务',
    'az.enable': '启用分析',
    'az.on': '已启用',
    'az.attach': '附带：',
    'az.sys': '系统提示全文',
    'az.toolDesc': '工具描述',
    'az.detach': '点击移除',
    'az.cost': '本次约 {k} 输入',
    'az.clear': '清空',
    'az.off': '关闭分析',
    'az.hint': '报告里已有构成、工具、步骤、最大消息等摘要；需要看原文时在上面勾选附带内容，或在提示词页点条目上的 ✦。',
    'az.q1': '这个上下文为什么这么大？最该先精简什么？',
    'az.q2': '找出 agent 的缺陷，并给出具体的改进方案',
    'az.q3': '哪些工具、技能或记忆可以精简或延迟加载？',
    'az.q4': '有没有重复读取、重复调用或无用输出？怎么避免？',
    'az.thinking': '思考过程',
    'az.working': '分析中…',
    'az.refs': '提到的消息',
    'az.usage': '输入 {i} · 输出 {o}',
    'az.placeholder': '问点什么，例如“第 4 步为什么多了 3k？”（Enter 发送，Shift+Enter 换行）',
    'az.stop': '停止',
    'az.send': '发送',
    'az.askThis': '问 AI：分析这一条',
    'nav.prompt': '提示词',
    'sd.storyNone': '这一步没有模型输出或工具调用',
    'sd.said': '回答',
    'sd.thought': '思考',
    'sd.called': '调用',
    'sd.story': '这一步发生了什么',
    'sd.fresh': '本步新增',
    'sd.toolDefs': '{n} 个工具定义',
    'sd.request': '此处发出请求',
    'sd.promptTitle': '模型读到的提示词',
    'sd.itemsN': '{n} 条',
    'sd.promptAt': '第 {t} 轮第 {s} 步发出请求时模型读到的全部内容，按读取顺序从上到下',
    'sd.promptNow': '最新一次请求模型读到的全部内容，按读取顺序从上到下；点分隔线可切换到当时那一步',
    'sd.later': '此步之后还有 {n} 条（{k}），当时模型还没看到',
    'dg.title': '诊断',
    'dg.count': '{n} 条发现',
    'dg.view': '查看',
    'dg.ok': '没发现明显问题：固定开销、工具结果和单条消息的占比都在正常范围',
    'dg.runway': '最近每步平均增长 {g}，约 {n} 步后触发自动压缩（距阈值还剩 {r}）',
    'dg.over': '已经超过自动压缩阈值，下一步会触发压缩',
    'dg.fixed': '还没开始干活就占了 {k}（{p}）：工具定义 {tk}，技能和记忆 {sk}。工具越多、技能越多，每一步都要重复带着',
    'dg.results': '工具结果占 {p}，最大来自 {name}（{k}）。读大文件或长输出是最常见的原因',
    'dg.big': '消息 #{seq} 一条就占 {p}（{k}）：{what}',
    'dg.repeat': '同一个调用重复了 {n} 次：{what}',
    'dg.idle': '{n} 个工具定义从没被调用过，白占 {k}',
    'dg.errors': '{n} 次工具调用出错（{names}）：出错的往往要重试，会多占上下文',
    'dg.cache': '上一次请求缓存命中率只有 {p}，大部分输入没走缓存',
    'sd.compacted': '此步压缩',
    'sd.now': '当前（最新）',
    'sd.backNow': '回到当前',
    'sd.added': '本步新增',
    'sd.items': '{n} 条 · {k}',
    'sd.none': '无新消息',
    'sd.onlyNew': '只在消息页看本步新增的内容',
    'sd.showAll': '显示全部消息',
    'lay.title': 'Agent 读取位置',
    'lay.sub': '按 dsh 实际加载规则',
    'lay.none': '无法读取加载位置',
    'lay.notLoaded': '存在，未加载',
    'lay.memSum': '已加载 {n} 个',
    'lay.memRule': '全局只读 AGENTS.md（不读 CLAUDE.md）；项目里从项目根到工作目录，每一级都读 AGENTS.md 和 CLAUDE.md（两个都读，不是二选一），再叠加 .local 版本；同一级内容相同只算一次。~/.claude/CLAUDE.md 不会被读取。',
    'lay.global': '全局',
    'lay.globalNote': '所有项目生效，两处内容相同时只算一次',
    'lay.project': '项目',
    'lay.rootBy': '项目根由 {m} 确定',
    'lay.noRoot': '没有 .git，只读工作目录这一级',
    'lay.root': '项目根',
    'lay.cwd': '工作目录',
    'lay.canPlace': '未放置：',
    'lay.deeper': '更深的目录',
    'lay.deeperNote': '读写到这些目录里的文件后追加',
    'lay.skillRoots': '技能目录',
    'lay.skillRule': '按优先级从高到低，同名技能取靠前的',
    'lay.sk.projectDsh': '项目 .dsh',
    'lay.sk.projectAgents': '项目 .agents',
    'lay.sk.custom': '自定义目录',
    'lay.sk.userDsh': '用户 ~/.dsh',
    'lay.sk.userAgents': '用户 ~/.agents',
    'lay.sk.bundled': '内置',
    'lay.skillsN': '{n} 个技能',
    'lay.onDisk': '磁盘上 {n} 个',
    'lay.empty': '空目录',
    'lay.otherSources': '其他来源：',
    'ov.composition': 'Token 构成',
    'ov.usedShort': '已用',
    'ov.openCat': '点击查看这一类的消息',
    'ov.more': '查看全部',
    'ov.peek.tools': '{n} 个工具 · {c} 次调用',
    'ov.peek.cmds': '{n} 条 · 共 {d} · 失败 {f}',
    'ov.peek.bigMsgs': '占用最大的消息',
    'ov.peek.skills': '已加载 {l} · 目录 {c} · 共 {n}',
    'ov.statsTitle': '上下文统计',
    'msg.sum.nodes': '消息节点',
    'msg.sum.tok': '消息占用',
    'msg.sum.turns': '轮次',
    'msg.sum.steps': '步数',
    'msg.sum.calls': '工具调用',
    'msg.sum.max': '最大一条',
};
const en = {
    'button.title': 'Context: {used} / {window} (click for breakdown)',
    'button.unknown': 'Context usage',
    'pop.title': 'Context',
    'pop.used': 'used',
    'pop.autoAt': 'Auto-compact at {t}',
    'pop.autoOff': 'Auto-compact is off',
    'pop.noCompaction': 'No compaction plugin detected',
    'pop.until': '{t} until auto-compact',
    'pop.over': 'Past the auto-compact threshold',
    'pop.deferredName': '{name} (deferred)',
    'pop.deferredTip': '{n} tools loaded on demand, not in context yet; the size is an estimate if all were loaded',
    'ov.cat.memory': '{n} memory files (AGENTS.md / CLAUDE.md)',
    'pop.open': 'Open Context Lens',
    'pop.empty': 'This session has not sent a request yet, so there is no context to measure.',
    'pop.src.meter-usage': 'calibrated to real usage',
    'pop.src.last-request': 'from the last request\'s real usage',
    'pop.src.estimate': 'estimated (no usage yet)',
    'pop.raw': '~{t} before compression',
    'pop.autoAtBili': 'billion-context nudge at {t}',
    'pop.untilShort': '{t} to compact',
    'pop.overShort': 'Past threshold',
    'pop.srcShort.meter-usage': 'measured',
    'pop.srcShort.last-request': 'from last request',
    'pop.srcShort.estimate': 'estimated',
    'ov.engine': 'Compaction engine',
    'ov.emergency': 'Emergency truncation',
    'ov.biliNote': 'billion-context owns compaction: it folds history in its proxy before each request, nudges the model to compress past the nudge threshold, and truncates oversized tool output past the emergency threshold.',
    'ov.biliDefaults': 'No custom values found in the plugin config; showing the 75% / 95% defaults.',
    'ov.usedSource': 'Source of "used"',
    'ov.rawTotal': 'Raw context estimate (before compression)',
    'ov.saved': 'Saved at request time',
    'ov.lastReq': 'Last request (#{seq}, {time}) usage',
    'ov.calNote': 'Each category is estimated with a character heuristic, then scaled by the calibration factor so the sum equals "used". Request-time compression (e.g. billion-context folding tool results) skews the real split away from these proportions.',
    loading: 'Loading…',
    failed: 'Failed: {msg}',
    retry: 'Retry',
    refresh: 'Refresh',
    auto: 'Auto refresh',
    expand: 'Expand sidebar',
    'tab.title': 'Context Lens',
    'nav.overview': 'Overview',
    'flow.n.sessionStart': 'Session start',
    'flow.n.userPrompt': 'User prompt',
    'flow.n.turnStart': 'Turn start',
    'flow.n.stepStart': 'Model request',
    'flow.n.assistant': 'Model output',
    'flow.n.toolCall': 'Tool call',
    'flow.n.toolExec': '[tool executes]',
    'flow.n.toolResult': 'Tool result',
    'flow.n.subagent': 'Subagent',
    'flow.n.todo': 'Todo update',
    'flow.n.stepEnd': 'Step end',
    'flow.n.turnEnd': 'Turn end',
    'flow.n.compaction': 'Compaction',
    'flow.n.goal': 'Goal',
    'flow.n.goalRound': 'Goal round',
    'flow.n.inbox': 'Queued input',
    'flow.n.context': 'Context injection',
    'flow.n.approval': 'Approval',
    'flow.n.modelSwitch': 'Model / preset switch',
    'flow.n.plan': 'Plan mode',
    'flow.n.schedule': 'Schedule',
    'flow.n.title': 'Session title',
    'flow.n.deliverables': 'Deliverables',
    'flow.n.workspace': 'Workspace changes',
    'flow.d.sessionStart': 'Session setup: permission preset, sandbox, approval policy',
    'flow.d.userPrompt': 'Messages you sent (and schedule-triggered ones)',
    'flow.d.turnStart': 'A turn begins',
    'flow.d.stepStart': 'One model request (step N) begins',
    'flow.d.assistant': 'Model output: reasoning, text and tool calls',
    'flow.d.toolCall': 'The model asks to call a tool',
    'flow.d.toolExec': 'Tools that run as background jobs (bash etc.), counted per job; other tools run inline when called and skip this stage',
    'flow.d.toolResult': 'Tool output returns to the context (including errors)',
    'flow.d.subagent': 'Subagent calls and results',
    'flow.d.todo': 'Todo list updated',
    'flow.d.stepEnd': 'Step ends; loops back while tools were called',
    'flow.d.turnEnd': 'Turn ends: completed, aborted or failed',
    'flow.d.compaction': 'Compaction start / end / summary',
    'flow.d.goal': 'Goal created / edited / paused / completed',
    'flow.d.goalRound': 'A new round started by the goal driver',
    'flow.d.inbox': 'Input added while a turn is running (into the next step or next turn); a message sent while idle counts as a user prompt',
    'flow.d.context': 'System prompt, runtime context, skill catalog, time injected',
    'flow.d.approval': 'A tool call waiting for your approval, and the decision',
    'flow.d.modelSwitch': 'Model or agent preset switched',
    'flow.d.plan': 'Plan mode entered or left',
    'flow.d.schedule': 'Schedule changed',
    'flow.d.title': 'Session title generated',
    'flow.d.deliverables': 'Deliverables presented to you',
    'flow.d.workspace': 'Workspace file changes for a turn',
    'nav.flow': 'Flow',
    'live.on': 'Live',
    'live.updated': 'Last data change: {time}',
    'part.text': 'Text',
    'part.reasoning': 'Reasoning',
    'part.tool-call': 'Tool call',
    'part.image': 'Image',
    'part.file': 'File',
    'ui.copy': 'Copy',
    'ui.copied': 'Copied',
    'ui.footnotes': 'Footnotes',
    'ui.copyValue': 'Copy value',
    'ui.copyJson': 'Copy JSON',
    'ui.copyPath': 'Copy path',
    'ui.copyPretty': 'Copy pretty JSON',
    'ui.copyCompact': 'Copy compact JSON',
    'ui.copyFailed': 'Copy failed',
    'ui.collapse': 'Collapse',
    'ui.expand': 'Expand',
    'ui.copyHint': '{action}',
    'ui.mode.md': 'Rendered',
    'ui.mode.json': 'JSON',
    'ui.mode.code': 'Output',
    'ui.mode.raw': 'Raw',
    'ui.expandAll': 'Show all',
    'ui.collapseAll': 'Collapse',
    'ui.chars': 'chars',
    'ui.spilled': 'Output too long: the model saw only the head and tail ([...] in between); the full output is at {path}',
    'src.memory': 'Memory files · AGENTS.md / CLAUDE.md',
    'ft.title': 'File structure',
    'ft.hint': 'The files and folders dsh reads for this conversation, as they are on disk now; click a file to preview it in the right sidebar (rendered by dsh\'s own preview)',
    'ft.preview': 'Preview in the right sidebar',
    'ft.previewShort': 'Preview',
    'ft.jump': 'Show message #{seq}',
    'ft.noSidebar': 'The right sidebar is not enabled, so files cannot be previewed',
    'ft.noViewer': 'No preview handles this kind of file',
    'ft.openFailed': 'Could not open the file preview',
    'ft.loaded': 'loaded', 'ft.exists': 'exists', 'ft.missing': 'not created', 'ft.onlyExisting': 'Existing only',
    'ft.skills': '{n} skills', 'ft.more': '{n} more', 'ft.less': 'Show less',
    'ft.r.projectRoot': 'Project root (has .git)',
    'ft.r.workdirRoot': 'Working directory (no .git, used as the root)',
    'ft.r.memProject': 'Project rules, loaded at the start',
    'ft.r.memClaude': 'Claude-compatible rules; counted once if same as AGENTS.md',
    'ft.r.memLocal': 'Personal overlay, appended after this level; gitignore it',
    'ft.r.memNested': "This level's rules, appended once work reaches it",
    'ft.r.git': 'Marks the project root; rules and skills are found from here',
    'ft.r.gitMissing': 'No .git: only the working directory level is used',
    'ft.r.projDsh': 'Project dsh folder',
    'ft.r.skillsProjectDsh': 'Project skills, highest priority',
    'ft.r.projAgents': 'Project folder shared with other agent tools',
    'ft.r.skillsProjectAgents': 'Shared project skills, usable by other agent tools',
    'ft.r.subDir': "Intermediate folder; its rules are read too",
    'ft.r.cwdDir': 'Current working directory',
    'ft.r.dshHome': 'Harness home ($DSH_HOME)',
    'ft.r.memGlobal': 'Global rules, loaded in every project',
    'ft.r.skillsUser': 'Personal skills, in every project',
    'ft.r.patchGlobal': 'Your plugin config changes, all profiles',
    'ft.r.profiles': 'Profiles',
    'ft.r.profile': 'Current profile',
    'ft.r.patchProfile': "This profile's plugin config changes",
    'ft.r.env': 'Environment variables read at startup',
    'ft.r.sessions': 'Session logs, grouped by working directory',
    'ft.r.agentsHome': 'Shared with other agent tools ($DSH_AGENTS_HOME)',
    'ft.r.memShared': 'Shared global rules',
    'ft.r.skillsShared': 'Shared skills, in every project',
    'ft.r.skillItem': 'Skill',
    'src.memoryNoneTree': 'This conversation loaded no memory files. Put an AGENTS.md in one of the places marked in the file structure above; a new conversation (or work in that folder) loads it.',
    'src.memoryZero': 'none loaded',
    'src.memoryHintShort': 'AGENTS.md / CLAUDE.md: two global locations, then every level from the project root to the working directory; .local versions override.',
    'src.memoryNoneFound': 'Some files exist but are not loaded yet: they are appended once that directory is read or written.',
    'src.where': 'Searched locations',
    'src.rootIs': 'project root {root}',
    'src.cand.existsShort': 'not loaded',
    'src.runtimeHint': 'Environment facts dsh attaches to every request; not memory files.',
    'rt.cwd': 'Working directory', 'rt.sandbox': 'File sandbox', 'rt.approval': 'Approval', 'rt.harness': 'Harness source', 'rt.web': 'Web URL', 'rt.time': 'Time',
    'src.memoryCount': '{n} loaded · ≈{t}',
    'src.memoryHint': 'Memory files are AGENTS.md / CLAUDE.md (plus .local overlays): the global ~/.dsh/AGENTS.md and ~/.agents/AGENTS.md, then every level from the project root down to the working directory. Reading or writing a deeper directory appends that level\'s file.',
    'src.mem.active': 'Active',
    'src.mem.removed': 'Removed',
    'src.mem.replaced': 'Replaced by a new baseline',
    'src.mem.removedHint': 'This file no longer applies.',
    'src.updates': 'updated {n}×',
    'src.inMessages': 'view in messages',
    'src.memoryNone': 'No memory files in this session. Put an AGENTS.md in one of the locations below; a new session (or a read/write in that directory) loads it.',
    'src.candidates': 'Searched locations (project root: {root})',
    'src.noRoot': 'no .git found, working directory only',
    'src.scope.user-global': 'Global · DSH_HOME',
    'src.scope.agents-global': 'Global · ~/.agents',
    'src.scope.project': 'Project ancestor',
    'src.scope.cwd': 'Working directory',
    'src.cand.loaded': 'Loaded',
    'src.cand.exists': 'Exists, not loaded',
    'src.cand.missing': 'Missing',
    'src.skills': 'Skills',
    'src.skillsSummary': '{n} total · {c} in catalog ({ct}) · {l} loaded ({lt})',
    'src.noRegistry': 'Skill registry unavailable; showing only the session catalog and loads.',
    'src.skillSearch': 'Search skill name or description',
    'src.f.all': 'All',
    'src.f.loaded': 'Loaded',
    'src.f.catalog': 'In catalog',
    'src.f.hidden': 'Not in catalog',
    'src.loadedN': 'loaded ×{n}',
    'src.inCatalog': 'in catalog',
    'src.userOnly': '/command only',
    'src.notInCatalog': 'not in catalog',
    'src.catCostHint': 'Tokens this entry takes in the skill catalog',
    'src.k.path': 'Path',
    'src.k.provider': 'Provider',
    'src.k.source': 'Source',
    'src.k.invocation': 'Invocation',
    'src.inv.model': 'model',
    'src.inv.user': 'user /command',
    'src.k.whenToUse': 'When to use',
    'src.k.catalogDesc': 'Catalog description (capped)',
    'src.loads': 'Loads (click to open the message)',
    'src.via.tool': 'skill tool',
    'src.via.user': 'user /command',
    'src.skillsNone': 'No matching skills.',
    'src.runtime': 'Runtime context',
    'flow.tip': '{n} events · {k} tokens in context now',
    'flow.live': 'Current state',
    'flow.live.idle': 'Idle',
    'flow.live.running': 'Running',
    'flow.live.tool': 'Running a tool',
    'flow.live.approval': 'Waiting for your approval',
    'flow.idleHint': 'waiting for your next message',
    'flow.stage': 'Stage',
    'flow.where': 'Turn {t} · step {s}',
    'flow.stepFor': 'Step running for {d}',
    'flow.jobs': 'Running',
    'flow.approvals': 'Pending approval',
    'flow.lastEvent': 'Last event',
    'flow.ago': '{d} ago',
    'flow.ctxNow': 'Context now',
    'flow.threshold': 'compacts at {t}',
    'flow.ctxAt': 'Context at this request',
    'flow.ctxEst': 'Total is the input the request reported; the split is estimated',
    'flow.ctxEstNoUsage': 'This request reported no usage; total and split are estimated',
    'flow.request': 'Cache hit {c} ({r}) · output {o}',
    'flow.path': 'Stages passed',
    'flow.status.done': 'Done',
    'flow.status.error': 'Tool errors',
    'flow.status.interrupted': 'Interrupted',
    'flow.status.running': 'Running',
    'flow.prev': 'Prev',
    'flow.next': 'Next',
    'flow.backLive': 'Back to live',
    'flow.trajectory': 'Trajectory',
    'flow.stepCount': '{n} steps',
    'flow.stepsTruncated': '{n} earlier steps not shown',
    'flow.noSteps': 'No model requests yet',
    'flow.textOnly': 'reply only',
    'flow.legend.live': 'Highlighted: the stage the conversation is in now and the path this step has taken. Right of each node: grey ×N is how many times it happened, bold is the context tokens that stage holds now. Click a node or a step below to see a past trajectory.',
    'flow.legend.sel': 'Viewing turn {t} step {s}: numbers are the stages it passed in order; right of each node: context that stage held at that request.',
    'flow.box.turn': 'EACH TURN',
    'flow.box.loop': 'AGENTIC LOOP',
    'flow.nextTurn': 'next turn',
    'flow.truncated': '{n} earlier events not shown',
    'flow.calls': 'Tool calls',
    'flow.goal': 'Current goal',
    'flow.goal.phase': 'Phase',
    'flow.goal.rounds': 'Rounds started / max',
    'flow.goal.blocked': 'Blocked reason',
    'flow.phase.active': 'Active',
    'flow.phase.paused': 'Paused',
    'flow.phase.completed': 'Completed',
    'flow.phase.blocked': 'Blocked',
    'flow.turns': 'Turns',
    'flow.trigger.user': 'User',
    'flow.trigger.goal': 'Goal',
    'flow.trigger.schedule': 'Schedule',
    'flow.trigger.none': 'Other',
    'flow.running': 'running',
    'flow.turnStats': '{s} steps · {c} tool calls · {e} errors',
    'nav.messages': 'Messages',
    'nav.tools': 'Tools',
    'nav.skills': 'Skills',
    'tools.desc': 'Description',
    'tools.paramsN': 'Parameters · {n}',
    'tools.noParams': 'No parameters',
    'tools.required': 'required',
    'tools.optional': 'optional',
    'tools.invocations': '{n} calls, each shown with its result, in order',
    'tools.earlier': 'Show {n} earlier',
    'cmd.title': 'Command runs',
    'cmd.hint': 'Shell calls on their own: commands can fail, take long, or keep running in the background',
    'cmd.all': 'All', 'cmd.failed': 'Failed', 'cmd.slow': 'Slow', 'cmd.bg': 'Background', 'cmd.running': 'Running',
    'cmd.summary': 'Summary', 'cmd.runs': 'Runs', 'cmd.totalTime': 'Total time', 'cmd.failRate': 'Failed · {p}',
    'cmd.notable': 'Worth a look', 'cmd.slowest': 'Slowest', 'cmd.mostFailed': 'Most failures', 'cmd.noneNotable': 'No failures and no slow commands',
    'cmd.programs': 'Programs · {n}', 'cmd.filterPrograms': 'Filter programs…', 'cmd.filter': 'Filter commands…',
    'cmd.sort.latest': 'Latest', 'cmd.sort.slowest': 'Slowest',
    'cmd.times': '×{n}', 'cmd.records': '{n} runs',
    'cmd.inline': 'inline', 'cmd.exit': 'exit {n}',
    'cmd.empty': 'No commands match', 'cmd.none': 'No commands have run in this conversation',
    'cmd.more': 'Show {n} more', 'cmd.clear': 'Clear filters',
    'cmd.slowTip': 'Slow = {s}s or more',
    'cmd.bgTip': 'The result came back while the command kept running (or it was asked to run in the background)',
    'cmd.inlineTip': 'No job record; the tool ran the command directly',
    'cmd.meta.exit': 'Exit code', 'cmd.meta.job': 'Job', 'cmd.meta.time': 'Duration', 'cmd.meta.cwd': 'Directory', 'cmd.meta.out': 'Output',
    'cmd.meta.ctx': 'Context', 'cmd.inCtx': 'in context', 'cmd.outCtx': 'no longer in context',
    'cmd.command': 'Command', 'cmd.stillRunning': 'still running',
    'pair.call': 'Call',
    'pair.result': 'Result',
    'pair.error': 'error',
    'pair.pending': 'No result (still running, interrupted, or compacted out of context)',
    'pair.noCall': 'The call is no longer in context (compacted)',
    'pair.calls': 'calls {names}',
    'pair.of': 'result of {name} ← #{seq}',
    'tools.expandHint': 'Click a row to expand',
    'nav.memory': 'Memory files',
    'nav.trend': 'Trend',
    'session.none': 'This conversation is not loaded yet.',
    'g.system': 'System prompt',
    'g.systemTools': 'System tools',
    'g.mcpTools': 'MCP tools',
    'g.skills': 'Skills',
    'g.memory': 'Memory files',
    'g.messages': 'Messages',
    'g.buffer': 'Autocompact buffer',
    'g.free': 'Free space',
    'c.system': 'System prompt',
    'c.systemTools': 'System tools',
    'c.mcpTools': 'MCP tools',
    'c.skills': 'Skills',
    'c.memory': 'Memory files',
    'c.injected': 'Injected context',
    'c.summary': 'Compaction summary',
    'c.user': 'User messages',
    'c.assistantText': 'Assistant text',
    'c.reasoning': 'Reasoning',
    'c.toolCalls': 'Tool calls',
    'c.toolResults': 'Tool results',
    'c.other': 'Other',
    'ov.window': 'Context window',
    'ov.used': 'Used',
    'ov.model': 'Model',
    'ov.maxOut': 'Max output',
    'ov.events': 'Events / context nodes',
    'ov.categories': 'Categories',
    'ov.col.cat': 'Category',
    'ov.col.tokens': 'Tokens',
    'ov.col.window': '% window',
    'ov.col.used': '% used',
    'ov.col.count': 'Items',
    'ov.col.raw': 'Raw estimate',
    'ov.measure': 'Measurement & calibration',
    'ov.total': 'Current total (tokenMeter)',
    'ov.baseline': 'Baseline source',
    'ov.baseline.usage': 'Last request usage',
    'ov.baseline.estimated': 'Heuristic estimate',
    'ov.baseline.none': 'None',
    'ov.baselineTokens': 'Baseline tokens',
    'ov.delta': 'Added since baseline',
    'ov.estSum': 'Sum of category estimates',
    'ov.factor': 'Calibration factor',
    'ov.usage': 'Last request usage',
    'ov.uncached': 'Uncached input',
    'ov.cacheRead': 'Cache read',
    'ov.cacheWrite': 'Cache write',
    'ov.output': 'Output',
    'ov.hit': 'Cache hit rate',
    'ov.compaction': 'Auto-compact policy',
    'ov.auto': 'Auto-compact',
    'ov.on': 'On',
    'ov.off': 'Off',
    'ov.ratio': 'Threshold ratio',
    'ov.headroom': 'Extra headroom',
    'ov.threshold': 'Trigger threshold',
    'ov.buffer': 'Buffer',
    'ov.remaining': 'Until trigger',
    'ov.retain': 'Recent context kept',
    'ov.summaryMax': 'Summary max output',
    'ov.override': 'Model-specific policy',
    'ov.formula': 'threshold = min(window × ratio, window − max output − headroom)',
    'ov.compactions': 'Compaction events in this session',
    'ov.injected': 'Injected context sources',
    'ov.types': 'Event type counts',
    'msg.search': 'Search content / tool…',
    'msg.sort.order': 'In order',
    'msg.sort.size': 'By size',
    'msg.all': 'All',
    'msg.more': 'Show {n} more',
    'msg.count': '{n} nodes, {t}',
    'msg.parts': '{n} parts',
    'msg.truncated': '(truncated)',
    'msg.turn': 'Turn {n}',
    'msg.tool': 'Tool',
    'msg.trunc': '{n} earlier nodes not shown',
    'tools.defs': 'Tool definitions (sent with every request)',
    'tools.usage': 'Tool usage',
    'tools.deferred': 'Deferred tools (loaded on demand, not in context)',
    'tools.col.name': 'Name',
    'tools.col.kind': 'Kind',
    'tools.col.params': 'Params',
    'tools.col.calls': 'Calls',
    'tools.col.callTok': 'Call tokens',
    'tools.col.results': 'Results',
    'tools.col.resTok': 'Result tokens',
    'tools.col.max': 'Largest',
    'tools.system': 'System',
    'tools.none': 'None',
    'trend.title': 'Cumulative context (by node order)',
    'trend.scale.fit': 'Fit',
    'trend.scale.window': 'Whole window',
    'trend.turns': 'Tokens added per turn',
    'trend.hint': 'Hover for a node, click to open it in Messages.',
    'trend.threshold': 'Compact threshold',
    'trend.window': 'Window',
    'trend.mode.nodes': 'By node',
    'trend.mode.turns': 'By turn',
    'ov.trend': 'Context growth',
    'ov.cat.hint': 'Click a row to see what is in it',
    'ov.cat.tools': '{n} tool definitions, largest first (hover for the full description)',
    'ov.cat.skills': 'Skill catalog entries the model sees; full bodies and loads are under Skills',
    'ov.cat.splitNote': 'Assistant messages are split by part; sizes are the part of each message in this category',
    'ov.cat.empty': 'Nothing here',
    'ov.cat.showAll': 'Show all {n} in Messages →',
    'ov.details': 'Measurement and raw data',
    'ov.bar.ofWin': '{p} of window',
    'ov.bar.ofUsed': '{p} of used',
    'ov.bar.items': '{n} items',
    'nav.sources': 'Sources',
    'ov.stat.turns': 'Turns',
    'ov.stat.steps': 'Steps',
    'ov.stat.calls': 'Tool calls',
    'ov.stat.hit': 'Cache hit',
    'ov.stat.left': 'To compaction',
    'st.title': 'Context per step',
    'st.count': '{n} requests · click a bar for its step',
    'st.ctx': 'Context',
    'st.delta': 'vs prev',
    'st.output': 'Output',
    'st.cache': 'Cache',
    'st.viewMsgs': 'Messages',
    'ov.flowDiagram': 'Execution flow',
    'ov.flowDiagram.sub': 'Session lifecycle and where it is now',
    'msg.pre': 'Session start',
    'msg.step': 'Step {n}',
    'msg.stepsN': '{n} steps',
    'msg.itemsN': '{n} items',
    'msg.allCats': 'All categories',
    'msg.earlier': 'Show {n} earlier',
    'msg.none': 'No matching messages',
    'k.system': 'System',
    'k.systemTools': 'Tool defs',
    'k.mcpTools': 'MCP',
    'k.skills': 'Skills',
    'k.memory': 'Memory',
    'k.injected': 'Injected',
    'k.summary': 'Summary',
    'k.user': 'User',
    'k.assistantText': 'Reply',
    'k.reasoning': 'Thinking',
    'k.toolCalls': 'Call',
    'k.toolResults': 'Result',
    'k.other': 'Other',
    'tools.callsN': '{n} calls',
    'tools.defTok': 'def',
    'tools.useTok': 'use',
    'tools.definition': 'Definition',
    'tools.noDef': 'Not among this session\'s tool definitions (deferred or removed).',
    'tools.search': 'Search tools…',
    'tools.noUse': 'No tool calls in this session yet',
    'tools.defsShort': 'Tool definitions',
    'tools.defsNote': 'sent with every request, by tokens',
    'tools.paramsShort': '{n} params',
    'tools.showAllDefs': 'Show all {n}',
    'tools.deferredN': '{n} deferred (not in context):',
    'tools.sum.defs': 'Definitions',
    'tools.sum.defTok': 'Definition tokens',
    'tools.sum.used': 'Tools used',
    'tools.sum.calls': 'Calls',
    'tools.sum.resTok': 'Result tokens',
    'tools.sum.cmds': 'Commands',
    'tools.pick': 'Pick a tool on the left to see its calls and definition',
    'src.search': 'Search memory files / skills…',
    'src.memNoneShort': 'No memory files loaded; see Environment → File structure for where to put one',
    'src.skillsShort': '{n} · {l} loaded ({lt}) · {c} in catalog ({ct})',
    'src.skillsZero': 'No skills available in this session',
    'src.env': 'Environment',
    'src.itemsN': '{n} items',
    'src.treeSum': '{l} loaded · {e} not loaded',
    'src.sum.mem': 'Memory files',
    'src.sum.loaded': 'Skills loaded',
    'src.sum.catalog': 'In catalog',
    'src.sum.all': 'Skills visible',
    'src.sum.rt': 'Runtime facts',
    'src.pick': 'Pick an item on the left to read it',
    'msg.collapse': 'Collapse',
    'nav.analyze': 'Analyze',
    'az.title': 'Context analysis',
    'az.i1': 'Uses the model this session runs on to analyze its context, find the agent\'s defects and waste, and suggest fixes',
    'az.i2': 'Fully separate from the current conversation: nothing is written to the session and its context is untouched',
    'az.i3': 'Off by default; the model is called only when you press Send, and every send costs tokens',
    'az.i4': 'One question sends about {k} input tokens to {m} (session content goes to the model provider)',
    'az.noLlm': 'No model service is available here',
    'az.enable': 'Enable analysis',
    'az.on': 'On',
    'az.attach': 'Attach:',
    'az.sys': 'Full system prompt',
    'az.toolDesc': 'Tool descriptions',
    'az.detach': 'Click to remove',
    'az.cost': '≈{k} input this time',
    'az.clear': 'Clear',
    'az.off': 'Turn off',
    'az.hint': 'The report already has composition, tools, steps and the biggest messages. For the raw text, attach it above or use ✦ on an item in Prompt.',
    'az.q1': 'Why is this context so large? What should I trim first?',
    'az.q2': 'Find the agent\'s defects and propose concrete fixes',
    'az.q3': 'Which tools, skills or memory can be trimmed or deferred?',
    'az.q4': 'Any repeated reads, repeated calls or useless output? How to avoid them?',
    'az.thinking': 'Reasoning',
    'az.working': 'Analyzing…',
    'az.refs': 'Messages mentioned',
    'az.usage': 'in {i} · out {o}',
    'az.placeholder': 'Ask anything, e.g. “Why did step 4 add 3k?” (Enter to send, Shift+Enter for a new line)',
    'az.stop': 'Stop',
    'az.send': 'Send',
    'az.askThis': 'Ask AI about this item',
    'nav.prompt': 'Prompt',
    'sd.storyNone': 'No model output or tool calls in this step',
    'sd.said': 'said',
    'sd.thought': 'thought',
    'sd.called': 'called',
    'sd.story': 'What happened in this step',
    'sd.fresh': 'new',
    'sd.toolDefs': '{n} tool definitions',
    'sd.request': 'request sent here',
    'sd.promptTitle': 'What the model read',
    'sd.itemsN': '{n} items',
    'sd.promptAt': 'Everything the model read for the request at turn {t}, step {s}, top to bottom in reading order',
    'sd.promptNow': 'Everything the model read for the latest request, top to bottom in reading order; click a divider to see an earlier request',
    'sd.later': '{n} more after this step ({k}); the model had not seen them yet',
    'dg.title': 'Diagnosis',
    'dg.count': '{n} findings',
    'dg.view': 'View',
    'dg.ok': 'Nothing stands out: fixed overhead, tool results and single messages are all within normal range',
    'dg.runway': 'Growing {g} per step lately; automatic compaction in about {n} steps ({r} below the trigger)',
    'dg.over': 'Already past the compaction trigger; the next step will compact',
    'dg.fixed': '{k} ({p}) is there before any work starts: tool definitions {tk}, skills and memory {sk}. Every step carries it again',
    'dg.results': 'Tool results are {p}, mostly from {name} ({k}). Big files and long output are the usual cause',
    'dg.big': 'Message #{seq} alone is {p} ({k}): {what}',
    'dg.repeat': 'The same call was made {n} times: {what}',
    'dg.idle': '{n} tool definitions were never called and cost {k}',
    'dg.errors': '{n} tool calls failed ({names}); retries add more context',
    'dg.cache': 'The last request hit the cache for only {p}; most input was not cached',
    'sd.compacted': 'compacted',
    'sd.now': 'current (latest)',
    'sd.backNow': 'Back to current',
    'sd.added': 'Added',
    'sd.items': '{n} items · {k}',
    'sd.none': 'nothing new',
    'sd.onlyNew': 'Show only what this step added in Messages',
    'sd.showAll': 'Show all messages',
    'lay.title': 'Where the agent reads',
    'lay.sub': 'by dsh\'s actual loading rules',
    'lay.none': 'Load locations unavailable',
    'lay.notLoaded': 'exists, not loaded',
    'lay.memSum': '{n} loaded',
    'lay.memRule': 'Globally only AGENTS.md is read (not CLAUDE.md). In the project, every level from the root down to the working directory reads both AGENTS.md and CLAUDE.md (both, not either), then the .local versions; identical content in one level counts once. ~/.claude/CLAUDE.md is never read.',
    'lay.global': 'Global',
    'lay.globalNote': 'applies to every project; identical content counts once',
    'lay.project': 'Project',
    'lay.rootBy': 'root found by {m}',
    'lay.noRoot': 'no .git: only the working directory level',
    'lay.root': 'project root',
    'lay.cwd': 'working dir',
    'lay.canPlace': 'not present:',
    'lay.deeper': 'Deeper directories',
    'lay.deeperNote': 'added once files under them are read or written',
    'lay.skillRoots': 'Skill roots',
    'lay.skillRule': 'highest priority first; a name resolves to the first root that has it',
    'lay.sk.projectDsh': 'Project .dsh',
    'lay.sk.projectAgents': 'Project .agents',
    'lay.sk.custom': 'Custom dir',
    'lay.sk.userDsh': 'User ~/.dsh',
    'lay.sk.userAgents': 'User ~/.agents',
    'lay.sk.bundled': 'Bundled',
    'lay.skillsN': '{n} skills',
    'lay.onDisk': '{n} on disk',
    'lay.empty': 'empty',
    'lay.otherSources': 'Other sources:',
    'ov.composition': 'Token composition',
    'ov.usedShort': 'used',
    'ov.openCat': 'click to see these messages',
    'ov.more': 'All',
    'ov.peek.tools': '{n} tools · {c} calls',
    'ov.peek.cmds': '{n} runs · {d} total · {f} failed',
    'ov.peek.bigMsgs': 'Largest messages',
    'ov.peek.skills': '{l} loaded · {c} in catalog · {n} total',
    'ov.statsTitle': 'Context stats',
    'msg.sum.nodes': 'Messages',
    'msg.sum.tok': 'Message tokens',
    'msg.sum.turns': 'Turns',
    'msg.sum.steps': 'Steps',
    'msg.sum.calls': 'Tool calls',
    'msg.sum.max': 'Largest',
};

// ===== src/styles/00-text.scss
/* compiled from src/styles/00-text.scss by build.mjs — edit the .scss, not this file */
const CSS_TEXT = ".clx-btn {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  height: 28px;\n  padding: 0 8px;\n  border-radius: 14px;\n  border: none;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  line-height: 1;\n  cursor: pointer;\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n\n.clx-btn:hover, .clx-btn[aria-expanded=true] {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-btn.dock {\n  height: 22px;\n  padding: 1px 8px;\n  gap: 6px;\n  border-radius: var(--dsw-radius-sm, 6px);\n  color: var(--dsw-alias-label-tertiary);\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n}\n\n.clx-btn.dock:hover, .clx-btn.dock[aria-expanded=true] {\n  color: var(--dsw-alias-label-secondary);\n}\n\n[data-composer-dock]:has(.clx-dock-ring) > :not([data-slot]) {\n  display: none;\n}\n\n.clx-pop {\n  position: fixed;\n  z-index: 1000;\n  box-sizing: border-box;\n  width: 340px;\n  max-width: calc(100vw - 24px);\n  max-height: min(600px, 100vh - 96px);\n  overflow: auto;\n  border: 0;\n  border-radius: var(--dsw-radius-lg, 16px);\n  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-2));\n  backdrop-filter: var(--dsw-menu-backdrop-filter);\n  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter);\n  --dsw-elevation-stroke-color:var(--dsw-alias-border-l1);\n  box-shadow: var(--dsw-elevation-prominent, 0 8px 28px rgba(0, 0, 0, 0.18));\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-secondary);\n  padding: 16px;\n  text-align: left;\n}\n\n.clx-pop-head {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 16px;\n  padding-bottom: 8px;\n  margin-bottom: 10px;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n}\n\n.clx-pop-title {\n  font-weight: 500;\n  font-size: 12px;\n  color: var(--dsw-alias-label-primary);\n  display: inline-flex;\n  align-items: baseline;\n  gap: 6px;\n}\n\n.clx-pop-title-en {\n  font-weight: 400;\n  font-size: 12px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-pop-open {\n  font-size: 12px;\n  white-space: nowrap;\n  padding: 2px 6px;\n  margin: -2px -6px -2px 0;\n  border-radius: 6px;\n  transition: background-color 0.15s ease;\n}\n\n.clx-pop-open:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-pop {\n  animation: clx-pop-in 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) both;\n  transform-origin: bottom right;\n}\n\n@keyframes clx-pop-in {\n  from {\n    opacity: 0;\n    transform: translateY(6px) scale(0.98);\n  }\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n.clx-pop-usage {\n  display: flex;\n  align-items: baseline;\n  flex-wrap: wrap;\n  gap: 0 4px;\n}\n\n.clx-pop-usage .clx-sub {\n  white-space: pre;\n}\n\n.clx-pop-chip {\n  margin-left: auto;\n  align-self: center;\n  font-size: 11.5px;\n  padding: 2px 8px;\n  border-radius: 999px;\n  corner-shape: round;\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-bg-layer-2);\n  border: 1px solid var(--dsw-alias-border-l1);\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n\n.clx-pop-chip.warn {\n  color: var(--dsw-alias-state-warn-primary);\n  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent);\n}\n\n.clx-pop-caption {\n  font-size: 12px;\n  color: var(--dsw-alias-label-tertiary);\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  cursor: default;\n}\n\n.clx-prows {\n  margin-top: 10px;\n  display: flex;\n  flex-direction: column;\n  gap: 1px;\n}\n\n.clx-prows > * {\n  animation: clx-fade 0.3s ease both;\n  animation-delay: calc(0.12s + var(--i, 0) * 35ms);\n}\n\n.clx-prows > .clx-sep {\n  margin: 4px 0;\n}\n\n.clx-prow {\n  display: grid;\n  grid-template-columns: 10px minmax(0, 1fr) 58px 46px;\n  column-gap: 10px;\n  align-items: center;\n  padding: 3px 6px;\n  margin: 0 -6px;\n  border-radius: 6px;\n  font-variant-numeric: tabular-nums;\n  cursor: default;\n  transition: background-color 0.15s ease, opacity 0.2s ease;\n}\n\n.clx-prow.on {\n  background: color-mix(in srgb, var(--cat) 14%, transparent);\n}\n\n.clx-prows[data-active] .clx-prow:not(.on) {\n  opacity: 0.45;\n}\n\n.clx-pbar {\n  height: 10px;\n}\n\n.clx-pbar > span {\n  cursor: default;\n}\n\n.clx-pop-name {\n  min-width: 0;\n  overflow: hidden;\n}\n\n.clx-dot.hollow {\n  background: transparent;\n  border: 1.5px solid;\n  box-sizing: border-box;\n}\n\n.clx-prow .clx-pop-name {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n}\n\n.clx-prow .lead {\n  display: inline-flex;\n  align-items: center;\n  margin-left: 2px;\n  color: var(--dsw-alias-label-tertiary);\n  transition: color 0.15s ease;\n}\n\n.clx-prow.tog {\n  cursor: pointer;\n}\n\n.clx-prow.tog:hover .lead {\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-prow.sub {\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-prow.sub .clx-pop-name {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding-left: 2px;\n}\n\n.clx-prow.sub .clx-dot {\n  width: 7px;\n  height: 7px;\n  flex: none;\n}\n\n.clx-pkids {\n  display: flex;\n  flex-direction: column;\n  gap: 1px;\n  margin-left: 4px;\n  padding-left: 16px !important;\n  padding-left: 0;\n  border-left: 1px solid var(--dsw-alias-border-l1);\n  animation: clx-drop 0.2s ease both !important;\n}\n\n.clx-pkids > .clx-prow {\n  margin-left: -6px;\n  grid-template-columns: minmax(0, 1fr) 58px 46px;\n  column-gap: 10px;\n}\n\n.clx-pfile {\n  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);\n  font-size: 11.5px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  min-width: 0;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .clx-pop, .clx-pop * {\n    animation: none !important;\n    transition: none !important;\n  }\n}\n.clx-muted {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-sub {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-big {\n  font-size: 16px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-bar {\n  display: flex;\n  height: 10px;\n  border-radius: 5px;\n  overflow: hidden;\n  background: var(--dsw-alias-border-l1);\n  margin: 8px 0 6px;\n}\n\n.clx-bar > span {\n  height: 100%;\n  min-width: 0;\n}\n\n.clx-bar > span + span {\n  box-shadow: inset 1px 0 0 var(--dsw-alias-bg-layer-1);\n}\n\n.clx-hatch {\n  background: repeating-linear-gradient(135deg, var(--dsw-alias-border-l3) 0 3px, transparent 3px 6px);\n}\n\n.clx-rows {\n  display: grid;\n  grid-template-columns: auto 1fr auto auto;\n  column-gap: 10px;\n  row-gap: 5px;\n  align-items: center;\n  margin-top: 10px;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-dot {\n  width: 9px;\n  height: 9px;\n  border-radius: 3px;\n  display: inline-block;\n}\n\n.clx-dot.free {\n  border: 1px solid var(--dsw-alias-border-l3);\n}\n\n.clx-num {\n  text-align: right;\n}\n\n.clx-sep {\n  grid-column: 1/-1;\n  height: 1px;\n  background: var(--dsw-alias-border-l1);\n  margin: 3px 0;\n}\n\n.clx-foot {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  margin-top: 12px;\n  padding-top: 10px;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n}\n\n.clx-link {\n  border: none;\n  background: transparent;\n  color: var(--dsw-alias-state-business-primary);\n  cursor: pointer;\n  font-size: 12.5px;\n  padding: 4px 6px;\n  border-radius: 6px;\n}\n\n.clx-link:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-chipbtn {\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  border-radius: 7px;\n  padding: 3px 9px;\n  font-size: 12px;\n  cursor: pointer;\n}\n\n.clx-chipbtn:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-chipbtn[aria-pressed=true] {\n  background: var(--dsw-alias-interactive-bg-active);\n  color: var(--dsw-alias-label-primary);\n  border-color: var(--dsw-alias-border-l3);\n}\n\n.clx-pane {\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  line-height: 1.5;\n  padding: 0 0 48px;\n  box-sizing: border-box;\n  min-height: 100%;\n}\n\n/* this view only reads the context and spans the full width, so the conversation it sits in drops\n   its composer and its chat-width drag handles while it is open */\n[data-conversation-content]:has(.clx-pane) [data-composer-seat],\n[data-conversation-content]:has(.clx-pane) > [data-width-handle] {\n  display: none;\n}\n\n.clx-toolbar {\n  position: sticky;\n  top: 0;\n  z-index: 4;\n  padding: 10px var(--dsh-composer-side-clearance, 16px);\n  background: var(--dsw-alias-bg-base);\n}\n\n.clx-col {\n  box-sizing: border-box;\n  width: 100%;\n  margin: 0 auto;\n}\n\n.clx-toolbar-in {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n}\n\n.clx-segnav {\n  display: inline-flex;\n  gap: 2px;\n  padding: 3px;\n  border-radius: 10px;\n  background: var(--dsw-alias-bg-layer-2);\n  border: 1px solid var(--dsw-alias-border-l1);\n  overflow-x: auto;\n  scrollbar-width: none;\n  min-width: 0;\n  max-width: 100%;\n}\n\n.clx-segnav button {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  border: 0;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  padding: 5px 11px;\n  border-radius: 7px;\n  font-size: 12.5px;\n  cursor: pointer;\n  white-space: nowrap;\n}\n\n.clx-segnav button:hover {\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-segnav {\n  position: relative;\n}\n\n.clx-segnav::before {\n  content: \"\";\n  position: absolute;\n  left: 0;\n  top: 3px;\n  bottom: 3px;\n  width: var(--ind-w, 0);\n  transform: translateX(var(--ind-x, 0));\n  border-radius: 7px;\n  background: var(--dsw-alias-bg-layer-1);\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), 0 0 0 1px var(--dsw-alias-border-l1);\n  opacity: 0;\n  transition: transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1), width 0.32s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s;\n}\n\n.clx-segnav[data-ind]::before {\n  opacity: 1;\n}\n\n.clx-segnav button {\n  position: relative;\n  z-index: 1;\n  transition: color 0.2s ease;\n}\n\n.clx-segnav[data-ind] button[aria-selected=true] {\n  background: transparent !important;\n  box-shadow: none !important;\n}\n\n.clx-segnav button[aria-selected=true] {\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), 0 0 0 1px var(--dsw-alias-border-l1);\n}\n\n.clx-segnav button svg {\n  display: none;\n}\n\n.clx-toolbar-meta {\n  margin-left: auto;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 12px;\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-toolbar-live {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  margin-left: 6px;\n  padding-left: 10px;\n  border-left: 1px solid var(--dsw-alias-border-l1);\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-main {\n  min-width: 0;\n  padding: 4px var(--dsh-composer-side-clearance, 16px) 0;\n}\n\n.clx-main > .clx-col {\n  container-type: inline-size;\n}\n\n@container (max-width: 760px) {\n  .clx-segnav button {\n    padding: 5px 9px;\n  }\n  .clx-toolbar-meta > :not(.clx-toolbar-live) {\n    display: none;\n  }\n  .clx-toolbar-live {\n    border-left: 0;\n    padding-left: 0;\n    margin-left: 0;\n  }\n}\n.clx-card {\n  background: var(--dsw-alias-settings-card-fill);\n  border: 1px solid var(--dsw-alias-settings-card-stroke);\n  border-radius: 10px;\n  padding: 12px;\n  margin-bottom: 12px;\n}\n\n.clx-subh {\n  margin: 4px 0 8px;\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-subh.sep {\n  margin-top: 14px;\n  padding-top: 12px;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n}\n\n.clx-card h4 {\n  margin: 0 0 8px;\n  font-size: 12.5px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-kv {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));\n  gap: 8px 14px;\n}\n\n.clx-kv > div {\n  min-width: 0;\n}\n\n.clx-kv .k {\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-kv .v {\n  font-variant-numeric: tabular-nums;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-table {\n  width: 100%;\n  border-collapse: collapse;\n  font-variant-numeric: tabular-nums;\n  font-size: 12.5px;\n}\n\n.clx-table th {\n  font-weight: 500;\n  color: var(--dsw-alias-label-tertiary);\n  text-align: right;\n  padding: 4px 6px;\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  white-space: nowrap;\n}\n\n.clx-table th:first-child, .clx-table td:first-child {\n  text-align: left;\n}\n\n.clx-table td {\n  padding: 4px 6px;\n  text-align: right;\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  white-space: nowrap;\n}\n\n.clx-table td.wrap {\n  white-space: normal;\n  word-break: break-word;\n}\n\n.clx-table tr:last-child td {\n  border-bottom: none;\n}\n\n.clx-scroll {\n  overflow-x: auto;\n}\n\n.clx-gauge {\n  display: flex;\n  align-items: center;\n  gap: 14px;\n  flex-wrap: wrap;\n}\n\n.clx-card-head {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex-wrap: wrap;\n  margin-bottom: 8px;\n}\n\n.clx-card-head h4 {\n  margin: 0;\n  flex: 1;\n  min-width: 0;\n}\n\n.clx-card-head > .clx-muted {\n  font-size: 11.5px;\n}\n\n.clx-segmini {\n  display: inline-flex;\n  gap: 4px;\n}\n\n.clx-hero {\n  display: flex;\n  align-items: center;\n  gap: 16px;\n  margin-bottom: 12px;\n}\n\n.clx-hero-main {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n\n.clx-hero-pct {\n  font-size: 26px;\n  font-weight: 650;\n  letter-spacing: -0.01em;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-hero-side {\n  display: grid;\n  grid-template-columns: auto auto;\n  gap: 3px 14px;\n  font-size: 12px;\n  align-self: center;\n  padding-left: 16px;\n  border-left: 1px solid var(--dsw-alias-border-l1);\n}\n\n.clx-hero-kv {\n  display: contents;\n}\n\n.clx-hero-kv .k {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-hero-kv .v {\n  color: var(--dsw-alias-label-primary);\n  font-variant-numeric: tabular-nums;\n  text-align: right;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  max-width: 220px;\n}\n\n.clx-hero-card .clx-legend {\n  margin-top: 8px;\n}\n\n.clx-catrow {\n  display: grid;\n  grid-template-columns: minmax(0, 1.5fr) minmax(40px, 1fr) 58px 52px 34px;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 10px;\n  border-radius: 10px;\n  font-size: 12.5px;\n}\n\n.clx-catrow.head {\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n  padding: 0 10px 4px;\n}\n\n.clx-catrow.head > span:nth-child(n+3) {\n  text-align: right;\n}\n\n.clx-catrow[role=button] {\n  cursor: pointer;\n}\n\n.clx-catrow[role=button]:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-catrow[role=button]:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -2px;\n}\n\n.clx-catrow .num {\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-catrow.static {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-catcell {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n}\n\n.clx-caret {\n  width: 12px;\n  height: 12px;\n  flex: none;\n  display: inline-flex;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-caret svg {\n  transition: transform 0.15s;\n}\n\n.clx-catblock.open .clx-caret svg {\n  transform: rotate(90deg);\n}\n\n.clx-catname {\n  display: flex;\n  align-items: baseline;\n  gap: 6px;\n  min-width: 0;\n  overflow: hidden;\n}\n\n.clx-catname .zh {\n  white-space: nowrap;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-catname .en {\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-catbar {\n  height: 6px;\n  border-radius: 3px;\n  background: var(--dsw-alias-border-l1);\n  overflow: hidden;\n}\n\n.clx-catbar > span {\n  display: block;\n  height: 100%;\n  border-radius: 3px;\n}\n\n.clx-catitem {\n  display: flex;\n  align-items: flex-start;\n  gap: 10px;\n  padding: 6px 10px 6px 24px;\n  border-radius: 8px;\n}\n\n/* ---- list items: one look everywhere (概览 分类明细, 消息, 工具, 技能, 记忆文件, 轨迹) ----\n   rows are rounded, no hairlines; an open item is the same row grown into a block tinted\n   in its colour, its content aligned with the row's text column; nested lists put their\n   arrows under the parent's dot; a nested open item is a lighter block inside the tint */\n.clx-catblock, .clx-node, .clx-tblock, .clx-disc, .clx-flow-tgroup {\n  border: 0;\n  border-radius: 10px;\n  margin: 0;\n  transition: background-color 0.2s ease;\n}\n\n:is(.clx-catblock, .clx-node, .clx-tblock, .clx-disc, .clx-flow-tgroup) + :is(.clx-catblock, .clx-node, .clx-tblock, .clx-disc, .clx-flow-tgroup) {\n  margin-top: 2px;\n}\n\n:is(.clx-catblock, .clx-node, .clx-tblock, .clx-disc, .clx-flow-tgroup).open {\n  background: color-mix(in srgb, var(--cat, var(--dsw-alias-label-tertiary)) 8%, transparent);\n}\n\n:is(.clx-catblock, .clx-node, .clx-tblock, .clx-disc).open :is(.clx-node, .clx-tblock, .clx-disc).open {\n  background: color-mix(in srgb, var(--cat, var(--dsw-alias-label-tertiary)) 7%, var(--dsw-alias-bg-layer-1));\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);\n}\n\n:is(.clx-catblock, .clx-node, .clx-tblock, .clx-disc).open > :is(.clx-catrow, .clx-node-row, .clx-trow, .clx-urow, .clx-disc-head) {\n  background: transparent;\n}\n\n:is(.clx-catblock, .clx-node, .clx-tblock, .clx-disc).open > :is(.clx-catrow, .clx-node-row, .clx-trow, .clx-urow, .clx-disc-head):hover {\n  background: color-mix(in srgb, var(--cat, var(--dsw-alias-label-tertiary)) 8%, transparent);\n}\n\n:is(.clx-catblock, .clx-node, .clx-tblock, .clx-disc).open :is(.clx-node-row, .clx-trow, .clx-urow, .clx-disc-head, .clx-catitem):hover {\n  background: color-mix(in srgb, var(--cat, var(--dsw-alias-label-tertiary)) 9%, transparent);\n}\n\n.clx-catdetail {\n  margin: 0;\n  padding: 0 8px 8px 18px;\n}\n\n.clx-detail {\n  margin: 0;\n  padding: 0 12px 12px 74px;\n  cursor: auto;\n  animation: clx-drop 0.26s cubic-bezier(0.2, 0.8, 0.2, 1) both;\n}\n\n.clx-expand {\n  margin: 0;\n  padding: 2px 12px 12px 32px;\n  animation: clx-drop 0.26s cubic-bezier(0.2, 0.8, 0.2, 1) both;\n}\n\n.clx-expand > .clx-node:first-of-type, .clx-catdetail > .clx-node:first-of-type {\n  margin-top: 0;\n}\n\n.clx-disc-body {\n  margin: 0;\n  padding: 0 12px 12px 30px;\n  animation: clx-drop 0.26s cubic-bezier(0.2, 0.8, 0.2, 1) both;\n}\n\n@container (max-width: 560px) {\n  .clx-detail {\n    padding-left: 12px;\n  }\n  .clx-expand {\n    padding-left: 12px;\n  }\n  .clx-disc-body {\n    padding-left: 12px;\n  }\n}\n.clx-flow-tgroup {\n  --cat:var(--dsw-alias-state-business-primary);\n}\n\n.clx-flow-turn {\n  padding: 8px 10px;\n  border-radius: 10px;\n  cursor: pointer;\n  transition: background-color 0.15s ease;\n}\n\n.clx-flow-steps .clx-flow-tgroup > .clx-flow-turn {\n  position: sticky;\n  top: 0;\n  z-index: 1;\n  background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1));\n}\n\n.clx-flow-steps .clx-flow-tgroup.open > .clx-flow-turn {\n  background: linear-gradient(color-mix(in srgb, var(--cat) 8%, transparent), color-mix(in srgb, var(--cat) 8%, transparent)), var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1));\n}\n\n.clx-flow-steps .clx-flow-tgroup > .clx-flow-turn:hover {\n  background: linear-gradient(color-mix(in srgb, var(--cat) 14%, transparent), color-mix(in srgb, var(--cat) 14%, transparent)), var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1));\n}\n\n.clx-flow-tgroup.open {\n  padding-bottom: 6px;\n}\n\n.clx-flow-tgroup.open .clx-flow-step:hover {\n  background: color-mix(in srgb, var(--cat) 9%, transparent);\n}\n\n.clx-flow-step.sel {\n  background: color-mix(in srgb, var(--cat, var(--dsw-alias-state-business-primary)) 18%, transparent);\n}\n\n.clx-catitem .main {\n  flex: 1;\n  min-width: 0;\n}\n\n/* a call and its result read as one unit */\n.clx-pair {\n  border-radius: 9px;\n  background: color-mix(in srgb, var(--cat, var(--dsw-alias-label-tertiary)) 4%, var(--dsw-alias-bg-layer-1));\n  padding: 6px 10px 8px;\n  margin-top: 6px;\n}\n\n.clx-pair:first-child {\n  margin-top: 0;\n}\n\n.clx-pair > .clx-rich.bare + .clx-rich.bare {\n  border-top: 1px dashed var(--dsw-alias-border-l2);\n}\n\n.clx-pair .clx-rich.bare > .clx-rich-body.flush, .clx-pair .clx-rich.bare .clx-code pre, .clx-pair .clx-rich.bare .clx-code [data-code-block-content] {\n  background: var(--dsw-alias-bg-layer-2) !important;\n}\n\n.clx-pair-note {\n  font-size: 12px;\n  color: var(--dsw-alias-label-tertiary);\n  padding: 6px 0 2px;\n  border-top: 1px dashed var(--dsw-alias-border-l2);\n  margin-top: 6px;\n}\n\n.clx-pair-note:first-child {\n  border-top: 0;\n  margin-top: 0;\n}\n\n.clx-node.paired {\n  margin-left: 30px;\n}\n\n.clx-node.paired > .clx-node-row .seq::before {\n  content: \"↳ \";\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-inv-row .prev.res {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  overflow: hidden;\n  white-space: nowrap;\n}\n\n.clx-inv-row .prev.res .clx-dot {\n  flex: none;\n  width: 6px;\n  height: 6px;\n}\n\n.clx-inv-row .prev.err {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-cmdcard {\n  container-type: inline-size;\n}\n\n.clx-cmdcard > .clx-card-head h4 {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.clx-cmd-icon {\n  font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;\n  color: var(--dsw-alias-label-tertiary);\n  letter-spacing: -0.5px;\n}\n\n.clx-cmd-status {\n  display: inline-flex;\n  gap: 2px;\n  padding: 2px;\n  border-radius: 9px;\n  background: var(--dsw-alias-bg-layer-1);\n  border: 1px solid var(--dsw-alias-border-l1);\n}\n\n.clx-cmd-sbtn {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  border: 0;\n  background: transparent;\n  border-radius: 7px;\n  padding: 3px 10px;\n  font-size: 12px;\n  cursor: pointer;\n  color: var(--dsw-alias-label-secondary);\n  transition: background-color 0.15s ease, color 0.15s ease;\n}\n\n.clx-cmd-sbtn b {\n  font-weight: 600;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-cmd-sbtn.bad {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-cmd-sbtn.slow {\n  color: #C98A1E;\n}\n\n.clx-cmd-sbtn.bg {\n  color: #2B93C4;\n}\n\n.clx-cmd-sbtn:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-cmd-sbtn[aria-pressed=true] {\n  background: var(--dsw-alias-state-business-primary);\n  color: #fff;\n}\n\n.clx-cmd-sbtn.bad[aria-pressed=true] {\n  background: var(--dsw-alias-state-error-primary);\n}\n\n.clx-cmd-sbtn.slow[aria-pressed=true] {\n  background: #D6951F;\n}\n\n.clx-cmd-sbtn.bg[aria-pressed=true] {\n  background: #2B93C4;\n}\n\n.clx-cmd {\n  display: grid;\n  grid-template-columns: minmax(210px, 270px) minmax(0, 1fr);\n  gap: 18px;\n  align-items: start;\n}\n\n.clx-cmd-side {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  min-width: 0;\n}\n\n.clx-cmd-h {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-secondary);\n  margin: 6px 2px 0;\n}\n\n.clx-cmd-h:first-child {\n  margin-top: 0;\n}\n\n.clx-cmd-h > span {\n  flex: 1;\n}\n\n.clx-cmd-tiles {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 6px;\n}\n\n.clx-cmd-tile {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  padding: 8px 10px;\n  border-radius: 10px;\n  background: var(--dsw-alias-bg-layer-1);\n}\n\n.clx-cmd-tile[role=button] {\n  cursor: pointer;\n}\n\n.clx-cmd-tile[role=button]:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-cmd-tile b {\n  font-size: 18px;\n  font-weight: 650;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-cmd-tile b.accent {\n  color: var(--dsw-alias-state-business-primary);\n}\n\n.clx-cmd-tile b.bad {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-cmd-tile b.bgc {\n  color: #2B93C4;\n}\n\n.clx-cmd-tile span {\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-cmd-notes {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n\n.clx-cmd-note {\n  display: grid;\n  grid-template-columns: 8px auto minmax(0, 1fr) auto;\n  align-items: center;\n  gap: 8px;\n  padding: 6px 10px;\n  border-radius: 10px;\n  font-size: 12px;\n  cursor: pointer;\n  background: var(--dsw-alias-bg-layer-1);\n}\n\n.clx-cmd-note:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-cmd-note .clx-dot {\n  width: 7px;\n  height: 7px;\n}\n\n.clx-cmd-note .k {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-cmd-note code {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-cmd-note b {\n  font-weight: 600;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-cmd-note b.slow, .clx-cmd-row .dur.slow, .clx-cmd-meta b.slow {\n  color: #C98A1E;\n}\n\n.clx-cmd-note b.bad, .clx-cmd-meta b.bad {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-cmd-pq {\n  width: 120px;\n  min-width: 0;\n  font-size: 11.5px;\n  padding: 2px 8px;\n  border-radius: 6px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  font-weight: 400;\n}\n\n.clx-cmd-progs {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  max-height: 360px;\n  overflow: auto;\n  margin: 0 -2px;\n  padding: 0 2px;\n}\n\n.clx-cmd-prog {\n  display: grid;\n  grid-template-columns: 8px minmax(0, 1fr) auto auto;\n  grid-template-rows: auto 3px;\n  align-items: center;\n  column-gap: 8px;\n  row-gap: 4px;\n  padding: 6px 10px;\n  border-radius: 10px;\n  cursor: pointer;\n  font-size: 12.5px;\n}\n\n.clx-cmd-prog:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-cmd-prog.on {\n  background: color-mix(in srgb, var(--pc) 14%, transparent);\n}\n\n.clx-cmd-prog .clx-dot {\n  background: var(--pc);\n  width: 7px;\n  height: 7px;\n}\n\n.clx-cmd-prog code {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-cmd-prog .n {\n  grid-column: 4;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  white-space: nowrap;\n}\n\n.clx-cmd-prog .n em {\n  font-style: normal;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-cmd-prog .clx-cmd-badge {\n  grid-column: 3;\n}\n\n.clx-cmd-prog .bar {\n  grid-column: 2/5;\n  grid-row: 2;\n  height: 3px;\n  border-radius: 2px;\n  background: color-mix(in srgb, var(--pc) 12%, transparent);\n  overflow: hidden;\n}\n\n.clx-cmd-prog .bar > span {\n  display: block;\n  height: 100%;\n  border-radius: 2px;\n  background: var(--pc);\n  opacity: 0.75;\n}\n\n.clx-cmd-main {\n  min-width: 0;\n}\n\n.clx-cmd-main > .clx-msgtools {\n  margin-bottom: 6px;\n}\n\n.clx-cmd-filt {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 12px;\n  margin: 0 2px 6px;\n}\n\n.clx-linkbtn {\n  border: 0;\n  background: transparent;\n  padding: 0;\n  font-size: 12px;\n  color: var(--dsw-alias-state-business-primary);\n  cursor: pointer;\n}\n\n.clx-linkbtn:hover {\n  text-decoration: underline;\n}\n\n.clx-cmd-row {\n  display: grid;\n  grid-template-columns: 12px 14px minmax(0, 1fr) auto 56px auto;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 10px;\n  border-radius: 10px;\n  font-size: 12.5px;\n  cursor: pointer;\n  transition: background-color 0.15s ease;\n}\n\n.clx-cmd-row:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-cmd-row:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -2px;\n}\n\n.clx-cmd-row .cmd {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-cmd-row .tags {\n  display: inline-flex;\n  gap: 4px;\n}\n\n.clx-cmd-row .dur {\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-cmd-row .when {\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11.5px;\n  white-space: nowrap;\n}\n\n.clx-cmd-st {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 14px;\n  font-size: 12px;\n  font-weight: 700;\n}\n\n.clx-cmd-st.ok {\n  color: #3FB37F;\n}\n\n.clx-cmd-st.bad {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-cmd-st.run::before {\n  content: \"\";\n  width: 9px;\n  height: 9px;\n  border-radius: 50%;\n  corner-shape: round;\n  border: 2px solid #3BA7D9;\n  border-right-color: transparent;\n  animation: clx-spin 0.8s linear infinite;\n}\n\n@keyframes clx-spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n.clx-cmd-badge {\n  display: inline-flex;\n  align-items: center;\n  padding: 0 6px;\n  border-radius: 999px;\n  corner-shape: round;\n  font-size: 10.5px;\n  line-height: 17px;\n  white-space: nowrap;\n  border: 1px solid var(--dsw-alias-border-l2);\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-cmd-badge.bad {\n  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-cmd-badge.bg {\n  border-color: color-mix(in srgb, #2B93C4 40%, transparent);\n  color: #2B93C4;\n}\n\n.clx-cmd-dir {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  vertical-align: 1px;\n  max-width: min(40%, 180px);\n  margin-right: 6px;\n  padding: 0 6px;\n  border-radius: 5px;\n  font: 500 11px/18px var(--dsw-font-family, inherit);\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-bg-layer-1);\n  border: 1px solid var(--dsw-alias-border-l1);\n  white-space: nowrap;\n}\n\n.clx-cmd-dir svg {\n  flex: none;\n  opacity: 0.7;\n}\n\n.clx-cmd-dir > span {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.clx-cmdtext .prog {\n  color: var(--dsw-alias-state-business-primary);\n  font-weight: 600;\n}\n\n.clx-cmdtext .op {\n  color: var(--dsw-alias-label-tertiary);\n  font-weight: 600;\n}\n\n.clx-cmdtext .redir {\n  color: #D2555A;\n}\n\n.clx-cmdtext .str {\n  color: #2F8F5B;\n}\n\n.clx-cmdtext .flag {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-cmd-item.failed > .clx-cmd-row .cmd {\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-node.open > .clx-cmd-row {\n  background: transparent;\n}\n\n.clx-node.open > .clx-cmd-row:hover {\n  background: color-mix(in srgb, var(--cat) 9%, transparent);\n}\n\n.clx-cmd-detail {\n  padding: 0 12px 12px 54px;\n}\n\n.clx-cmd-desc {\n  font-size: 12.5px;\n  color: var(--dsw-alias-label-secondary);\n  margin-bottom: 6px;\n}\n\n.clx-cmd-meta {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 16px;\n  font-size: 12px;\n  margin-bottom: 8px;\n}\n\n.clx-cmd-meta span {\n  display: inline-flex;\n  gap: 6px;\n  min-width: 0;\n}\n\n.clx-cmd-meta i {\n  font-style: normal;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-cmd-meta b {\n  font-weight: 500;\n  color: var(--dsw-alias-label-primary);\n  overflow-wrap: anywhere;\n}\n\n@container (max-width: 880px) {\n  .clx-cmd {\n    grid-template-columns: minmax(0, 1fr);\n  }\n  .clx-cmd-tiles {\n    grid-template-columns: repeat(4, minmax(0, 1fr));\n  }\n  .clx-cmd-progs {\n    display: grid;\n    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));\n    column-gap: 8px;\n  }\n  .clx-cmd-progs {\n    max-height: 220px;\n  }\n}\n@container (max-width: 560px) {\n  .clx-cmd-tiles {\n    grid-template-columns: 1fr 1fr;\n  }\n  .clx-cmd-row {\n    grid-template-columns: 12px 14px minmax(0, 1fr) 52px;\n  }\n  .clx-cmd-row .tags, .clx-cmd-row .when {\n    display: none;\n  }\n  .clx-cmd-detail {\n    padding: 0 10px 10px 12px;\n  }\n}\n.clx-minibar.two {\n  display: flex;\n  gap: 2px;\n  background: none;\n}\n\n.clx-minibar.two > span {\n  border-radius: 2px;\n}\n\n.clx-catitem .name {\n  font-weight: 550;\n  font-size: 12.5px;\n  word-break: break-all;\n}\n\n.clx-catitem .desc {\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n  display: -webkit-box;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n}\n\n.clx-catitem .tok {\n  font-size: 12px;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-secondary);\n  white-space: nowrap;\n}\n\n.clx-catfoot {\n  display: flex;\n  gap: 6px;\n  flex-wrap: wrap;\n  margin-top: 8px;\n}\n\n@container (max-width: 560px) {\n  .clx-catrow {\n    grid-template-columns: minmax(0, 1fr) 58px 52px;\n  }\n  .clx-catrow > :nth-child(2), .clx-catrow > :nth-child(5) {\n    display: none;\n  }\n  .clx-hero {\n    flex-wrap: wrap;\n  }\n  .clx-hero-side {\n    border-left: 0;\n    padding-left: 0;\n    width: 100%;\n  }\n}\n.clx-legend {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 12px;\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-legend span {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n}\n\n.clx-msgtools {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  align-items: center;\n  margin-bottom: 8px;\n}\n\n.clx-msgtools input {\n  flex: 1 1 160px;\n  min-width: 0;\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 7px;\n  padding: 5px 8px;\n  font-size: 12.5px;\n}\n\n.clx-chips {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n  margin-bottom: 8px;\n}\n\n.clx-chip {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 999px;\n  corner-shape: round;\n  padding: 2px 8px;\n  font-size: 11.5px;\n  cursor: pointer;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-chip[aria-pressed=true] {\n  background: var(--dsw-alias-interactive-bg-active);\n  color: var(--dsw-alias-label-primary);\n  border-color: var(--dsw-alias-border-l3);\n}\n\n.clx-node-row {\n  display: grid;\n  grid-template-columns: 12px 36px minmax(0, 1fr) 64px;\n  gap: 8px;\n  align-items: center;\n  padding: 8px 10px;\n  cursor: pointer;\n  border-radius: 10px;\n  transition: background-color 0.15s ease, box-shadow 0.15s ease;\n}\n\n.clx-node-row:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-node-row .seq {\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-node-row .main {\n  min-width: 0;\n}\n\n.clx-node-row .line1 {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n  min-width: 0;\n}\n\n.clx-node-row .prev {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 12.5px;\n}\n\n.clx-node-row .tok {\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n  font-size: 12.5px;\n}\n\n.clx-minibar {\n  height: 3px;\n  border-radius: 2px;\n  margin-top: 3px;\n  background: var(--dsw-alias-border-l1);\n  overflow: hidden;\n}\n\n.clx-minibar > span {\n  display: block;\n  height: 100%;\n}\n\n.clx-tag {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  white-space: nowrap;\n}\n\n.clx-callid {\n  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);\n  font-size: 11px;\n  max-width: 24ch;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-detail-meta {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 10px;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n  margin-bottom: 6px;\n}\n\n.clx-part {\n  margin-top: 8px;\n}\n\n.clx-part-head {\n  display: flex;\n  gap: 8px;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n  margin-bottom: 3px;\n}\n\n.clx-pre {\n  margin: 0;\n  max-height: 360px;\n  overflow: auto;\n  white-space: pre-wrap;\n  word-break: break-word;\n  background: var(--dsw-alias-bg-layer-2);\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 7px;\n  padding: 8px;\n  font-size: 12px;\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n}\n\n.clx-rich.bare {\n  margin-top: 0;\n  border: 0;\n  border-radius: 0;\n  background: none;\n  overflow: visible;\n}\n\n.clx-rich.bare + .clx-rich.bare {\n  margin-top: 10px;\n  padding-top: 8px;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n}\n\n.clx-rich.bare > .clx-rich-head {\n  padding: 4px 0 6px;\n  background: none;\n  border-bottom: 0;\n  font-size: 11.5px;\n}\n\n.clx-rich.bare > .clx-rich-note {\n  margin: 0 0 8px;\n  border-radius: 7px;\n  border-bottom: 0;\n}\n\n.clx-rich.bare > .clx-rich-body {\n  padding: 2px 2px 4px;\n  font-size: 13px;\n}\n\n.clx-rich.bare > .clx-rich-body:has(> [class*=json], > .clx-plain.mono) {\n  padding: 8px 10px;\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-1);\n}\n\n.clx-rich.bare > .clx-rich-body.flush {\n  padding: 0;\n  border-radius: 8px;\n  overflow: hidden;\n  background: var(--dsw-alias-bg-layer-1);\n}\n\n.clx-rich.bare .clx-code [data-code-block-content], .clx-rich.bare .clx-code pre {\n  background: var(--dsw-alias-bg-layer-1) !important;\n}\n\n.clx-rich.bare > .clx-rich-more {\n  border-top: 0;\n  border-radius: 6px;\n  margin-top: 4px;\n}\n\n.clx-rich {\n  margin-top: 8px;\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 10px;\n  background: var(--dsw-alias-bg-layer-1);\n  overflow: hidden;\n}\n\n.clx-rich-head {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 8px;\n  row-gap: 4px;\n  padding: 6px 10px;\n  font-size: 12px;\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  background: var(--dsw-alias-bg-layer-2);\n}\n\n.clx-rich-head b {\n  font-weight: 600;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-rich-modes {\n  margin-left: auto;\n  display: inline-flex;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 6px;\n  overflow: hidden;\n}\n\n.clx-seg {\n  border: 0;\n  background: transparent;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11.5px;\n  padding: 2px 8px;\n  cursor: pointer;\n}\n\n.clx-seg + .clx-seg {\n  border-left: 1px solid var(--dsw-alias-border-l2);\n}\n\n.clx-seg[aria-pressed=true] {\n  background: var(--dsw-alias-interactive-bg-active);\n  color: var(--dsw-alias-label-primary);\n}\n\n/* 「↗ 预览」: opens the file a tool touched in dsh's right Sidebar (the snapshot stays inline) */\n.clx-filepreview {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n}\n\n.clx-filebtn {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-state-business-primary);\n  font-size: 11.5px;\n  line-height: 1.4;\n  padding: 2px 8px;\n  border-radius: 6px;\n  cursor: pointer;\n  white-space: nowrap;\n  transition: background-color 0.15s ease, border-color 0.15s ease;\n}\n\n.clx-filebtn:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n  border-color: var(--dsw-alias-state-business-primary);\n}\n\n.clx-filebtn:focus-visible {\n  outline: 2px solid var(--dsw-alias-border-focus, #4d8cff);\n  outline-offset: 1px;\n}\n\n.clx-filebtn svg {\n  flex: none;\n}\n\n.clx-filepreview-note {\n  font-size: 11px;\n  color: var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary));\n  overflow-wrap: anywhere;\n}\n\n.clx-rich-body {\n  padding: 10px 14px;\n  font-size: 13.5px;\n  line-height: 1.6;\n  color: var(--dsw-alias-label-primary);\n  overflow-wrap: anywhere;\n}\n\n.clx-rich-body.folded {\n  max-height: 420px;\n  overflow: hidden;\n  -webkit-mask-image: linear-gradient(#000 78%, transparent);\n  mask-image: linear-gradient(#000 78%, transparent);\n}\n\n.clx-rich-more {\n  display: block;\n  width: 100%;\n  border: 0;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  padding: 6px;\n  cursor: pointer;\n}\n\n.clx-rich-more:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-md {\n  min-width: 0;\n}\n\n.clx-rich-body.flush {\n  padding: 0;\n}\n\n.clx-code {\n  position: relative;\n}\n\n.clx-code :has(> [data-code-block-banner]) {\n  position: absolute;\n  top: 6px;\n  right: 8px;\n  z-index: 1;\n  height: auto;\n  min-height: 0;\n  padding: 0;\n  margin: 0;\n  background: none;\n  border: 0;\n}\n\n.clx-code [data-code-block-banner] {\n  padding: 0;\n  background: none;\n  border: 0;\n  min-height: 0;\n}\n\n.clx-code [data-code-block-banner] > :first-child {\n  display: none;\n}\n\n.clx-code > * {\n  margin: 0 !important;\n  border: 0 !important;\n  border-radius: 0 !important;\n}\n\n.clx-rich-note {\n  font-size: 11.5px;\n  padding: 6px 10px;\n  color: var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary));\n  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent);\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  overflow-wrap: anywhere;\n}\n\n.clx-md > :first-child {\n  margin-top: 0;\n}\n\n.clx-md > :last-child {\n  margin-bottom: 0;\n}\n\n.clx-plain {\n  margin: 0;\n  white-space: pre-wrap;\n  word-break: break-word;\n  font-size: 12.5px;\n  line-height: 1.55;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-plain.mono {\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-size: 12px;\n}\n\n.clx-disc-head {\n  display: flex;\n  gap: 8px;\n  align-items: flex-start;\n  padding: 8px 10px;\n  cursor: pointer;\n  border-radius: 10px;\n  transition: background-color 0.15s ease, box-shadow 0.15s ease;\n}\n\n.clx-disc-head:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -2px;\n}\n\n.clx-disc-head:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-disc-caret {\n  display: inline-flex;\n  width: 12px;\n  flex: none;\n  padding-top: 3px;\n}\n\n.clx-disc-head > :last-child {\n  flex: 1;\n  min-width: 0;\n}\n\n.clx-src-row {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 4px 10px;\n  font-size: 12.5px;\n}\n\n.clx-src-name {\n  font-weight: 600;\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-size: 12.5px;\n  overflow-wrap: anywhere;\n}\n\n.clx-src-tok {\n  margin-left: auto;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-src-meta {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 12px;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n  margin-bottom: 2px;\n  overflow-wrap: anywhere;\n}\n\n.clx-src-meta a, .clx-link {\n  color: var(--dsw-alias-state-business-primary);\n  cursor: pointer;\n  font-size: 11.5px;\n}\n\n.clx-src-path {\n  font-size: 12px;\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  overflow-wrap: anywhere;\n  margin-bottom: 8px;\n}\n\n.clx-skill-desc {\n  font-size: 12.5px;\n  color: var(--dsw-alias-label-secondary);\n  margin-top: 3px;\n  line-height: 1.5;\n  overflow-wrap: anywhere;\n}\n\n.clx-badge {\n  font-size: 11px;\n  padding: 0 7px;\n  border-radius: 9px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  color: var(--dsw-alias-label-secondary);\n  white-space: nowrap;\n}\n\n.clx-badge.ok {\n  border-color: transparent;\n  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, transparent);\n  color: var(--dsw-alias-state-success-primary);\n}\n\n.clx-badge.dim {\n  color: var(--dsw-alias-label-tertiary);\n  border-style: dashed;\n}\n\n.clx-empty {\n  font-size: 12.5px;\n  color: var(--dsw-alias-label-tertiary);\n  padding: 10px;\n  border: 1px dashed var(--dsw-alias-border-l2);\n  border-radius: 8px;\n}\n\n.clx-memtab {\n  display: grid;\n  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);\n  gap: 12px;\n  align-items: start;\n}\n\n.clx-memtab-l, .clx-memtab-r {\n  min-width: 0;\n  container-type: inline-size;\n}\n\n.clx-ft {\n  grid-template-columns: max-content 32px minmax(0, 1fr) !important;\n}\n\n@container (max-width: 1020px) {\n  .clx-memtab {\n    grid-template-columns: minmax(0, 1fr);\n  }\n}\n.clx-ftcard > .clx-card-head {\n  margin-bottom: 2px;\n}\n\n.clx-ft-legend {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  font-size: 11.5px;\n}\n\n.clx-ft-legend {\n  flex-wrap: wrap;\n}\n\n.clx-ft-legend .clx-chip {\n  margin-left: 6px;\n  white-space: nowrap;\n}\n\n.clx-ft {\n  display: grid;\n  grid-template-columns: max-content minmax(28px, 110px) minmax(0, 1fr);\n  row-gap: 1px;\n  padding: 4px 0 2px;\n}\n\n.clx-ft-row {\n  display: grid;\n  grid-column: 1/-1;\n  grid-template-columns: subgrid;\n  align-items: center;\n  min-height: 32px;\n  padding: 0 10px;\n  border-radius: 9px;\n  transition: background-color 0.15s ease;\n  animation: clx-fade 0.35s ease both;\n  animation-delay: calc(var(--i, 0) * 12ms);\n}\n\n.clx-ft-row:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-ft-row.open {\n  cursor: pointer;\n}\n\n.clx-ft-row.open:hover .clx-ft-name {\n  text-decoration: underline;\n  text-underline-offset: 2px;\n  text-decoration-color: color-mix(in srgb, var(--ft) 60%, transparent);\n}\n\n.clx-ft-st.link {\n  cursor: pointer;\n}\n\n.clx-ft-st.link:hover {\n  box-shadow: 0 0 0 1px color-mix(in srgb, #C9772F 55%, transparent);\n}\n\n.clx-ft-st.link:focus-visible {\n  outline: 2px solid color-mix(in srgb, #C9772F 55%, transparent);\n  outline-offset: 1px;\n}\n\n.clx-ft-note {\n  margin: 2px 2px 6px;\n  font-size: 12px;\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-ft-row.top {\n  min-height: 40px;\n  margin-top: 10px;\n  background: color-mix(in srgb, var(--ft) 8%, transparent);\n}\n\n.clx-ft-row.top:first-child {\n  margin-top: 0;\n}\n\n.clx-ft-row.top:hover {\n  background: color-mix(in srgb, var(--ft) 12%, transparent);\n}\n\n.clx-ft-tree {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  min-width: 0;\n  align-self: stretch;\n}\n\n.clx-ft-g {\n  position: relative;\n  align-self: stretch;\n  flex: none;\n  width: 20px;\n  margin-right: -7px;\n}\n\n.clx-ft-g.pipe::before, .clx-ft-g.tee::before, .clx-ft-g.elbow::before {\n  content: \"\";\n  position: absolute;\n  left: 8px;\n  top: 0;\n  bottom: 0;\n  border-left: 1.5px solid color-mix(in srgb, var(--dsw-alias-label-tertiary) 35%, transparent);\n}\n\n.clx-ft-g.elbow::before {\n  bottom: 50%;\n  border-bottom-left-radius: 5px;\n}\n\n.clx-ft-g.tee::after, .clx-ft-g.elbow::after {\n  content: \"\";\n  position: absolute;\n  left: 8px;\n  right: 3px;\n  top: 50%;\n  border-top: 1.5px solid color-mix(in srgb, var(--dsw-alias-label-tertiary) 35%, transparent);\n}\n\n.clx-ft-g + .clx-ft-icon, .clx-ft-g + .clx-linkbtn {\n  margin-left: 7px;\n}\n\n.clx-ft-icon {\n  flex: none;\n}\n\n.clx-ft-row.top .clx-ft-icon {\n  width: 17px;\n  height: 17px;\n}\n\n.clx-ft-name {\n  font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;\n  color: var(--dsw-alias-label-primary);\n  white-space: nowrap;\n}\n\n.clx-ft-name.dir {\n  font-weight: 600;\n}\n\n.clx-ft-row.top .clx-ft-name {\n  font-size: 13.5px;\n  font-weight: 650;\n}\n\n.clx-ft-st {\n  flex: none;\n  display: inline-flex;\n  align-items: center;\n  padding: 0 7px;\n  border-radius: 999px;\n  corner-shape: round;\n  font-size: 11px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-bg-layer-1);\n  white-space: nowrap;\n}\n\n.clx-ft-st.loaded {\n  color: #fff;\n  background: #C9772F;\n  font-weight: 600;\n}\n\n.clx-ft-st.missing {\n  background: transparent;\n  border: 1px dashed var(--dsw-alias-border-l3, var(--dsw-alias-border-l2));\n  line-height: 16px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-ft-row.missing .clx-ft-name {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-ft-row.missing .clx-ft-icon {\n  opacity: 0.5;\n}\n\n.clx-ft-lead {\n  align-self: center;\n  margin: 0 10px;\n  border-top: 1.5px dotted color-mix(in srgb, var(--dsw-alias-label-tertiary) 40%, transparent);\n}\n\n.clx-ft-pill {\n  justify-self: start;\n  max-width: 100%;\n  padding: 3px 12px;\n  border-radius: 999px;\n  corner-shape: round;\n  font-size: 12.5px;\n  line-height: 1.45;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  background: color-mix(in srgb, var(--ft) 14%, transparent);\n  color: color-mix(in srgb, var(--ft) 70%, var(--dsw-alias-label-primary));\n}\n\n.clx-ft-row.top .clx-ft-pill {\n  font-weight: 600;\n  background: color-mix(in srgb, var(--ft) 20%, transparent);\n}\n\n.clx-ft-row.missing .clx-ft-pill {\n  background: transparent;\n  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ft) 28%, transparent);\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-ft-row.more {\n  min-height: 26px;\n}\n\n.clx-ft-row.more:hover {\n  background: transparent;\n}\n\n.clx-ft-row.more > .clx-ft-tree {\n  grid-column: 1/-1;\n}\n\n@container (max-width: 620px) {\n  .clx-ft {\n    display: flex;\n    flex-direction: column;\n  }\n  .clx-ft-row {\n    display: flex;\n    flex-wrap: wrap;\n    padding: 4px 8px;\n  }\n  .clx-ft-lead {\n    display: none;\n  }\n  .clx-ft-tree {\n    flex: 1 1 100%;\n  }\n  .clx-ft-pill {\n    margin: 2px 0 2px 26px;\n    font-size: 11.5px;\n    white-space: normal;\n  }\n  .clx-ft-tree {\n    min-width: 0;\n  }\n  .clx-ft-name {\n    min-width: 0;\n    overflow: hidden;\n    text-overflow: ellipsis;\n  }\n}\n.clx-mem-hint {\n  font-size: 12px;\n  color: var(--dsw-alias-label-tertiary);\n  margin: -2px 2px 10px;\n}\n\n.clx-mem-files {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  margin-bottom: 10px;\n}\n\n.clx-mem-loc-head {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 4px 10px;\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-secondary);\n  margin: 4px 2px 6px;\n}\n\n.clx-mem-loc-head > .clx-muted {\n  font-weight: 400;\n  font-size: 11.5px;\n}\n\n.clx-mem-legend {\n  margin-left: auto;\n  display: inline-flex;\n  gap: 4px;\n  font-weight: 400;\n}\n\n.clx-mem-legend .clx-mem-pill {\n  font-size: 10.5px;\n  line-height: 16px;\n  padding: 0 6px;\n}\n\n.clx-mem-empty {\n  font-size: 12.5px;\n  color: var(--dsw-alias-label-secondary);\n  padding: 8px 10px;\n  margin-bottom: 6px;\n  border-radius: 10px;\n  background: color-mix(in srgb, var(--cat-memory, #B6992D) 8%, transparent);\n}\n\n.clx-mem-locs {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n\n.clx-mem-loc {\n  display: grid;\n  grid-template-columns: 112px minmax(0, 1fr) auto;\n  align-items: center;\n  gap: 10px;\n  padding: 7px 10px;\n  border-radius: 10px;\n  font-size: 12.5px;\n}\n\n.clx-mem-loc:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-mem-loc .scope {\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n  white-space: nowrap;\n}\n\n.clx-mem-loc .dir {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-mem-loc .dir svg {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-mem-loc .dir > span {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-mem-loc .files {\n  display: inline-flex;\n  flex-wrap: wrap;\n  justify-content: flex-end;\n  gap: 4px;\n}\n\n.clx-mem-pill {\n  display: inline-flex;\n  align-items: center;\n  padding: 0 7px;\n  border-radius: 999px;\n  corner-shape: round;\n  font: 11px/18px ui-monospace, SFMono-Regular, Menlo, monospace;\n  white-space: nowrap;\n  border: 1px solid transparent;\n}\n\n.clx-mem-pill.loaded {\n  background: color-mix(in srgb, #B6992D 18%, transparent);\n  color: color-mix(in srgb, #B6992D 70%, var(--dsw-alias-label-primary));\n  border-color: color-mix(in srgb, #B6992D 35%, transparent);\n}\n\n.clx-mem-pill.exists {\n  border-color: color-mix(in srgb, #B6992D 55%, transparent);\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-mem-pill.missing {\n  color: var(--dsw-alias-label-tertiary);\n  border-color: var(--dsw-alias-border-l1);\n  opacity: 0.75;\n}\n\n.clx-rt-list {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n\n.clx-rt {\n  display: grid;\n  grid-template-columns: 112px minmax(0, 1fr);\n  gap: 10px;\n  padding: 7px 10px;\n  border-radius: 10px;\n  font-size: 12.5px;\n  line-height: 1.55;\n}\n\n.clx-rt:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-rt .k {\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n  padding-top: 1px;\n}\n\n.clx-rt .v {\n  min-width: 0;\n  color: var(--dsw-alias-label-primary);\n  overflow-wrap: anywhere;\n}\n\n.clx-card-head > .clx-link {\n  font-size: 11.5px;\n}\n\n@container (max-width: 560px) {\n  .clx-mem-loc {\n    grid-template-columns: minmax(0, 1fr) auto;\n  }\n  .clx-mem-loc .scope {\n    grid-column: 1/-1;\n  }\n  .clx-rt {\n    grid-template-columns: minmax(0, 1fr);\n    gap: 2px;\n  }\n  .clx-mem-legend {\n    margin-left: 0;\n  }\n}\n.clx-err {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-warn {\n  color: var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary));\n}\n\n.clx-ok {\n  color: var(--dsw-alias-state-success-primary);\n}\n\n.clx-svg text {\n  fill: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n}\n\n.clx-tip {\n  font-size: 12px;\n  min-height: 36px;\n  color: var(--dsw-alias-label-secondary);\n  margin-top: 6px;\n  word-break: break-word;\n}\n\n.clx-spin {\n  opacity: 0.6;\n}\n\n.clx-pane {\n  container-type: inline-size;\n}\n\n.clx-flow-wrap {\n  display: grid;\n  grid-template-columns: minmax(0, 600px) minmax(260px, 1fr);\n  gap: 12px;\n  align-items: start;\n}\n\n@container (max-width: 860px) {\n  .clx-flow-wrap {\n    grid-template-columns: minmax(0, 1fr);\n  }\n}\n.clx-flow-diagram {\n  padding: 8px;\n}\n\n.clx-flow-node text {\n  pointer-events: none;\n}\n\n.clx-flow-label {\n  font-size: 12.5px;\n  font-weight: 600;\n  fill: var(--dsw-alias-label-primary);\n}\n\n.clx-flow-label.side {\n  font-size: 11.5px;\n  font-weight: 500;\n  fill: var(--dsw-alias-label-secondary);\n}\n\n.clx-flow-label.inv, .clx-flow-count.inv {\n  fill: #fff;\n}\n\n.clx-flow-count {\n  font-size: 10.5px;\n  fill: var(--dsw-alias-label-tertiary);\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-flow-boxlabel {\n  font-size: 11px;\n  font-weight: 700;\n  letter-spacing: 0.08em;\n}\n\n.clx-flow-side {\n  font-size: 10px;\n  fill: var(--dsw-alias-label-tertiary);\n}\n\n.clx-flow-glow {\n  animation: clx-pulse 1.1s ease-in-out infinite;\n}\n\n.clx-flow-tok {\n  font-size: 11px;\n  font-weight: 600;\n  fill: var(--dsw-alias-label-secondary);\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-flow-tok.inv {\n  fill: #fff;\n}\n\n.clx-flow-num {\n  font-size: 10px;\n  font-weight: 700;\n  fill: #fff;\n}\n\n.clx-flow-trace {\n  fill: none;\n  stroke-width: 2.4;\n  stroke-dasharray: 7 5;\n  animation: clx-dash 0.9s linear infinite;\n}\n\n@keyframes clx-dash {\n  to {\n    stroke-dashoffset: -12;\n  }\n}\n.clx-flow-status {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n  align-items: center;\n  font-size: 13px;\n}\n\n.clx-live-dot {\n  display: inline-block;\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  corner-shape: round;\n  flex: none;\n}\n\n.clx-live-dot.on {\n  animation: clx-pulse 1.1s ease-in-out infinite;\n}\n\n.clx-flow-big {\n  font-size: 13px;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-flow-big b {\n  font-size: 18px;\n}\n\n.clx-flow-comp {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 12px;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-flow-path {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n}\n\n.clx-flow-chip {\n  font-size: 11.5px;\n  padding: 1px 7px;\n  border-radius: 10px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  white-space: nowrap;\n}\n\n.clx-flow-chip b {\n  color: var(--dsw-alias-state-business-primary);\n}\n\n.clx-flow-steps {\n  max-height: 460px;\n  overflow: auto;\n  margin: 0 -6px;\n  padding: 0 6px;\n}\n\n.clx-flow-step {\n  display: grid;\n  grid-template-columns: 34px minmax(0, 1fr) auto;\n  gap: 8px;\n  align-items: center;\n  padding: 4px 10px 4px 30px;\n  border-radius: 8px;\n  cursor: pointer;\n  font-size: 12px;\n}\n\n.clx-flow-step:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-flow-step-tools {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-flow-step-ctx {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  font-variant-numeric: tabular-nums;\n  font-size: 11.5px;\n}\n\n.clx-flow-mini {\n  display: inline-block;\n  width: 46px;\n  height: 4px;\n  border-radius: 2px;\n  background: var(--dsw-alias-border-l1);\n  overflow: hidden;\n}\n\n.clx-flow-mini > span {\n  display: block;\n  height: 100%;\n  background: var(--dsw-alias-state-business-primary);\n  opacity: 0.75;\n}\n\n.clx-flow-job {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n}\n\n.clx-flow-job .clx-live-dot {\n  margin-right: 2px;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .clx-flow-trace, .clx-flow-glow, .clx-live-dot.on {\n    animation: none;\n  }\n}\n/* 概览 motion: cards rise in, the usage bar sweeps open, category rows and bars stagger in, the growth line draws itself */\n.clx-ov > .clx-card {\n  animation: clx-rise 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) both;\n}\n\n.clx-ov > .clx-card:nth-child(2) {\n  animation-delay: 0.07s;\n}\n\n.clx-ov > .clx-card:nth-child(3) {\n  animation-delay: 0.14s;\n}\n\n.clx-ov > .clx-card:nth-child(4) {\n  animation-delay: 0.21s;\n}\n\n.clx-ov > .clx-card:nth-child(n+5) {\n  animation-delay: 0.28s;\n}\n\n@keyframes clx-rise {\n  from {\n    opacity: 0;\n    transform: translateY(10px);\n  }\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n.clx-bar.anim {\n  animation: clx-reveal 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) 0.12s both;\n}\n\n@keyframes clx-reveal {\n  from {\n    clip-path: inset(0 100% 0 0);\n  }\n  to {\n    clip-path: inset(0 0 0 0);\n  }\n}\n.clx-bar > span {\n  transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);\n}\n\n.clx-ov .clx-catblock, .clx-ov .clx-catrow.static {\n  animation: clx-slide 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both;\n  animation-delay: calc(0.18s + var(--i, 0) * 40ms);\n}\n\n@keyframes clx-slide {\n  from {\n    opacity: 0;\n    transform: translateX(-6px);\n  }\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n.clx-catbar > span {\n  transform-origin: left center;\n  animation: clx-grow 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both;\n  animation-delay: calc(0.28s + var(--i, 0) * 50ms);\n  transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);\n}\n\n@keyframes clx-grow {\n  from {\n    transform: scaleX(0);\n  }\n  to {\n    transform: scaleX(1);\n  }\n}\n.clx-catrow {\n  transition: background-color 0.15s ease;\n}\n\n.clx-catrow[role=button]:active {\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\n.clx-catdetail {\n  animation: clx-drop 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) both;\n}\n\n@keyframes clx-drop {\n  from {\n    opacity: 0;\n    transform: translateY(-6px);\n  }\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n.clx-trend-line {\n  stroke-dasharray: 1;\n  stroke-dashoffset: 1;\n  animation: clx-draw 1.4s cubic-bezier(0.45, 0, 0.2, 1) 0.3s forwards;\n}\n\n@keyframes clx-draw {\n  to {\n    stroke-dashoffset: 0;\n  }\n}\n.clx-trend-area {\n  animation: clx-fadein 0.9s ease 0.8s both;\n}\n\n@keyframes clx-fadein {\n  from {\n    opacity: 0;\n  }\n}\n.clx-ibar {\n  height: 14px;\n}\n\n.clx-ibar > span {\n  cursor: pointer;\n  transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s ease, filter 0.2s ease;\n}\n\n.clx-ibar > span[data-k]:not(.free) {\n  min-width: 3px;\n}\n\n.clx-ibar > span:hover {\n  filter: brightness(1.08) saturate(1.1);\n}\n\n.clx-ibar[data-active] > span:not(.on) {\n  opacity: 0.22;\n}\n\n.clx-ibar > span.free.on {\n  background: var(--dsw-alias-border-l2);\n}\n\n.clx-ilegend {\n  gap: 2px 2px;\n  margin-left: -6px;\n}\n\n.clx-ilegend button {\n  all: unset;\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  padding: 2px 6px;\n  border-radius: 6px;\n  cursor: pointer;\n  transition: opacity 0.2s ease, background-color 0.15s ease, color 0.15s ease;\n}\n\n.clx-ilegend button:hover, .clx-ilegend button.on {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-ilegend button[aria-pressed=true] {\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\n.clx-ilegend button:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -2px;\n}\n\n.clx-ilegend[data-active] button:not(.on) {\n  opacity: 0.45;\n}\n\n.clx-catblock.hl > .clx-catrow {\n  background: color-mix(in srgb, var(--cat) 12%, transparent);\n}\n\n.clx-catblock > .clx-catrow {\n  transition: background-color 0.2s ease;\n}\n\n.clx-chev {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 12px;\n  height: 12px;\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), color 0.15s;\n}\n\n.clx-chev svg {\n  display: block;\n}\n\n.clx-chev.open {\n  transform: rotate(90deg);\n  color: var(--dsw-alias-label-primary);\n}\n\n:is(.clx-node-row, .clx-catrow, .clx-trow, .clx-urow, .clx-disc-head, .clx-flow-turn):hover .clx-chev {\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-node-row:focus-visible, .clx-trow:focus-visible, .clx-urow:focus-visible, .clx-flow-turn:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -2px;\n}\n\n.clx-trow, .clx-urow {\n  display: grid;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 10px;\n  border-radius: 10px;\n  font-size: 12.5px;\n  cursor: pointer;\n  transition: background-color 0.15s ease, box-shadow 0.15s ease;\n}\n\n.clx-trow {\n  grid-template-columns: 12px minmax(0, 1.4fr) minmax(70px, 0.6fr) 44px minmax(50px, 1fr) 56px;\n}\n\n.clx-urow {\n  grid-template-columns: 12px minmax(0, 1.6fr) 44px 64px 44px 64px 64px;\n}\n\n.clx-trow.head, .clx-urow.head {\n  cursor: default;\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n  padding: 0 10px 4px;\n}\n\n.clx-trow.head > span:nth-child(n+4), .clx-urow.head > span:nth-child(n+3) {\n  text-align: right;\n}\n\n.clx-trow[role=button]:hover, .clx-urow[role=button]:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-trow .num, .clx-urow .num {\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-tblock {\n  animation: clx-fade 0.35s ease both;\n  animation-delay: calc(var(--i, 0) * 18ms);\n}\n\n.clx-tname {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n}\n\n.clx-tname code, .clx-tcode {\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-size: 12px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-ubar {\n  display: flex;\n  gap: 1px;\n  flex: 1;\n  min-width: 30px;\n  max-width: 160px;\n  height: 5px;\n  margin-left: auto;\n  border-radius: 3px;\n  overflow: hidden;\n  background: var(--dsw-alias-border-l1);\n}\n\n.clx-ubar > span {\n  transform-origin: left;\n  animation: clx-grow 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.15s both;\n}\n\n.clx-params {\n  margin-top: 10px;\n}\n\n.clx-params-head {\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-secondary);\n  margin-bottom: 4px;\n}\n\n.clx-param {\n  padding: 6px 0;\n  border-top: 1px dashed var(--dsw-alias-border-l1);\n}\n\n.clx-param-head {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  flex-wrap: wrap;\n}\n\n.clx-param-head code {\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-size: 12px;\n  font-weight: 600;\n}\n\n.clx-param-desc {\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary);\n  margin-top: 2px;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n}\n\n.clx-param-enum {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n  margin-top: 4px;\n}\n\n.clx-param-enum code {\n  font-size: 11px;\n  padding: 1px 5px;\n  border-radius: 4px;\n  background: var(--dsw-alias-bg-layer-2);\n}\n\n.clx-badge.warn {\n  color: var(--dsw-alias-state-warn-primary);\n  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent);\n}\n\n@container (max-width: 620px) {\n  .clx-trow {\n    grid-template-columns: 12px minmax(0, 1fr) 44px 56px;\n  }\n  .clx-trow > :nth-child(3), .clx-trow > :nth-child(5) {\n    display: none;\n  }\n  .clx-urow {\n    grid-template-columns: 12px minmax(0, 1fr) 44px 44px 64px;\n  }\n  .clx-urow > :nth-child(4), .clx-urow > :nth-child(7) {\n    display: none;\n  }\n}\n/* every section: cards rise in, list rows fade in, bars grow; state changes ease */\n.clx-main .clx-col > .clx-card, .clx-flow-side-panel > .clx-card, .clx-flow-wrap > .clx-card {\n  animation: clx-rise 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;\n}\n\n.clx-main .clx-col > .clx-card:nth-child(2), .clx-flow-side-panel > .clx-card:nth-child(2) {\n  animation-delay: 0.07s;\n}\n\n.clx-main .clx-col > .clx-card:nth-child(3), .clx-flow-side-panel > .clx-card:nth-child(3) {\n  animation-delay: 0.14s;\n}\n\n.clx-main .clx-col > .clx-card:nth-child(n+4) {\n  animation-delay: 0.2s;\n}\n\n.clx-flow-side-panel > .clx-card:first-child {\n  animation-delay: 0.05s;\n}\n\n.clx-node {\n  animation: clx-fade 0.3s ease both;\n  animation-delay: calc(var(--i, 0) * 16ms);\n}\n\n@keyframes clx-fade {\n  from {\n    opacity: 0;\n  }\n  to {\n    opacity: 1;\n  }\n}\n.clx-minibar > span {\n  transform-origin: left center;\n  animation: clx-grow 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) 0.1s both;\n  transition: width 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);\n}\n\n.clx-flow-mini > span {\n  transition: width 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);\n}\n\n.clx-chipbtn, .clx-chip, .clx-seg {\n  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;\n}\n\n.clx-flow-step {\n  transition: background-color 0.15s ease, box-shadow 0.15s ease;\n}\n\n.clx-flow-log {\n  transition: background-color 0.15s ease;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .clx-pane *, .clx-pane *::before {\n    animation: none !important;\n    transition: none !important;\n  }\n  .clx-trend-line {\n    stroke-dasharray: none !important;\n    stroke-dashoffset: 0 !important;\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  .clx-ov, .clx-ov * {\n    animation: none !important;\n    transition: none !important;\n  }\n  .clx-trend-line {\n    stroke-dasharray: none;\n    stroke-dashoffset: 0;\n  }\n}\n@keyframes clx-pulse {\n  0%, 100% {\n    opacity: 0.95;\n  }\n  50% {\n    opacity: 0.2;\n  }\n}\n.clx-flow-now {\n  margin-top: 8px;\n  padding: 8px 10px;\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-2);\n  border: 1px solid var(--dsw-alias-border-l1);\n}\n\n.clx-flow-now-head {\n  display: flex;\n  gap: 8px;\n  align-items: baseline;\n  flex-wrap: wrap;\n  margin-bottom: 2px;\n}\n\n.clx-flow-now-text {\n  word-break: break-word;\n  font-size: 12.5px;\n}\n\n.clx-flow-turn-head .clx-chev {\n  align-self: center;\n}\n\n.clx-flow-tgroup.open > .clx-flow-step, .clx-flow-tgroup > .clx-flow-step {\n  animation: clx-fade 0.25s ease both;\n}\n\n.clx-flow-turn:hover, .clx-flow-log:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-flow-turn.cur, .clx-flow-log.cur {\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\n.clx-flow-turn-head {\n  display: flex;\n  gap: 8px;\n  align-items: baseline;\n  flex-wrap: wrap;\n  font-size: 12.5px;\n}\n\n.clx-flow-turn-prompt {\n  font-size: 12px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-flow-log {\n  font-size: 12px;\n  padding: 2px 4px;\n  border-radius: 5px;\n  cursor: pointer;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-card {\n  padding: 10px 12px;\n  margin-bottom: 10px;\n}\n\n.clx-navcount {\n  font-size: 10.5px;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-tertiary);\n  margin-left: 1px;\n}\n\n.clx-liveline {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 12px;\n  min-width: 0;\n  padding-bottom: 8px;\n  margin-bottom: 10px;\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n}\n\n.clx-liveline > * {\n  flex: none;\n}\n\n.clx-liveline-last {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-hero {\n  gap: 12px;\n  margin-bottom: 10px;\n  flex-wrap: wrap;\n}\n\n.clx-hero-main {\n  flex: 1 1 160px;\n}\n\n.clx-hero-pct {\n  font-size: 22px;\n}\n\n.clx-stats {\n  display: flex;\n  gap: 6px;\n  flex-wrap: wrap;\n}\n\n.clx-stat {\n  min-width: 64px;\n  padding: 5px 9px;\n  border-radius: 8px;\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-stat .k {\n  font-size: 10.5px;\n  color: var(--dsw-alias-label-tertiary);\n  white-space: nowrap;\n}\n\n.clx-stat .v {\n  font-size: 15px;\n  font-weight: 600;\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n\n.clx-stat .v small {\n  font-size: 11px;\n  font-weight: 500;\n}\n\n.clx-stat.warn .v {\n  color: var(--dsw-alias-state-warn-primary);\n}\n\n.clx-catfree {\n  display: flex;\n  gap: 14px;\n  flex-wrap: wrap;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-secondary);\n  padding: 6px 10px 0;\n  margin-top: 4px;\n  border-top: 1px dashed var(--dsw-alias-border-l1);\n}\n\n.clx-catfree .clx-dot {\n  margin-right: 5px;\n}\n\n.clx-catfree b {\n  font-weight: 600;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-catrow {\n  padding: 6px 10px;\n}\n\n.clx-stbars-wrap {\n  position: relative;\n}\n\n.clx-stbars {\n  display: flex;\n  align-items: flex-end;\n  gap: 2px;\n  height: 116px;\n  padding: 0 0 16px;\n  overflow-x: auto;\n  overflow-y: hidden;\n  scrollbar-width: thin;\n}\n\n.clx-stbar {\n  position: relative;\n  flex: 1 0 6px;\n  max-width: 40px;\n  height: 100%;\n  display: flex;\n  align-items: flex-end;\n  padding: 0;\n  border: 0;\n  background: transparent;\n  cursor: pointer;\n}\n\n.clx-stbar.turn:not(:first-child) {\n  margin-left: 6px;\n}\n\n.clx-stbar .col {\n  width: 100%;\n  display: flex;\n  flex-direction: column-reverse;\n  border-radius: 3px 3px 1px 1px;\n  overflow: hidden;\n  opacity: 0.72;\n  transition: opacity 0.12s;\n}\n\n.clx-stbar .col > i {\n  display: block;\n  min-height: 1px;\n}\n\n.clx-stbar:hover .col {\n  opacity: 0.92;\n}\n\n.clx-stbar.on .col {\n  opacity: 1;\n  outline: 1.5px solid var(--dsw-alias-label-primary);\n  outline-offset: 1px;\n}\n\n.clx-stbar.err::after {\n  content: \"\";\n  position: absolute;\n  left: 50%;\n  bottom: -5px;\n  width: 4px;\n  height: 4px;\n  margin-left: -2px;\n  border-radius: 50%;\n  corner-shape: round;\n  background: var(--dsw-alias-state-error-primary);\n}\n\n.clx-stbar .lbl {\n  position: absolute;\n  left: 0;\n  bottom: -16px;\n  font-size: 10px;\n  color: var(--dsw-alias-label-tertiary);\n  white-space: nowrap;\n}\n\n.clx-stbars-th {\n  position: absolute;\n  left: 0;\n  right: 0;\n  margin-bottom: 16px;\n  border-top: 1px dashed var(--dsw-alias-state-warn-primary);\n  pointer-events: none;\n  z-index: 1;\n}\n\n.clx-stbars-th span {\n  position: absolute;\n  right: 0;\n  bottom: 1px;\n  font-size: 10px;\n  color: var(--dsw-alias-state-warn-primary);\n}\n\n.clx-stdetail {\n  margin-top: 8px;\n  padding-top: 8px;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n\n.clx-stdetail-head {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  flex-wrap: wrap;\n  font-size: 12.5px;\n}\n\n.clx-stdetail-head > b {\n  margin-right: 2px;\n}\n\n.clx-stdetail-go {\n  margin-left: auto;\n  padding: 1px 8px;\n}\n\n.clx-stchip {\n  display: inline-flex;\n  gap: 4px;\n  align-items: baseline;\n  padding: 1px 7px;\n  border-radius: 6px;\n  background: var(--dsw-alias-interactive-bg-hover);\n  font-size: 11.5px;\n  font-weight: 600;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-stchip .k {\n  font-weight: 400;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-stchip.up {\n  color: var(--dsw-alias-state-warn-primary);\n}\n\n.clx-stdetail-tools {\n  font-size: 12px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.clx-stlegend {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 14px;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-stlegend > span {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n}\n\n.clx-stlegend b {\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-stlegend em {\n  font-style: normal;\n  font-size: 10.5px;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-stlegend em.up {\n  color: var(--dsw-alias-state-warn-primary);\n}\n\n.clx-stlegend em.down {\n  color: var(--dsw-alias-state-success-primary);\n}\n\n.clx-live {\n  color: var(--dsw-alias-state-business-primary);\n}\n\n.clx-morecard {\n  padding: 4px;\n}\n\n.clx-morecard > .clx-disc {\n  border: 0;\n}\n\n.clx-morehead {\n  display: flex;\n  align-items: baseline;\n  gap: 8px;\n  min-width: 0;\n  font-size: 12.5px;\n}\n\n.clx-morehead .clx-muted {\n  font-size: 11.5px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-flowcard-head {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 11.5px;\n  margin-bottom: 4px;\n}\n\n.clx-flowcard-head > .clx-muted {\n  flex: 1;\n}\n\n.clx-flowcard .clx-flow {\n  margin: 0 auto;\n}\n\n.clx-msgbar {\n  position: sticky;\n  top: 44px;\n  z-index: 2;\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 6px 0 8px;\n  background: var(--dsw-alias-bg-base);\n}\n\n.clx-msgsearch {\n  flex: 1 1 180px;\n  min-width: 120px;\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  height: 28px;\n  padding: 0 8px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 8px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-msgsearch:focus-within {\n  border-color: var(--dsw-alias-state-business-primary);\n}\n\n.clx-msgsearch input {\n  flex: 1;\n  min-width: 0;\n  border: 0;\n  outline: 0;\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  font-size: 12.5px;\n}\n\n.clx-msgclear {\n  border: 0;\n  background: transparent;\n  color: var(--dsw-alias-label-tertiary);\n  cursor: pointer;\n  font-size: 14px;\n  padding: 0 2px;\n}\n\n.clx-msgcat {\n  position: relative;\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  height: 28px;\n  padding: 0 6px 0 8px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 8px;\n  max-width: 170px;\n}\n\n.clx-msgcat .clx-dot {\n  background: var(--cat);\n  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l3);\n}\n\n.clx-msgcat select {\n  min-width: 0;\n  border: 0;\n  outline: 0;\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  font: inherit;\n  font-size: 12px;\n  cursor: pointer;\n}\n\n.clx-msgcount {\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n  white-space: nowrap;\n  font-variant-numeric: tabular-nums;\n}\n\n@container (max-width: 560px) {\n  .clx-msgbar {\n    flex-wrap: wrap;\n  }\n  .clx-msgcount {\n    display: none;\n  }\n}\n.clx-mmore {\n  margin: 4px 0 8px;\n}\n\n.clx-mlist {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n\n.clx-mturn {\n  border: 1px solid var(--dsw-alias-settings-card-stroke);\n  border-radius: 10px;\n  background: var(--dsw-alias-settings-card-fill);\n  overflow: clip;\n}\n\n.clx-mturn-head {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 7px 10px;\n  font-size: 12.5px;\n  cursor: pointer;\n  min-width: 0;\n}\n\n.clx-mturn-head:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-mturn-head > b {\n  flex: none;\n}\n\n.clx-mturn-prompt {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-mturn-meta {\n  flex: none;\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-mturn-tok {\n  flex: none;\n  min-width: 44px;\n  text-align: right;\n  font-size: 12px;\n  font-weight: 600;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-mturn-body {\n  border-top: 1px solid var(--dsw-alias-border-l1);\n  padding: 2px 0 4px;\n}\n\n.clx-mstep {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 6px 10px 2px 30px;\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n  min-width: 0;\n}\n\n.clx-mstep .n {\n  flex: none;\n  font-weight: 600;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-mstep .tools {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-mstep .ctx {\n  flex: none;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-mstep .ctx::before {\n  content: \"⧉ \";\n  opacity: 0.6;\n}\n\n.clx-mnode.open {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-mlist > .clx-mnode {\n  border-radius: 8px;\n}\n\n.clx-mnode > .clx-detail {\n  margin: 0 8px 6px 30px;\n}\n\n.clx-mrow {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  height: 28px;\n  padding: 0 10px;\n  font-size: 12.5px;\n  cursor: pointer;\n  min-width: 0;\n}\n\n.clx-mrow:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-mrow:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -2px;\n}\n\n.clx-mrow > .clx-chev {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-mrow-kind {\n  flex: none;\n  width: 52px;\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-secondary);\n  white-space: nowrap;\n  overflow: hidden;\n}\n\n.clx-mrow-kind::before {\n  content: \"\";\n  flex: none;\n  width: 3px;\n  height: 14px;\n  border-radius: 2px;\n  background: var(--cat);\n}\n\n.clx-mrow-text {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-mrow-tool {\n  font-weight: 600;\n  font-family: var(--dsw-font-mono, ui-monospace, monospace);\n  font-size: 11.5px;\n}\n\n.clx-mrow-res {\n  flex: none;\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  padding: 0 6px;\n  height: 18px;\n  border-radius: 5px;\n  background: var(--dsw-alias-interactive-bg-hover);\n  font-size: 11px;\n  color: var(--dsw-alias-label-secondary);\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-mrow-res.err {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-mrow-res .clx-dot {\n  width: 6px;\n  height: 6px;\n}\n\n.clx-mrow-tok {\n  flex: none;\n  min-width: 40px;\n  text-align: right;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-secondary);\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-subnav {\n  display: flex;\n  margin: 2px 0 10px;\n}\n\n.clx-ov-top, .clx-ov-pair {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr);\n  gap: 0 12px;\n  align-items: start;\n}\n\n.clx-ov-l, .clx-ov-r, .clx-ov-pair > * {\n  min-width: 0;\n}\n\n@container (min-width: 880px) {\n  .clx-ov-top {\n    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);\n  }\n  .clx-ov-pair {\n    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);\n  }\n}\n.clx-ov-pair {\n  align-items: stretch;\n}\n\n.clx-ov-flow {\n  margin-top: 6px;\n}\n\n.clx-ov-flow > .clx-colhead {\n  margin-bottom: 10px;\n}\n\n.clx-sources {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr);\n  gap: 12px;\n  align-items: start;\n}\n\n.clx-sources-col {\n  min-width: 0;\n  container-type: inline-size;\n}\n\n@container (min-width: 880px) {\n  .clx-sources {\n    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);\n  }\n}\n.clx-colhead {\n  margin: 2px 2px 8px;\n  font-size: 13px;\n  font-weight: 600;\n}\n\n.clx-mmain {\n  min-width: 0;\n}\n\n.clx-mside {\n  position: sticky;\n  top: 58px;\n  min-width: 0;\n  max-height: calc(100vh - 140px);\n  display: flex;\n  flex-direction: column;\n  margin-top: 6px;\n  border: 1px solid var(--dsw-alias-settings-card-stroke);\n  border-radius: 10px;\n  background: var(--dsw-alias-settings-card-fill);\n  overflow: hidden;\n}\n\n.clx-mside-head {\n  flex: none;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 10px;\n  font-size: 12.5px;\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n}\n\n.clx-mside-head .clx-mrow-kind {\n  width: auto;\n}\n\n.clx-mside-tok {\n  margin-left: auto;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-secondary);\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-mside-body {\n  flex: 1 1 auto;\n  min-height: 0;\n  overflow: auto;\n  padding: 8px 10px 12px;\n}\n\n.clx-mside-body > .clx-detail {\n  margin: 0;\n}\n\n.clx-mside-empty {\n  padding: 40px 16px;\n  text-align: center;\n  font-size: 12px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-msgbar .clx-chipbtn, .clx-msgbar .clx-segmini {\n  white-space: nowrap;\n  flex: none;\n}\n\n.clx-infocard {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n\n.clx-infocard > .clx-card-head {\n  margin-bottom: 0;\n}\n\n.clx-pill {\n  font-size: 11px;\n  padding: 1px 7px;\n  border-radius: 6px;\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-secondary);\n  white-space: nowrap;\n}\n\n.clx-pill.on {\n  color: var(--dsw-alias-state-success-primary);\n}\n\n.clx-pill.off {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-cgauge .track {\n  position: relative;\n  height: 10px;\n  border-radius: 5px;\n  background: var(--dsw-alias-border-l1);\n  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2);\n}\n\n.clx-cgauge .fill {\n  position: absolute;\n  left: 0;\n  top: 0;\n  bottom: 0;\n  min-width: 3px;\n  border-radius: 5px;\n  background: var(--dsw-alias-state-business-primary);\n}\n\n.clx-cgauge .fill.over {\n  background: var(--dsw-alias-state-warn-primary);\n}\n\n.clx-cgauge .track > i {\n  position: absolute;\n  top: -3px;\n  bottom: -3px;\n  width: 2px;\n  margin-left: -1px;\n  border-radius: 1px;\n}\n\n.clx-cgauge i.warn, .clx-cgauge .scale .warn {\n  background: var(--dsw-alias-state-warn-primary);\n}\n\n.clx-cgauge i.err {\n  background: var(--dsw-alias-state-error-primary);\n}\n\n.clx-cgauge .scale {\n  position: relative;\n  height: 16px;\n  margin-top: 4px;\n  font-size: 10.5px;\n  color: var(--dsw-alias-label-tertiary);\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-cgauge .scale > span {\n  position: absolute;\n  top: 0;\n  white-space: nowrap;\n}\n\n.clx-cgauge .scale > span:first-child {\n  left: 0;\n}\n\n.clx-cgauge .scale > span.warn, .clx-cgauge .scale > span.err {\n  transform: translateX(-50%);\n  background: none;\n}\n\n.clx-cgauge .scale > span.warn {\n  color: var(--dsw-alias-state-warn-primary);\n}\n\n.clx-cgauge .scale > span.err {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-cgauge .scale > span.end {\n  right: 0;\n}\n\n.clx-tiles {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));\n  gap: 6px;\n}\n\n.clx-tiles .clx-stat {\n  min-width: 0;\n}\n\n.clx-tiles .clx-stat .v {\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.clx-note {\n  font-size: 11.5px;\n  line-height: 1.5;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-req {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  padding-top: 8px;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n}\n\n.clx-req-head {\n  display: flex;\n  justify-content: space-between;\n  gap: 8px;\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-req-head b {\n  color: var(--dsw-alias-state-success-primary);\n  font-weight: 600;\n  white-space: nowrap;\n}\n\n.clx-req-bar {\n  display: flex;\n  height: 8px;\n  gap: 2px;\n  border-radius: 4px;\n  overflow: hidden;\n}\n\n.clx-req-bar > span {\n  min-width: 2px;\n}\n\n.clx-req .cr {\n  background: var(--dsw-alias-state-success-primary);\n}\n\n.clx-req .cw {\n  background: var(--dsw-alias-state-warn-primary);\n}\n\n.clx-req .in {\n  background: var(--dsw-alias-state-business-primary);\n}\n\n.clx-req .out {\n  background: #B07AA1;\n}\n\n.clx-req-legend {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 14px;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-req-legend > span {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n}\n\n.clx-req-legend i {\n  width: 8px;\n  height: 8px;\n  border-radius: 2px;\n}\n\n.clx-req-legend b {\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-types {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 4px;\n  font-size: 11px;\n}\n\n.clx-types > .clx-muted {\n  margin-right: 4px;\n}\n\n.clx-type {\n  display: inline-flex;\n  gap: 4px;\n  padding: 1px 6px;\n  border-radius: 5px;\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-secondary);\n  font-family: var(--dsw-font-mono, ui-monospace, monospace);\n}\n\n.clx-type b {\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n}\n\n.clx-tsum {\n  margin-bottom: 10px;\n  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));\n}\n\n.clx-tsplit {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);\n  gap: 12px;\n  align-items: start;\n  margin-bottom: 10px;\n}\n\n.clx-tsplit > .clx-mside {\n  margin-top: 0;\n  top: 56px;\n  max-height: calc(100vh - 90px);\n}\n\n.clx-tlists {\n  min-width: 0;\n}\n\n.clx-tsearch {\n  height: 30px;\n  margin-bottom: 8px;\n}\n\n.clx-tcard {\n  padding: 8px 6px 6px;\n}\n\n.clx-tcard > .clx-card-head {\n  padding: 0 6px;\n  margin-bottom: 4px;\n}\n\n.clx-tcard > .clx-card-head > .clx-muted {\n  font-size: 11px;\n}\n\n.clx-tlegend {\n  display: inline-flex;\n  gap: 10px;\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-tlegend > span {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n}\n\n.clx-tlegend i {\n  width: 8px;\n  height: 8px;\n  border-radius: 2px;\n}\n\n.clx-tl {\n  display: grid;\n  grid-template-columns: 8px minmax(0, 132px) auto minmax(40px, 1fr) 42px 26px 44px;\n  align-items: center;\n  gap: 8px;\n  height: 28px;\n  padding: 0 8px;\n  border-radius: 7px;\n  font-size: 12px;\n  cursor: pointer;\n}\n\n.clx-tl:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-tl.sel {\n  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);\n}\n\n.clx-tl:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -2px;\n}\n\n.clx-tl .nm {\n  font-family: var(--dsw-font-mono, ui-monospace, monospace);\n  font-size: 12px;\n  font-weight: 600;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-tl .kd:empty {\n  display: none;\n}\n\n.clx-tl .kd {\n  font-size: 10.5px;\n  color: var(--dsw-alias-label-tertiary);\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  max-width: 120px;\n}\n\n.clx-tl .bar {\n  display: flex;\n  gap: 1px;\n  height: 6px;\n  border-radius: 3px;\n  overflow: hidden;\n  background: var(--dsw-alias-border-l1);\n}\n\n.clx-tl .bar > span {\n  min-width: 1px;\n}\n\n.clx-tl .ct, .clx-tl .tk, .clx-tl .er {\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n\n.clx-tl .ct {\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-tl .er {\n  font-size: 11px;\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-tl .tk {\n  font-weight: 600;\n}\n\n.clx-tl-inline {\n  margin: 2px 4px 8px 20px;\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 8px;\n}\n\n.clx-tempty {\n  font-size: 12px;\n  padding: 8px;\n}\n\n.clx-tmore {\n  margin: 4px 8px;\n}\n\n.clx-tdeferred {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 4px;\n  margin: 6px 8px 2px;\n  padding-top: 8px;\n  border-top: 1px dashed var(--dsw-alias-border-l1);\n  font-size: 11px;\n}\n\n.clx-tdeferred code {\n  padding: 1px 6px;\n  border-radius: 5px;\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-tp-def {\n  margin-top: 12px;\n  padding-top: 10px;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n}\n\n.clx-tp-h {\n  font-size: 12px;\n  font-weight: 600;\n  margin-bottom: 6px;\n}\n\n.clx-mside-body > .clx-expand, .clx-tp-def > .clx-expand {\n  margin: 0;\n  padding: 0;\n  border: 0;\n}\n\n.clx-tl:has(.kd:empty) {\n  grid-template-columns: 8px minmax(0, 132px) minmax(40px, 1fr) 42px 26px 44px;\n}\n\n.clx-tl .bar {\n  max-width: 260px;\n}\n\n.clx-tsplit {\n  grid-template-columns: minmax(300px, 0.9fr) minmax(0, 1.1fr);\n}\n\n.clx-sl {\n  grid-template-columns: 8px minmax(0, 1fr) auto 44px !important;\n}\n\n.clx-sl .nm {\n  font-size: 12px;\n  font-weight: 600;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-sl .bd {\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n  white-space: nowrap;\n}\n\n.clx-sl.dim .nm {\n  font-weight: 400;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-sp-filters {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n  padding: 0 6px 6px;\n}\n\n.clx-sp-filters .clx-chipbtn {\n  padding: 1px 8px;\n  font-size: 11.5px;\n}\n\n.clx-sp-filters small {\n  color: var(--dsw-alias-label-tertiary);\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-sp-title {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-sp-meta {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 6px;\n  margin-bottom: 8px;\n  font-size: 11.5px;\n}\n\n.clx-sp-meta code {\n  flex: 1 1 200px;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-sp-meta .clx-chipbtn {\n  padding: 1px 8px;\n  font-size: 11.5px;\n}\n\n.clx-sp-desc {\n  font-size: 12.5px;\n  line-height: 1.55;\n  margin-bottom: 8px;\n}\n\n.clx-sp-kv {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 16px;\n  font-size: 12px;\n  margin-bottom: 6px;\n}\n\n.clx-sp-kv i {\n  font-style: normal;\n  color: var(--dsw-alias-label-tertiary);\n  margin-right: 5px;\n}\n\n.clx-sp-loads {\n  margin: 8px 0;\n}\n\n.clx-sp-tree > .clx-card {\n  border: 0;\n  background: none;\n  padding: 0;\n  margin: 0;\n}\n\n.clx-sp-inline .clx-mside-body {\n  max-height: 520px;\n  overflow: auto;\n}\n\n.clx-dash {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr);\n  gap: 10px;\n  align-items: stretch;\n}\n\n.clx-dash > * {\n  min-width: 0;\n  margin: 0;\n}\n\n.clx-dash > .span2 > .clx-card {\n  margin: 0;\n}\n\n@container (min-width: 760px) {\n  .clx-dash {\n    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);\n  }\n  .clx-dash > .span2 {\n    grid-column: 1/-1;\n  }\n}\n.clx-card-head h4, .clx-ctitle {\n  font-size: 13px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-ctitle {\n  display: inline-flex;\n  align-items: center;\n  gap: 7px;\n  margin: 0;\n  flex: 1;\n  min-width: 0;\n}\n\n.clx-ctitle .ic {\n  flex: none;\n  display: inline-grid;\n  place-items: center;\n  width: 22px;\n  height: 22px;\n  border-radius: 6px;\n  color: var(--dsw-alias-state-business-primary);\n  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);\n}\n\n.clx-chead-meta {\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  min-width: 0;\n}\n\n.clx-more {\n  flex: none;\n  border: 0;\n  background: transparent;\n  padding: 2px 4px;\n  font-size: 11.5px;\n  color: var(--dsw-alias-state-business-primary);\n  cursor: pointer;\n  border-radius: 5px;\n}\n\n.clx-more:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-hero-card .clx-liveline {\n  margin-top: 2px;\n}\n\n.clx-goalline {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-top: 10px;\n  padding-top: 8px;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n  font-size: 12px;\n  min-width: 0;\n}\n\n.clx-goalline .txt {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-donutwrap {\n  display: flex;\n  align-items: center;\n  gap: 16px;\n}\n\n.clx-donut {\n  flex: none;\n}\n\n.clx-donut circle {\n  transition: opacity 0.15s, stroke-width 0.15s;\n}\n\n.clx-donut-v {\n  font-size: 17px;\n  font-weight: 650;\n  fill: var(--dsw-alias-label-primary);\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-donut-k {\n  font-size: 10px;\n  fill: var(--dsw-alias-label-tertiary);\n}\n\n.clx-dlegend {\n  flex: 1;\n  min-width: 0;\n  display: grid;\n  grid-template-columns: minmax(0, 1fr);\n  gap: 1px;\n}\n\n.clx-dlegend button {\n  display: grid;\n  grid-template-columns: 8px minmax(0, 1fr) 46px 44px;\n  align-items: center;\n  gap: 8px;\n  height: 24px;\n  padding: 0 6px;\n  border: 0;\n  border-radius: 6px;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  font-size: 12px;\n  text-align: left;\n  cursor: pointer;\n}\n\n.clx-dlegend button:hover, .clx-dlegend button.on {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-dlegend .nm {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-dlegend .pc, .clx-dlegend .tk {\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-dlegend .tk {\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-peek {\n  display: flex;\n  flex-direction: column;\n}\n\n.clx-peek .clx-tl {\n  padding: 0 6px;\n}\n\n.clx-peekrow {\n  padding: 0 6px;\n  border-radius: 7px;\n}\n\n.clx-peekrow .clx-mrow-kind {\n  width: 44px;\n}\n\n.clx-peek-pct {\n  flex: none;\n  width: 34px;\n  text-align: right;\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-peek-foot {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-top: auto;\n  padding-top: 8px;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-peek-foot .clx-ctitle {\n  flex: none;\n  font-size: 12px;\n}\n\n.clx-peek-foot .clx-ctitle .ic {\n  width: 18px;\n  height: 18px;\n}\n\n.clx-dash .clx-infocard, .clx-dash .clx-steptrend, .clx-dash > .clx-card {\n  height: 100%;\n  box-sizing: border-box;\n}\n\n.clx-flowsec .clx-flow-wrap > .clx-card, .clx-flowsec .clx-flow-side-panel > .clx-card {\n  background: var(--dsw-alias-bg-base);\n}\n\n.clx-stat-link {\n  cursor: pointer;\n}\n\n.clx-stat-link:hover {\n  outline: 1px solid var(--dsw-alias-border-l3);\n}\n\n.clx-lay {\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n}\n\n.clx-lay-h {\n  display: flex;\n  align-items: baseline;\n  gap: 8px;\n  font-size: 12.5px;\n  margin-bottom: 6px;\n}\n\n.clx-lay-h .clx-muted {\n  font-size: 11px;\n}\n\n.clx-lay-rule {\n  font-size: 11.5px;\n  line-height: 1.55;\n  color: var(--dsw-alias-label-secondary);\n  padding: 6px 8px;\n  border-radius: 6px;\n  background: var(--dsw-alias-interactive-bg-hover);\n  margin-bottom: 8px;\n}\n\n.clx-lay-group {\n  margin-bottom: 8px;\n}\n\n.clx-lay-gh {\n  display: flex;\n  align-items: baseline;\n  gap: 8px;\n  font-size: 11.5px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-secondary);\n  margin: 4px 0 2px;\n}\n\n.clx-lay-gh .clx-muted {\n  font-weight: 400;\n  font-size: 11px;\n}\n\n.clx-lay-level {\n  margin: 4px 0 6px;\n  padding-left: 8px;\n  border-left: 2px solid var(--dsw-alias-border-l1);\n}\n\n.clx-lay-dir {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  font-size: 11.5px;\n  min-width: 0;\n  margin-bottom: 1px;\n}\n\n.clx-lay-dir .p {\n  font-family: var(--dsw-font-mono, ui-monospace, monospace);\n  color: var(--dsw-alias-label-secondary);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  min-width: 0;\n}\n\n.clx-lay-row {\n  display: grid;\n  grid-template-columns: 14px minmax(0, 1fr) auto auto;\n  align-items: center;\n  gap: 8px;\n  min-height: 26px;\n  padding: 0 4px;\n  border-radius: 6px;\n  font-size: 12px;\n}\n\n.clx-lay-row:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-lay-row .st {\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  corner-shape: round;\n  justify-self: center;\n  box-sizing: border-box;\n}\n\n.clx-lay-row.loaded .st {\n  background: var(--dsw-alias-state-success-primary);\n}\n\n.clx-lay-row.exists .st {\n  background: var(--dsw-alias-label-tertiary);\n}\n\n.clx-lay-row.missing .st {\n  border: 1.5px dashed var(--dsw-alias-label-tertiary);\n}\n\n.clx-lay-row .nm {\n  font-family: var(--dsw-font-mono, ui-monospace, monospace);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  min-width: 0;\n}\n\n.clx-lay-row .nm code {\n  margin-left: 8px;\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-lay-row.missing .nm {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-lay-row .ss {\n  font-size: 11px;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-lay-row.loaded .ss {\n  color: var(--dsw-alias-state-success-primary);\n}\n\n.clx-lay-row .ac {\n  display: inline-flex;\n  gap: 2px;\n}\n\n.clx-lay-row .rk {\n  justify-self: center;\n  font-size: 10.5px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-tertiary);\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-lay-absent {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 4px;\n  padding: 2px 4px 2px 26px;\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-lay-absent code {\n  padding: 0 5px;\n  border-radius: 4px;\n  border: 1px dashed var(--dsw-alias-border-l2);\n}\n\n.clx-mnode.open {\n  background: none;\n  margin: 4px 0 8px;\n  border: 1px solid var(--dsw-alias-settings-card-stroke);\n  border-radius: 10px;\n  background: var(--dsw-alias-settings-card-fill);\n}\n\n.clx-mnode.open > .clx-mrow {\n  position: sticky;\n  top: 56px;\n  z-index: 2;\n  border-radius: 10px 10px 0 0;\n  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, var(--dsw-alias-settings-card-fill));\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n}\n\n.clx-mopen {\n  padding: 8px 12px 6px;\n}\n\n.clx-mopen > .clx-detail {\n  margin: 0;\n}\n\n.clx-mopen-close {\n  display: block;\n  margin: 6px auto 0;\n  padding: 3px 14px;\n  font-size: 11.5px;\n  border: 0;\n  border-radius: 6px;\n  background: none;\n  color: var(--dsw-alias-label-secondary);\n  cursor: pointer;\n}\n\n.clx-mopen-close:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-stepbar {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  margin-bottom: 10px;\n  padding: 8px 10px;\n  border: 1px solid var(--dsw-alias-settings-card-stroke);\n  border-radius: 10px;\n  background: var(--dsw-alias-settings-card-fill);\n}\n\n.clx-stepbar-top,\n.clx-stepbar-diff {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 6px 8px;\n  font-size: 12px;\n  min-width: 0;\n}\n\n.clx-stepbar-top .clx-chipbtn:disabled {\n  opacity: 0.35;\n  cursor: default;\n}\n\n.clx-stepbar-tools {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-stepbar-now {\n  margin-left: auto;\n  font-size: 11.5px;\n}\n\n.clx-stepbar-strip {\n  display: flex;\n  align-items: flex-end;\n  gap: 2px;\n  height: 34px;\n  overflow-x: auto;\n  scrollbar-width: thin;\n}\n\n.clx-stepbar-strip .b {\n  flex: 1 0 8px;\n  max-width: 22px;\n  height: 100%;\n  padding: 0;\n  display: flex;\n  align-items: flex-end;\n  border: 0;\n  border-radius: 3px;\n  background: none;\n  cursor: pointer;\n}\n\n.clx-stepbar-strip .b i {\n  display: block;\n  width: 100%;\n  border-radius: 2px;\n  background: var(--dsw-alias-label-tertiary);\n  opacity: 0.55;\n}\n\n.clx-stepbar-strip .b:hover i {\n  opacity: 0.9;\n}\n\n.clx-stepbar-strip .b.on i {\n  background: var(--dsw-alias-state-business-primary);\n  opacity: 1;\n}\n\n.clx-stepbar-strip .b.later i {\n  opacity: 0.25;\n}\n\n.clx-stchip.warn {\n  color: var(--dsw-alias-state-warn-primary);\n}\n\n.clx-stepbar-diff .clx-chipbtn.on {\n  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent);\n}\n\n.clx-stepbar-diff em {\n  margin-left: 4px;\n  font-style: normal;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-stepbar-diff em.up {\n  color: var(--dsw-alias-state-warn-primary);\n}\n\n.clx-stepbar-diff em.down {\n  color: var(--dsw-alias-state-success-primary);\n}\n\n.clx-mnode.instep > .clx-mrow {\n  box-shadow: inset 2px 0 0 var(--dsw-alias-state-business-primary);\n}\n\n.clx-mnode.later {\n  opacity: 0.4;\n}\n\n.clx-tl.hot {\n  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);\n}\n\n.clx-diag-row {\n  display: grid;\n  grid-template-columns: 10px minmax(0, 1fr) auto;\n  align-items: center;\n  gap: 10px;\n  padding: 7px 8px;\n  border-radius: 8px;\n  font-size: 12.5px;\n  line-height: 1.5;\n}\n\n.clx-diag-row[role=button] {\n  cursor: pointer;\n}\n\n.clx-diag-row[role=button]:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-diag-row .clx-dot {\n  width: 8px;\n  height: 8px;\n  background: var(--dsw-alias-state-business-primary);\n}\n\n.clx-diag-row.warn .clx-dot {\n  background: var(--dsw-alias-state-warn-primary);\n}\n\n.clx-diag-row .go {\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n  white-space: nowrap;\n}\n\n.clx-pv {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n\n.clx-pv-map {\n  display: flex;\n  height: 22px;\n  gap: 1px;\n  border-radius: 6px;\n  overflow: hidden;\n}\n\n.clx-pv-map button {\n  flex-basis: 0;\n  min-width: 1px;\n  padding: 0;\n  border: 0;\n  cursor: pointer;\n  opacity: 0.85;\n}\n\n.clx-pv-map button:hover {\n  opacity: 1;\n}\n\n.clx-pv-chips {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  margin-top: 8px;\n}\n\n.clx-pv-chips .clx-chipbtn:not(.on) {\n  opacity: 0.45;\n}\n\n.clx-pv-list {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n.clx-pv-item {\n  border-left: 3px solid var(--cat);\n  border-radius: 2px 8px 8px 2px;\n  background: var(--dsw-alias-settings-card-fill);\n  border-top: 1px solid var(--dsw-alias-border-l1);\n  border-right: 1px solid var(--dsw-alias-border-l1);\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  min-width: 0;\n}\n\n.clx-pv-item.fresh {\n  background: color-mix(in srgb, var(--cat) 8%, var(--dsw-alias-settings-card-fill));\n}\n\n.clx-pv-head {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-height: 28px;\n  padding: 0 10px;\n  font-size: 12.5px;\n  cursor: pointer;\n  min-width: 0;\n}\n\n.clx-pv-head .sq {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n}\n\n.clx-pv-head .tk {\n  margin-left: auto;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-pv-head .tk small {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 10.5px;\n}\n\n.clx-pv-text {\n  padding: 0 10px 8px 28px;\n  font-size: 12px;\n  line-height: 1.55;\n  color: var(--dsw-alias-label-secondary);\n  display: -webkit-box;\n  -webkit-line-clamp: 3;\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n  word-break: break-word;\n  cursor: pointer;\n}\n\n.clx-pv-item.tools .clx-pv-text {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n  -webkit-line-clamp: unset;\n  cursor: default;\n}\n\n.clx-pv-tool {\n  padding: 0 6px;\n  border-radius: 4px;\n  background: var(--dsw-alias-interactive-bg-hover);\n  font-size: 11px;\n}\n\n.clx-pv-tool small {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-pv-body {\n  padding: 0 10px 10px 18px;\n}\n\n.clx-pv-body > .clx-detail {\n  margin: 0;\n}\n\n.clx-pv-div {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  margin: 8px 0 4px;\n  padding: 3px 10px;\n  font-size: 11.5px;\n  border-radius: 6px;\n  border: 1px dashed var(--dsw-alias-border-l2);\n  color: var(--dsw-alias-label-secondary);\n  cursor: pointer;\n}\n\n.clx-pv-div:hover,\n.clx-pv-div.on {\n  border-style: solid;\n  border-color: var(--dsw-alias-state-business-primary);\n  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);\n}\n\n.clx-pv-div span:first-child {\n  font-weight: 600;\n}\n\n.clx-pv-later {\n  text-align: center;\n  font-size: 12px;\n  padding: 8px;\n}\n\n.clx-story {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n\n.clx-story-row {\n  display: grid;\n  grid-template-columns: 34px minmax(0, 1fr);\n  gap: 8px;\n  padding: 4px 6px;\n  border-radius: 6px;\n  font-size: 12px;\n  line-height: 1.5;\n  cursor: pointer;\n}\n\n.clx-story-row:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-story-row .k {\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  padding-top: 1px;\n}\n\n.clx-story-row .tx {\n  min-width: 0;\n  word-break: break-word;\n  display: -webkit-box;\n  -webkit-line-clamp: 3;\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n}\n\n.clx-story-row.call .tx code {\n  font-size: 11px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-story-row .res {\n  display: block;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-story-row .res .tk {\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-story-row.err .res {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-az {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n\n.clx-az-intro ul {\n  margin: 4px 0 12px 18px;\n  padding: 0;\n  font-size: 12.5px;\n  line-height: 1.7;\n}\n\n.clx-az-go {\n  align-self: flex-start;\n}\n\n.clx-az-bar {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 6px 8px;\n  font-size: 12px;\n}\n\n.clx-az-bar .clx-chipbtn.on {\n  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent);\n}\n\n.clx-az-tok {\n  margin-left: auto;\n}\n\n.clx-az-asks {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-start;\n  gap: 6px;\n}\n\n.clx-az-user {\n  align-self: flex-end;\n  max-width: 85%;\n  padding: 7px 12px;\n  border-radius: 12px 12px 4px 12px;\n  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent);\n  font-size: 13px;\n  line-height: 1.55;\n  white-space: pre-wrap;\n  word-break: break-word;\n}\n\n.clx-az-ans {\n  font-size: 13px;\n  line-height: 1.65;\n}\n\n.clx-az-think {\n  margin-bottom: 8px;\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-az-think > div {\n  margin-top: 4px;\n  max-height: 160px;\n  overflow: auto;\n  white-space: pre-wrap;\n}\n\n.clx-az-refs {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 6px;\n  margin-top: 8px;\n  font-size: 12px;\n}\n\n.clx-az-use {\n  margin-top: 6px;\n  font-size: 11px;\n}\n\n.clx-az-input {\n  position: sticky;\n  bottom: 8px;\n  display: flex;\n  align-items: flex-end;\n  gap: 8px;\n}\n\n.clx-az-input textarea {\n  flex: 1 1 auto;\n  min-width: 0;\n  resize: none;\n  border: 0;\n  outline: 0;\n  background: none;\n  font: inherit;\n  font-size: 13px;\n  line-height: 1.5;\n  color: inherit;\n}\n\n.clx-pv-ask {\n  padding: 0 6px;\n  border: 0;\n  border-radius: 4px;\n  background: none;\n  color: var(--dsw-alias-label-tertiary);\n  cursor: pointer;\n  font-size: 12px;\n}\n\n.clx-pv-ask:hover {\n  color: var(--dsw-alias-state-business-primary);\n  background: var(--dsw-alias-interactive-bg-hover);\n}"

// ===== src/parts/01-context-lens.js
"use strict";
/*!
 * dsh-context-monitor — browser half, part 1.
 *
 * 1. Compact view: a usage ring in the composer dock (`conversation.composer.dock`, in place of the
 *    built-in meter) that opens a compact breakdown popover.
 * 2. Detailed view: a tab in the conversation's top View row ("上下文透视") with the full breakdown:
 *    categories, calibration, compaction policy, every surface node with its content, tool
 *    definitions and usage, system prompt sections, memory and skills; the overview folds in the
 *    context growth chart.
 *
 * Everything below runs inside the part factory: `kit` gives React, h and the body portal, and the
 * dictionaries/CSS/formatting live in src/lib so the parts stay about behaviour.
 */
part({
    id: 'dsh-context-monitor',
    factory(require, kit) {
        const { React, h, portal: toBody } = kit;
        const { useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore, useLayoutEffect, } = React;
        function useLocaleTick(ctx) {
            return useSyncExternalStore(useCallback((fn) => ctx.locale.subscribe(fn), [ctx]), () => ctx.locale.getSnapshot());
        }
        /** Projection selector that never throws and works when the host gives no hook. */
        function useSafeProjection(props, name) {
            const hook = typeof props.useProjection === 'function' ? props.useProjection : null;
            let value = null;
            try {
                value = hook ? hook(name) : null;
            }
            catch {
                value = null;
            }
            return value;
        }
        function useBreakdown(sessionId, liveKey, active, pollMs) {
            const [state, setState] = useState({ data: null, error: null, loading: false });
            const [nonce, setNonce] = useState(0);
            const has = useRef(false);
            useEffect(() => {
                if (!active || !sessionId)
                    return undefined;
                let dead = false;
                const run = () => {
                    setState((s) => ({ ...s, loading: true }));
                    call('breakdown', { sessionId }).then((data) => { if (!dead) {
                        has.current = true;
                        setState({ data, error: null, loading: false });
                    } }, (e) => { if (!dead)
                        setState((s) => ({ ...s, error: String(e?.message || e), loading: false })); });
                };
                const timer = setTimeout(run, has.current ? 450 : 0);
                const poll = pollMs ? setInterval(run, pollMs) : undefined;
                return () => {
                    dead = true;
                    clearTimeout(timer);
                    if (poll)
                        clearInterval(poll);
                };
            }, [sessionId, liveKey, active, nonce, pollMs]);
            const data = state.data && state.data.sessionId === sessionId ? state.data : null;
            return { data, error: state.error, loading: state.loading, reload: () => setNonce((n) => n + 1) };
        }
        function Style() {
            return h('style', null, CSS_TEXT);
        }
        function Ring({ ratio, size = 16, stroke = 2.6, warn }) {
            const r = (size - stroke) / 2;
            const c = 2 * Math.PI * r;
            const v = Math.max(0, Math.min(1, ratio || 0));
            const color = warn === 2 ? 'var(--dsw-alias-state-error-primary)' : warn === 1 ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-state-business-primary)';
            return h('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, 'aria-hidden': true, style: { flex: 'none' } }, h('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'var(--dsw-alias-border-l2)', strokeWidth: stroke }), h('circle', {
                cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, strokeWidth: stroke,
                strokeDasharray: `${c * v} ${c}`, strokeLinecap: 'round',
                transform: `rotate(-90 ${size / 2} ${size / 2})`,
            }));
        }
        /** Stacked usage bar: segments in window units, then buffer (hatched) and free space. */
        function UsageBar({ segments, win, buffer, height, anim }) {
            if (!win)
                return null;
            return h('div', { className: `clx-bar${anim ? ' anim' : ''}`, style: height ? { height } : undefined }, segments.filter((s) => s.tokens > 0).map((s) => h('span', {
                key: s.key, title: `${s.label}: ${fmtInt(s.tokens)}`,
                style: { width: `${s.tokens / win * 100}%`, background: s.color },
            })), h('span', { key: 'free', style: { flex: '1 1 auto' } }), buffer > 0 ? h('span', { key: 'buffer', className: 'clx-hatch', title: `buffer: ${fmtInt(buffer)}`, style: { width: `${buffer / win * 100}%` } }) : null);
        }
        // ================================================================== compact view
        /** English names for tool groups (used for the deferred rows). */
        const GROUP_EN = {
            messages: 'Messages',
            systemTools: 'System tools',
            system: 'System prompt',
            skills: 'Skills',
            mcpTools: 'MCP tools',
            memory: 'Memory files',
            buffer: 'Autocompact buffer',
            free: 'Free space',
        };
        /** Chinese name plus the muted English term (one name when the UI is English). */
        function BiName({ zh, en: term }) {
            return h('span', { className: 'clx-catname' }, h('span', { className: 'zh' }, zh), term && term !== zh ? h('span', { className: 'en' }, term) : null);
        }
        /** A dot for a group: its categories' colours in proportion, like a tiny pie. */
        function groupDot(children) {
            const total = children.reduce((a, c) => a + c.tokens, 0);
            if (children.length < 2 || !total)
                return { background: children[0]?.color || 'var(--dsw-alias-border-l3)' };
            let at = 0;
            const stops = children.map((c) => {
                const from = at;
                at += c.tokens / total * 360;
                return `${c.color} ${from}deg ${at}deg`;
            });
            return { background: `conic-gradient(${stops.join(',')})` };
        }
        function PopBody({ data, t }) {
            const s = summarize(data);
            const [hov, setHov] = useState(null);
            const [open, setOpen] = useState(() => new Set());
            const usedAnim = useCountUp(s.used, 700);
            const toggle = (k) => setOpen((o) => { const n = new Set(o); if (n.has(k))
                n.delete(k);
            else
                n.add(k); return n; });
            // level 1: the standard groups; level 2: the overview's categories (or a group's files)
            const memoryFiles = data.memoryFiles || [];
            const groups = GROUPS.map((g) => {
                const children = g.cats.map((k) => ({ key: k, color: CAT_COLOR[k], tokens: s.byCat[k]?.tokens || 0, count: s.byCat[k]?.count || 0 }))
                    .filter((c) => c.tokens > 0).sort((a, b) => b.tokens - a.tokens);
                const tokens = children.reduce((a, c) => a + c.tokens, 0);
                const files = g.key === 'memory' ? memoryFiles : [];
                return { key: g.key, tokens, children, files, cats: new Set(children.map((c) => c.key)), expandable: children.length > 1 || files.length > 0 };
            }).filter((g) => g.tokens > 0).sort((a, b) => b.tokens - a.tokens);
            const groupOf = {};
            for (const g of groups)
                for (const c of g.children)
                    groupOf[c.key] = g.key;
            const deferred = data.deferred || [];
            const defRows = ['mcpTools', 'systemTools'].map((k) => {
                const list = deferred.filter((d) => (d.kind === 'mcp') === (k === 'mcpTools'));
                return { key: `def-${k}`, cat: k, n: list.length, tokens: list.reduce((a, d) => a + (d.tokens || 0), 0) };
            }).filter((r) => r.n);
            const comp = s.comp;
            const m = data.measured || {};
            const auto = comp && comp.auto && typeof comp.thresholdTokens === 'number';
            const over = auto && comp.remainingTokens === 0;
            const caption = !comp ? t('pop.noCompaction') : !comp.auto ? t('pop.autoOff')
                : fmt(t(comp.engine === 'billion-context' ? 'pop.autoAtBili' : 'pop.autoAt'), { t: fmtK(comp.thresholdTokens) });
            const captionTip = [t(`pop.src.${m.usedSource || 'estimate'}`), m.rawTotalTokens > s.used * 1.05 ? fmt(t('pop.raw'), { t: fmtK(m.rawTotalTokens) }) : null].filter(Boolean).join(' · ');
            const nameOf = (k) => t(k === 'buffer' || k === 'free' ? `g.${k}` : `c.${k}`);
            const tip = (k, tokens) => [`${nameOf(k)} · ${fmtInt(Math.round(tokens))}`, fmt(t('ov.bar.ofWin'), { p: pct(tokens, s.win) })].join(' · ');
            const enOf = (key, fallback) => (t(key) !== en[key] ? fallback : null);
            // a hovered group lights all of its segments; a hovered category lights its own and its group row
            const isOn = (k) => hov === k || (hov && groups.some((g) => g.key === hov && g.cats.has(k)));
            const hover = (k) => ({ onMouseEnter: () => setHov(k), onMouseLeave: () => setHov(null) });
            const seg = (k, tokens, extra = undefined) => ({ 'data-k': k, title: tip(k, tokens), className: [extra, isOn(k) ? 'on' : ''].filter(Boolean).join(' ') || undefined, ...hover(k) });
            const keyToggle = (k) => (e) => { if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle(k);
            } };
            let i = 0;
            const row = ({ k, lead, dotStyle, dotCls = 'clx-dot', name, tokens, share, color, title, sub, on, onClick, expanded }) => h('div', {
                key: k, title,
                className: ['clx-prow', sub ? 'sub' : '', on ? 'on' : '', onClick ? 'tog' : ''].filter(Boolean).join(' '),
                style: { '--i': sub ? 0 : i++, '--cat': color || 'var(--dsw-alias-border-l3)' },
                ...(onClick ? { role: 'button', tabIndex: 0, 'aria-expanded': expanded, onClick, onKeyDown: keyToggle(k) } : null),
                ...hover(k),
            }, sub ? null : h('span', { className: dotCls, style: dotStyle }), h('span', { className: 'clx-pop-name' }, sub ? h('span', { className: dotCls, style: dotStyle }) : null, name, lead ? h('span', { className: 'lead' }, lead) : null), h('span', { className: 'clx-num' }, fmtK(tokens)), h('span', { className: 'clx-num clx-muted' }, share));
            const lines = [];
            for (const g of groups) {
                const isOpen = open.has(g.key);
                const single = g.children.length === 1 ? g.children[0] : null;
                lines.push(row({
                    k: g.key,
                    lead: g.expandable ? h(Chevron, { open: isOpen, size: 10 }) : null,
                    dotStyle: groupDot(g.children),
                    name: h(BiName, { zh: t(`g.${g.key}`), en: enOf(`g.${g.key}`, GROUP_EN[g.key]) }),
                    tokens: g.tokens, share: pct(g.tokens, s.win),
                    color: single ? single.color : (GROUPS.find((x) => x.key === g.key) || {}).color,
                    title: single && single.count ? fmt(t('ov.bar.items'), { n: single.count }) : undefined,
                    on: hov === g.key || (hov && groupOf[hov] === g.key),
                    onClick: g.expandable ? () => toggle(g.key) : null, expanded: isOpen,
                }));
                if (!isOpen)
                    continue;
                const kids = g.files.length
                    ? g.files.map((f) => row({ k: `file:${f.path}`, sub: true, dotStyle: { background: CAT_COLOR.memory }, color: CAT_COLOR.memory,
                        name: h('code', { className: 'clx-pfile' }, f.path), tokens: f.tokens, share: pct(f.tokens, s.win), title: f.loads > 1 ? `${f.path} ×${f.loads}` : f.path,
                        on: hov === g.key }))
                    : g.children.map((c) => row({ k: c.key, sub: true, dotStyle: { background: c.color }, color: c.color,
                        name: h(CatName, { t, k: c.key }), tokens: c.tokens, share: pct(c.tokens, s.win),
                        title: c.count ? fmt(t('ov.bar.items'), { n: c.count }) : undefined, on: isOn(c.key) }));
                lines.push(h('div', { key: `${g.key}-kids`, className: 'clx-pkids' }, kids));
            }
            return h(React.Fragment, null, h('div', { className: 'clx-pop-usage' }, h('span', { className: 'clx-big' }, pct(usedAnim, s.win, 0)), h('span', { className: 'clx-sub' }, ` ${t('pop.used')} `), h('span', { className: 'clx-sub', style: { fontVariantNumeric: 'tabular-nums' } }, `${fmtK(usedAnim)} / ${fmtK(s.win)}`), auto ? h('span', { className: `clx-pop-chip${over ? ' warn' : ''}`, title: fmt(t('pop.until'), { t: fmtK(comp.remainingTokens) }) }, over ? t('pop.overShort') : fmt(t('pop.untilShort'), { t: fmtK(comp.remainingTokens) })) : null), s.win ? h('div', { className: 'clx-bar anim clx-ibar clx-pbar', 'data-active': hov ? '' : undefined, 'aria-hidden': true }, groups.flatMap((g) => g.children).map((c) => h('span', { key: c.key, ...seg(c.key, c.tokens), style: { width: `${c.tokens / s.win * 100}%`, background: c.color } })), h('span', { key: 'free', ...seg('free', s.free, 'free'), style: { flex: '1 1 auto' } }), s.buffer > 0 ? h('span', { key: 'buffer', ...seg('buffer', s.buffer, 'clx-hatch'), style: { width: `${s.buffer / s.win * 100}%` } }) : null) : null, h('div', { className: 'clx-pop-caption', title: captionTip }, caption, ' · ', t(`pop.srcShort.${m.usedSource || 'estimate'}`)), h('div', { className: 'clx-prows', 'data-active': hov ? '' : undefined }, lines, h('div', { key: 'sep', className: 'clx-sep', style: { '--i': i++ } }), s.buffer > 0 ? row({ k: 'buffer', dotCls: 'clx-dot clx-hatch', name: h(CatName, { t, k: 'buffer' }), tokens: s.buffer, share: pct(s.buffer, s.win), on: hov === 'buffer' }) : null, row({ k: 'free', dotCls: 'clx-dot free', name: h(CatName, { t, k: 'free' }), tokens: s.free, share: pct(s.free, s.win), on: hov === 'free' }), defRows.map((r) => row({ k: r.key, dotCls: 'clx-dot hollow', dotStyle: { borderColor: CAT_COLOR[r.cat] }, color: CAT_COLOR[r.cat],
                name: h(BiName, { zh: fmt(t('pop.deferredName'), { name: t(`g.${r.cat}`) }), en: enOf(`g.${r.cat}`, 'deferred') }),
                tokens: r.tokens, share: '—', title: fmt(t('pop.deferredTip'), { n: r.n }), on: hov === r.key }))));
        }
        function CompactPopover({ data, error, loading, reload, t, onOpen, style, popRef }) {
            let body;
            if (!data) {
                body = error
                    ? h('div', null, h('div', { className: 'clx-err' }, fmt(t('failed'), { msg: error })), h('button', { className: 'clx-link', onClick: reload }, t('retry')))
                    : h('div', { className: 'clx-muted' }, t('loading'));
            }
            else if (!data.contextWindow && !data.measured?.totalTokens) {
                body = h('div', { className: 'clx-muted' }, t('pop.empty'));
            }
            else {
                body = h(PopBody, { data, t });
            }
            return h('div', { ref: popRef, className: 'clx-pop notranslate', translate: 'no', style, role: 'dialog', 'aria-label': t('pop.title') }, h('div', { className: 'clx-pop-head' }, h('span', { className: 'clx-pop-title' }, t('pop.title'), t('pop.title') !== en['pop.title'] ? h('span', { className: 'clx-pop-title-en' }, en['pop.title']) : null, loading ? h('span', { className: 'clx-muted clx-spin' }, ' ·') : null), data ? h('button', { className: 'clx-link clx-pop-open', onClick: onOpen, title: [data.model, data.contextWindow ? fmtK(data.contextWindow) : null].filter(Boolean).join(' · ') }, `${t('pop.open')} →`) : null), body);
        }
        function CompactButton(props) {
            const { ctx, t } = props;
            useLocaleTick(ctx);
            const sessionId = typeof props.sessionId === 'string' ? props.sessionId : '';
            const pressure = useSafeProjection(props, 'contextPressure');
            const [open, setOpen] = useState(false);
            const [pos, setPos] = useState(null);
            const btnRef = useRef(null);
            const popRef = useRef(null);
            const liveKey = pressure ? `${pressure.pressureTokens}:${pressure.projectedTokens}:${pressure.contextWindow}` : '';
            const { data, error, loading, reload } = useBreakdown(sessionId, liveKey, open && !!sessionId, open && !pressure ? 5000 : 0);
            const used = pressure?.pressureTokens ?? pressure?.projectedTokens ?? data?.measured?.totalTokens;
            const win = pressure?.contextWindow ?? data?.contextWindow;
            const ratio = used !== undefined && win ? used / win : 0;
            const threshold = data?.compaction?.thresholdTokens;
            const warn = threshold && used ? (used >= threshold ? 2 : used >= threshold * 0.85 ? 1 : 0) : (ratio > 0.9 ? 2 : ratio > 0.75 ? 1 : 0);
            const place = useCallback(() => {
                const el = btnRef.current;
                if (!el)
                    return;
                const r = el.getBoundingClientRect();
                const width = Math.min(368, window.innerWidth - 24);
                const left = Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12));
                setPos({ left, bottom: Math.max(12, window.innerHeight - r.top + 8), width });
            }, []);
            useLayoutEffect(() => {
                if (!open)
                    return undefined;
                place();
                const onDown = (e) => {
                    if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target))
                        return;
                    setOpen(false);
                };
                const onKey = (e) => { if (e.key === 'Escape')
                    setOpen(false); };
                window.addEventListener('resize', place);
                document.addEventListener('mousedown', onDown, true);
                document.addEventListener('keydown', onKey);
                return () => {
                    window.removeEventListener('resize', place);
                    document.removeEventListener('mousedown', onDown, true);
                    document.removeEventListener('keydown', onKey);
                };
            }, [open, place]);
            // The composer has no View-switching hook, so select our tab in the
            // header's own tab row (the same click a user would make).
            const openLens = () => {
                setOpen(false);
                try {
                    const label = t('tab.title');
                    // nearest enclosing Conversation's tab row (split views have several)
                    let node = btnRef.current;
                    let row = null;
                    while (node && !row) {
                        row = node.querySelector?.('[data-conversation-tabs]') ?? null;
                        node = node.parentElement;
                    }
                    const tabs = row ? [...row.querySelectorAll('[role="tab"]')] : [];
                    const tab = tabs.find((el) => el.textContent.trim() === label);
                    if (tab)
                        tab.click();
                }
                catch { }
            };
            if (!sessionId)
                return null;
            const label = win ? `${Math.round(ratio * 100)}%` : '';
            return h(React.Fragment, null, h(Style), h('button', {
                ref: btnRef,
                type: 'button',
                className: 'clx-btn dock clx-dock-ring',
                'aria-expanded': open,
                'aria-haspopup': 'dialog',
                title: win ? fmt(t('button.title'), { used: fmtK(used), window: fmtK(win) }) : t('button.unknown'),
                onClick: () => setOpen((v) => !v),
            }, h(Ring, { ratio, warn, size: 14, stroke: 2 }), label ? h('span', null, label) : null), open && pos ? toBody(h(CompactPopover, {
                data, error, loading, reload, t, onOpen: openLens, popRef,
                style: { left: pos.left, bottom: pos.bottom, width: pos.width },
            })) : null);
        }
        // ================================================================== detailed view
        /** English term for a category; the Chinese UI shows it next to the Chinese name. */
        const CAT_EN = {
            system: 'System prompt',
            systemTools: 'System tools',
            mcpTools: 'MCP tools',
            skills: 'Skills',
            memory: 'Memory files',
            injected: 'Injected context',
            summary: 'Compaction summary',
            user: 'User messages',
            assistantText: 'Assistant text',
            reasoning: 'Reasoning',
            toolCalls: 'Tool calls',
            toolResults: 'Tool results',
            other: 'Other',
            buffer: 'Autocompact buffer',
            free: 'Free space',
        };
        /** Category name; outside the English UI the English term follows in muted type. */
        function CatName({ t, k }) {
            const key = k === 'buffer' || k === 'free' ? `g.${k}` : `c.${k}`;
            const label = t(key);
            const term = label !== en[key] ? CAT_EN[k] : null;
            return h('span', { className: 'clx-catname' }, h('span', { className: 'zh' }, label), term ? h('span', { className: 'en' }, term) : null);
        }
        const reducedMotion = () => {
            try {
                return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            }
            catch {
                return false;
            }
        };
        /** Eases a number toward its target (from 0 on mount, then from wherever it is on each change). */
        function useCountUp(target, ms = 900) {
            const [v, setV] = useState(() => (reducedMotion() ? target : 0));
            const cur = useRef(v);
            useEffect(() => {
                if (reducedMotion()) {
                    cur.current = target;
                    setV(target);
                    return undefined;
                }
                const from = cur.current;
                const start = performance.now();
                let raf = 0;
                const step = (now) => {
                    const p = Math.min(1, (now - start) / ms);
                    const e = 1 - Math.pow(1 - p, 3);
                    cur.current = from + (target - from) * e;
                    setV(cur.current);
                    if (p < 1)
                        raf = requestAnimationFrame(step);
                };
                raf = requestAnimationFrame(step);
                return () => cancelAnimationFrame(raf);
            }, [target]);
            return v;
        }
        /**
         * The overview's stacked usage bar, made interactive: hover a segment or legend
         * item to preview it, click to pin it; the rest dims and the matching 分类明细
         * row is tinted (numbers are in the tooltip).
         */
        function HeroBar({ cats, s, t, active, pick, onHover, onPick }) {
            if (!s.win)
                return null;
            const parts = cats.filter((c) => c.tokens > 0);
            const info = {};
            for (const c of parts)
                info[c.key] = { key: c.key, color: c.color, tokens: c.tokens, count: c.count, cat: true };
            info.free = { key: 'free', tokens: s.free };
            if (s.buffer > 0)
                info.buffer = { key: 'buffer', tokens: s.buffer };
            const tip = (k) => {
                const x = info[k];
                const name = t(k === 'buffer' || k === 'free' ? `g.${k}` : `c.${k}`);
                return [`${name} · ${fmtInt(Math.round(x.tokens))}`, fmt(t('ov.bar.ofWin'), { p: pct(x.tokens, s.win) }),
                    x.cat ? fmt(t('ov.bar.ofUsed'), { p: pct(x.tokens, s.used) }) : null,
                    x.cat && x.count ? fmt(t('ov.bar.items'), { n: x.count }) : null].filter(Boolean).join(' · ');
            };
            const seg = (k, extra = undefined) => ({
                'data-k': k,
                title: tip(k),
                className: [extra, active === k ? 'on' : ''].filter(Boolean).join(' ') || undefined,
                onMouseEnter: () => onHover(k),
                onMouseLeave: () => onHover(null),
                onClick: () => onPick(k),
            });
            const legendItem = (k, dot, label) => h('button', {
                key: k, type: 'button', title: tip(k), 'aria-pressed': pick === k,
                className: active === k ? 'on' : undefined,
                onMouseEnter: () => onHover(k), onMouseLeave: () => onHover(null),
                onFocus: () => onHover(k), onBlur: () => onHover(null),
                onClick: () => onPick(k),
            }, dot, label);
            return h(React.Fragment, null, h('div', { className: 'clx-bar anim clx-ibar', 'data-active': active ? '' : undefined, 'aria-hidden': true }, parts.map((c) => h('span', { key: c.key, ...seg(c.key), style: { width: `${c.tokens / s.win * 100}%`, background: c.color } })), h('span', { key: 'free', ...seg('free', 'free'), style: { flex: '1 1 auto' } }), s.buffer > 0 ? h('span', { key: 'buffer', ...seg('buffer', 'clx-hatch'), style: { width: `${s.buffer / s.win * 100}%` } }) : null), h('div', { className: 'clx-legend clx-ilegend', 'data-active': active ? '' : undefined }, [...parts].sort((a, b) => b.tokens - a.tokens).map((c) => legendItem(c.key, h('i', { className: 'clx-dot', style: { background: c.color } }), c.label)), s.buffer > 0 ? legendItem('buffer', h('i', { className: 'clx-dot clx-hatch' }), t('g.buffer')) : null, legendItem('free', h('i', { className: 'clx-dot free' }), t('g.free'))));
        }
        /** The breakdown's flow data (steps, turns, live state), refreshed while a turn runs. */
        function useFlow(sessionId, liveKey) {
            const [st, setSt] = useState({ data: null, error: null, sid: null });
            const [tick, setTick] = useState(0);
            useEffect(() => {
                if (!sessionId)
                    return undefined;
                let dead = false;
                call('flow', { sessionId }).then((v) => { if (!dead)
                    setSt({ data: v, error: null, sid: sessionId }); }, (e) => { if (!dead)
                    setSt((s) => ({ ...s, error: String(e?.message || e) })); });
                return () => { dead = true; };
            }, [sessionId, liveKey, tick]);
            const data = st.sid === sessionId ? st.data : null;
            const busy = !!data?.live && data.live.phase !== 'idle';
            useEffect(() => {
                if (!busy)
                    return undefined;
                const id = setTimeout(() => setTick((x) => x + 1), 2500);
                return () => clearTimeout(id);
            }, [busy, data]);
            return { flow: data, flowError: st.error };
        }
        /** One line of what the conversation is doing right now. */
        function LiveLine({ flow, t }) {
            const live = flow?.live;
            const ph = live?.phase || 'idle';
            const now = useNow(ph !== 'idle');
            if (!live)
                return null;
            const where = live.turn ? (live.step ? fmt(t('flow.where'), { t: live.turn, s: live.step }) : fmt(t('msg.turn'), { n: live.turn })) : null;
            const last = live.lastSeq !== undefined
                ? `${t(`flow.n.${live.lastStage}`) || ''} ${live.lastTitle || ''}`.trim()
                : '';
            return h('div', { className: 'clx-liveline' }, h('i', { className: `clx-live-dot${ph === 'idle' ? '' : ' on'}`, style: { background: LIVE_COLOR[ph] } }), h('b', null, t(`flow.live.${ph}`)), where ? h('span', { className: 'clx-muted' }, where) : null, last ? h('span', { className: 'clx-liveline-last', title: last }, last) : null, live.lastTime ? h('span', { className: 'clx-muted clx-liveline-ago' }, fmt(t('flow.ago'), { d: fmtDur(Math.max(0, now - live.lastTime)) })) : null);
        }
        function Stat({ k, v, sub = undefined, tone = '' }) {
            return h('div', { className: `clx-stat${tone ? ` ${tone}` : ''}` }, h('div', { className: 'k' }, k), h('div', { className: 'v' }, v, sub ? h('small', null, sub) : null));
        }
        /** Context composition at every step that sent a request, grouped for stacking. */
        /** Stacking order for the per-step bars: fixed preamble at the bottom, the conversation on top. */
        const SERIES_CATS = ['system', 'systemTools', 'mcpTools', 'skills', 'memory', 'injected', 'summary', 'user', 'reasoning', 'assistantText', 'toolCalls', 'toolResults', 'other'];
        function useStepSeries(bd, flow) {
            return useMemo(() => {
                const steps = flow?.steps || [];
                return steps.map((st, i) => {
                    const comp = compositionAt(bd, st);
                    const groups = SERIES_CATS.map((k) => comp.by[k] || 0);
                    return { st, i, comp, groups };
                });
            }, [bd, flow]);
        }
        /** What one request added to the context compared with the one before it. */
        function stepDiff(bd, series, idx) {
            const cur = series[idx];
            if (!cur)
                return null;
            const prev = idx > 0 ? series[idx - 1] : null;
            const cutOf = (x) => x.st.requestSeq ?? x.st.endSeq ?? x.st.startSeq;
            const cut = cutOf(cur);
            const prevCut = prev ? cutOf(prev) : 0;
            const added = (bd.nodes || []).filter((n) => n.seq >= prevCut && n.seq < cut);
            const addedTok = added.reduce((a, n) => a + n.tokensCal, 0);
            const byCat = SERIES_CATS.map((k, gi) => ({ k, v: cur.groups[gi], d: prev ? cur.groups[gi] - prev.groups[gi] : cur.groups[gi] })).filter((x) => Math.abs(x.d) >= 1);
            const compacted = (bd.compactionEvents || []).filter((c) => c.seq >= prevCut && c.seq <= Math.max(cut, cur.st.endSeq ?? cut));
            const delta = prev ? cur.comp.total - prev.comp.total : cur.comp.total;
            return { idx, cur, prev, cut, prevCut, added, addedTok, byCat, compacted, delta, last: idx === series.length - 1 };
        }
        const dsign = (v) => (Math.abs(v) < 0.5 ? "±0" : `${v > 0 ? "+" : "−"}${fmtK(Math.abs(v))}`);
        /** The step every page follows: a strip of requests, and what the picked one changed. */
        function StepBar({ series, diff, onSel, t, onNav, stepOnly, setStepOnly, nav }) {
            const scroller = useRef(null);
            useLayoutEffect(() => {
                const el = scroller.current;
                const b = el?.querySelector(".on");
                if (el && b)
                    el.scrollLeft = Math.max(0, b.offsetLeft - el.clientWidth / 2);
            }, [diff?.idx, series.length]);
            if (!diff)
                return null;
            const peak = Math.max(1, ...series.map((x) => x.comp.total));
            const st = diff.cur.st;
            const go = (i) => onSel(Math.min(series.length - 1, Math.max(0, i)));
            return h("div", { className: "clx-stepbar" }, h("div", { className: "clx-stepbar-top" }, h("button", { className: "clx-chipbtn", disabled: diff.idx <= 0, onClick: () => go(diff.idx - 1), "aria-label": "‹" }, "‹"), h("button", { className: "clx-chipbtn", disabled: diff.last, onClick: () => go(diff.idx + 1), "aria-label": "›" }, "›"), h("b", null, fmt(t("flow.where"), { t: st.turn, s: st.step })), h("span", { className: "clx-stchip" }, h("span", { className: "k" }, t("st.ctx")), fmtK(diff.cur.comp.total)), h("span", { className: `clx-stchip${diff.delta > 0 ? " up" : ""}` }, h("span", { className: "k" }, t("st.delta")), dsign(diff.delta)), diff.compacted.length ? h("span", { className: "clx-stchip warn" }, "✂ ", t("sd.compacted")) : null, st.tools.length ? h("span", { className: "clx-stepbar-tools", title: st.tools.join(", ") }, groupNames(st.tools)) : null, diff.last ? h("span", { className: "clx-muted clx-stepbar-now" }, t("sd.now")) : h("button", { className: "clx-chipbtn clx-stepbar-now", onClick: () => onSel(null) }, t("sd.backNow"))), h("div", { className: "clx-stepbar-strip", ref: scroller }, series.map((x) => h("button", {
                key: x.st.startSeq, type: "button", className: `b${x.i === diff.idx ? " on" : ""}${x.i > diff.idx ? " later" : ""}`,
                title: `${fmt(t("flow.where"), { t: x.st.turn, s: x.st.step })} · ${fmtK(x.comp.total)}`, onClick: () => onSel(x.i),
            }, h("i", { style: { height: `${Math.max(6, x.comp.total / peak * 100)}%` } })))), h("div", { className: "clx-stepbar-diff" }, h("span", { className: "clx-muted" }, t("sd.added")), diff.added.length
                ? h("button", { className: `clx-chipbtn${stepOnly && nav === "messages" ? " on" : ""}`, "aria-pressed": stepOnly, onClick: () => { setStepOnly(true); onNav("messages"); }, title: t("sd.onlyNew") }, fmt(t("sd.items"), { n: diff.added.length, k: fmtK(diff.addedTok) }))
                : h("span", { className: "clx-muted" }, t("sd.none")), diff.byCat.sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 5).map((g) => h("span", { key: g.k, className: "clx-stchip" }, h("i", { className: "clx-dot", style: { background: CAT_COLOR[g.k] } }), t(`c.${g.k}`), h("em", { className: g.d > 0 ? "up" : "down" }, dsign(g.d)))), stepOnly ? h("button", { className: "clx-chipbtn clx-stepbar-now", onClick: () => setStepOnly(false) }, t("sd.showAll")) : null));
        }
        /** Per-step stacked bars (what each request carried), with the picked step's detail under them. */
        /** The message a step is about: what the model said or called in it, else its first message. */
        function stepNode(bd, st) {
            const inStep = (bd.nodes || []).filter((n) => n.seq >= st.startSeq && (st.endSeq === undefined || n.seq <= st.endSeq));
            const own = inStep.find((n) => n.category === 'toolCalls' || n.category === 'assistantText' || n.category === 'reasoning');
            return (own || inStep[0])?.seq ?? st.startSeq;
        }
        function StepTrend({ data, flow, t, onJump, series, pickIdx, onSel }) {
            const [hover, setHover] = useState(null);
            const scroller = useRef(null);
            const s = summarize(data);
            const comp = s.comp;
            useLayoutEffect(() => {
                const el = scroller.current;
                if (el)
                    el.scrollLeft = el.scrollWidth;
            }, [series.length]);
            if (!series.length)
                return h(Trend, { data, t, onJump });
            const peak = Math.max(1, ...series.map((x) => x.comp.total));
            const yMax = Math.max(peak * 1.08, comp?.thresholdTokens && comp.thresholdTokens < peak * 1.6 ? comp.thresholdTokens * 1.04 : 0);
            const cur = series[hover ?? pickIdx];
            const prev = cur && cur.i > 0 ? series[cur.i - 1] : null;
            const st = cur.st;
            const u = st.usage;
            const delta = prev ? cur.comp.total - prev.comp.total : cur.comp.total;
            const thY = comp?.thresholdTokens && comp.thresholdTokens <= yMax ? comp.thresholdTokens / yMax * 100 : null;
            const segs = SERIES_CATS.map((k, gi) => ({ key: k, label: t(`c.${k}`), color: CAT_COLOR[k], tokens: cur.groups[gi], d: prev ? cur.groups[gi] - prev.groups[gi] : cur.groups[gi] }));
            return h('div', { className: 'clx-card clx-steptrend' }, h('div', { className: 'clx-card-head' }, h(CardTitle, { icon: 'trend', text: t('st.title') }), h('span', { className: 'clx-muted' }, fmt(t('st.count'), { n: series.length }))), h('div', { className: 'clx-stbars-wrap' }, thY !== null ? h('div', { className: 'clx-stbars-th', style: { bottom: `${thY}%` } }, h('span', null, `${t('trend.threshold')} ${fmtK(comp.thresholdTokens)}`)) : null, h('div', { className: 'clx-stbars', ref: scroller, onMouseLeave: () => setHover(null) }, series.map((x) => {
                const newTurn = x.i === 0 || series[x.i - 1].st.turn !== x.st.turn;
                const on = x.i === pickIdx;
                return h('button', {
                    key: x.st.startSeq, type: 'button',
                    className: `clx-stbar${on ? ' on' : ''}${newTurn ? ' turn' : ''}${x.st.errors ? ' err' : ''}`,
                    title: `${fmt(t('flow.where'), { t: x.st.turn, s: x.st.step })} · ${fmtK(x.comp.total)}`,
                    onMouseEnter: () => setHover(x.i),
                    onClick: () => onSel(x.i),
                }, h('span', { className: 'col', style: { height: `${Math.max(2, x.comp.total / yMax * 100)}%` } }, SERIES_CATS.map((k, gi) => (x.groups[gi] > 0 ? h('i', { key: k, style: { flexGrow: x.groups[gi], background: CAT_COLOR[k] } }) : null))), newTurn ? h('span', { className: 'lbl' }, `T${x.st.turn}`) : null);
            }))), h('div', { className: 'clx-stdetail' }, h('div', { className: 'clx-stdetail-head' }, h('b', null, fmt(t('flow.where'), { t: st.turn, s: st.step })), st.status !== 'done' ? h('span', { className: st.status === 'error' ? 'clx-err' : st.status === 'running' ? 'clx-live' : 'clx-warn' }, t(`flow.status.${st.status}`)) : null, h('span', { className: 'clx-stchip' }, h('span', { className: 'k' }, t('st.ctx')), fmtK(cur.comp.total)), h('span', { className: `clx-stchip${delta > 0 ? ' up' : ''}` }, h('span', { className: 'k' }, t('st.delta')), dsign(delta)), u ? h('span', { className: 'clx-stchip' }, h('span', { className: 'k' }, t('st.output')), fmtK(u.output || 0)) : null, u ? h('span', { className: 'clx-stchip' }, h('span', { className: 'k' }, t('st.cache')), pct(u.cacheRead || 0, st.promptTokens || 0, 0)) : null, h('button', { className: 'clx-chipbtn clx-stdetail-go', onClick: () => onJump(stepNode(data, st)) }, `${t('st.viewMsgs')} ›`)), st.tools.length ? h('div', { className: 'clx-stdetail-tools', title: st.tools.join(', ') }, h('span', { className: 'clx-muted' }, `${t('flow.calls')} `), groupNames(st.tools)) : null, h(UsageBar, { segments: segs, win: s.win, buffer: 0 }), h('div', { className: 'clx-stlegend' }, [...segs].sort((p, q) => q.tokens - p.tokens).filter((g) => g.tokens >= 1 || Math.abs(g.d) >= 1).map((g) => h('span', { key: g.key }, h('i', { className: 'clx-dot', style: { background: g.color } }), g.label, h('b', null, fmtK(g.tokens)), prev && Math.abs(g.d) >= 1 ? h('em', { className: g.d > 0 ? 'up' : 'down' }, dsign(g.d)) : null))), !cur.comp.exact ? h('div', { className: 'clx-muted', style: { fontSize: 11 } }, t('flow.ctxEstNoUsage')) : null));
        }
        /** Where the context sits against the compaction triggers, and the policy behind them. */
        function CompactionCard({ data, comp, s, t }) {
            const win = s.win || 1;
            const at = (v) => `${Math.min(100, Math.max(0, v / win * 100))}%`;
            const marks = [
                comp.thresholdTokens ? { k: 'th', v: comp.thresholdTokens, label: t('ov.threshold'), cls: 'warn' } : null,
                comp.emergencyTokens ? { k: 'em', v: comp.emergencyTokens, label: t('ov.emergency'), cls: 'err' } : null,
            ].filter(Boolean);
            const over = comp.thresholdTokens && s.used >= comp.thresholdTokens;
            const ratio = typeof comp.thresholdRatio === 'number' ? `${Math.round(comp.thresholdRatio * 100)}%` : null;
            return h('div', { className: 'clx-card clx-infocard' }, h('div', { className: 'clx-card-head' }, h(CardTitle, { icon: 'compress', text: t('ov.compaction') }), h('span', { className: 'clx-pill' }, comp.engine || '—'), h('span', { className: `clx-pill ${comp.auto ? 'on' : 'off'}` }, `${t('ov.auto')} · ${comp.auto ? t('ov.on') : t('ov.off')}`)), h('div', { className: 'clx-cgauge' }, h('div', { className: 'track' }, h('span', { className: `fill${over ? ' over' : ''}`, style: { width: at(s.used) } }), marks.map((x) => h('i', { key: x.k, className: x.cls, style: { left: at(x.v) }, title: `${x.label} ${fmtInt(x.v)}` }))), h('div', { className: 'scale' }, h('span', null, `${t('ov.used')} ${fmtK(s.used)}`), marks.map((x) => h('span', { key: x.k, className: x.cls, style: { left: at(x.v) } }, fmtK(x.v))), h('span', { className: 'end' }, fmtK(s.win)))), h('div', { className: 'clx-tiles' }, comp.thresholdTokens ? h(Stat, { k: t('ov.threshold'), v: fmtK(comp.thresholdTokens), sub: ratio ? ` ${ratio}` : undefined }) : null, h(Stat, { k: t('ov.remaining'), v: comp.remainingTokens > 0 ? fmtK(comp.remainingTokens) : t('pop.over'), tone: comp.remainingTokens > 0 ? '' : 'warn' }), comp.emergencyTokens ? h(Stat, { k: t('ov.emergency'), v: fmtK(comp.emergencyTokens), sub: comp.emergencyRatio ? ` ${Math.round(comp.emergencyRatio * 100)}%` : undefined }) : null, h(Stat, { k: t('ov.buffer'), v: fmtK(comp.bufferTokens) }), comp.headroomTokens !== undefined ? h(Stat, { k: t('ov.headroom'), v: fmtK(comp.headroomTokens) }) : null, comp.retainBudget !== undefined ? h(Stat, { k: t('ov.retain'), v: comp.retainTokens !== undefined ? fmtK(comp.retainTokens) : fmtK(comp.retainBudget), sub: comp.retainTokens === undefined ? ` ${Math.round((comp.retainRatio || 0) * 100)}%` : undefined }) : null, comp.summaryMaxTokens ? h(Stat, { k: t('ov.summaryMax'), v: fmtK(comp.summaryMaxTokens) }) : null, h(Stat, { k: t('ov.compactions'), v: String((data.compactionEvents || []).length) }), comp.override ? h(Stat, { k: t('ov.override'), v: comp.override.model, sub: ` ${comp.override.provider}` }) : null), h('div', { className: 'clx-note' }, comp.engine === 'billion-context' ? `${t('ov.biliNote')}${comp.defaults ? ` ${t('ov.biliDefaults')}` : ''}` : t('ov.formula')));
        }
        /** How "used" was measured, how the estimate was calibrated to it, and what the last request cost. */
        function MeasureCard({ data, s, t }) {
            const m = data.measured || {};
            const u = m.lastRequest;
            const inTot = u ? (u.inputTokens || 0) + (u.cacheReadTokens || 0) + (u.cacheWriteTokens || 0) : 0;
            const seg = (v, cls) => (v > 0 ? h('span', { className: cls, style: { flexGrow: v } }) : null);
            const types = Object.entries(data.typeCounts || {}).sort((a, b) => b[1] - a[1]);
            return h('div', { className: 'clx-card clx-infocard' }, h('div', { className: 'clx-card-head' }, h(CardTitle, { icon: 'gauge', text: t('ov.measure') }), h('span', { className: 'clx-pill' }, t(`pop.src.${m.usedSource || 'estimate'}`)), h('span', { className: 'clx-pill', title: t('ov.baseline') }, t(`ov.baseline.${m.baselineKind || 'none'}`))), h('div', { className: 'clx-tiles' }, h(Stat, { k: t('ov.used'), v: fmtK(m.totalTokens) }), h(Stat, { k: t('ov.rawTotal'), v: fmtK(m.rawTotalTokens), sub: m.rawTotalTokens > m.totalTokens ? ` −${pct(m.rawTotalTokens - m.totalTokens, m.rawTotalTokens, 0)}` : undefined }), h(Stat, { k: t('ov.estSum'), v: fmtK(m.estimatedSum) }), h(Stat, { k: t('ov.factor'), v: `×${(m.factor || 1).toFixed(3)}` }), h(Stat, { k: t('ov.baseline'), v: fmtK(m.baselineTokens) }), h(Stat, { k: t('ov.delta'), v: fmtK(m.surfaceDeltaTokens) }), h(Stat, { k: t('ov.window'), v: fmtK(data.contextWindow) }), h(Stat, { k: t('ov.maxOut'), v: fmtK(data.maxTokens) })), u ? h('div', { className: 'clx-req' }, h('div', { className: 'clx-req-head' }, h('span', null, fmt(t('ov.lastReq'), { seq: u.seq, time: fmtTime(u.time) })), h('b', null, `${t('ov.hit')} ${pct(u.cacheReadTokens || 0, inTot, 0)}`)), h('div', { className: 'clx-req-bar' }, seg(u.cacheReadTokens, 'cr'), seg(u.cacheWriteTokens, 'cw'), seg(u.inputTokens, 'in'), seg(u.outputTokens, 'out')), h('div', { className: 'clx-req-legend' }, h('span', null, h('i', { className: 'cr' }), t('ov.cacheRead'), h('b', null, fmtK(u.cacheReadTokens || 0))), h('span', null, h('i', { className: 'cw' }), t('ov.cacheWrite'), h('b', null, fmtK(u.cacheWriteTokens || 0))), h('span', null, h('i', { className: 'in' }), t('ov.uncached'), h('b', null, fmtK(u.inputTokens || 0))), h('span', null, h('i', { className: 'out' }), t('ov.output'), h('b', null, fmtK(u.outputTokens || 0))))) : null, types.length ? h('div', { className: 'clx-types', title: t('ov.types') }, h('span', { className: 'clx-muted' }, `${t('ov.types')} · ${fmtInt(data.eventCount)}`), types.slice(0, 8).map(([k, v]) => h('span', { key: k, className: 'clx-type' }, k, h('b', null, fmtInt(v)))), types.length > 8 ? h('span', { className: 'clx-type more', title: types.slice(8).map(([k, v]) => `${k} ${v}`).join('\n') }, `+${types.length - 8}`) : null) : null, h('div', { className: 'clx-note' }, t('ov.calNote')));
        }
        // ================================================================== dashboard cards
        // Every card on every page opens the same way: an icon, a title, a figure on the right, and (on
        // the overview) a link to the page that has the whole story.
        const CARD_ICON = {
            stats: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
            donut: ['M12 3a9 9 0 1 0 9 9h-9z', 'M15 3.5A9 9 0 0 1 20.5 9H15z'],
            trend: ['M3 17l5-5 4 3 8-8', 'M15 7h5v5'],
            tools: ['M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z'],
            messages: ['M4 5h16v11H9l-5 4z'],
            sources: ['M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', 'M5 17a3 3 0 0 1 3-3h9'],
            compress: ['M4 9h16', 'M4 15h16', 'M9 4l3 3 3-3', 'M9 20l3-3 3 3'],
            gauge: ['M4 15a8 8 0 1 1 16 0', 'M12 15l4-4'],
            flow: ['M6 4h5v5H6z', 'M13 15h5v5h-5z', 'M8.5 9v3.5h7V15'],
            cmd: ['M4 6l5 5-5 5', 'M12 18h8'],
        };
        function CardTitle({ icon, text }) {
            return h('h4', { className: 'clx-ctitle' }, h('span', { className: 'ic' }, h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, (CARD_ICON[icon] || []).map((d, i) => h('path', { key: i, d })))), text);
        }
        function CardHead({ icon, title, meta = null, more = null, t }) {
            return h('div', { className: 'clx-card-head' }, h(CardTitle, { icon, text: title }), meta ? h('span', { className: 'clx-chead-meta' }, meta) : null, more ? h('button', { className: 'clx-more', onClick: more }, `${t('ov.more')} ›`) : null);
        }
        /** Category shares as a ring, the used total in its middle; the legend opens that category's messages. */
        function CompositionCard({ data, s, t, onShowCat, stepLabel = null }) {
            const [hov, setHov] = useState(null);
            const parts = CATS.map((k) => ({ k, v: s.byCat[k]?.tokens || 0, n: s.byCat[k]?.count || 0 })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
            const total = parts.reduce((a, b) => a + b.v, 0) || 1;
            const R = 50;
            const C = 2 * Math.PI * R;
            let off = 0;
            const segs = parts.map((x) => {
                const len = x.v / total * C;
                const seg = { ...x, dash: `${Math.max(0, len - (parts.length > 1 ? 1.2 : 0))} ${C}`, off: -off };
                off += len;
                return seg;
            });
            const cur = hov ? parts.find((x) => x.k === hov) : null;
            return h('div', { className: 'clx-card' }, h(CardHead, { t, icon: 'donut', title: t('ov.composition'), meta: `${stepLabel ? stepLabel + ' · ' : ''}${fmtK(s.used)} · ${pct(s.used, s.win)}` }), h('div', { className: 'clx-donutwrap' }, h('svg', { className: 'clx-donut', viewBox: '0 0 128 128', width: 128, height: 128 }, h('circle', { cx: 64, cy: 64, r: R, fill: 'none', stroke: 'var(--dsw-alias-border-l1)', strokeWidth: 16 }), segs.map((x) => h('circle', {
                key: x.k, cx: 64, cy: 64, r: R, fill: 'none', stroke: CAT_COLOR[x.k], strokeWidth: hov === x.k ? 20 : 16,
                strokeDasharray: x.dash, strokeDashoffset: x.off, transform: 'rotate(-90 64 64)', opacity: hov && hov !== x.k ? 0.35 : 1,
                onMouseEnter: () => setHov(x.k), onMouseLeave: () => setHov(null), onClick: () => onShowCat(x.k), style: { cursor: 'pointer' },
            }, h('title', null, `${t(`c.${x.k}`)} ${fmtInt(x.v)}`))), h('text', { x: 64, y: 62, textAnchor: 'middle', className: 'clx-donut-v' }, cur ? fmtK(cur.v) : fmtK(s.used)), h('text', { x: 64, y: 78, textAnchor: 'middle', className: 'clx-donut-k' }, cur ? t(`c.${cur.k}`) : t('ov.usedShort'))), h('div', { className: 'clx-dlegend' }, parts.map((x) => h('button', {
                key: x.k, type: 'button', className: hov === x.k ? 'on' : undefined, title: `${CAT_EN[x.k]} · ${fmtInt(x.v)} · ${t('ov.openCat')}`,
                onMouseEnter: () => setHov(x.k), onMouseLeave: () => setHov(null), onClick: () => onShowCat(x.k),
            }, h('i', { className: 'clx-dot', style: { background: CAT_COLOR[x.k] } }), h('span', { className: 'nm' }, t(`c.${x.k}`)), h('span', { className: 'pc' }, pct(x.v, total, 1)), h('span', { className: 'tk' }, fmtK(x.v)))))));
        }
        /** The heaviest tools of the session, as on the tools page. */
        function ToolsPeek({ data, t, onNav }) {
            const stats = [...(data.toolStats || [])].sort((a, b) => (b.callTokens + b.resultTokens) - (a.callTokens + a.resultTokens));
            const errsBy = {};
            for (const x of data.invocations || [])
                if (x.isError)
                    errsBy[x.name] = (errsBy[x.name] || 0) + 1;
            const max = Math.max(1, ...stats.map((x) => x.callTokens + x.resultTokens));
            const cmds = data.commands || [];
            const calls = stats.reduce((a, x) => a + x.calls, 0);
            return h('div', { className: 'clx-card clx-peek' }, h(CardHead, { t, icon: 'tools', title: t('nav.tools'), meta: fmt(t('ov.peek.tools'), { n: stats.length, c: calls }), more: () => onNav('tools') }), stats.length ? stats.slice(0, 5).map((x) => h(ToolLine, {
                key: x.name, name: x.name, color: CAT_COLOR.toolResults, sel: false, onClick: () => onNav('tools'),
                title: `${t('pair.call')} ${fmtInt(x.callTokens)} + ${t('pair.result')} ${fmtInt(x.resultTokens)}`,
                bar: h(React.Fragment, null, h('span', { style: { width: `${x.callTokens / max * 100}%`, background: CAT_COLOR.toolCalls } }), h('span', { style: { width: `${x.resultTokens / max * 100}%`, background: CAT_COLOR.toolResults } })),
                count: `×${x.calls}`, errs: errsBy[x.name], tok: fmtK(x.callTokens + x.resultTokens),
            })) : h('div', { className: 'clx-tempty clx-muted' }, t('tools.noUse')), cmds.length ? h('div', { className: 'clx-peek-foot' }, h(CardTitle, { icon: 'cmd', text: t('cmd.title') }), h('span', null, fmt(t('ov.peek.cmds'), { n: cmds.length, d: fmtMs(cmds.reduce((a, c) => a + (c.durationMs || 0), 0)), f: cmds.filter((c) => c.status === 'failed').length }))) : null);
        }
        /** The biggest messages in the context: where the tokens actually sit. */
        function MessagesPeek({ data, t, onJump, onNav }) {
            const nodes = data.nodes || [];
            const top = [...nodes].sort((a, b) => b.tokensCal - a.tokensCal).slice(0, 6);
            const sum = nodes.reduce((a, n) => a + n.tokensCal, 0);
            return h('div', { className: 'clx-card clx-peek' }, h(CardHead, { t, icon: 'messages', title: t('ov.peek.bigMsgs'), meta: fmt(t('msg.count'), { n: nodes.length, t: fmtK(sum) }), more: () => onNav('messages') }), top.map((n) => h('div', { key: n.seq, className: 'clx-mrow clx-peekrow', role: 'button', tabIndex: 0, onClick: () => onJump(n.seq), title: `#${n.seq}` }, h('span', { className: 'clx-mrow-kind', style: { '--cat': CAT_COLOR[n.category] || CAT_COLOR.other } }, t(`k.${n.category}`)), h('span', { className: 'clx-mrow-text' }, n.tool ? h('b', { className: 'clx-mrow-tool' }, `${n.tool} `) : null, n.preview || '—'), h('span', { className: 'clx-peek-pct' }, pct(n.tokensCal, sum, 0)), h('span', { className: 'clx-mrow-tok' }, fmtK(n.tokensCal)))));
        }
        /** Memory files, skills and runtime facts in three lines. */
        function SourcesPeek({ sessionId, liveKey, bd, t, onNav }) {
            const { data: src } = useSources(sessionId, liveKey);
            const rows = useMemo(() => (src ? skillRows(src) : []), [src]);
            if (!src)
                return h('div', { className: 'clx-card clx-peek' }, h(CardHead, { t, icon: 'sources', title: t('nav.sources'), more: () => onNav('sources') }), h('div', { className: 'clx-muted' }, t('loading')));
            const active = (src.memory?.files || []).filter((f) => f.status === 'active');
            const memTok = active.reduce((a, f) => a + (f.tokens || 0), 0);
            const loaded = rows.filter((r) => r.loads.length);
            const inCat = rows.filter((r) => r.cat).length;
            const catTok = (bd?.skills || []).reduce((a, x) => a + (x.tokensCal || 0), 0);
            const rt = (src.runtime?.sections || []).length + (src.timeContext ? 1 : 0);
            const line = (color, name, badge, tok) => h(SrcLine, { key: name, color, name, badge, tok, sel: false, onClick: () => onNav('sources') });
            return h('div', { className: 'clx-card clx-peek' }, h(CardHead, { t, icon: 'sources', title: t('nav.sources'), meta: fmtK(memTok + catTok), more: () => onNav('sources') }), line(CAT_COLOR.memory, t('nav.memory'), active.length ? active.map((f) => f.displayPath).slice(0, 2).join(', ') + (active.length > 2 ? ` +${active.length - 2}` : '') : t('src.memoryZero'), active.length ? fmtK(memTok) : '—'), line(CAT_COLOR.skills, t('src.skills'), rows.length ? fmt(t('ov.peek.skills'), { l: loaded.length, c: inCat, n: rows.length }) : t('src.skillsZero'), catTok ? fmtK(catTok) : '—'), line(CAT_COLOR.injected, t('src.runtime'), fmt(t('src.itemsN'), { n: rt }), ''));
        }
        /** What happened inside one step: what the model said, what it called, what came back. */
        function stepStory(bd, st) {
            const inRange = (q) => q !== undefined && q >= st.startSeq && (st.endSeq === undefined || q <= st.endSeq);
            const said = [];
            for (const n of bd.nodes || []) {
                if (!inRange(n.seq) || !n.split)
                    continue;
                if ((n.split.assistantText || 0) > 0 || (n.split.reasoning || 0) > 0) {
                    const kind = (n.split.assistantText || 0) >= (n.split.reasoning || 0) ? "answer" : "thinking";
                    if (n.preview && !(n.tools || []).length || (n.preview && n.preview !== (n.tools || []).join(", ")))
                        said.push({ seq: n.seq, kind, text: n.preview, tok: n.tokensCal });
                }
            }
            const calls = (bd.invocations || []).filter((x) => inRange(x.callSeq) || (x.callSeq === undefined && inRange(x.resultSeq)));
            return { said, calls };
        }
        function StepStory({ bd, st, t, onJump }) {
            if (!st)
                return null;
            const { said, calls } = stepStory(bd, st);
            if (!said.length && !calls.length)
                return h("div", { className: "clx-muted clx-tempty" }, t("sd.storyNone"));
            return h("div", { className: "clx-story" }, said.map((x) => h("div", { key: "s" + x.seq, className: "clx-story-row said", role: "button", onClick: () => onJump(x.seq) }, h("span", { className: "k" }, t(x.kind === "answer" ? "sd.said" : "sd.thought")), h("span", { className: "tx" }, x.text))), calls.map((x, i) => h("div", { key: "c" + i, className: `clx-story-row call${x.isError ? " err" : ""}`, role: "button", onClick: () => onJump(x.resultSeq ?? x.callSeq) }, h("span", { className: "k" }, t("sd.called")), h("span", { className: "tx" }, h("b", null, x.name), " ", h("code", null, x.args || ""), x.resultSeq !== undefined
                ? h("span", { className: "res" }, x.isError ? "⚠ " : "→ ", h("span", { className: "tk" }, fmtK(x.resultTokens || 0)), " ", x.resultPreview || "")
                : h("span", { className: "res clx-muted" }, "…")))));
        }
        /** The prompt the model read, in the order it read it; picking a step shows that request. */
        function PromptView({ data, t, diff, series, onSel, sessionId, ctx, cwd, onJump, onAsk }) {
            const [open, setOpen] = useState(null);
            const [hide, setHide] = useState({});
            const [toolsOpen, setToolsOpen] = useState(false);
            const all = data.nodes || [];
            const cut = diff && !diff.last ? diff.cut : Infinity;
            const sent = all.filter((n) => n.seq < cut);
            const later = all.length - sent.length;
            const laterTok = all.filter((n) => n.seq >= cut).reduce((a, n) => a + n.tokensCal, 0);
            const sys = sent.filter((n) => n.category === "system");
            const rest = sent.filter((n) => n.category !== "system");
            const tools = data.tools || [];
            const toolTok = tools.reduce((a, x) => a + (x.tokensCal || 0), 0);
            const total = sent.reduce((a, n) => a + n.tokensCal, 0) + toolTok || 1;
            const present = {};
            for (const n of sent)
                present[n.category] = (present[n.category] || 0) + 1;
            const shown = (n) => !hide[n.category];
            const cutOf = (x) => x.st.requestSeq ?? x.st.endSeq ?? x.st.startSeq;
            const dividers = new Map();
            for (const x of series) {
                const c = cutOf(x);
                const first = rest.find((n) => n.seq >= c);
                const key = first ? first.seq : "end";
                if (!dividers.has(key))
                    dividers.set(key, []);
                dividers.get(key).push(x);
            }
            const goto = (id) => document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
            const segs = [
                ...sys.map((n) => ({ id: `pv-${n.seq}`, w: n.tokensCal, c: CAT_COLOR.system, title: `${t("c.system")} · ${fmtInt(n.tokensCal)}` })),
                { id: "pv-tools", w: toolTok, c: CAT_COLOR.systemTools, title: `${t("c.systemTools")} · ${fmtInt(toolTok)}` },
                ...rest.map((n) => ({ id: `pv-${n.seq}`, w: n.tokensCal, c: CAT_COLOR[n.category] || CAT_COLOR.other, title: `#${n.seq} ${t(`c.${n.category}`)} · ${fmtInt(n.tokensCal)}` })),
            ].filter((x) => x.w > 0);
            const itemEl = (n) => {
                const isOpen = open === n.seq;
                const color = CAT_COLOR[n.category] || CAT_COLOR.other;
                const fresh = diff && n.seq >= diff.prevCut && n.seq < diff.cut;
                return h("div", { key: n.seq, id: `pv-${n.seq}`, className: `clx-pv-item${isOpen ? " open" : ""}${fresh ? " fresh" : ""}`, style: { "--cat": color } }, h("div", { className: "clx-pv-head", role: "button", tabIndex: 0, onClick: () => setOpen(isOpen ? null : n.seq),
                    onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpen(isOpen ? null : n.seq);
                    } } }, h(Chevron, { open: isOpen, size: 10 }), h("span", { className: "clx-mrow-kind", style: { "--cat": color } }, t(`k.${n.category}`)), n.tool ? h("b", { className: "clx-mrow-tool" }, n.tool) : null, (n.tools || []).length ? h("b", { className: "clx-mrow-tool" }, groupNames(n.tools)) : null, fresh ? h("span", { className: "clx-pill" }, t("sd.fresh")) : null, h("span", { className: "sq" }, `#${n.seq}`), h("button", { className: "clx-pv-ask", title: t("az.askThis"), onClick: (e) => { e.stopPropagation(); onAsk(n.seq); } }, "✦"), h("span", { className: "tk" }, fmtK(n.tokensCal), h("small", null, ` ${pct(n.tokensCal, total, 1)}`))), isOpen ? h("div", { className: "clx-pv-body" }, h(NodeDetail, { sessionId, seq: n.seq, t, ctx, cwd }))
                    : h("div", { className: "clx-pv-text", onClick: () => setOpen(n.seq) }, n.preview || "—"));
            };
            const rows = [];
            for (const n of sys)
                if (shown(n))
                    rows.push(itemEl(n));
            rows.push(h("div", { key: "tools", id: "pv-tools", className: `clx-pv-item tools${toolsOpen ? " open" : ""}`, style: { "--cat": CAT_COLOR.systemTools } }, h("div", { className: "clx-pv-head", role: "button", tabIndex: 0, onClick: () => setToolsOpen(!toolsOpen) }, h(Chevron, { open: toolsOpen, size: 10 }), h("span", { className: "clx-mrow-kind", style: { "--cat": CAT_COLOR.systemTools } }, t("c.systemTools")), h("span", { className: "clx-muted" }, fmt(t("sd.toolDefs"), { n: tools.length })), h("span", { className: "tk" }, fmtK(toolTok), h("small", null, ` ${pct(toolTok, total, 1)}`))), h("div", { className: "clx-pv-text" }, tools.slice().sort((a, b) => b.tokensCal - a.tokensCal).slice(0, toolsOpen ? 999 : 12).map((x) => h("code", { key: x.name, className: "clx-pv-tool" }, x.name, h("small", null, ` ${fmtK(x.tokensCal)}`))), !toolsOpen && tools.length > 12 ? h("span", { className: "clx-muted" }, ` +${tools.length - 12}`) : null)));
            for (const n of rest) {
                const ds = dividers.get(n.seq);
                if (ds)
                    for (const x of ds)
                        rows.push(h("div", { key: `d${x.st.startSeq}`, className: `clx-pv-div${diff && x.i === diff.idx ? " on" : ""}`, role: "button", onClick: () => onSel(x.i) }, h("span", null, fmt(t("flow.where"), { t: x.st.turn, s: x.st.step })), h("span", { className: "clx-muted" }, `${t("sd.request")} · ${fmtK(x.comp.total)}`)));
                if (shown(n))
                    rows.push(itemEl(n));
            }
            const endDs = dividers.get("end");
            if (endDs)
                for (const x of endDs)
                    rows.push(h("div", { key: `d${x.st.startSeq}`, className: `clx-pv-div${diff && x.i === diff.idx ? " on" : ""}`, role: "button", onClick: () => onSel(x.i) }, h("span", null, fmt(t("flow.where"), { t: x.st.turn, s: x.st.step })), h("span", { className: "clx-muted" }, `${t("sd.request")} · ${fmtK(x.comp.total)}`)));
            return h("div", { className: "clx-pv" }, h("div", { className: "clx-card" }, h(CardHead, { t, icon: "messages", title: t("sd.promptTitle"), meta: `${fmtK(total)} · ${fmt(t("sd.itemsN"), { n: sent.length })}` }), h("div", { className: "clx-muted", style: { fontSize: 11.5, marginBottom: 6 } }, diff && !diff.last ? fmt(t("sd.promptAt"), { t: diff.cur.st.turn, s: diff.cur.st.step }) : t("sd.promptNow")), h("div", { className: "clx-pv-map" }, segs.map((x, i) => h("button", { key: i, type: "button", title: x.title, style: { flexGrow: x.w, background: x.c }, onClick: () => goto(x.id) }))), h("div", { className: "clx-pv-chips" }, CATS.filter((k) => present[k]).map((k) => h("button", {
                key: k, type: "button", className: `clx-chipbtn${hide[k] ? "" : " on"}`, "aria-pressed": !hide[k], onClick: () => setHide({ ...hide, [k]: !hide[k] }),
            }, h("i", { className: "clx-dot", style: { background: CAT_COLOR[k] } }), ` ${t(`c.${k}`)} ${present[k]}`)))), diff ? h("div", { className: "clx-card" }, h(CardHead, { t, icon: "flow", title: t("sd.story"), meta: fmt(t("flow.where"), { t: diff.cur.st.turn, s: diff.cur.st.step }) }), h(StepStory, { bd: data, st: diff.cur.st, t, onJump })) : null, h("div", { className: "clx-pv-list" }, rows), later > 0 ? h("div", { className: "clx-muted clx-pv-later" }, fmt(t("sd.later"), { n: later, k: fmtK(laterTok) })) : null);
        }
        /** Ask the session's model about this context. Off until enabled; each send is one explicit call. */
        const AZ_ASKS = ['az.q1', 'az.q2', 'az.q3', 'az.q4'];
        function AnalyzeView({ data, t, sessionId, onJump, seqs, setSeqs }) {
            const key = `dsh-context-lens:az:${sessionId}`;
            const [enabled, setEnabledState] = useState(() => { try {
                return sessionStorage.getItem(key) === "1";
            }
            catch {
                return false;
            } });
            const setEnabled = (v) => { setEnabledState(v); try {
                sessionStorage.setItem(key, v ? "1" : "0");
            }
            catch { } };
            const [msgs, setMsgs] = useState([]);
            const [input, setInput] = useState("");
            const [inc, setInc] = useState({ system: false, tools: false });
            const [prev, setPrev] = useState(null);
            const [busy, setBusy] = useState(false);
            const job = useRef(null);
            const endRef = useRef(null);
            const lang = /[一-鿿]/.test(t("nav.prompt")) ? "zh" : "en";
            const include = { ...inc, seqs };
            // the estimate costs nothing: it only measures what a send would carry
            useEffect(() => {
                let dead = false;
                const id = setTimeout(() => {
                    call("analyze-preview", { sessionId, include, question: input, history: msgs.filter((m) => !m.busy).map((m) => ({ role: m.role, text: m.text })) })
                        .then((v) => { if (!dead)
                        setPrev(v); }, () => { if (!dead)
                        setPrev(null); });
                }, 350);
                return () => { dead = true; clearTimeout(id); };
            }, [sessionId, inc.system, inc.tools, seqs.join(","), msgs.length, input.length > 0]);
            useEffect(() => () => { if (job.current)
                call("analyze-stop", { jobId: job.current }).catch(() => { }); }, []);
            useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [msgs]);
            const patch = (id, v) => setMsgs((xs) => xs.map((m) => (m.id === id ? { ...m, ...v } : m)));
            const send = async (q) => {
                const question = (q ?? input).trim();
                if (!question || busy)
                    return;
                const history = msgs.filter((m) => !m.busy && !m.error).map((m) => ({ role: m.role, text: m.text }));
                const uid = `u${Date.now()}`;
                const aid = `a${Date.now()}`;
                setMsgs((xs) => [...xs, { id: uid, role: "user", text: question }, { id: aid, role: "assistant", text: "", busy: true }]);
                setInput("");
                setBusy(true);
                try {
                    const { jobId, inputTokens } = await call("analyze-start", { sessionId, question, history, include, lang });
                    job.current = jobId;
                    patch(aid, { inputTokens });
                    for (;;) {
                        await new Promise((r) => setTimeout(r, 450));
                        if (job.current !== jobId)
                            break;
                        const v = await call("analyze-poll", { jobId });
                        patch(aid, { text: v.text, reasoning: v.reasoning, usage: v.usage, error: v.error, busy: !v.done });
                        if (v.done)
                            break;
                    }
                }
                catch (e) {
                    patch(aid, { error: String(e?.message || e), busy: false });
                }
                finally {
                    job.current = null;
                    setBusy(false);
                }
            };
            const stop = () => { if (job.current)
                call("analyze-stop", { jobId: job.current }).catch(() => { }); };
            if (!enabled) {
                return h("div", { className: "clx-card clx-az-intro" }, h(CardHead, { t, icon: "gauge", title: t("az.title"), meta: prev?.model ? `${prev.model}` : null }), h("ul", null, h("li", null, t("az.i1")), h("li", null, t("az.i2")), h("li", null, t("az.i3")), prev?.tokens ? h("li", null, fmt(t("az.i4"), { k: fmtK(prev.tokens), m: prev.model || "" })) : null), prev && !prev.ready ? h("div", { className: "clx-err", style: { fontSize: 12 } }, t("az.noLlm")) : null, h("button", { className: "clx-chipbtn clx-az-go", disabled: !!prev && !prev.ready, onClick: () => setEnabled(true) }, t("az.enable")));
            }
            const tokens = prev?.tokens || 0;
            const refs = (text) => [...new Set([...String(text || "").matchAll(/#(\d{1,6})/g)].map((m) => Number(m[1])))].filter((n) => (data.nodes || []).some((x) => x.seq === n)).slice(0, 8);
            return h("div", { className: "clx-az" }, h("div", { className: "clx-card clx-az-bar" }, h("span", { className: "clx-pill" }, t("az.on")), prev?.model ? h("span", { className: "clx-muted" }, prev.model) : null, h("span", { className: "clx-muted" }, t("az.attach")), h("button", { className: `clx-chipbtn${inc.system ? " on" : ""}`, "aria-pressed": inc.system, onClick: () => setInc({ ...inc, system: !inc.system }) }, t("az.sys")), h("button", { className: `clx-chipbtn${inc.tools ? " on" : ""}`, "aria-pressed": inc.tools, onClick: () => setInc({ ...inc, tools: !inc.tools }) }, t("az.toolDesc")), seqs.map((q) => h("button", { key: q, className: "clx-chipbtn on", title: t("az.detach"), onClick: () => setSeqs(seqs.filter((x) => x !== q)) }, `#${q} ×`)), h("span", { className: "clx-az-tok clx-muted" }, tokens ? fmt(t("az.cost"), { k: fmtK(tokens) }) : ""), msgs.length ? h("button", { className: "clx-chipbtn", disabled: busy, onClick: () => setMsgs([]) }, t("az.clear")) : null, h("button", { className: "clx-chipbtn", disabled: busy, onClick: () => { setEnabled(false); setMsgs([]); } }, t("az.off"))), msgs.length === 0 ? h("div", { className: "clx-card" }, h("div", { className: "clx-muted", style: { fontSize: 12, marginBottom: 8 } }, t("az.hint")), h("div", { className: "clx-az-asks" }, AZ_ASKS.map((k) => h("button", { key: k, className: "clx-chipbtn", disabled: busy, onClick: () => send(t(k)) }, t(k))))) : null, msgs.map((m) => m.role === "user"
                ? h("div", { key: m.id, className: "clx-az-user" }, m.text)
                : h("div", { key: m.id, className: "clx-card clx-az-ans" }, m.reasoning ? h("details", { className: "clx-az-think", open: m.busy && !m.text }, h("summary", null, t("az.thinking")), h("div", null, m.reasoning)) : null, m.text ? h(RichText, { text: m.text, hint: "md", t, bare: true }) : m.busy ? h("div", { className: "clx-muted" }, t("az.working")) : null, m.error ? h("div", { className: "clx-err" }, fmt(t("failed"), { msg: m.error })) : null, !m.busy && refs(m.text).length ? h("div", { className: "clx-az-refs" }, h("span", { className: "clx-muted" }, t("az.refs")), refs(m.text).map((n) => h("button", { key: n, className: "clx-chipbtn", onClick: () => onJump(n) }, `#${n}`))) : null, m.usage ? h("div", { className: "clx-muted clx-az-use" }, fmt(t("az.usage"), { i: fmtK((m.usage.inputTokens || 0) + (m.usage.cacheReadTokens || 0)), o: fmtK(m.usage.outputTokens || 0) })) : null)), h("div", { ref: endRef }), h("div", { className: "clx-card clx-az-input" }, h("textarea", {
                value: input, rows: 2, placeholder: t("az.placeholder"), onChange: (e) => setInput(e.target.value),
                onKeyDown: (e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                } },
            }), busy ? h("button", { className: "clx-chipbtn", onClick: stop }, t("az.stop"))
                : h("button", { className: "clx-chipbtn on", disabled: !input.trim(), onClick: () => send() }, t("az.send"))));
        }
        /** Plain-language findings: what is making the context heavy, and what to do about it. */
        function diagnose(data, s, series, t) {
            const out = [];
            const used = s.used || 0;
            if (!used)
                return out;
            const comp = s.comp;
            const tok = (k) => s.byCat[k]?.tokens || 0;
            // runway to the compaction trigger, from the recent growth
            if (comp?.auto && comp.thresholdTokens && series.length >= 3) {
                const recent = series.slice(-6);
                const g = (recent[recent.length - 1].comp.total - recent[0].comp.total) / (recent.length - 1);
                const left = comp.thresholdTokens - used;
                if (g > 50 && left > 0) {
                    const n = Math.ceil(left / g);
                    if (n <= 50)
                        out.push({ id: "runway", level: n <= 5 ? "warn" : "info", text: fmt(t("dg.runway"), { g: fmtK(g), n, r: fmtK(left) }), nav: "overview" });
                }
                else if (left <= 0)
                    out.push({ id: "runway", level: "warn", text: t("dg.over"), nav: "overview" });
            }
            // what is there before any work happens
            const fixed = tok("system") + tok("systemTools") + tok("mcpTools") + tok("skills") + tok("memory");
            if (fixed / used >= 0.25) {
                out.push({ id: "fixed", level: fixed / used >= 0.4 ? "warn" : "info", text: fmt(t("dg.fixed"), { k: fmtK(fixed), p: pct(fixed, used, 0), tk: fmtK(tok("systemTools") + tok("mcpTools")), sk: fmtK(tok("skills") + tok("memory")) }), nav: "tools" });
            }
            // tool results dominate
            const res = tok("toolResults");
            if (res / used >= 0.45) {
                const top = [...(data.toolStats || [])].sort((a, b) => b.resultTokens - a.resultTokens)[0];
                out.push({ id: "results", level: "warn", text: fmt(t("dg.results"), { p: pct(res, used, 0), name: top?.name || "—", k: fmtK(top?.resultTokens || 0) }), nav: "tools" });
            }
            // one message that is a big share
            const big = [...(data.nodes || [])].sort((a, b) => b.tokensCal - a.tokensCal)[0];
            if (big && big.tokensCal >= 2000 && big.tokensCal / used >= 0.1) {
                out.push({ id: "big", level: big.tokensCal / used >= 0.2 ? "warn" : "info", text: fmt(t("dg.big"), { seq: big.seq, p: pct(big.tokensCal, used, 0), k: fmtK(big.tokensCal), what: (big.tool ? big.tool + " " : "") + (big.preview || "").slice(0, 60) }), seq: big.seq });
            }
            // the same call made again and again
            const seen = new Map();
            for (const x of data.invocations || []) {
                const key = x.name + " " + (x.args || "");
                seen.set(key, (seen.get(key) || 0) + 1);
            }
            const rep = [...seen.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1])[0];
            if (rep)
                out.push({ id: "repeat", level: "warn", text: fmt(t("dg.repeat"), { n: rep[1], what: rep[0].slice(0, 70) }), nav: "tools" });
            // tool definitions nobody called
            const called = new Set((data.toolStats || []).map((x) => x.name));
            const idle = (data.tools || []).filter((x) => !called.has(x.name));
            const idleTok = idle.reduce((a, x) => a + (x.tokensCal || 0), 0);
            if (idle.length >= 3 && idleTok >= 1500)
                out.push({ id: "idle", level: "info", text: fmt(t("dg.idle"), { n: idle.length, k: fmtK(idleTok) }), nav: "tools" });
            // failing calls
            const errs = (data.invocations || []).filter((x) => x.isError);
            if (errs.length)
                out.push({ id: "errors", level: "warn", text: fmt(t("dg.errors"), { n: errs.length, names: [...new Set(errs.map((x) => x.name))].slice(0, 3).join(", ") }), nav: "tools" });
            // cache
            const u = data.measured?.lastRequest;
            if (u) {
                const inTot = (u.inputTokens || 0) + (u.cacheReadTokens || 0) + (u.cacheWriteTokens || 0);
                if (inTot >= 4000 && (u.cacheReadTokens || 0) / inTot < 0.5)
                    out.push({ id: "cache", level: "info", text: fmt(t("dg.cache"), { p: pct(u.cacheReadTokens || 0, inTot, 0) }), nav: "overview" });
            }
            return out;
        }
        function DiagnosisCard({ data, s, series, t, onJump, onNav }) {
            const items = useMemo(() => diagnose(data, s, series, t), [data, s, series, t]);
            return h("div", { className: "clx-card clx-diag span2" }, h(CardHead, { t, icon: "gauge", title: t("dg.title"), meta: items.length ? fmt(t("dg.count"), { n: items.length }) : null }), items.length
                ? items.map((x) => h("div", { key: x.id, className: `clx-diag-row ${x.level}`, role: x.seq !== undefined || x.nav !== "overview" ? "button" : undefined,
                    onClick: () => (x.seq !== undefined ? onJump(x.seq) : x.nav !== "overview" ? onNav(x.nav) : undefined) }, h("i", { className: "clx-dot" }), h("span", { className: "tx" }, x.text), x.seq !== undefined || x.nav !== "overview" ? h("span", { className: "go" }, `${t("dg.view")} ›`) : null))
                : h("div", { className: "clx-muted clx-tempty" }, t("dg.ok")));
        }
        function Overview({ data, flow, t, onJump, onShowCat, onNav, sessionId, liveKey, series, diff, onSel }) {
            const [pick, setPick] = useState(null);
            const [hov, setHov] = useState(null);
            const s = summarize(data);
            const m = data.measured || {};
            const usage = m.lastRequest;
            const cats = CATS.map((k) => ({ key: k, label: t(`c.${k}`), color: CAT_COLOR[k], ...(s.byCat[k] || { tokens: 0, raw: 0, count: 0 }) }));
            const comp = s.comp;
            const inputTotal = usage ? (usage.inputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.cacheWriteTokens || 0) : 0;
            const warn = comp && comp.thresholdTokens ? (s.used >= comp.thresholdTokens ? 2 : s.used >= comp.thresholdTokens * 0.85 ? 1 : 0) : 0;
            const usedAnim = useCountUp(s.used);
            const turnCount = (flow?.turns || []).length || new Set((data.nodes || []).map((n) => n.turn).filter((x) => x !== undefined)).size;
            const stepCount = flow ? (flow.steps || []).length + (flow.stepsTruncated || 0) : null;
            const calls = (data.invocations || []).length;
            const errs = (data.invocations || []).filter((x) => x.isError).length;
            const g = flow?.goal;
            const sView = diff && !diff.last
                ? { ...s, used: diff.cur.comp.total, byCat: Object.fromEntries(CATS.map((k) => [k, { tokens: diff.cur.comp.by[k] || 0, count: 0 }])) }
                : s;
            return h('div', { className: 'clx-dash' }, h('div', { className: 'clx-card clx-hero-card span2' }, h(CardHead, { t, icon: 'stats', title: t('ov.statsTitle'), meta: [data.model, data.reasoningEffort].filter(Boolean).join(' · ') }), h(LiveLine, { flow, t }), h('div', { className: 'clx-hero' }, h(Ring, { ratio: s.win ? usedAnim / s.win : 0, size: 58, stroke: 7, warn }), h('div', { className: 'clx-hero-main' }, h('div', null, h('span', { className: 'clx-hero-pct' }, fmtK(usedAnim)), h('span', { className: 'clx-sub' }, ` / ${fmtK(s.win)} · ${pct(usedAnim, s.win)}`)), h('div', { className: 'clx-muted', style: { fontSize: 11.5 } }, t(`pop.src.${m.usedSource || 'estimate'}`))), h('div', { className: 'clx-stats' }, h(Stat, { k: t('ov.stat.turns'), v: fmtInt(turnCount) }), h(Stat, { k: t('ov.stat.steps'), v: stepCount === null ? '—' : fmtInt(stepCount) }), h(Stat, { k: t('ov.stat.calls'), v: fmtInt(calls), sub: errs ? ` ⚠${errs}` : undefined, tone: errs ? 'warn' : '' }), usage ? h(Stat, { k: t('ov.stat.hit'), v: pct(usage.cacheReadTokens || 0, inputTotal, 0) }) : null, comp && comp.auto && comp.thresholdTokens
                ? h(Stat, { k: t('ov.stat.left'), v: comp.remainingTokens > 0 ? fmtK(comp.remainingTokens) : t('pop.over'), tone: warn ? 'warn' : '' })
                : null)), h(HeroBar, { cats, s, t, active: hov || pick, pick, onHover: setHov, onPick: (k) => setPick(pick === k ? null : k) }), g ? h('div', { className: 'clx-goalline' }, h('b', null, t('flow.goal')), h('span', { className: 'clx-pill' }, `${t(`flow.phase.${g.phase}`) || g.phase} · ${g.roundsStarted ?? 0}/${g.maxGoalRounds ?? '∞'}`), h('span', { className: 'txt' }, g.objective)) : null), h(DiagnosisCard, { data, s, series, t, onJump, onNav }), h(CompositionCard, { data, s: sView, t, onShowCat, stepLabel: diff && !diff.last ? fmt(t('flow.where'), { t: diff.cur.st.turn, s: diff.cur.st.step }) : null }), h(StepTrend, { data, flow, t, onJump, series, pickIdx: diff ? diff.idx : 0, onSel }), h(ToolsPeek, { data, t, onNav }), h(MessagesPeek, { data, t, onJump, onNav }), h(SourcesPeek, { sessionId, liveKey, bd: data, t, onNav }), comp ? h(CompactionCard, { data, comp, s, t }) : null, h('div', { className: 'span2' }, h(MeasureCard, { data, s, t })), h('section', { className: 'clx-card span2 clx-flowsec' }, h(CardHead, { t, icon: 'flow', title: t('nav.flow'), meta: flow?.live ? t(`flow.live.${flow.live.phase || 'idle'}`) : null }), h(FlowTab, { sessionId, liveKey, bd: data, t, onJump })));
        }
        function kv(k, v, title = undefined) {
            return h('div', { key: k, title: title || (typeof v === 'string' ? v : undefined) }, h('div', { className: 'k' }, k), h('div', { className: 'v' }, v ?? '—'));
        }
        /** "read×2, bash" from a list of tool names. */
        function groupNames(names) {
            const m = new Map();
            for (const x of names)
                m.set(x, (m.get(x) || 0) + 1);
            return [...m].map(([k, v]) => (v > 1 ? `${k}×${v}` : k)).join(', ');
        }
        /** The one expand affordance used everywhere: a chevron that turns down when open. */
        function Chevron({ open, size = 12 }) {
            return h('span', { className: `clx-chev${open ? ' open' : ''}`, 'aria-hidden': true }, h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: 'M9 6l6 6-6 6' })));
        }
        // ================================================================== rich content
        // dsh's own renderers (the ones 轨迹 uses), with a plain fallback.
        let UI = null;
        try {
            UI = require('@deepseek-ai/dsh-client-ui-primitives');
        }
        catch {
            UI = null;
        }
        function parseJson(text) {
            const s = String(text || '').trim();
            if (!/^[[{]/.test(s) || s.length > 400000)
                return undefined;
            try {
                const v = JSON.parse(s);
                return v && typeof v === 'object' ? v : undefined;
            }
            catch {
                return undefined;
            }
        }
        function mdLabels(t) {
            return { code: { copyLabel: t('ui.copy'), copiedLabel: t('ui.copied') }, footnotes: t('ui.footnotes') };
        }
        function jsonLabels(t) {
            return {
                copyValue: t('ui.copyValue'),
                copyJson: t('ui.copyJson'),
                copyPath: t('ui.copyPath'),
                copyPrettyJson: t('ui.copyPretty'),
                copyCompactJson: t('ui.copyCompact'),
                copied: t('ui.copied'),
                copyFailed: t('ui.copyFailed'),
                collapseNode: t('ui.collapse'),
                expandNode: t('ui.expand'),
                copyButtonTitle: (action) => fmt(t('ui.copyHint'), { action }),
            };
        }
        /** Pick how a text looks best: a JSON tree, Markdown, or plain monospace output. */
        function guessMode(text, hint) {
            if (parseJson(text) !== undefined)
                return 'json';
            if (hint === 'code') {
                const s = String(text || '');
                const md = /<skill_content|^#{1,6} \S|^```|^\s*[-*] \S[\s\S]*\n\s*[-*] \S|\*\*[^*\n]+\*\*/m.test(s);
                return md ? 'md' : 'code';
            }
            return 'md';
        }
        class RenderBoundary extends React.Component {
            constructor(props) {
                super(props);
                this.state = { failed: false };
            }
            static getDerivedStateFromError() {
                return { failed: true };
            }
            render() {
                return this.state.failed ? this.props.fallback : this.props.children;
            }
        }
        function PlainText({ text, mono }) {
            return h('pre', { className: `clx-plain${mono ? ' mono' : ''}` }, text);
        }
        /**
         * One block of model-visible text, rendered like the conversation renders it,
         * with a 渲染 / 原文 switch and a fold for long content.
         */
        function RichText({ text, hint, t, label, meta, metaTitle, defaultOpen, bare, lang: langHint, action }) {
            const auto = useMemo(() => guessMode(text, hint), [text, hint]);
            const [mode, setMode] = useState(auto);
            const [full, setFull] = useState(!!defaultOpen);
            useEffect(() => setMode(auto), [auto]);
            const long = String(text || '').length > 2400;
            const json = mode === 'json' ? parseJson(text) : undefined;
            const plain = h(PlainText, { text, mono: true });
            let body;
            if (mode === 'raw')
                body = plain;
            else if (mode === 'json' && json !== undefined && UI?.JsonTree) {
                body = h(RenderBoundary, { fallback: plain }, h(UI.JsonTree, { data: json, labels: jsonLabels(t), collapsedStringLines: 12 }));
            }
            else if (mode === 'json' && json !== undefined) {
                body = h(PlainText, { text: JSON.stringify(json, null, 2), mono: true });
            }
            else if (mode === 'md' && UI?.MarkdownText) {
                body = h(RenderBoundary, { fallback: plain }, h('div', { className: 'clx-md' }, h(UI.MarkdownText, { text: String(text || ''), labels: mdLabels(t) })));
            }
            else if (mode === 'code' && UI?.CodeBlock) {
                const lang = langHint || (/^\s*[[{]/.test(String(text || '')) ? 'json' : 'text');
                body = h(RenderBoundary, { fallback: plain }, h('div', { className: 'clx-code' }, h(UI.CodeBlock, { code: String(text || ''), lang, copyLabel: t('ui.copy'), copiedLabel: t('ui.copied') })));
            }
            else {
                body = plain;
            }
            // dsh keeps the head and tail of oversized tool output and spills the rest to a file
            const spill = /(\/\S*dsh-spill\S*?)\.?\s+Use read/.exec(String(text || ''))?.[1];
            const modes = [auto, 'raw'].filter((m, i, a) => a.indexOf(m) === i);
            return h('div', { className: `clx-rich${bare ? ' bare' : ''}` }, h('div', { className: 'clx-rich-head' }, label ? h('b', null, label) : null, meta ? h('span', { className: 'clx-muted', title: metaTitle }, meta) : null, h('span', { className: 'clx-rich-modes' }, modes.length > 1 ? modes.map((m) => h('button', {
                key: m, className: 'clx-seg', 'aria-pressed': mode === m, onClick: (e) => { e.stopPropagation(); setMode(m); },
            }, t(`ui.mode.${m}`))) : null), action || null), spill ? h('div', { className: 'clx-rich-note' }, fmt(t('ui.spilled'), { path: spill })) : null, h('div', { className: `clx-rich-body${long && !full ? ' folded' : ''}${mode === 'code' ? ' flush' : ''}` }, body), long ? h('button', { className: 'clx-rich-more', onClick: (e) => { e.stopPropagation(); setFull(!full); } }, full ? t('ui.collapseAll') : t('ui.expandAll')) : null);
        }
        function NodeDetail({ sessionId, seq, t, ctx, cwd }) {
            const [state, setState] = useState({ loading: true });
            useEffect(() => {
                let dead = false;
                call('node', { sessionId, seq }).then((v) => { if (!dead)
                    setState({ value: v }); }, (e) => { if (!dead)
                    setState({ error: String(e?.message || e) }); });
                return () => { dead = true; };
            }, [sessionId, seq]);
            if (state.loading)
                return h('div', { className: 'clx-detail clx-muted' }, t('loading'));
            if (state.error)
                return h('div', { className: 'clx-detail clx-err' }, fmt(t('failed'), { msg: state.error }));
            const v = state.value;
            const isTool = v.type === 'tool/result' || v.role === 'tool';
            // the row above already shows kind, tool and time; label parts only when there are several
            const many = v.parts.length > 1;
            const when = v.time ? new Date(v.time).toLocaleString() : '';
            const meta = (p) => `${fmtInt(p.chars)} ${t('ui.chars')} · ≈${fmtK(p.tokensEst)} tok${p.truncated ? ` · ${t('msg.truncated')}` : ''}`;
            // a tool result opens with the call that asked for it
            if (isTool) {
                const resultText = v.parts.map((p) => p.text || '').join('\n');
                const callFile = v.call ? toolFilePath(v.call.name, v.call.text, resultText, cwd) : null;
                // the call was compacted out, but a file/image read still carries <path>
                const orphan = !v.call ? absPath(/<path>\s*([^<]+?)\s*<\/path>/.exec(resultText)?.[1], cwd) : null;
                return h('div', { className: 'clx-detail', onClick: (e) => e.stopPropagation() }, h('div', { className: 'clx-pair' }, v.call
                    ? h(RichText, { t, bare: true, text: v.call.text, hint: 'code', label: `${t('pair.call')} · ${v.call.name || '?'} · #${v.call.seq}`, meta: meta(v.call), metaTitle: v.call.time ? new Date(v.call.time).toLocaleString() : '', action: h(FilePreview, { ctx, sessionId, cwd, t, file: callFile }) })
                    : h('div', { className: 'clx-pair-note' }, t('pair.noCall')), v.parts.map((p, i) => h(RichText, {
                    key: `${seq}-${i}`, t, bare: true, text: p.text || '', hint: 'code',
                    label: `${t('pair.result')} · #${seq}`, meta: meta(p), metaTitle: [when, v.toolCallId].filter(Boolean).join(' · '),
                    action: i === 0 && orphan ? h(FilePreview, { ctx, sessionId, cwd, t, file: orphan }) : null,
                }))));
            }
            return h('div', { className: 'clx-detail', onClick: (e) => e.stopPropagation() }, v.parts.map((p, i) => {
                const text = h(RichText, {
                    key: `${seq}-${i}`,
                    t,
                    bare: true,
                    text: p.text || '',
                    hint: p.type === 'tool-call' ? 'code' : 'md',
                    label: many || p.type === 'tool-call' ? (p.type === 'tool-call' ? `${t('pair.call')} · ${p.name || '?'}` : (t(`part.${p.type}`) || p.type)) : null,
                    meta: meta(p),
                    metaTitle: [when, p.callId].filter(Boolean).join(' · '),
                    action: p.type === 'tool-call' ? h(FilePreview, { ctx, sessionId, cwd, t, file: toolFilePath(p.name, p.text, null, cwd) }) : null,
                });
                // a call carries its result right under it
                if (p.type !== 'tool-call')
                    return text;
                return h('div', { key: `${seq}-${i}`, className: 'clx-pair' }, text, p.resultSeq !== undefined
                    ? h(PairedResult, { sessionId, seq: p.resultSeq, t })
                    : h('div', { className: 'clx-pair-note' }, t('pair.pending')));
            }));
        }
        /** The result half of a call, fetched when the call is shown. */
        function PairedResult({ sessionId, seq, t }) {
            const [st, setSt] = useState({ loading: true });
            useEffect(() => {
                let dead = false;
                call('node', { sessionId, seq }).then((v) => { if (!dead)
                    setSt({ v }); }, (e) => { if (!dead)
                    setSt({ error: String(e?.message || e) }); });
                return () => { dead = true; };
            }, [sessionId, seq]);
            if (st.loading)
                return h('div', { className: 'clx-pair-note' }, t('loading'));
            if (st.error)
                return h('div', { className: 'clx-pair-note clx-err' }, fmt(t('failed'), { msg: st.error }));
            const v = st.v;
            return h(React.Fragment, null, v.parts.map((p, i) => h(RichText, {
                key: i, t, bare: true, text: p.text || '', hint: 'code',
                label: `${t('pair.result')} · #${seq}`,
                meta: `${fmtInt(p.chars)} ${t('ui.chars')} · ≈${fmtK(p.tokensEst)} tok${p.truncated ? ` · ${t('msg.truncated')}` : ''}`,
                metaTitle: v.time ? new Date(v.time).toLocaleString() : '',
            })));
        }
        /** One tool call as a row: what was asked, what came back, what both cost. */
        function InvocationRow({ x, t, max, open, onClick }) {
            const callTok = x.callTokens || 0;
            const resTok = x.resultTokens || 0;
            return h('div', {
                className: `clx-node-row clx-inv-row${open ? ' open' : ''}`, onClick, role: 'button', tabIndex: 0, 'aria-expanded': !!open,
                onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick?.();
                } },
                title: `${t('pair.call')} ${fmtInt(callTok)} + ${t('pair.result')} ${fmtInt(resTok)} tok`,
            }, h(Chevron, { open }), h('span', { className: 'seq' }, x.callSeq !== undefined ? `#${x.callSeq}` : '—'), h('div', { className: 'main' }, h('div', { className: 'line1' }, h('span', { className: 'clx-tag' }, h('i', { className: 'clx-dot', style: { background: CAT_COLOR.toolCalls } }), x.name), x.resultSeq !== undefined ? h('span', null, `→ #${x.resultSeq}`) : null, x.isError ? h('span', { className: 'clx-err' }, t('pair.error')) : null, x.time ? h('span', { style: { marginLeft: 'auto' } }, fmtTime(x.time)) : null), h('div', { className: 'prev' }, x.args || h('span', { className: 'clx-muted' }, '—')), h('div', { className: `prev res${x.isError ? ' err' : ''}` }, h('i', { className: 'clx-dot', style: { background: CAT_COLOR.toolResults } }), x.resultSeq !== undefined ? (x.resultPreview || '—') : t('pair.pending')), h('div', { className: 'clx-minibar two' }, h('span', { style: { width: `${Math.max(callTok ? 1 : 0, callTok / max * 100)}%`, background: CAT_COLOR.toolCalls } }), h('span', { style: { width: `${Math.max(resTok ? 1 : 0, resTok / max * 100)}%`, background: CAT_COLOR.toolResults } }))), h('span', { className: 'tok' }, fmtK(callTok + resTok)));
        }
        /** Both halves of one call, opened in place: the arguments, then the result. */
        function InvocationDetail({ sessionId, x, t, ctx, cwd }) {
            const [st, setSt] = useState({ loading: true });
            useEffect(() => {
                let dead = false;
                if (x.callSeq === undefined) {
                    setSt({ v: null });
                    return undefined;
                }
                call('node', { sessionId, seq: x.callSeq }).then((v) => { if (!dead)
                    setSt({ v }); }, (e) => { if (!dead)
                    setSt({ error: String(e?.message || e) }); });
                return () => { dead = true; };
            }, [sessionId, x.callSeq]);
            if (st.loading)
                return h('div', { className: 'clx-detail clx-muted' }, t('loading'));
            if (st.error)
                return h('div', { className: 'clx-detail clx-err' }, fmt(t('failed'), { msg: st.error }));
            const part = st.v?.parts.find((p) => p.type === 'tool-call' && p.callId !== undefined && p.callId === x.id)
                ?? st.v?.parts.find((p) => p.type === 'tool-call' && p.name === x.name);
            return h('div', { className: 'clx-detail', onClick: (e) => e.stopPropagation() }, h('div', { className: 'clx-pair' }, part
                ? h(RichText, { t, bare: true, text: part.text || '', hint: 'code', label: `${t('pair.call')} · ${x.name} · #${x.callSeq}`, meta: `${fmtInt(part.chars)} ${t('ui.chars')} · ≈${fmtK(part.tokensEst)} tok`, metaTitle: x.id, action: h(FilePreview, { ctx, sessionId, cwd, t, file: toolFilePath(x.name, part.text, null, cwd) }) })
                : h('div', { className: 'clx-pair-note' }, t('pair.noCall')), x.resultSeq !== undefined ? h(PairedResult, { sessionId, seq: x.resultSeq, t }) : h('div', { className: 'clx-pair-note' }, t('pair.pending'))));
        }
        /** Every call of one tool, oldest first, each with its result. */
        function ToolInvocations({ data, name, sessionId, t, ctx, cwd }) {
            const [openKey, setOpenKey] = useState(null);
            const [limit, setLimit] = useState(20);
            const list = useMemo(() => (data.invocations || []).filter((x) => x.name === name), [data.invocations, name]);
            const max = Math.max(1, ...list.map((x) => (x.callTokens || 0) + (x.resultTokens || 0)));
            const from = Math.max(0, list.length - limit);
            return h('div', { className: 'clx-expand' }, h('div', { className: 'clx-muted', style: { fontSize: 12, marginBottom: 4 } }, fmt(t('tools.invocations'), { n: list.length })), from > 0 ? h('button', { className: 'clx-chipbtn', style: { marginBottom: 6 }, onClick: () => setLimit(limit + 30) }, fmt(t('tools.earlier'), { n: Math.min(30, from) })) : null, list.slice(from).map((x) => {
                const key = x.id ?? `${x.callSeq}-${x.resultSeq}`;
                const open = openKey === key;
                return h('div', { key, className: `clx-node${open ? ' open' : ''}`, style: { '--cat': CAT_COLOR.toolResults } }, h(InvocationRow, { x, t, max, open, onClick: () => setOpenKey(open ? null : key) }), open ? h(InvocationDetail, { sessionId, x, t, ctx, cwd }) : null);
            }));
        }
        /** A message on one line: what kind it is, what it says, what it costs. A call carries its results. */
        function MsgRow({ n, t, open, onClick, invs, merged }) {
            // a message that made calls reads as the call, whatever else it says
            const kind = invs && invs.length ? 'toolCalls' : n.category;
            const color = CAT_COLOR[kind] || CAT_COLOR.other;
            let text = n.preview || '';
            let extra = null;
            let tok = n.tokensCal;
            if (invs && invs.length) {
                const first = invs[0];
                text = h(React.Fragment, null, h('b', { className: 'clx-mrow-tool' }, first.name), ` ${first.args || ''}`, invs.length > 1 ? h('span', { className: 'clx-muted' }, `  +${groupNames(invs.slice(1).map((x) => x.name))}`) : null);
                if (merged) {
                    const res = invs.reduce((s, x) => s + (x.resultTokens || 0), 0);
                    const errs = invs.filter((x) => x.isError).length;
                    const pending = invs.some((x) => x.resultSeq === undefined);
                    tok += res;
                    extra = h('span', { className: `clx-mrow-res${errs ? ' err' : ''}`, title: `${t('pair.call')} ${fmtInt(n.tokensCal)} + ${t('pair.result')} ${fmtInt(res)}` }, h('i', { className: 'clx-dot', style: { background: CAT_COLOR.toolResults } }), errs ? `⚠ ${t('pair.error')}` : pending ? t('pair.pending') : fmtK(res));
                }
            }
            else if (n.category === 'toolResults' && n.tool) {
                text = h(React.Fragment, null, h('b', { className: 'clx-mrow-tool' }, n.tool), ` ${n.preview || ''}`);
            }
            return h('div', {
                className: `clx-mrow${open ? ' open' : ''}`, onClick, role: 'button', tabIndex: 0, 'aria-expanded': !!open,
                title: `#${n.seq}${n.time ? ` · ${new Date(n.time).toLocaleString()}` : ''}`,
                onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick?.();
                } },
            }, h(Chevron, { open, size: 10 }), h('span', { className: 'clx-mrow-kind', style: { '--cat': color } }, t(`k.${kind}`)), h('span', { className: 'clx-mrow-text' }, text || h('span', { className: 'clx-muted' }, '—')), extra, h('span', { className: 'clx-mrow-tok' }, fmtK(tok)));
        }
        function Messages({ data, flow, t, focus, sessionId, preset, ctx, cwd, diff, stepOnly }) {
            const [query, setQuery] = useState('');
            const [sort, setSort] = useState('order');
            const [cat, setCat] = useState('');
            const [limit, setLimit] = useState(300);
            const [openSeq, setOpenSeq] = useState(focus ?? null);
            const [openTurns, setOpenTurns] = useState({});
            const fromJump = useRef(false);
            useEffect(() => { if (focus !== undefined && focus !== null) {
                fromJump.current = true;
                setOpenSeq(focus);
            } }, [focus]);
            useEffect(() => {
                if (!preset)
                    return;
                setCat(preset.cat);
                setSort('size');
                setQuery('');
            }, [preset]);
            const nodes = data.nodes || [];
            const present = useMemo(() => {
                const m = {};
                for (const n of nodes)
                    m[n.category] = (m[n.category] || 0) + n.tokensCal;
                return m;
            }, [nodes]);
            // calls by the node that made them, so a call row can carry its results
            const invsBySeq = useMemo(() => {
                const m = new Map();
                for (const x of data.invocations || []) {
                    if (x.callSeq === undefined)
                        continue;
                    if (!m.has(x.callSeq))
                        m.set(x.callSeq, []);
                    m.get(x.callSeq).push(x);
                }
                return m;
            }, [data.invocations]);
            const stepMode = !!diff && !diff.last;
            const inStep = (n) => !!diff && n.seq >= diff.prevCut && n.seq < diff.cut;
            const stepFilter = !!stepOnly && !!diff;
            const filtering = !!query.trim() || !!cat || stepFilter;
            const list = useMemo(() => {
                const q = query.trim().toLowerCase();
                const inCat = (n) => n.category === cat || (n.split && (n.split[cat] || 0) > 0);
                let out = nodes.filter((n) => (!cat || inCat(n)) && (!stepFilter || inStep(n))
                    && (!q || (n.preview || '').toLowerCase().includes(q) || (n.tool || '').toLowerCase().includes(q)
                        || (n.tools || []).some((x) => x.toLowerCase().includes(q)) || String(n.seq) === q));
                if (sort === 'size')
                    out = [...out].sort((a, b) => b.tokensCal - a.tokensCal);
                return out;
            }, [nodes, query, sort, cat, stepFilter, diff?.prevCut, diff?.cut]);
            // in order, a result whose call is listed folds into the call's row
            const shownSet = useMemo(() => new Set(list.map((n) => n.seq)), [list]);
            const rows = useMemo(() => (sort === 'order'
                ? list.filter((n) => !(n.category === 'toolResults' && n.callSeq !== undefined && shownSet.has(n.callSeq) && invsBySeq.has(n.callSeq)))
                : list), [list, sort, shownSet, invsBySeq]);
            const total = list.reduce((s, n) => s + n.tokensCal, 0);
            // turn → step grouping (order only)
            const stepsByTurn = useMemo(() => {
                const m = new Map();
                for (const st of flow?.steps || []) {
                    if (!m.has(st.turn))
                        m.set(st.turn, []);
                    m.get(st.turn).push(st);
                }
                return m;
            }, [flow]);
            const turnInfo = useMemo(() => new Map((flow?.turns || []).map((x) => [x.turn, x])), [flow]);
            const stepOf = (n) => {
                const ss = stepsByTurn.get(n.turn);
                if (!ss)
                    return null;
                let hit = null;
                for (const st of ss)
                    if (st.startSeq <= n.seq)
                        hit = st;
                return hit;
            };
            const lastTurn = useMemo(() => {
                let x;
                for (const n of nodes)
                    if (n.turn !== undefined)
                        x = n.turn;
                return x;
            }, [nodes]);
            const focusTurn = useMemo(() => {
                const n = openSeq !== null ? nodes.find((y) => y.seq === openSeq) : null;
                if (!n)
                    return undefined;
                if (n.category === 'toolResults' && n.callSeq !== undefined)
                    return nodes.find((y) => y.seq === n.callSeq)?.turn ?? n.turn;
                return n.turn;
            }, [openSeq, nodes]);
            const keyOf = (turn) => (turn === undefined ? 'pre' : String(turn));
            const isOpen = (k) => openTurns[k] ?? (filtering || k === keyOf(lastTurn) || k === keyOf(focusTurn));
            const from = sort === 'order' ? Math.max(0, rows.length - limit) : 0;
            const visible = sort === 'order' ? rows.slice(from) : rows.slice(0, limit);
            // a jump opens its row, and a result jump lands on the call that carries it
            useEffect(() => {
                if (openSeq === null || openSeq === undefined)
                    return;
                const n = nodes.find((y) => y.seq === openSeq);
                if (n && sort === 'order' && n.category === 'toolResults' && n.callSeq !== undefined && invsBySeq.has(n.callSeq) && shownSet.has(n.callSeq)) {
                    setOpenSeq(n.callSeq);
                    return;
                }
                const idx = rows.findIndex((y) => y.seq === openSeq);
                if (sort === 'order' && idx >= 0 && idx < rows.length - limit)
                    setLimit(rows.length - idx + 20);
                else if (sort !== 'order' && idx >= limit)
                    setLimit(idx + 50);
                if (!fromJump.current)
                    return;
                fromJump.current = false;
                requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`clx-node-${openSeq}`)?.scrollIntoView({ block: 'center' })));
            }, [openSeq]);
            const rowEl = (n, i) => {
                const open = openSeq === n.seq;
                const invs = invsBySeq.get(n.seq);
                return h('div', { key: n.seq, id: `clx-node-${n.seq}`, className: `clx-mnode${open ? ' open' : ''}${diff && inStep(n) && !stepFilter ? ' instep' : ''}${stepMode && diff && n.seq >= diff.cut ? ' later' : ''}`, style: { '--cat': CAT_COLOR[invs ? 'toolCalls' : n.category] || CAT_COLOR.other } }, h(MsgRow, { n, t, open, invs, merged: sort === 'order', onClick: () => setOpenSeq(open ? null : n.seq) }), open ? h('div', { className: 'clx-mopen' }, h(NodeDetail, { sessionId, seq: n.seq, t, ctx, cwd }), h('button', { className: 'clx-mopen-close', onClick: () => { setOpenSeq(null); requestAnimationFrame(() => { const el = document.getElementById(`clx-node-${n.seq}`); if (el && el.getBoundingClientRect().top < 60)
                        el.scrollIntoView({ block: 'center' }); }); } }, t('msg.collapse'))) : null);
            };
            let body;
            if (sort !== 'order') {
                body = h('div', { className: 'clx-mlist' }, visible.map(rowEl));
            }
            else {
                // consecutive runs of one turn, then of one step inside it
                const groups = [];
                for (const n of visible) {
                    const k = keyOf(n.turn);
                    let g = groups[groups.length - 1];
                    if (!g || g.key !== k)
                        groups.push(g = { key: k, turn: n.turn, items: [], tok: 0 });
                    g.items.push(n);
                    g.tok += n.tokensCal + (invsBySeq.get(n.seq) || []).reduce((s, x) => s + (x.resultTokens || 0), 0);
                }
                body = h('div', { className: 'clx-mlist' }, groups.map((g, gi) => {
                    const opened = isOpen(g.key);
                    const tu = g.turn !== undefined ? turnInfo.get(g.turn) || {} : {};
                    const ss = g.turn !== undefined ? stepsByTurn.get(g.turn) || [] : [];
                    const children = [];
                    if (opened) {
                        let curStep;
                        for (const n of g.items) {
                            const st = stepOf(n);
                            if (st && st !== curStep) {
                                curStep = st;
                                children.push(h('div', { key: `s${st.startSeq}`, className: 'clx-mstep' }, h('span', { className: 'n' }, fmt(t('msg.step'), { n: st.step })), st.tools.length ? h('span', { className: 'tools' }, groupNames(st.tools)) : h('span', { className: 'tools clx-muted' }, st.stages.includes('assistant') ? t('flow.textOnly') : ''), st.errors ? h('span', { className: 'clx-err' }, `⚠${st.errors}`) : null, st.promptTokens ? h('span', { className: 'ctx', title: t('st.ctx') }, fmtK(st.promptTokens)) : null));
                            }
                            children.push(rowEl(n, 0));
                        }
                    }
                    return h('section', { key: `${g.key}-${gi}`, className: `clx-mturn${opened ? ' open' : ''}` }, h('div', {
                        className: 'clx-mturn-head', role: 'button', tabIndex: 0, 'aria-expanded': opened,
                        onClick: () => setOpenTurns({ ...openTurns, [g.key]: !opened }),
                        onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setOpenTurns({ ...openTurns, [g.key]: !opened });
                        } },
                    }, h(Chevron, { open: opened }), h('b', null, g.turn === undefined ? t('msg.pre') : fmt(t('msg.turn'), { n: g.turn })), h('span', { className: 'clx-mturn-prompt' }, tu.prompt || ''), h('span', { className: 'clx-mturn-meta' }, [ss.length ? fmt(t('msg.stepsN'), { n: ss.length }) : fmt(t('msg.itemsN'), { n: g.items.length }), tu.start && tu.end ? fmtDur(tu.end - tu.start) : null].filter(Boolean).join(' · ')), h('span', { className: 'clx-mturn-tok' }, fmtK(g.tok))), opened ? h('div', { className: 'clx-mturn-body' }, children) : null);
                }));
            }
            const allTok = nodes.reduce((a, n) => a + n.tokensCal, 0);
            const biggest = nodes.reduce((a, n) => (!a || n.tokensCal > a.tokensCal ? n : a), null);
            const turnsN = (flow?.turns || []).length || new Set(nodes.map((n) => n.turn).filter((x) => x !== undefined)).size;
            return h(React.Fragment, null, h('div', { className: 'clx-tiles clx-tsum' }, h(Stat, { k: t('msg.sum.nodes'), v: fmtInt(nodes.length) }), h(Stat, { k: t('msg.sum.tok'), v: fmtK(allTok) }), h(Stat, { k: t('msg.sum.turns'), v: fmtInt(turnsN) }), h(Stat, { k: t('msg.sum.steps'), v: flow ? fmtInt((flow.steps || []).length) : '—' }), h(Stat, { k: t('msg.sum.calls'), v: fmtInt((data.invocations || []).length) }), biggest ? h('div', { className: 'clx-stat clx-stat-link', role: 'button', tabIndex: 0, onClick: () => { fromJump.current = true; setOpenSeq(biggest.seq); }, title: biggest.preview }, h('div', { className: 'k' }, t('msg.sum.max')), h('div', { className: 'v' }, fmtK(biggest.tokensCal), h('small', null, ` #${biggest.seq}`))) : null), h('div', { className: 'clx-msgs' }, h('div', { className: 'clx-mmain' }, h('div', { className: 'clx-msgbar' }, h('div', { className: 'clx-msgsearch' }, h('svg', { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': true }, h('circle', { cx: 11, cy: 11, r: 6.5 }), h('path', { d: 'M16 16l4 4' })), h('input', { value: query, placeholder: t('msg.search'), onChange: (e) => setQuery(e.target.value) }), query ? h('button', { className: 'clx-msgclear', 'aria-label': '×', onClick: () => setQuery('') }, '×') : null), h('span', { className: 'clx-segmini' }, h('button', { className: 'clx-chipbtn', 'aria-pressed': sort === 'order', onClick: () => setSort('order') }, t('msg.sort.order')), h('button', { className: 'clx-chipbtn', 'aria-pressed': sort === 'size', onClick: () => setSort('size') }, t('msg.sort.size'))), h('label', { className: 'clx-msgcat', style: { '--cat': cat ? CAT_COLOR[cat] : 'transparent' } }, h('i', { className: 'clx-dot' }), h('select', { value: cat, onChange: (e) => setCat(e.target.value) }, h('option', { value: '' }, t('msg.allCats')), CATS.filter((k) => present[k]).map((k) => h('option', { key: k, value: k }, `${t(`c.${k}`)} · ${fmtK(present[k])}`)))), h('span', { className: 'clx-msgcount' }, fmt(t('msg.count'), { n: list.length, t: fmtK(total) }), data.nodesTruncated ? ` · ${fmt(t('msg.trunc'), { n: data.nodesTruncated })}` : '')), sort === 'order' && from > 0 ? h('button', { className: 'clx-chipbtn clx-mmore', onClick: () => setLimit(limit + 300) }, fmt(t('msg.earlier'), { n: Math.min(300, from) })) : null, rows.length ? body : h('div', { className: 'clx-muted', style: { fontSize: 12, padding: '12px 2px' } }, t('msg.none')), sort !== 'order' && rows.length > limit ? h('button', { className: 'clx-chipbtn clx-mmore', onClick: () => setLimit(limit + 300) }, fmt(t('msg.more'), { n: Math.min(300, rows.length - limit) })) : null)));
        }
        /** A tool's full definition, fetched when its row is opened. */
        function ToolDetail({ sessionId, name, t }) {
            const [st, setSt] = useState({ loading: true });
            useEffect(() => {
                let dead = false;
                setSt({ loading: true });
                call('tool', { sessionId, name }).then((v) => { if (!dead)
                    setSt({ data: v }); }, (e) => { if (!dead)
                    setSt({ error: String(e?.message || e) }); });
                return () => { dead = true; };
            }, [sessionId, name]);
            if (st.loading)
                return h('div', { className: 'clx-expand clx-muted' }, t('loading'));
            if (st.error)
                return h('div', { className: 'clx-expand clx-err' }, fmt(t('failed'), { msg: st.error }));
            const d = st.data;
            return h('div', { className: 'clx-expand' }, d.description ? h(RichText, { text: d.description, hint: 'md', t, label: t('tools.desc'), bare: true }) : null, h('div', { className: 'clx-params' }, h('div', { className: 'clx-params-head' }, d.params.length ? fmt(t('tools.paramsN'), { n: d.params.length }) : t('tools.noParams')), d.params.map((p) => h('div', { key: p.name, className: 'clx-param' }, h('div', { className: 'clx-param-head' }, h('code', null, p.name), p.type ? h('span', { className: 'clx-badge' }, p.type) : null, p.required ? h('span', { className: 'clx-badge warn' }, t('tools.required')) : h('span', { className: 'clx-muted', style: { fontSize: 11 } }, t('tools.optional'))), p.description ? h('div', { className: 'clx-param-desc' }, p.description) : null, p.enum ? h('div', { className: 'clx-param-enum' }, p.enum.map((e) => h('code', { key: e }, e))) : null))), d.schema ? h(Disclosure, { head: h('span', { className: 'clx-sub', style: { fontSize: 12 } }, 'JSON Schema') }, h(RichText, { text: d.schema, hint: 'code', t, bare: true })) : null);
        }
        // ------------------------------------------------------------ command runs
        const PROG_COLORS = ['#E8833A', '#E9A23B', '#2BAE9F', '#3BA7D9', '#3FB37F', '#E2558F', '#6573E0', '#9B6BD6', '#C46F3B', '#5B9E4A'];
        function progColor(name) {
            let x = 0;
            for (const ch of String(name))
                x = (x * 31 + ch.charCodeAt(0)) >>> 0;
            return PROG_COLORS[x % PROG_COLORS.length];
        }
        function fmtMs(ms) {
            if (!(ms >= 0))
                return '—';
            if (ms < 1000)
                return `${Math.round(ms)}ms`;
            if (ms < 60000)
                return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1).replace(/\.?0+$/, '')}s`;
            const s = Math.round(ms / 1000);
            if (s < 3600)
                return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
            return `${Math.floor(s / 3600)}h${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`;
        }
        /** A command line with its programs and shell operators picked out (no full parser: just enough to scan). */
        function CmdText({ text, programs }) {
            const progs = new Set(programs || []);
            const tokens = String(text || '').replace(/\s+/g, ' ').match(/"(?:[^"\\]|\\.)*"?|'[^']*'?|\d*>>?&?\d*\S*|&&|\|\||[|;&]|[^\s|;&"'>]+|\s+/g) || [];
            let expectProgram = true;
            return h('span', { className: 'clx-cmdtext' }, tokens.map((tok, i) => {
                if (/^\s+$/.test(tok))
                    return tok;
                if (/^(&&|\|\||[|;&])$/.test(tok)) {
                    expectProgram = true;
                    return h('span', { key: i, className: 'op' }, tok);
                }
                if (/^\d*>/.test(tok))
                    return h('span', { key: i, className: 'redir' }, tok);
                if (/^["']/.test(tok)) {
                    expectProgram = false;
                    return h('span', { key: i, className: 'str' }, tok);
                }
                const base = tok.split('/').pop();
                if (expectProgram && !/^[A-Za-z_]\w*=/.test(tok)) {
                    expectProgram = false;
                    if (progs.has(base) || base === 'cd')
                        return h('span', { key: i, className: 'prog' }, tok);
                }
                if (/^-/.test(tok))
                    return h('span', { key: i, className: 'flag' }, tok);
                return tok;
            }));
        }
        /** `cd <dir> [2>/dev/null] && rest` → { dir, rest }: the directory is shown as a chip so the command itself is visible. */
        function splitCd(command) {
            const m = /^\s*cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))(?:\s+2>\s*\/dev\/null)?\s*(?:&&|;)\s*([\s\S]+)$/.exec(String(command || ''));
            return m ? { dir: m[1] ?? m[2] ?? m[3], rest: m[4] } : { dir: undefined, rest: String(command || '') };
        }
        function DirChip({ dir }) {
            if (!dir)
                return null;
            const parts = dir.replace(/\/+$/, '').split('/');
            const last = parts.pop() || '/';
            // a scope like @deepseek-ai alone says little, keep its parent too
            const name = /^@/.test(last) && parts.length ? `${parts.pop()}/${last}` : last;
            return h('span', { className: 'clx-cmd-dir', title: `cd ${dir}` }, h('svg', { viewBox: '0 0 16 16', width: 11, height: 11, 'aria-hidden': true }, h('path', { d: 'M1.5 4.5a1 1 0 0 1 1-1h3.6l1.5 1.6h5.9a1 1 0 0 1 1 1v6.4a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1z', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 })), h('span', null, name));
        }
        function CmdStatus({ c, t }) {
            if (c.status === 'running')
                return h('span', { className: 'clx-cmd-st run', title: t('cmd.running') });
            if (c.status === 'failed')
                return h('span', { className: 'clx-cmd-st bad', title: c.exitCode !== undefined ? fmt(t('cmd.exit'), { n: c.exitCode }) : t('cmd.failed') }, '✕');
            return h('span', { className: 'clx-cmd-st ok', title: c.exitCode !== undefined ? fmt(t('cmd.exit'), { n: c.exitCode }) : '' }, '✓');
        }
        function CmdRow({ c, t, open, onClick }) {
            const where = [c.turn !== undefined ? `T${c.turn}` : '', c.step !== undefined ? `S${c.step}` : ''].filter(Boolean).join(' ');
            return h('div', {
                className: 'clx-cmd-row', role: 'button', tabIndex: 0, 'aria-expanded': !!open, onClick,
                onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                } },
                title: c.description || c.command,
            }, h(Chevron, { open }), h(CmdStatus, { c, t }), h('span', { className: 'cmd' }, (() => { const x = splitCd(c.command); return h(React.Fragment, null, h(DirChip, { dir: x.dir }), h(CmdText, { text: x.rest, programs: c.programs })); })()), h('span', { className: 'tags' }, c.status === 'failed' && c.exitCode !== undefined && c.exitCode !== 0 ? h('span', { className: 'clx-cmd-badge bad' }, fmt(t('cmd.exit'), { n: c.exitCode })) : null, c.background ? h('span', { className: 'clx-cmd-badge bg', title: t('cmd.bgTip') }, t('cmd.bg')) : null, c.inline ? h('span', { className: 'clx-cmd-badge', title: t('cmd.inlineTip') }, t('cmd.inline')) : null), h('span', { className: `dur${c.slow ? ' slow' : ''}` }, c.status === 'running' ? t('cmd.running') : fmtMs(c.durationMs)), h('span', { className: 'when' }, [where, fmtTime(c.time)].filter(Boolean).join(' · ')));
        }
        /** One command opened: what it was for, how it ended, then the command and its output together. */
        function CmdDetail({ c, t, sessionId }) {
            const meta = [
                [t('cmd.meta.exit'), c.exitCode !== undefined ? String(c.exitCode) : (c.status === 'running' ? t('cmd.stillRunning') : '—'), c.status === 'failed' ? 'bad' : ''],
                [t('cmd.meta.time'), c.status === 'running' ? t('cmd.stillRunning') : fmtMs(c.durationMs), c.slow ? 'slow' : ''],
                c.job ? [t('cmd.meta.job'), [c.job.kind, c.job.status, c.job.id].filter(Boolean).join(' · ')] : [t('cmd.meta.job'), t('cmd.inline')],
                c.cwd ? [t('cmd.meta.cwd'), c.cwd] : null,
                c.outputChars !== undefined ? [t('cmd.meta.out'), `${fmtInt(c.outputChars)} ${t('ui.chars')}`] : null,
                [t('cmd.meta.ctx'), c.inContext ? t('cmd.inCtx') : t('cmd.outCtx')],
            ].filter(Boolean);
            return h('div', { className: 'clx-detail clx-cmd-detail', onClick: (e) => e.stopPropagation() }, c.description ? h('div', { className: 'clx-cmd-desc' }, c.description) : null, h('div', { className: 'clx-cmd-meta' }, meta.map(([k, v, cls]) => h('span', { key: k }, h('i', null, k), h('b', { className: cls || '' }, v)))), h('div', { className: 'clx-pair' }, h(RichText, { t, bare: true, text: c.command, hint: 'code', lang: 'bash', label: `${t('pair.call')} · ${t('cmd.command')}${c.callSeq !== undefined ? ` · #${c.callSeq}` : ''}`, metaTitle: c.id }), c.resultSeq !== undefined ? h(PairedResult, { sessionId, seq: c.resultSeq, t }) : h('div', { className: 'clx-pair-note' }, c.status === 'running' ? t('cmd.stillRunning') : t('pair.pending'))));
        }
        function Commands({ data, t, sessionId }) {
            const cmds = data.commands || [];
            const [status, setStatus] = useState('all');
            const [query, setQuery] = useState('');
            const [prog, setProg] = useState(null);
            const [progQuery, setProgQuery] = useState('');
            const [sort, setSort] = useState('latest');
            const [openId, setOpenId] = useState(null);
            const [limit, setLimit] = useState(60);
            const counts = useMemo(() => ({
                all: cmds.length,
                failed: cmds.filter((c) => c.status === 'failed').length,
                slow: cmds.filter((c) => c.slow).length,
                bg: cmds.filter((c) => c.background).length,
            }), [cmds]);
            const total = cmds.reduce((s, c) => s + (c.durationMs || 0), 0);
            const programs = useMemo(() => {
                const m = new Map();
                for (const c of cmds) {
                    for (const p of c.programs || []) {
                        const x = m.get(p) || { name: p, times: 0, runs: 0, failed: 0 };
                        x.times++;
                        m.set(p, x);
                    }
                    for (const p of new Set(c.programs || []))
                        m.get(p).runs++;
                    // a command line's exit code is its last command's, so a failure is charged to that program
                    const last = (c.programs || [])[(c.programs || []).length - 1];
                    if (c.status === 'failed' && last)
                        m.get(last).failed++;
                }
                return [...m.values()].sort((a, b) => b.times - a.times || a.name.localeCompare(b.name));
            }, [cmds]);
            const slowest = useMemo(() => cmds.reduce((a, c) => (c.durationMs !== undefined && (!a || c.durationMs > a.durationMs) ? c : a), null), [cmds]);
            const mostFailed = programs.filter((p) => p.failed).sort((a, b) => b.failed - a.failed)[0];
            const list = useMemo(() => {
                const q = query.trim().toLowerCase();
                const out = cmds.filter((c) => (status === 'all' || (status === 'failed' && c.status === 'failed') || (status === 'slow' && c.slow) || (status === 'bg' && c.background))
                    && (!prog || (c.programs || []).includes(prog))
                    && (!q || c.command.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q)));
                return sort === 'slowest'
                    ? out.sort((a, b) => (b.durationMs ?? -1) - (a.durationMs ?? -1))
                    : out.sort((a, b) => (b.time || 0) - (a.time || 0));
            }, [cmds, status, prog, query, sort]);
            if (!cmds.length)
                return h('div', { className: 'clx-card' }, h('div', { className: 'clx-card-head' }, h('h4', null, t('cmd.title'))), h('div', { className: 'clx-muted' }, t('cmd.none')));
            const maxTimes = Math.max(1, ...programs.map((p) => p.times));
            const pq = progQuery.trim().toLowerCase();
            const reveal = (c) => { setStatus('all'); setProg(null); setQuery(''); setOpenId(c.id); };
            const filtered = status !== 'all' || prog || query;
            const STATUS = [['all', ''], ['failed', 'bad'], ['slow', 'slow'], ['bg', 'bg']];
            return h('div', { className: 'clx-card clx-cmdcard' }, h('div', { className: 'clx-card-head' }, h('h4', null, h('span', { className: 'clx-cmd-icon' }, '>_'), t('cmd.title')), h('span', { className: 'clx-cmd-status' }, STATUS.map(([k, cls]) => h('button', {
                key: k, className: `clx-cmd-sbtn ${cls}`, 'aria-pressed': status === k, onClick: () => setStatus(status === k && k !== 'all' ? 'all' : k),
                title: k === 'slow' ? fmt(t('cmd.slowTip'), { s: Math.round((data.slowMs || 10000) / 1000) }) : k === 'bg' ? t('cmd.bgTip') : undefined,
            }, t(`cmd.${k}`), h('b', null, counts[k]))))), h('div', { className: 'clx-cmd' }, h('div', { className: 'clx-cmd-side' }, h('div', { className: 'clx-cmd-h' }, t('cmd.summary')), h('div', { className: 'clx-cmd-tiles' }, h('div', { className: 'clx-cmd-tile' }, h('b', null, fmtInt(counts.all)), h('span', null, t('cmd.runs'))), h('div', { className: 'clx-cmd-tile' }, h('b', { className: 'accent' }, fmtMs(total)), h('span', null, t('cmd.totalTime'))), h('div', { className: 'clx-cmd-tile', role: 'button', tabIndex: 0, onClick: () => setStatus('failed') }, h('b', { className: counts.failed ? 'bad' : '' }, counts.failed), h('span', null, fmt(t('cmd.failRate'), { p: pct(counts.failed, counts.all) }))), h('div', { className: 'clx-cmd-tile', role: 'button', tabIndex: 0, onClick: () => setStatus('bg') }, h('b', { className: counts.bg ? 'bgc' : '' }, counts.bg), h('span', null, t('cmd.bg')))), h('div', { className: 'clx-cmd-h' }, t('cmd.notable')), slowest && slowest.slow || mostFailed ? h('div', { className: 'clx-cmd-notes' }, slowest && slowest.slow ? h('div', { className: 'clx-cmd-note', role: 'button', tabIndex: 0, onClick: () => reveal(slowest), title: slowest.command }, h('i', { className: 'clx-dot', style: { background: '#E9A23B' } }), h('span', { className: 'k' }, t('cmd.slowest')), h('code', null, splitCd(slowest.command).rest), h('b', { className: 'slow' }, fmtMs(slowest.durationMs))) : null, mostFailed ? h('div', { className: 'clx-cmd-note', role: 'button', tabIndex: 0, onClick: () => { setStatus('failed'); setProg(mostFailed.name); } }, h('i', { className: 'clx-dot', style: { background: 'var(--dsw-alias-state-error-primary)' } }), h('span', { className: 'k' }, t('cmd.mostFailed')), h('code', null, mostFailed.name), h('b', { className: 'bad' }, `×${mostFailed.failed}`)) : null)
                : h('div', { className: 'clx-muted', style: { fontSize: 12, padding: '2px 2px 4px' } }, t('cmd.noneNotable')), h('div', { className: 'clx-cmd-h' }, h('span', null, fmt(t('cmd.programs'), { n: programs.length })), programs.length > 8 ? h('input', { className: 'clx-cmd-pq', value: progQuery, placeholder: t('cmd.filterPrograms'), onChange: (e) => setProgQuery(e.target.value) }) : null), h('div', { className: 'clx-cmd-progs' }, programs.filter((p) => !pq || p.name.toLowerCase().includes(pq)).map((p) => h('div', {
                key: p.name, className: `clx-cmd-prog${prog === p.name ? ' on' : ''}`, role: 'button', tabIndex: 0, 'aria-pressed': prog === p.name,
                onClick: () => setProg(prog === p.name ? null : p.name), style: { '--pc': progColor(p.name) },
            }, h('i', { className: 'clx-dot' }), h('code', null, p.name), p.failed ? h('span', { className: 'clx-cmd-badge bad' }, `✕${p.failed}`) : null, h('span', { className: 'n' }, fmt(t('cmd.times'), { n: p.times }), h('em', null, ` · ${fmt(t('cmd.records'), { n: p.runs })}`)), h('span', { className: 'bar' }, h('span', { style: { width: `${p.times / maxTimes * 100}%` } })))))), h('div', { className: 'clx-cmd-main' }, h('div', { className: 'clx-msgtools' }, h('input', { value: query, placeholder: t('cmd.filter'), onChange: (e) => setQuery(e.target.value) }), h('button', { className: 'clx-chipbtn', 'aria-pressed': sort === 'latest', onClick: () => setSort('latest') }, t('cmd.sort.latest')), h('button', { className: 'clx-chipbtn', 'aria-pressed': sort === 'slowest', onClick: () => setSort('slowest') }, t('cmd.sort.slowest'))), filtered ? h('div', { className: 'clx-muted clx-cmd-filt' }, `${list.length} / ${cmds.length}`, prog ? h('span', { className: 'clx-chip', style: { '--pc': progColor(prog), cursor: 'default' } }, h('i', { className: 'clx-dot', style: { background: progColor(prog) } }), prog) : null, h('button', { className: 'clx-linkbtn', onClick: () => { setStatus('all'); setProg(null); setQuery(''); } }, t('cmd.clear'))) : null, list.length ? list.slice(0, limit).map((c, i) => {
                const open = openId === c.id;
                const cat = c.status === 'failed' ? 'var(--dsw-alias-state-error-primary)' : c.status === 'running' || c.background ? '#3BA7D9' : '#3FB37F';
                return h('div', { key: c.id, className: `clx-node clx-cmd-item${open ? ' open' : ''}${c.status === 'failed' ? ' failed' : ''}`, style: { '--cat': cat, '--i': Math.min(i, 24) } }, h(CmdRow, { c, t, open, onClick: () => setOpenId(open ? null : c.id) }), open ? h(CmdDetail, { c, t, sessionId }) : null);
            }) : h('div', { className: 'clx-muted', style: { padding: '12px 4px' } }, t('cmd.empty')), list.length > limit ? h('button', { className: 'clx-chipbtn', style: { marginTop: 8 }, onClick: () => setLimit(limit + 100) }, fmt(t('cmd.more'), { n: Math.min(100, list.length - limit) })) : null)));
        }
        /** One tool on one line: name, what it costs, how often it ran. */
        function ToolLine({ name, color, kind, bar, count, errs, tok, sel, onClick, title, hot = false }) {
            return h('div', {
                className: `clx-tl${sel ? ' sel' : ''}${hot ? ' hot' : ''}`, role: 'button', tabIndex: 0, 'aria-pressed': !!sel, onClick, title,
                onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                } },
            }, h('i', { className: 'clx-dot', style: { background: color } }), h('code', { className: 'nm' }, name), h('span', { className: 'kd' }, kind || ''), h('span', { className: 'bar' }, bar), count !== undefined ? h('span', { className: 'ct' }, count) : null, errs ? h('span', { className: 'er' }, `⚠${errs}`) : h('span', { className: 'er' }), h('span', { className: 'tk' }, tok));
        }
        /** A tool opened: its calls this session (each with its result), then its definition. */
        function ToolPanel({ data, name, t, sessionId, ctx, cwd }) {
            const def = (data.tools || []).find((x) => x.name === name);
            const st = (data.toolStats || []).find((x) => x.name === name);
            const errs = (data.invocations || []).filter((x) => x.name === name && x.isError).length;
            return h(React.Fragment, null, h('div', { className: 'clx-mside-head' }, h('code', { className: 'clx-mrow-tool', style: { fontSize: 13 } }, name), def ? h('span', { className: 'clx-pill' }, def.kind === 'mcp' ? `MCP · ${def.server}` : t('tools.system')) : null, st ? h('span', { className: 'clx-muted' }, `${fmt(t('tools.callsN'), { n: st.calls })}${errs ? ` · ⚠${errs}` : ''}`) : null, h('span', { className: 'clx-mside-tok' }, [def ? `${t('tools.defTok')} ${fmtK(def.tokensCal)}` : null, st ? `${t('tools.useTok')} ${fmtK(st.callTokens + st.resultTokens)}` : null].filter(Boolean).join(' · '))), h('div', { className: 'clx-mside-body' }, st && st.calls ? h(ToolInvocations, { data, name, sessionId, t, ctx, cwd }) : null, def ? h('div', { className: 'clx-tp-def' }, h('div', { className: 'clx-tp-h' }, t('tools.definition')), h(ToolDetail, { sessionId, name, t })) : h('div', { className: 'clx-muted', style: { fontSize: 12 } }, t('tools.noDef'))));
        }
        function Tools({ data, t, sessionId, ctx, cwd, diff }) {
            const hotTools = useMemo(() => new Set(diff && !diff.last ? diff.cur.st.tools : diff ? diff.cur.st.tools : []), [diff]);
            const [rootRef, rootW] = useWidth(800);
            const wide = rootW >= 760;
            const [sel, setSel] = useState(null);
            const [q, setQ] = useState('');
            const [allDefs, setAllDefs] = useState(false);
            const tools = data.tools || [];
            const stats = useMemo(() => [...(data.toolStats || [])].sort((a, b) => (b.callTokens + b.resultTokens) - (a.callTokens + a.resultTokens)), [data.toolStats]);
            const errsBy = useMemo(() => {
                const m = {};
                for (const x of data.invocations || [])
                    if (x.isError)
                        m[x.name] = (m[x.name] || 0) + 1;
                return m;
            }, [data.invocations]);
            const defBy = useMemo(() => new Map(tools.map((x) => [x.name, x])), [tools]);
            const query = q.trim().toLowerCase();
            const match = (x) => !query || x.name.toLowerCase().includes(query) || (x.description || '').toLowerCase().includes(query);
            const used = stats.filter((x) => match({ name: x.name, description: defBy.get(x.name)?.description }));
            const defs = [...tools].sort((a, b) => b.tokensCal - a.tokensCal).filter(match);
            const defsShown = allDefs || query ? defs : defs.slice(0, 10);
            const useMax = Math.max(1, ...stats.map((x) => x.callTokens + x.resultTokens));
            const defMax = Math.max(1, ...tools.map((x) => x.tokensCal));
            const callsTotal = stats.reduce((s, x) => s + x.calls, 0);
            const resTotal = stats.reduce((s, x) => s + x.resultTokens, 0);
            const errTotal = Object.values(errsBy).reduce((a, b) => a + b, 0);
            const mcp = tools.filter((x) => x.kind === 'mcp').length;
            const cmds = data.commands || [];
            // on a wide pane the most used tool is open from the start
            const current = sel ?? (wide && stats[0] ? stats[0].name : null);
            const pick = (name) => setSel(current === name && !wide ? null : name);
            const panel = (name) => h(ToolPanel, { key: name, data, name, t, sessionId, ctx, cwd });
            const inline = (name) => (!wide && current === name ? h('div', { className: 'clx-tl-inline' }, panel(name)) : null);
            const list = h('div', { className: 'clx-tlists' }, h('div', { className: 'clx-msgsearch clx-tsearch' }, h('svg', { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': true }, h('circle', { cx: 11, cy: 11, r: 6.5 }), h('path', { d: 'M16 16l4 4' })), h('input', { value: q, placeholder: t('tools.search'), onChange: (e) => setQ(e.target.value) }), q ? h('button', { className: 'clx-msgclear', onClick: () => setQ('') }, '×') : null), h('div', { className: 'clx-card clx-tcard' }, h('div', { className: 'clx-card-head' }, h('h4', null, t('tools.usage')), h('span', { className: 'clx-tlegend' }, h('span', null, h('i', { style: { background: CAT_COLOR.toolCalls } }), t('pair.call')), h('span', null, h('i', { style: { background: CAT_COLOR.toolResults } }), t('pair.result')))), used.length ? used.map((x) => h(React.Fragment, { key: x.name }, h(ToolLine, {
                name: x.name, color: CAT_COLOR.toolResults, sel: current === x.name, onClick: () => pick(x.name), hot: hotTools.has(x.name),
                title: `${t('pair.call')} ${fmtInt(x.callTokens)} + ${t('pair.result')} ${fmtInt(x.resultTokens)} · ${t('tools.col.max')} ${fmtInt(x.maxResult)}`,
                bar: h(React.Fragment, null, h('span', { style: { width: `${x.callTokens / useMax * 100}%`, background: CAT_COLOR.toolCalls } }), h('span', { style: { width: `${x.resultTokens / useMax * 100}%`, background: CAT_COLOR.toolResults } })),
                count: `×${x.calls}`, errs: errsBy[x.name], tok: fmtK(x.callTokens + x.resultTokens),
            }), inline(x.name))) : h('div', { className: 'clx-muted clx-tempty' }, query ? t('msg.none') : t('tools.noUse'))), h('div', { className: 'clx-card clx-tcard' }, h('div', { className: 'clx-card-head' }, h('h4', null, t('tools.defsShort')), h('span', { className: 'clx-muted' }, t('tools.defsNote'))), defsShown.map((x) => {
                const color = x.kind === 'mcp' ? CAT_COLOR.mcpTools : CAT_COLOR.systemTools;
                return h(React.Fragment, { key: x.name }, h(ToolLine, {
                    name: x.name, color, kind: x.kind === 'mcp' ? `MCP · ${x.server}` : null, sel: current === x.name, onClick: () => pick(x.name), title: x.description,
                    bar: h('span', { style: { width: `${x.tokensCal / defMax * 100}%`, background: color } }),
                    count: fmt(t('tools.paramsShort'), { n: x.params }), tok: fmtK(x.tokensCal),
                }), inline(x.name));
            }), !query && defs.length > 10 ? h('button', { className: 'clx-chipbtn clx-tmore', onClick: () => setAllDefs(!allDefs) }, allDefs ? t('ui.collapseAll') : fmt(t('tools.showAllDefs'), { n: defs.length })) : null, (data.deferred || []).length ? h('div', { className: 'clx-tdeferred' }, h('span', { className: 'clx-muted' }, fmt(t('tools.deferredN'), { n: data.deferred.length })), data.deferred.map((x) => h('code', { key: x.name, title: x.description }, x.name))) : null));
            return h('div', { className: 'clx-tools', ref: rootRef }, h('div', { className: 'clx-tiles clx-tsum' }, h(Stat, { k: t('tools.sum.defs'), v: fmtInt(tools.length), sub: mcp ? ` MCP ${mcp}` : undefined }), h(Stat, { k: t('tools.sum.defTok'), v: fmtK(data.toolsTokens) }), h(Stat, { k: t('tools.sum.used'), v: fmtInt(stats.length) }), h(Stat, { k: t('tools.sum.calls'), v: fmtInt(callsTotal), sub: errTotal ? ` ⚠${errTotal}` : undefined, tone: errTotal ? 'warn' : '' }), h(Stat, { k: t('tools.sum.resTok'), v: fmtK(resTotal) }), h(Stat, { k: t('tools.sum.cmds'), v: fmtInt(cmds.length), sub: cmds.length ? ` ${fmtMs(cmds.reduce((s, c) => s + (c.durationMs || 0), 0))}` : undefined })), wide
                ? h('div', { className: 'clx-tsplit' }, list, h('aside', { className: 'clx-mside' }, current ? panel(current) : h('div', { className: 'clx-mside-empty' }, t('tools.pick'))))
                : list, h(Commands, { data, t, sessionId }));
        }
        function useSources(sessionId, liveKey) {
            const [state, setState] = useState({ data: null, error: null });
            useEffect(() => {
                let dead = false;
                call('sources', { sessionId }).then((v) => { if (!dead)
                    setState({ data: v, error: null }); }, (e) => { if (!dead)
                    setState((s) => ({ data: s.data, error: String(e?.message || e) })); });
                return () => { dead = true; };
            }, [sessionId, liveKey]);
            return state;
        }
        function Disclosure({ head, children, open: initial, color }) {
            const [open, setOpen] = useState(!!initial);
            return h('div', { className: `clx-disc${open ? ' open' : ''}`, style: color ? { '--cat': color } : undefined }, h('div', {
                className: 'clx-disc-head', role: 'button', tabIndex: 0, 'aria-expanded': open, onClick: () => setOpen(!open),
                onKeyDown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    setOpen(!open);
                } },
            }, h('span', { className: 'clx-disc-caret' }, h(Chevron, { open })), head), open ? h('div', { className: 'clx-disc-body' }, children) : null);
        }
        // ------------------------------------------------------------------ file preview
        // File contents are not rendered here: a click opens the file in dsh's right
        // Sidebar, whose document preview already renders Markdown, code, images, PDF
        // and Office files (and shows its own state when it cannot). The address is
        // built like dsh's own `fileAddressFor(sessionId, cwd, path)`, so a file opened
        // here and the same file opened from a `@` reference are one tab.
        function sidebarFileAddress(sessionId, cwd, absPath) {
            let normalized = String(absPath).replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
            const root = cwd ? String(cwd).replace(/\\/g, '/').replace(/\/+$/, '') : '';
            if (root && normalized === root)
                normalized = '';
            else if (root && normalized.startsWith(`${root}/`))
                normalized = normalized.slice(root.length + 1);
            const encoded = normalized.split('/').map((s) => encodeURIComponent(s).replace(/%3A/gi, ':')).join('/');
            return `dsh-resource://file/session/${encodeURIComponent(sessionId)}/${encoded}`;
        }
        /** Open one file in the right sidebar; a returned key names what went wrong. */
        function openInSidebar(ctx, sessionId, cwd, absPath) {
            if (!ctx || !sessionId || !absPath)
                return 'openFailed';
            let nav;
            let tabs;
            try {
                nav = ctx.get('sidebarRight');
                tabs = ctx.get('sidebarRightTabs');
            }
            catch {
                return 'noSidebar';
            }
            if (!nav || !tabs)
                return 'noSidebar';
            const address = sidebarFileAddress(sessionId, cwd, absPath);
            try {
                if (!tabs.candidates(address).length)
                    return 'noViewer';
                nav.openResource(address);
                return null;
            }
            catch {
                return 'openFailed';
            }
        }
        /** `[failure line, open(path)]` for one card, so each surface reports its own failures. */
        function useSidebarPreview(ctx, sessionId, cwd, t) {
            const [note, setNote] = useState(null);
            const open = (file) => setNote(openInSidebar(ctx, sessionId, cwd, file));
            return [note ? h('div', { className: 'clx-ft-note' }, t(`ft.${note}`)) : null, open];
        }
        // Tools whose call touches one file. The model-visible snapshot stays inline,
        // but the real file can also be opened in dsh's right Sidebar, whose preview
        // renders Markdown / code / images / PDF / Office properly (an image result is
        // only metadata here, so the sidebar is the one way to actually see it).
        const FILE_TOOL = /^(read|read_file|read_image|view|open|open_file|cat|edit|write|multi_edit|notebook_edit|notebook_read|file_read|load_file|str_replace_editor)$/i;
        /** A path made absolute against cwd (null when relative with no cwd). */
        function absPath(p, cwd) {
            p = String(p || '').trim().replace(/^\.\//, '');
            if (!p)
                return null;
            if (p.startsWith('/'))
                return p;
            return cwd ? `${String(cwd).replace(/\/+$/, '')}/${p}` : null;
        }
        /** The absolute path a file tool touched: the resolved <path>…</path> the result
         *  carries, else file_path / path from the call args; relative paths use cwd. */
        function toolFilePath(name, argsText, resultText, cwd) {
            if (!FILE_TOOL.test(String(name || '')))
                return null;
            let p = /<path>\s*([^<]+?)\s*<\/path>/.exec(String(resultText || ''))?.[1] || '';
            if (!p) {
                const a = parseJson(argsText);
                if (a && typeof a === 'object')
                    p = String(a.file_path ?? a.path ?? a.filePath ?? a.filename ?? a.notebook_path ?? '').trim();
                if (!p) {
                    // a write/edit arg can be too big to JSON.parse; pull just the path token
                    const m = /"(?:file_path|filePath|path|filename|notebook_path)"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(String(argsText || ''));
                    if (m) {
                        try {
                            p = JSON.parse(`"${m[1]}"`);
                        }
                        catch {
                            p = m[1];
                        }
                    }
                }
            }
            return absPath(p, cwd);
        }
        /** A 「↗ 预览」 button for a file a tool touched: opens dsh's right Sidebar and
         *  reports noSidebar / noViewer in place. The in-context snapshot is left as is. */
        function FilePreview({ ctx, sessionId, cwd, file, t }) {
            const [note, setNote] = useState(null);
            if (!file)
                return null;
            const open = () => setNote(openInSidebar(ctx, sessionId, cwd, file));
            return h('span', { className: 'clx-filepreview', onClick: (e) => e.stopPropagation() }, h('button', { type: 'button', className: 'clx-filebtn', title: `${file}\n${t('ft.preview')}`, onClick: open }, h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M6.5 2.5h-3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3' }), h('path', { d: 'M9.5 2.5h4v4M13.2 2.8 7.5 8.5' })), t('ft.previewShort')), note ? h('span', { className: 'clx-filepreview-note' }, t(`ft.${note}`)) : null);
        }
        function SkillBody({ sessionId, name, t }) {
            const [state, setState] = useState({ loading: true });
            useEffect(() => {
                let dead = false;
                call('skill', { sessionId, name }).then((v) => { if (!dead)
                    setState({ value: v }); }, (e) => { if (!dead)
                    setState({ error: String(e?.message || e) }); });
                return () => { dead = true; };
            }, [sessionId, name]);
            if (state.loading)
                return h('div', { className: 'clx-muted' }, t('loading'));
            if (state.error)
                return h('div', { className: 'clx-err', style: { fontSize: 12 } }, fmt(t('failed'), { msg: state.error }));
            const v = state.value;
            return h(RichText, { bare: true, text: v.content, hint: 'md', t, label: 'SKILL.md', meta: `${fmtInt(v.chars)} ${t('ui.chars')} · ≈${fmtK(v.tokensEst)} tok${v.truncated ? ` · ${t('msg.truncated')}` : ''}` });
        }
        const RT_NAME = {
            'working-directory:current': 'rt.cwd', 'sandbox:policy': 'rt.sandbox', 'approval:policy': 'rt.approval',
            'harness:source': 'rt.harness', 'app:web-surface': 'rt.web', 'time-context': 'rt.time',
        };
        /** What this agent reads and where, laid out by the rules of the plugins that read it. */
        function AgentLayout({ src, t, onJump, ctx, sessionId }) {
            const L = src.layout;
            const [noteLine, preview] = useSidebarPreview(ctx, sessionId, src.cwd, t);
            if (!L)
                return h('div', { className: 'clx-muted' }, t('lay.none'));
            const home = L.home || '';
            const tilde = (p) => (home && String(p).startsWith(home) ? `~${String(p).slice(home.length)}` : String(p));
            const row = (f, label = undefined) => {
                const st = f.loaded ? 'loaded' : f.exists ? 'exists' : 'missing';
                return h('div', { key: f.path, className: `clx-lay-row ${st}`, title: f.path }, h('i', { className: 'st' }), h('span', { className: 'nm' }, label || f.name), h('span', { className: 'ss' }, f.loaded ? `${t('ft.loaded')}${f.tokens ? ` · ≈${fmtK(f.tokens)}` : ''}` : f.exists ? t('lay.notLoaded') : t('ft.missing')), h('span', { className: 'ac' }, f.exists ? h('button', { className: 'clx-more', onClick: () => preview(f.path) }, t('ft.previewShort')) : null, f.loaded && f.seq !== undefined ? h('button', { className: 'clx-more', onClick: () => onJump(f.seq) }, `#${f.seq}`) : null));
            };
            const gl = L.global || [];
            const loadedN = [...gl, ...(L.levels || []).flatMap((l) => l.files), ...(L.deeper || [])].filter((f) => f.loaded).length;
            const SRC_LABEL = { 'project-dsh': 'lay.sk.projectDsh', 'project-agents': 'lay.sk.projectAgents', custom: 'lay.sk.custom', 'user-dsh': 'lay.sk.userDsh', 'user-agents': 'lay.sk.userAgents', bundled: 'lay.sk.bundled' };
            return h('div', { className: 'clx-lay' }, noteLine, h('section', null, h('div', { className: 'clx-lay-h' }, h('b', null, t('nav.memory')), h('span', { className: 'clx-muted' }, fmt(t('lay.memSum'), { n: loadedN }))), h('div', { className: 'clx-lay-rule' }, t('lay.memRule')), h('div', { className: 'clx-lay-group' }, h('div', { className: 'clx-lay-gh' }, t('lay.global'), h('span', { className: 'clx-muted' }, t('lay.globalNote'))), gl.map((g) => row(g, tilde(g.path)))), h('div', { className: 'clx-lay-group' }, h('div', { className: 'clx-lay-gh' }, t('lay.project'), h('span', { className: 'clx-muted' }, L.root ? fmt(t('lay.rootBy'), { m: L.rootMarker }) : t('lay.noRoot'))), (L.levels || []).map((lv) => {
                const present = lv.files.filter((f) => f.exists || f.loaded);
                const absent = lv.files.filter((f) => !f.exists && !f.loaded);
                return h('div', { key: lv.dir, className: 'clx-lay-level' }, h('div', { className: 'clx-lay-dir', title: lv.dir }, h('span', { className: 'p' }, `${tilde(lv.dir)}/`), lv.isRoot ? h('span', { className: 'clx-pill' }, t('lay.root')) : null, lv.isCwd ? h('span', { className: 'clx-pill on' }, t('lay.cwd')) : null), present.map((f) => row(f)), absent.length ? h('div', { className: 'clx-lay-absent' }, `${t('lay.canPlace')} `, absent.map((f) => h('code', { key: f.name }, f.name))) : null);
            })), (L.deeper || []).length ? h('div', { className: 'clx-lay-group' }, h('div', { className: 'clx-lay-gh' }, t('lay.deeper'), h('span', { className: 'clx-muted' }, t('lay.deeperNote'))), L.deeper.map((f) => row(f, `${f.rel ? `${f.rel}/` : ''}${f.name}`))) : null), h('section', null, h('div', { className: 'clx-lay-h' }, h('b', null, t('lay.skillRoots')), h('span', { className: 'clx-muted' }, t('lay.skillRule'))), (L.skillRoots || []).map((r, i) => h('div', { key: `${r.source}-${r.path}`, className: `clx-lay-row ${r.registered ? 'loaded' : r.exists ? 'exists' : 'missing'}`, title: r.path }, h('span', { className: 'rk' }, i + 1), h('span', { className: 'nm' }, t(SRC_LABEL[r.source] || r.source), h('code', null, tilde(r.path))), h('span', { className: 'ss' }, !r.exists ? t('ft.missing') : r.registered ? fmt(t('lay.skillsN'), { n: r.registered }) : r.onDisk ? fmt(t('lay.onDisk'), { n: r.onDisk }) : t('lay.empty')), h('span', { className: 'ac' }))), (L.otherSkillSources || []).length ? h('div', { className: 'clx-lay-absent' }, `${t('lay.otherSources')} `, L.otherSkillSources.map((x) => h('code', { key: x.source }, `${x.source} ×${x.count}`))) : null));
        }
        /** Skills by name: registry, catalog entry and every load, most-loaded first. */
        function skillRows(src) {
            const sk = src.skills || {};
            const by = new Map();
            const get = (name) => {
                if (!by.has(name))
                    by.set(name, { name, loads: [] });
                return by.get(name);
            };
            for (const s of sk.registry || [])
                Object.assign(get(s.name), { reg: s });
            for (const e of sk.catalog?.entries || [])
                Object.assign(get(e.name), { cat: e });
            for (const l of sk.loaded || [])
                get(l.name).loads.push(l);
            return [...by.values()].sort((a, b) => (b.loads.length - a.loads.length) || ((b.cat ? 1 : 0) - (a.cat ? 1 : 0)) || a.name.localeCompare(b.name));
        }
        /** Every node of the file structure, flattened. */
        function treeNodes(st) {
            const out = [];
            const walk = (n) => { out.push(n); for (const k of n.children || [])
                walk(k); };
            for (const r of st?.trees || [])
                walk(r);
            return out;
        }
        function SrcLine({ color, name, badge, tok, sel, onClick, title, dim = false }) {
            return h('div', {
                className: `clx-tl clx-sl${sel ? ' sel' : ''}${dim ? ' dim' : ''}`, role: 'button', tabIndex: 0, 'aria-pressed': !!sel, onClick, title,
                onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                } },
            }, h('i', { className: 'clx-dot', style: { background: color } }), h('span', { className: 'nm' }, name), h('span', { className: 'bd' }, badge), h('span', { className: 'tk' }, tok));
        }
        function MemPanel({ f, t, onJump, preview, noteLine }) {
            return h(React.Fragment, null, h('div', { className: 'clx-mside-head' }, h('b', { className: 'clx-sp-title' }, f.displayPath), h('span', { className: `clx-pill ${f.status === 'active' ? 'on' : 'off'}` }, t(`src.mem.${f.status}`)), f.updates ? h('span', { className: 'clx-muted' }, fmt(t('src.updates'), { n: f.updates })) : null, h('span', { className: 'clx-mside-tok' }, f.tokens ? `≈${fmtK(f.tokens)} tok` : '')), h('div', { className: 'clx-mside-body' }, h('div', { className: 'clx-sp-meta' }, f.path ? h('code', { title: f.path }, f.path) : null, f.path ? h('button', { className: 'clx-chipbtn', onClick: () => preview(f.path) }, `↗ ${t('ft.preview')}`) : null, f.lastSeq !== undefined ? h('button', { className: 'clx-chipbtn', onClick: () => onJump(f.lastSeq) }, `#${f.lastSeq} ${t('src.inMessages')}`) : null), noteLine, f.status === 'removed' ? h('div', { className: 'clx-muted' }, t('src.mem.removedHint'))
                : h(RichText, { text: f.content || '', hint: 'md', t, defaultOpen: true, bare: true })));
        }
        function SkillPanel({ r, sk, sessionId, t, onJump, nodeTok, cost }) {
            const desc = r.reg?.description ?? r.cat?.description ?? '';
            return h(React.Fragment, null, h('div', { className: 'clx-mside-head' }, h('b', { className: 'clx-sp-title' }, r.name), r.loads.length ? h('span', { className: 'clx-pill on' }, fmt(t('src.loadedN'), { n: r.loads.length })) : null, h('span', { className: 'clx-pill' }, r.cat ? t('src.inCatalog') : r.reg && !r.reg.modelInvocable ? t('src.userOnly') : t('src.notInCatalog')), h('span', { className: 'clx-mside-tok', title: t('src.catCostHint') }, cost ? `${fmtK(cost)} tok` : '')), h('div', { className: 'clx-mside-body' }, desc ? h('div', { className: 'clx-sp-desc' }, desc) : null, h('div', { className: 'clx-sp-kv' }, h('span', null, h('i', null, t('src.k.provider')), r.reg?.provider || '—'), h('span', null, h('i', null, t('src.k.source')), r.reg?.source || '—'), h('span', null, h('i', null, t('src.k.invocation')), r.reg ? [r.reg.modelInvocable ? t('src.inv.model') : null, r.reg.userInvocable ? t('src.inv.user') : null].filter(Boolean).join(' · ') || '—' : '—')), h('div', { className: 'clx-sp-meta' }, h('code', null, r.reg?.path || r.loads[0]?.base || '—')), r.reg?.whenToUse ? h('div', { className: 'clx-sp-desc' }, h('span', { className: 'clx-muted' }, `${t('src.k.whenToUse')}: `), r.reg.whenToUse) : null, r.loads.length ? h('div', { className: 'clx-sp-loads' }, h('div', { className: 'clx-tp-h' }, t('src.loads')), r.loads.map((l) => h('div', { key: l.seq, className: 'clx-tl clx-sl', role: 'button', tabIndex: 0, onClick: () => onJump(l.seq) }, h('i', { className: 'clx-dot', style: { background: CAT_COLOR.skills } }), h('span', { className: 'nm' }, `#${l.seq} · ${fmtTime(l.time)}`), h('span', { className: 'bd' }, `${t(`src.via.${l.via}`)}${l.isError ? ' · ⚠' : ''}`), h('span', { className: 'tk' }, fmtK(nodeTok[l.seq] ?? l.tokensEst))))) : null, sk.registryAvailable ? h('div', { className: 'clx-tp-def' }, h(SkillBody, { sessionId, name: r.name, t })) : null));
        }
        /** 来源: what entered the context from outside the conversation, as a list on the left and the picked item on the right. */
        function SourcesTab({ sessionId, liveKey, bd, t, onJump, ctx }) {
            const { data: src, error } = useSources(sessionId, liveKey);
            const [rootRef, rootW] = useWidth(800);
            const wide = rootW >= 760;
            const [sel, setSel] = useState(null);
            const [q, setQ] = useState('');
            const [filter, setFilter] = useState('all');
            const [allSkills, setAllSkills] = useState(false);
            const [noteLine, preview] = useSidebarPreview(ctx, sessionId, src?.cwd, t);
            const rows = useMemo(() => (src ? skillRows(src) : []), [src]);
            const cost = useMemo(() => {
                const m = {};
                for (const s of bd?.skills || [])
                    m[s.name] = s.tokensCal;
                return m;
            }, [bd]);
            const nodeTok = useMemo(() => {
                const m = {};
                for (const n of bd?.nodes || [])
                    m[n.seq] = n.tokensCal;
                return m;
            }, [bd]);
            if (error && !src)
                return h('div', { className: 'clx-err' }, fmt(t('failed'), { msg: error }));
            if (!src)
                return h('div', { className: 'clx-muted' }, t('loading'));
            const sk = src.skills || {};
            const files = src.memory?.files || [];
            const active = files.filter((f) => f.status === 'active');
            const memTok = active.reduce((s, f) => s + (f.tokens || 0), 0);
            const loaded = rows.filter((r) => r.loads.length);
            const inCat = rows.filter((r) => r.cat);
            const catTok = Object.values(cost).reduce((a, b) => a + b, 0);
            const loadTok = (sk.loaded || []).reduce((s, l) => s + (nodeTok[l.seq] ?? l.tokensEst ?? 0), 0);
            const rt = [...(src.runtime?.sections || []), ...(src.timeContext ? [{ name: 'time-context', text: src.timeContext.text }] : [])];
            const L = src.layout;
            const layFiles = L ? [...(L.global || []), ...(L.levels || []).flatMap((l) => l.files), ...(L.deeper || [])] : [];
            const tree = L ? [1] : treeNodes(src.structure);
            const treeLoaded = layFiles.filter((f) => f.loaded).length;
            const treeExists = layFiles.filter((f) => f.exists && !f.loaded).length;
            const query = q.trim().toLowerCase();
            const skillShown = rows.filter((r) => (filter === 'all' || (filter === 'loaded' ? r.loads.length : filter === 'catalog' ? r.cat : !r.cat))
                && (!query || r.name.toLowerCase().includes(query) || (r.reg?.description || r.cat?.description || '').toLowerCase().includes(query)));
            const skillList = allSkills || query ? skillShown : skillShown.slice(0, 12);
            const memShown = files.filter((f) => !query || f.displayPath.toLowerCase().includes(query));
            const fallback = active[0] ? `m:${active[0].displayPath}` : loaded[0] ? `s:${loaded[0].name}` : rt.length ? 'rt' : tree.length ? 'ft' : null;
            const current = sel ?? (wide ? fallback : null);
            const pick = (id) => setSel(current === id && !wide ? null : id);
            const panelFor = (id) => {
                if (!id)
                    return null;
                if (id.startsWith('m:')) {
                    const f = files.find((x) => `m:${x.displayPath}` === id);
                    return f ? h(MemPanel, { key: id, f, t, onJump, preview, noteLine }) : null;
                }
                if (id.startsWith('s:')) {
                    const r = rows.find((x) => `s:${x.name}` === id);
                    return r ? h(SkillPanel, { key: id, r, sk, sessionId, t, onJump, nodeTok, cost: cost[r.name] }) : null;
                }
                if (id === 'rt') {
                    return h(React.Fragment, { key: id }, h('div', { className: 'clx-mside-head' }, h('b', { className: 'clx-sp-title' }, t('src.runtime')), src.runtime ? h('button', { className: 'clx-chipbtn', style: { marginLeft: 'auto' }, onClick: () => onJump(src.runtime.seq) }, `#${src.runtime.seq} ${t('src.inMessages')}`) : null), h('div', { className: 'clx-mside-body' }, h('div', { className: 'clx-note', style: { marginBottom: 8 } }, t('src.runtimeHint')), h('div', { className: 'clx-rt-list' }, rt.map((s) => h('div', { key: s.name, className: 'clx-rt' }, h('span', { className: 'k', title: s.name }, RT_NAME[s.name] ? t(RT_NAME[s.name]) : s.name), h('span', { className: 'v' }, s.text))))));
                }
                if (id === 'ft') {
                    return h(React.Fragment, { key: id }, h('div', { className: 'clx-mside-head' }, h('b', { className: 'clx-sp-title' }, t('lay.title')), h('span', { className: 'clx-muted' }, t('lay.sub'))), h('div', { className: 'clx-mside-body' }, h(AgentLayout, { src, t, onJump, ctx, sessionId })));
                }
                return null;
            };
            const inline = (id) => (!wide && current === id ? h('div', { className: 'clx-tl-inline clx-sp-inline' }, panelFor(id)) : null);
            const list = h('div', { className: 'clx-tlists' }, h('div', { className: 'clx-msgsearch clx-tsearch' }, h('svg', { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': true }, h('circle', { cx: 11, cy: 11, r: 6.5 }), h('path', { d: 'M16 16l4 4' })), h('input', { value: q, placeholder: t('src.search'), onChange: (e) => setQ(e.target.value) }), q ? h('button', { className: 'clx-msgclear', onClick: () => setQ('') }, '×') : null), h('div', { className: 'clx-card clx-tcard' }, h('div', { className: 'clx-card-head' }, h('h4', null, t('nav.memory')), h('span', { className: 'clx-muted' }, active.length ? fmt(t('src.memoryCount'), { n: active.length, t: fmtK(memTok) }) : t('src.memoryZero'))), memShown.length ? memShown.map((f) => {
                const id = `m:${f.displayPath}`;
                return h(React.Fragment, { key: id }, h(SrcLine, {
                    color: CAT_COLOR.memory, name: f.displayPath, title: f.path, sel: current === id, onClick: () => pick(id), dim: f.status !== 'active',
                    badge: [t(`src.mem.${f.status}`), f.updates ? fmt(t('src.updates'), { n: f.updates }) : null].filter(Boolean).join(' · '),
                    tok: f.tokens ? fmtK(f.tokens) : '—',
                }), inline(id));
            }) : h('div', { className: 'clx-tempty clx-muted' }, query ? t('msg.none') : t('src.memNoneShort'))), h('div', { className: 'clx-card clx-tcard' }, h('div', { className: 'clx-card-head' }, h('h4', null, t('src.skills')), h('span', { className: 'clx-muted' }, rows.length ? fmt(t('src.skillsShort'), { n: rows.length, l: loaded.length, lt: fmtK(loadTok), c: inCat.length, ct: fmtK(catTok) }) : '')), rows.length ? h('div', { className: 'clx-sp-filters' }, ['all', 'loaded', 'catalog', 'hidden'].map((k) => h('button', { key: k, className: 'clx-chipbtn', 'aria-pressed': filter === k, onClick: () => setFilter(k) }, t(`src.f.${k}`), h('small', null, ` ${k === 'all' ? rows.length : k === 'loaded' ? loaded.length : k === 'catalog' ? inCat.length : rows.length - inCat.length}`)))) : null, sk.registryAvailable === false ? h('div', { className: 'clx-note', style: { padding: '0 8px 4px' } }, t('src.noRegistry')) : null, skillList.length ? skillList.map((r) => {
                const id = `s:${r.name}`;
                return h(React.Fragment, { key: id }, h(SrcLine, {
                    color: r.loads.length ? CAT_COLOR.skills : r.cat ? 'color-mix(in srgb, #EDC948 45%, transparent)' : 'var(--dsw-alias-border-l3)',
                    name: r.name, title: r.reg?.description || r.cat?.description || '', sel: current === id, onClick: () => pick(id), dim: !r.cat && !r.loads.length,
                    badge: r.loads.length ? fmt(t('src.loadedN'), { n: r.loads.length }) : r.cat ? t('src.inCatalog') : r.reg && !r.reg.modelInvocable ? t('src.userOnly') : t('src.notInCatalog'),
                    tok: cost[r.name] ? fmtK(cost[r.name]) : '',
                }), inline(id));
            }) : h('div', { className: 'clx-tempty clx-muted' }, rows.length ? t('src.skillsNone') : t('src.skillsZero')), !query && skillShown.length > 12 ? h('button', { className: 'clx-chipbtn clx-tmore', onClick: () => setAllSkills(!allSkills) }, allSkills ? t('ui.collapseAll') : fmt(t('tools.showAllDefs'), { n: skillShown.length })) : null), h('div', { className: 'clx-card clx-tcard' }, h('div', { className: 'clx-card-head' }, h('h4', null, t('src.env'))), rt.length ? h(React.Fragment, null, h(SrcLine, { color: CAT_COLOR.injected, name: t('src.runtime'), badge: fmt(t('src.itemsN'), { n: rt.length }), tok: '', sel: current === 'rt', onClick: () => pick('rt') }), inline('rt')) : null, tree.length ? h(React.Fragment, null, h(SrcLine, { color: '#5DA9A0', name: t('lay.title'), badge: fmt(t('src.treeSum'), { e: treeExists, l: treeLoaded }), tok: '', sel: current === 'ft', onClick: () => pick('ft') }), inline('ft')) : null));
            return h('div', { className: 'clx-sources2', ref: rootRef }, h('div', { className: 'clx-tiles clx-tsum' }, h(Stat, { k: t('src.sum.mem'), v: fmtInt(active.length), sub: active.length ? ` ≈${fmtK(memTok)}` : undefined }), h(Stat, { k: t('src.sum.loaded'), v: fmtInt(loaded.length), sub: loaded.length ? ` ${fmtK(loadTok)}` : undefined }), h(Stat, { k: t('src.sum.catalog'), v: fmtInt(inCat.length), sub: catTok ? ` ${fmtK(catTok)}` : undefined }), h(Stat, { k: t('src.sum.all'), v: fmtInt(rows.length) }), h(Stat, { k: t('src.sum.rt'), v: fmtInt(rt.length) })), wide
                ? h('div', { className: 'clx-tsplit' }, list, h('aside', { className: 'clx-mside' }, current ? panelFor(current) : h('div', { className: 'clx-mside-empty' }, t('src.pick'))))
                : list);
        }
        /** Pixel width of an element, so charts draw at their real size (fixed text, fixed height). */
        function useWidth(fallback) {
            const ref = useRef(null);
            const [w, setW] = useState(fallback);
            useLayoutEffect(() => {
                const el = ref.current;
                if (!el || typeof ResizeObserver === 'undefined')
                    return undefined;
                const ro = new ResizeObserver(([e]) => {
                    const next = Math.round(e.contentRect.width);
                    if (next > 0)
                        setW(next);
                });
                ro.observe(el);
                return () => ro.disconnect();
            }, []);
            return [ref, w];
        }
        function Trend({ data, t, onJump }) {
            const [boxRef, boxW] = useWidth(640);
            const [scale, setScale] = useState('fit');
            const [mode, setMode] = useState('nodes');
            const [hover, setHover] = useState(null);
            const nodes = data.nodes || [];
            const s = summarize(data);
            const comp = s.comp;
            const W = Math.max(320, boxW);
            const H = 230;
            const P = { l: 46, r: 10, t: 10, b: 52 };
            const strip = 34;
            const last = nodes.length ? nodes[nodes.length - 1].cumulative : 0;
            const base = Math.max(0, s.used - last);
            const yMax = scale === 'window' && s.win ? s.win : Math.max(1, (base + last) * 1.12);
            const n = Math.max(1, nodes.length);
            const x = (i) => P.l + (W - P.l - P.r) * (nodes.length <= 1 ? 0.5 : i / (nodes.length - 1));
            const y = (v) => P.t + (H - P.t - P.b - strip) * (1 - Math.min(1, v / yMax));
            const area = nodes.length
                ? `M${x(0)},${y(0)} ` + nodes.map((nd, i) => `L${x(i).toFixed(1)},${y(base + nd.cumulative).toFixed(1)}`).join(' ') + ` L${x(nodes.length - 1)},${y(0)} Z`
                : '';
            const line = nodes.map((nd, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(base + nd.cumulative).toFixed(1)}`).join(' ');
            const maxNode = Math.max(1, ...nodes.map((nd) => nd.tokensCal));
            const stripTop = H - P.b - strip + 6;
            const bw = Math.max(0.6, (W - P.l - P.r) / n - 0.4);
            const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
            const onMove = (e) => {
                const svg = e.currentTarget;
                const r = svg.getBoundingClientRect();
                const px = (e.clientX - r.left) / r.width * W;
                const i = Math.round((px - P.l) / (W - P.l - P.r) * (nodes.length - 1));
                setHover(i >= 0 && i < nodes.length ? i : null);
            };
            const hv = hover !== null ? nodes[hover] : null;
            const turns = data.turns || [];
            const tMax = Math.max(1, ...turns.map((x) => x.tokens));
            const TW = W;
            const TH = 120;
            const tbw = (TW - 50) / Math.max(1, turns.length);
            const modeBtn = (k) => h('button', { key: k, className: 'clx-chipbtn', 'aria-pressed': mode === k, onClick: () => setMode(k) }, t(`trend.mode.${k}`));
            return h('div', { className: 'clx-card', ref: boxRef }, h('div', { className: 'clx-card-head' }, h('h4', null, t('ov.trend')), h('span', { className: 'clx-segmini' }, modeBtn('nodes'), turns.length ? modeBtn('turns') : null), mode === 'nodes' ? h('span', { className: 'clx-segmini' }, h('button', { className: 'clx-chipbtn', 'aria-pressed': scale === 'fit', onClick: () => setScale('fit') }, t('trend.scale.fit')), h('button', { className: 'clx-chipbtn', 'aria-pressed': scale === 'window', onClick: () => setScale('window') }, t('trend.scale.window'))) : null), mode === 'turns' && turns.length ? h(React.Fragment, null, h('div', { className: 'clx-muted', style: { fontSize: 12, marginBottom: 4 } }, t('trend.turns')), h('svg', { className: 'clx-svg', viewBox: `0 0 ${TW} ${TH}`, width: '100%', style: { display: 'block' } }, h('text', { x: 44, y: 12, textAnchor: 'end' }, fmtK(tMax)), h('text', { x: 44, y: TH - 18, textAnchor: 'end' }, '0'), turns.map((tu, i) => {
                const hh = Math.max(1, tu.tokens / tMax * (TH - 30));
                return h('g', { key: tu.turn }, h('rect', { x: 50 + i * tbw + 1, width: Math.max(1, tbw - 2), y: TH - 20 - hh, height: hh, rx: 2, fill: 'var(--dsw-alias-state-business-primary)', opacity: 0.75 }, h('title', null, `${fmt(t('msg.turn'), { n: tu.turn })}: ${fmtInt(tu.tokens)} · ${tu.nodes}`)), turns.length <= 40 || i % Math.ceil(turns.length / 40) === 0
                    ? h('text', { x: 50 + i * tbw + tbw / 2, y: TH - 6, textAnchor: 'middle' }, String(tu.turn)) : null);
            })))
                : h(React.Fragment, null, h('svg', { className: 'clx-svg', viewBox: `0 0 ${W} ${H}`, width: '100%', style: { display: 'block', cursor: 'crosshair' }, onMouseMove: onMove, onMouseLeave: () => setHover(null), onClick: () => { if (hv)
                        onJump(hv.seq); } }, ticks.map((v, i) => h('g', { key: i }, h('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), stroke: 'var(--dsw-alias-border-l1)' }), h('text', { x: P.l - 6, y: y(v) + 3, textAnchor: 'end' }, fmtK(v)))), area ? h('path', { className: 'clx-trend-area', d: area, fill: 'var(--dsw-alias-state-business-primary)', opacity: 0.14 }) : null, line ? h('path', { className: 'clx-trend-line', pathLength: 1, d: line, fill: 'none', stroke: 'var(--dsw-alias-state-business-primary)', strokeWidth: 1.6 }) : null, comp && comp.thresholdTokens && comp.thresholdTokens <= yMax ? h('g', null, h('line', { x1: P.l, x2: W - P.r, y1: y(comp.thresholdTokens), y2: y(comp.thresholdTokens), stroke: 'var(--dsw-alias-state-warn-primary)', strokeDasharray: '4 3' }), h('text', { x: W - P.r, y: y(comp.thresholdTokens) - 3, textAnchor: 'end' }, `${t('trend.threshold')} ${fmtK(comp.thresholdTokens)}`)) : null, s.win && s.win <= yMax ? h('g', null, h('line', { x1: P.l, x2: W - P.r, y1: y(s.win), y2: y(s.win), stroke: 'var(--dsw-alias-state-error-primary)', strokeDasharray: '2 3' }), h('text', { x: W - P.r, y: y(s.win) + 11, textAnchor: 'end' }, `${t('trend.window')} ${fmtK(s.win)}`)) : null, nodes.map((nd, i) => h('rect', {
                    key: nd.seq, x: x(i) - bw / 2, width: bw,
                    y: stripTop + strip - 6 - Math.max(1, nd.tokensCal / maxNode * (strip - 6)),
                    height: Math.max(1, nd.tokensCal / maxNode * (strip - 6)),
                    fill: CAT_COLOR[nd.category] || CAT_COLOR.other,
                })), hv ? h('line', { x1: x(hover), x2: x(hover), y1: P.t, y2: stripTop + strip - 6, stroke: 'var(--dsw-alias-label-tertiary)', strokeWidth: 0.8 }) : null, hv ? h('circle', { cx: x(hover), cy: y(base + hv.cumulative), r: 3, fill: 'var(--dsw-alias-state-business-primary)' }) : null, h('text', { x: P.l, y: H - 6 }, nodes.length ? `#${nodes[0].seq}` : ''), h('text', { x: W - P.r, y: H - 6, textAnchor: 'end' }, nodes.length ? `#${nodes[nodes.length - 1].seq}` : '')), h('div', { className: 'clx-tip' }, hv
                    ? h(React.Fragment, null, h('span', { className: 'clx-tag' }, h('i', { className: 'clx-dot', style: { background: CAT_COLOR[hv.category] } }), `#${hv.seq} ${t(`c.${hv.category}`)}`), ` · +${fmtK(hv.tokensCal)} → ${fmtK(base + hv.cumulative)}`, hv.time ? ` · ${fmtTime(hv.time)}` : '', h('div', { className: 'clx-muted' }, hv.tool || (hv.tools || []).join(', ') || hv.preview || ''))
                    : h('span', { className: 'clx-muted' }, t('trend.hint'))), h('div', { className: 'clx-legend', style: { marginTop: 6 } }, CATS.filter((k) => s.byCat[k]?.count).map((k) => h('span', { key: k }, h('i', { className: 'clx-dot', style: { background: CAT_COLOR[k] } }), t(`c.${k}`))))));
        }
        // ================================================================== execution flow
        // Lifecycle diagram of this conversation showing where it is now, or where a
        // chosen step of its trajectory went, with the context each stage holds.
        const FW = 600;
        const MAIN_X = 345;
        const MAIN_W = 210;
        const SIDE_X = 88;
        const SIDE_W = 150;
        const NH = 34;
        const FLOW_NODES = [
            { key: 'sessionStart', y: 34, tone: 'green' },
            { key: 'userPrompt', y: 104, tone: 'grey' },
            { key: 'turnStart', y: 164, tone: 'grey' },
            { key: 'stepStart', y: 250, tone: 'cream', loop: true },
            { key: 'assistant', y: 310, tone: 'cream', loop: true },
            { key: 'toolCall', y: 370, tone: 'cream', loop: true },
            { key: 'toolExec', y: 430, tone: 'blue', loop: true },
            { key: 'toolResult', y: 490, tone: 'cream', loop: true },
            { key: 'subagent', y: 550, tone: 'cream', loop: true },
            { key: 'todo', y: 610, tone: 'cream', loop: true },
            { key: 'stepEnd', y: 670, tone: 'cream', loop: true },
            { key: 'turnEnd', y: 752, tone: 'red' },
            { key: 'compaction', y: 822, tone: 'grey' },
            // side column (dashed, conditional / async)
            { key: 'goal', y: 34, side: true },
            { key: 'goalRound', y: 104, side: true },
            { key: 'inbox', y: 164, side: true },
            { key: 'context', y: 250, side: true },
            { key: 'approval', y: 370, side: true },
            { key: 'modelSwitch', y: 490, side: true },
            { key: 'plan', y: 550, side: true },
            { key: 'schedule', y: 610, side: true },
            { key: 'title', y: 670, side: true },
            { key: 'deliverables', y: 752, side: true },
            { key: 'workspace', y: 822, side: true },
        ];
        const FLOW_H = 866;
        const NODE = Object.fromEntries(FLOW_NODES.map((n, i) => [n.key, { ...n, i, x: n.side ? SIDE_X : MAIN_X, w: n.side ? SIDE_W : MAIN_W }]));
        const MAIN_ORDER = FLOW_NODES.filter((n) => !n.side).map((n) => n.key);
        const TONE = {
            green: ['rgba(76,175,110,.20)', 'rgba(76,175,110,.75)'],
            grey: ['rgba(140,146,160,.16)', 'rgba(140,146,160,.55)'],
            cream: ['rgba(242,190,90,.17)', 'rgba(222,160,70,.75)'],
            blue: ['rgba(70,140,220,.85)', 'rgba(70,140,220,1)'],
            red: ['rgba(230,110,110,.22)', 'rgba(220,100,100,.8)'],
        };
        const LOOP_CH = MAIN_X + MAIN_W / 2 + 26;
        const TURN_CH = MAIN_X + MAIN_W / 2 + 58;
        /** Polyline a pulse travels from stage a to stage b. */
        function flowRoute(a, b) {
            const A = NODE[a];
            const B = NODE[b];
            if (!A || !B)
                return null;
            if (a === b)
                return [[A.x + A.w / 2, A.y], [A.x + A.w / 2 + 14, A.y], [A.x + A.w / 2, A.y]];
            if (A.side || B.side) {
                const ax = A.x < B.x ? A.x + A.w / 2 : A.x - A.w / 2;
                const bx = A.x < B.x ? B.x - B.w / 2 : B.x + B.w / 2;
                if (A.x === B.x)
                    return [[A.x - A.w / 2, A.y], [A.x - A.w / 2 - 12, A.y], [B.x - B.w / 2 - 12, B.y], [B.x - B.w / 2, B.y]];
                return [[ax, A.y], [(ax + bx) / 2, A.y], [(ax + bx) / 2, B.y], [bx, B.y]];
            }
            const ia = MAIN_ORDER.indexOf(a);
            const ib = MAIN_ORDER.indexOf(b);
            if (ib === ia + 1)
                return [[A.x, A.y + NH / 2], [B.x, B.y - NH / 2]];
            const ch = A.loop && B.loop ? LOOP_CH : TURN_CH;
            return [[A.x + A.w / 2, A.y], [ch, A.y], [ch, B.y], [B.x + B.w / 2, B.y]];
        }
        function arrowPath(points) {
            return points.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
        }
        /** Which context categories each stage's content lands in. */
        const STAGE_CATS = {
            context: ['system', 'skills', 'memory', 'injected'],
            userPrompt: ['user'],
            goalRound: [],
            stepStart: ['systemTools', 'mcpTools'],
            assistant: ['assistantText', 'reasoning'],
            toolCall: ['toolCalls'],
            toolResult: ['toolResults'],
            compaction: ['summary'],
        };
        function stageTokens(byCat) {
            const out = {};
            for (const [stage, cats] of Object.entries(STAGE_CATS)) {
                const v = cats.reduce((s, k) => s + (byCat[k] || 0), 0);
                if (v > 0)
                    out[stage] = v;
            }
            return out;
        }
        /**
         * Context composition as of one request: every node appended before it,
         * plus tool definitions. Scaled to the request's reported prompt when known.
         */
        function compositionAt(bd, step) {
            const by = {};
            for (const k of CATS)
                by[k] = 0;
            if (!bd)
                return { by, total: 0, exact: false };
            const cut = step.requestSeq ?? step.endSeq ?? step.startSeq;
            for (const n of bd.nodes || []) {
                if (!(n.seq < cut))
                    continue;
                const cal = n.tokens ? (n.tokensCal ?? n.tokens) / n.tokens : 1;
                if (n.split)
                    for (const [k, v] of Object.entries(n.split))
                        by[k] = (by[k] || 0) + v * cal;
                else
                    by[n.category] = (by[n.category] || 0) + (n.tokensCal ?? n.tokens ?? 0);
            }
            for (const c of bd.categories || [])
                if (c.key === 'systemTools' || c.key === 'mcpTools')
                    by[c.key] = c.tokens;
            const est = Object.values(by).reduce((a, b) => a + b, 0);
            const exact = typeof step.promptTokens === 'number' && step.promptTokens > 0 && est > 0;
            if (exact) {
                const f = step.promptTokens / est;
                for (const k of Object.keys(by))
                    by[k] *= f;
            }
            return { by, total: exact ? step.promptTokens : est, exact };
        }
        function FlowDiagram({ t, totals, badges, path, focus, phase, goal, onPick }) {
            const edges = [];
            for (let i = 0; i + 1 < MAIN_ORDER.length; i++) {
                const a = MAIN_ORDER[i];
                const b = MAIN_ORDER[i + 1];
                if (a === 'stepEnd')
                    continue;
                edges.push({ key: `${a}-${b}`, d: arrowPath(flowRoute(a, b)), dashed: b === 'compaction' });
            }
            edges.push({ key: 'stepEnd-turnEnd', d: arrowPath([[MAIN_X, NODE.stepEnd.y + NH / 2], [MAIN_X, NODE.turnEnd.y - NH / 2]]) });
            const loop = flowRoute('stepEnd', 'stepStart');
            const turnLoop = flowRoute('turnEnd', 'userPrompt');
            const side = (a, b, dashed = true) => ({ key: `${a}-${b}`, d: arrowPath(flowRoute(a, b)), dashed, side: true });
            edges.push(side('goal', 'goalRound'), side('goalRound', 'userPrompt'), side('inbox', 'turnStart'), side('context', 'stepStart'), side('toolCall', 'approval'), side('approval', 'toolExec'));
            const box = (x1, y1, x2, y2, color, label) => h('g', null, h('rect', { x: x1, y: y1, width: x2 - x1, height: y2 - y1, rx: 10, fill: 'none', stroke: color, strokeDasharray: '5 4', strokeWidth: 1.4, opacity: 0.8 }), h('text', { x: x1 + 12, y: y1 + 18, className: 'clx-flow-boxlabel', fill: color }, label));
            const loopX1 = MAIN_X - MAIN_W / 2 - 22;
            // the highlighted trajectory: consecutive stages, numbered by first visit
            const order = {};
            const trace = [];
            (path || []).forEach((s, i) => {
                if (!NODE[s])
                    return;
                if (order[s] === undefined)
                    order[s] = Object.keys(order).length + 1;
                const prev = path[i - 1];
                if (prev && NODE[prev] && prev !== s)
                    trace.push({ key: `${i}-${prev}-${s}`, d: arrowPath(flowRoute(prev, s)) });
            });
            const hasPath = trace.length > 0 || Object.keys(order).length > 0;
            const accent = phase === 'approval' ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-state-business-primary)';
            return h('svg', { className: 'clx-flow', viewBox: `0 0 ${FW} ${FLOW_H}`, width: '100%', style: { display: 'block', maxWidth: FW } }, h('defs', null, h('marker', { id: 'clx-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, h('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--dsw-alias-label-tertiary)' })), h('marker', { id: 'clx-arrow-hot', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, h('path', { d: 'M0,0 L10,5 L0,10 z', fill: accent }))), box(loopX1 - 14, NODE.userPrompt.y - 32, TURN_CH + 14, NODE.turnEnd.y + 30, 'rgba(70,140,220,.9)', t('flow.box.turn')), box(loopX1, NODE.stepStart.y - 42, LOOP_CH + 12, NODE.stepEnd.y + 30, 'rgba(222,150,90,.95)', t('flow.box.loop')), edges.map((e) => h('path', { key: e.key, d: e.d, fill: 'none', stroke: 'var(--dsw-alias-label-tertiary)', strokeWidth: 1.3, strokeDasharray: e.dashed ? '4 3' : undefined, opacity: hasPath ? 0.35 : e.side ? 0.6 : 0.85, markerEnd: 'url(#clx-arrow)' })), h('path', { d: arrowPath(loop), fill: 'none', stroke: 'rgba(222,150,90,.95)', strokeWidth: 1.4, opacity: hasPath ? 0.45 : 1, markerEnd: 'url(#clx-arrow)' }), h('path', { d: arrowPath(turnLoop), fill: 'none', stroke: 'rgba(70,140,220,.9)', strokeWidth: 1.4, opacity: hasPath ? 0.45 : 1, markerEnd: 'url(#clx-arrow)' }), h('text', { x: TURN_CH + 6, y: (NODE.userPrompt.y + NODE.turnEnd.y) / 2, className: 'clx-flow-side', transform: `rotate(90 ${TURN_CH + 6} ${(NODE.userPrompt.y + NODE.turnEnd.y) / 2})`, textAnchor: 'middle' }, t('flow.nextTurn')), trace.map((e) => h('path', { key: e.key, d: e.d, className: 'clx-flow-trace', style: { stroke: accent }, markerEnd: 'url(#clx-arrow-hot)' })), FLOW_NODES.map((n) => {
                const N = NODE[n.key];
                const total = totals[n.key] || 0;
                const tokens = badges[n.key] || 0;
                const [fill, stroke] = n.side ? ['transparent', 'var(--dsw-alias-border-l3)'] : TONE[n.tone];
                const isFocus = focus === n.key;
                const inPath = order[n.key] !== undefined;
                const dim = hasPath ? !inPath && !isFocus : !total && !tokens;
                const inv = n.tone === 'blue';
                const label = n.key === 'goal' && goal ? `${t('flow.n.goal')} · ${t(`flow.phase.${goal.phase}`) || goal.phase}` : t(`flow.n.${n.key}`);
                const left = N.x - N.w / 2;
                return h('g', {
                    key: n.key, className: `clx-flow-node${isFocus ? ' active' : ''}`,
                    opacity: dim ? (tokens ? 0.5 : 0.3) : 1, style: { cursor: total ? 'pointer' : 'default' },
                    onClick: () => { if (total)
                        onPick(n.key); },
                }, h('title', null, `${t(`flow.n.${n.key}`)} — ${t(`flow.d.${n.key}`)}\n${fmt(t('flow.tip'), { n: fmtInt(total), k: tokens ? fmtInt(Math.round(tokens)) : '—' })}`), isFocus ? h('rect', { className: 'clx-flow-glow', x: left - 5, y: N.y - NH / 2 - 5, width: N.w + 10, height: NH + 10, rx: 12, fill: 'none', stroke: accent, strokeWidth: 2.4 }) : null, h('rect', { x: left, y: N.y - NH / 2, width: N.w, height: NH, rx: 8, fill, stroke: inPath || isFocus ? accent : stroke, strokeWidth: inPath || isFocus ? 1.8 : 1.1, strokeDasharray: n.side && !inPath ? '4 3' : undefined }), h('text', { x: left + (inPath ? 28 : 10), y: N.y + 4, className: `clx-flow-label${inv ? ' inv' : ''}${n.side ? ' side' : ''}` }, label), total || tokens ? h('text', { x: left + N.w - 8, y: N.y + 4, textAnchor: 'end' }, total ? h('tspan', { className: `clx-flow-count${inv ? ' inv' : ''}` }, `×${total}`) : null, tokens ? h('tspan', { className: `clx-flow-tok${inv ? ' inv' : ''}`, dx: total ? 6 : 0 }, fmtK(tokens)) : null) : null, inPath ? h('g', null, h('circle', { cx: left + 14, cy: N.y, r: 8.5, fill: accent }), h('text', { x: left + 14, y: N.y + 3.5, textAnchor: 'middle', className: 'clx-flow-num' }, order[n.key])) : null);
            }));
        }
        const LIVE_COLOR = {
            idle: 'var(--dsw-alias-label-tertiary)',
            running: 'var(--dsw-alias-state-business-primary)',
            tool: 'rgba(70,140,220,1)',
            approval: 'var(--dsw-alias-state-warn-primary)',
        };
        function useNow(active) {
            const [now, setNow] = useState(() => Date.now());
            useEffect(() => {
                if (!active)
                    return undefined;
                const id = setInterval(() => setNow(Date.now()), 1000);
                return () => clearInterval(id);
            }, [active]);
            return now;
        }
        function CompositionBar({ by, win, t }) {
            const segs = GROUPS.map((g) => ({ key: g.key, label: t(`g.${g.key}`) || g.key, color: g.color, tokens: g.cats.reduce((s, k) => s + (by[k] || 0), 0) }));
            const rows = CATS.map((k) => ({ k, v: by[k] || 0 })).filter((r) => r.v >= 1).sort((a, b) => b.v - a.v).slice(0, 6);
            return h('div', null, h(UsageBar, { segments: segs, win, buffer: 0 }), h('div', { className: 'clx-flow-comp' }, rows.map((r) => h('span', { key: r.k }, h('i', { className: 'clx-dot', style: { background: CAT_COLOR[r.k] } }), ` ${t(`c.${r.k}`)} `, h('b', null, fmtK(r.v))))));
        }
        function StepRow({ s, win, sel, onPick, t }) {
            const w = win && s.promptTokens ? Math.min(100, s.promptTokens / win * 100) : 0;
            const tools = s.tools.length ? [...new Set(s.tools)].map((x) => {
                const n = s.tools.filter((y) => y === x).length;
                return n > 1 ? `${x}×${n}` : x;
            }).join(', ') : (s.stages.includes('assistant') ? t('flow.textOnly') : '—');
            return h('div', { className: `clx-flow-step${sel ? ' sel' : ''}`, onClick: onPick, title: s.stages.map((x) => t(`flow.n.${x}`)).join(' → ') }, h('span', { className: 'clx-muted', style: { fontVariantNumeric: 'tabular-nums' } }, `#${s.step}`), h('span', { className: 'clx-flow-step-tools' }, s.status === 'running' ? h('i', { className: 'clx-live-dot', style: { background: LIVE_COLOR.running, marginRight: 5 } }) : null, tools, s.errors ? h('span', { className: 'clx-err' }, ` ⚠${s.errors}`) : null, s.status === 'interrupted' ? h('span', { className: 'clx-warn' }, ` · ${t('flow.status.interrupted')}`) : null), h('span', { className: 'clx-flow-step-ctx', title: s.promptTokens ? fmtInt(s.promptTokens) : '' }, h('span', { className: 'clx-flow-mini' }, h('span', { style: { width: `${w}%` } })), h('span', { className: 'clx-muted' }, s.promptTokens ? fmtK(s.promptTokens) : '—')));
        }
        function FlowTab({ sessionId, liveKey, bd, t, onJump }) {
            const [data, setData] = useState(null);
            const [error, setError] = useState(null);
            const [selKey, setSelKey] = useState(null);
            const [open, setOpen] = useState({});
            const [tick, setTick] = useState(0);
            useEffect(() => {
                let dead = false;
                call('flow', { sessionId }).then((v) => {
                    if (dead)
                        return;
                    setData(v);
                    setError(null);
                }, (e) => { if (!dead)
                    setError(String(e?.message || e)); });
                return () => { dead = true; };
            }, [sessionId, liveKey, tick]);
            const live = data?.live;
            const busy = !!live && live.phase !== 'idle';
            // while a turn is open, keep the state current
            useEffect(() => {
                if (!busy)
                    return undefined;
                const id = setTimeout(() => setTick((x) => x + 1), 2500);
                return () => clearTimeout(id);
            }, [busy, data]);
            const now = useNow(busy);
            const listRef = useRef(null);
            const stick = useRef(true);
            useEffect(() => {
                const el = listRef.current?.querySelector('.clx-flow-step.sel');
                if (el)
                    el.scrollIntoView({ block: 'nearest' });
            }, [selKey]);
            // oldest first, like the conversation; stay pinned to the newest step unless scrolled up
            const stepCount = data?.steps?.length || 0;
            useLayoutEffect(() => {
                const el = listRef.current;
                if (el && stick.current && selKey === null)
                    el.scrollTop = el.scrollHeight;
            }, [stepCount, !!data]);
            const onListScroll = (e) => {
                const el = e.currentTarget;
                stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
            };
            const steps = data?.steps || [];
            const selIdx = selKey === null ? -1 : steps.findIndex((s) => s.startSeq === selKey);
            const sel = selIdx >= 0 ? steps[selIdx] : null;
            const s = summarize(bd);
            const win = s.win;
            const badges = useMemo(() => {
                if (sel)
                    return stageTokens(compositionAt(bd, sel).by);
                const by = {};
                for (const c of bd?.categories || [])
                    by[c.key] = c.tokens;
                return stageTokens(by);
            }, [bd, sel]);
            const byTurn = useMemo(() => {
                const m = new Map();
                for (const st of steps) {
                    if (!m.has(st.turn))
                        m.set(st.turn, []);
                    m.get(st.turn).push(st);
                }
                return m;
            }, [data]);
            if (error && !data)
                return h('div', { className: 'clx-err' }, fmt(t('failed'), { msg: error }));
            if (!data)
                return h('div', { className: 'clx-muted' }, t('loading'));
            const curStep = live?.currentStep !== undefined ? steps[live.currentStep] : null;
            const path = sel ? sel.stages : curStep ? curStep.stages : [];
            const focus = sel ? sel.stages[sel.stages.length - 1] : live?.stage;
            const phase = sel ? 'selected' : live?.phase;
            const pick = (st) => setSelKey(st ? st.startSeq : null);
            const pickStage = (stage) => {
                // most recent step (before the selected one, cycling) that passed through this stage
                const from = selIdx >= 0 ? selIdx - 1 : steps.length - 1;
                for (let k = 0; k < steps.length; k++) {
                    const i = ((from - k) % steps.length + steps.length) % steps.length;
                    if (steps[i].stages.includes(stage)) {
                        pick(steps[i]);
                        return;
                    }
                }
            };
            const g = data.goal;
            const turnsInfo = new Map((data.turns || []).map((x) => [x.turn, x]));
            const turnNums = [...byTurn.keys()].sort((a, b) => a - b);
            const lastTurn = turnNums[turnNums.length - 1];
            const isOpen = (n) => open[n] ?? (n === (sel?.turn ?? lastTurn));
            const statusCard = sel
                ? (() => {
                    const comp = compositionAt(bd, sel);
                    const u = sel.usage;
                    const dur = sel.endTime && sel.startTime ? sel.endTime - sel.startTime : sel.status === 'running' ? now - sel.startTime : undefined;
                    return h('div', { className: 'clx-card' }, h('div', { className: 'clx-flow-status' }, h('b', null, fmt(t('flow.where'), { t: sel.turn, s: sel.step })), h('span', { className: sel.status === 'error' ? 'clx-err' : sel.status === 'interrupted' ? 'clx-warn' : 'clx-muted' }, t(`flow.status.${sel.status}`)), h('span', { style: { marginLeft: 'auto', display: 'flex', gap: 6 } }, h('button', { className: 'clx-chipbtn', disabled: selIdx <= 0, onClick: () => pick(steps[selIdx - 1]) }, `‹ ${t('flow.prev')}`), h('button', { className: 'clx-chipbtn', disabled: selIdx >= steps.length - 1, onClick: () => pick(steps[selIdx + 1]) }, `${t('flow.next')} ›`), h('button', { className: 'clx-chipbtn', 'aria-pressed': true, onClick: () => pick(null) }, t('flow.backLive')))), h('div', { className: 'clx-muted', style: { fontSize: 12, margin: '2px 0 8px' } }, [sel.startTime ? new Date(sel.startTime).toLocaleString() : null, dur !== undefined ? fmtDur(dur) : null, `#${sel.startSeq}${sel.endSeq ? `–${sel.endSeq}` : ''}`].filter(Boolean).join(' · ')), h('h4', null, t('flow.path')), h('div', { className: 'clx-flow-path' }, sel.stages.map((x, i) => h('span', { key: i, className: 'clx-flow-chip' }, h('b', null, i + 1), ` ${t(`flow.n.${x}`)}`))), h('h4', { style: { marginTop: 10 } }, t('sd.story')), h(StepStory, { bd, st: sel, t, onJump }), sel.turnEnd ? h('div', { style: { fontSize: 12, marginTop: 4 } }, h('span', { className: 'clx-muted' }, `${t('flow.n.turnEnd')}: `), sel.turnEnd) : null, h('h4', { style: { marginTop: 12 } }, t('flow.ctxAt')), h('div', { className: 'clx-flow-big' }, h('b', null, fmtK(comp.total)), h('span', { className: 'clx-muted' }, ` / ${fmtK(win)} · ${pct(comp.total, win)}`)), u ? h('div', { className: 'clx-muted', style: { fontSize: 12 } }, fmt(t('flow.request'), { c: fmtK(u.cacheRead || 0), r: pct(u.cacheRead || 0, sel.promptTokens || 0, 0), o: fmtK(u.output || 0) })) : null, h(CompositionBar, { by: comp.by, win, t }), h('div', { className: 'clx-muted', style: { fontSize: 11.5 } }, t(comp.exact ? 'flow.ctxEst' : 'flow.ctxEstNoUsage')));
                })()
                : (() => {
                    const ph = live?.phase || 'idle';
                    return h('div', { className: 'clx-card' }, h('h4', null, t('flow.live')), h('div', { className: 'clx-flow-status' }, h('i', { className: `clx-live-dot${ph === 'idle' ? '' : ' on'}`, style: { background: LIVE_COLOR[ph] } }), h('b', null, t(`flow.live.${ph}`)), live?.turn ? h('span', { className: 'clx-muted' }, live.step ? fmt(t('flow.where'), { t: live.turn, s: live.step }) : fmt(t('msg.turn'), { n: live.turn })) : null), h('div', { style: { fontSize: 12.5, marginTop: 6 } }, h('span', { className: 'clx-muted' }, `${t('flow.stage')}: `), h('b', null, t(`flow.n.${live?.stage}`) || '—'), ph === 'idle' ? h('span', { className: 'clx-muted' }, ` · ${t('flow.idleHint')}`) : null), curStep ? h('div', { className: 'clx-muted', style: { fontSize: 12, marginTop: 2 } }, `${fmt(t('flow.stepFor'), { d: fmtDur(now - curStep.startTime) })}${curStep.tools.length ? ` · ${curStep.tools.join(', ')}` : ''}`) : null, live?.jobs?.length ? h('div', { style: { marginTop: 8, fontSize: 12 } }, h('div', { className: 'clx-muted' }, t('flow.jobs')), live.jobs.map((j) => h('div', { key: j.job, className: 'clx-flow-job' }, h('i', { className: 'clx-live-dot on', style: { background: LIVE_COLOR.tool } }), ` ${j.label} `, h('span', { className: 'clx-muted' }, fmtDur(now - j.startedAt))))) : null, live?.approvals?.length ? h('div', { style: { marginTop: 8, fontSize: 12 } }, h('div', { className: 'clx-warn' }, t('flow.approvals')), live.approvals.map((a) => h('div', { key: a.seq }, a.title))) : null, live?.lastSeq !== undefined ? h('div', { className: 'clx-flow-now', style: { fontSize: 12 } }, h('span', { className: 'clx-muted' }, `${t('flow.lastEvent')} · #${live.lastSeq} · ${fmt(t('flow.ago'), { d: fmtDur(Math.max(0, now - live.lastTime)) })}`), h('div', { className: 'clx-flow-now-text' }, h('b', null, t(`flow.n.${live.lastStage}`)), ' ', live.lastTitle)) : null, (curStep || steps[steps.length - 1]) ? h(React.Fragment, null, h('h4', { style: { marginTop: 10 } }, t('sd.story')), h(StepStory, { bd, st: curStep || steps[steps.length - 1], t, onJump })) : null, h('h4', { style: { marginTop: 12 } }, t('flow.ctxNow')), h('div', { className: 'clx-flow-big' }, h('b', null, fmtK(s.used)), h('span', { className: 'clx-muted' }, ` / ${fmtK(win)} · ${pct(s.used, win)}`), s.comp?.auto && s.comp.thresholdTokens ? h('span', { className: s.used >= s.comp.thresholdTokens ? 'clx-warn' : 'clx-muted', style: { fontSize: 12 } }, ` · ${fmt(t('flow.threshold'), { t: fmtK(s.comp.thresholdTokens) })}`) : null), h(CompositionBar, { by: s.byCat ? Object.fromEntries(Object.entries(s.byCat).map(([k, c]) => [k, c.tokens])) : {}, win, t }));
                })();
            return h('div', { className: 'clx-flow-wrap' }, h('div', { className: 'clx-card clx-flow-diagram' }, h('div', { className: 'clx-muted', style: { fontSize: 11.5, marginBottom: 4 } }, sel ? fmt(t('flow.legend.sel'), { t: sel.turn, s: sel.step }) : t('flow.legend.live')), h(FlowDiagram, { t, totals: data.counts || {}, badges, path, focus, phase, goal: g, onPick: pickStage })), h('div', { className: 'clx-flow-side-panel' }, statusCard, g ? h('div', { className: 'clx-card' }, h('h4', null, t('flow.goal')), h('div', { style: { fontWeight: 600, marginBottom: 4 } }, g.objective), h('div', { className: 'clx-kv' }, kv(t('flow.goal.phase'), t(`flow.phase.${g.phase}`) || g.phase), kv(t('flow.goal.rounds'), `${g.roundsStarted ?? 0} / ${g.maxGoalRounds ?? '∞'}`), g.blockedReason ? kv(t('flow.goal.blocked'), typeof g.blockedReason === 'string' ? g.blockedReason : JSON.stringify(g.blockedReason)) : null), (data.goalHistory || []).length ? h('div', { style: { marginTop: 8, fontSize: 12 } }, data.goalHistory.map((x) => h('div', { key: x.seq, className: 'clx-flow-log' }, h('span', { className: 'clx-muted' }, fmtTime(x.time)), ` ${x.operation}${x.phase ? ` → ${x.phase}` : ''}`))) : null) : null, h('div', { className: 'clx-card' }, h('h4', null, `${t('flow.trajectory')} · ${fmt(t('flow.stepCount'), { n: steps.length + (data.stepsTruncated || 0) })}`), data.stepsTruncated ? h('div', { className: 'clx-muted', style: { fontSize: 11.5 } }, fmt(t('flow.stepsTruncated'), { n: data.stepsTruncated })) : null, steps.length ? h('div', { className: 'clx-flow-steps', ref: listRef, onScroll: onListScroll }, turnNums.map((n) => {
                const tu = turnsInfo.get(n) || {};
                const list = byTurn.get(n);
                const opened = isOpen(n);
                return h('div', { key: n, className: `clx-flow-tgroup${opened ? ' open' : ''}` }, h('div', { className: 'clx-flow-turn', role: 'button', tabIndex: 0, 'aria-expanded': opened, onClick: () => setOpen({ ...open, [n]: !opened }) }, h('div', { className: 'clx-flow-turn-head' }, h(Chevron, { open: opened }), h('b', null, fmt(t('msg.turn'), { n })), h('span', { className: 'clx-tag' }, t(`flow.trigger.${tu.trigger || 'none'}`)), h('span', { className: tu.reason && /abort|error|fail/.test(tu.reason) ? 'clx-warn' : 'clx-muted' }, tu.reason || t('flow.running')), h('span', { className: 'clx-muted', style: { marginLeft: 'auto' } }, `${fmt(t('flow.stepCount'), { n: list.length })}${tu.start && tu.end ? ` · ${fmtDur(tu.end - tu.start)}` : ''}`)), tu.prompt ? h('div', { className: 'clx-flow-turn-prompt' }, tu.prompt) : null), opened ? list.map((st) => h(StepRow, { key: st.startSeq, s: st, win, sel: st === sel, t, onPick: () => pick(st === sel ? null : st) })) : null);
            })) : h('div', { className: 'clx-muted' }, t('flow.noSteps')))));
        }
        function fmtDur(ms) {
            if (!(ms >= 0))
                return '';
            const s = Math.round(ms / 1000);
            if (s < 60)
                return `${s}s`;
            const m = Math.floor(s / 60);
            if (m < 60)
                return `${m}m ${s % 60}s`;
            return `${Math.floor(m / 60)}h ${m % 60}m`;
        }
        const NAV_ICON = {
            overview: ['M12 3a9 9 0 1 0 9 9', 'M12 3a9 9 0 0 1 9 9h-9z'],
            analyze: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z'],
            prompt: ['M6 3h9l4 4v14H6z', 'M9 11h7', 'M9 15h7', 'M9 7h3'],
            flow: ['M6 4h5v5H6z', 'M13 15h5v5h-5z', 'M8.5 9v3.5h7V15', 'M17 6.5h3'],
            messages: ['M4 6h16', 'M4 11h16', 'M4 16h10'],
            tools: ['M8 5 4 12l4 7', 'M16 5l4 7-4 7', 'M13.5 5l-3 14'],
            sources: ['M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', 'M5 17a3 3 0 0 1 3-3h9', 'M19 7v13'],
        };
        const NAVS = ['overview', 'prompt', 'messages', 'tools', 'sources', 'analyze'];
        const NAV_STORE = 'dsh-context-lens:nav';
        const NAV_OLD = { flow: 'overview', skills: 'sources', memory: 'sources', system: 'sources' };
        function NavIcon({ k }) {
            return h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, (NAV_ICON[k] || []).map((d, i) => h('path', { key: i, d })));
        }
        /** Nearest ancestor that scrolls, so a section switch can start at the top. */
        function scrollParent(el) {
            for (let p = el?.parentElement; p; p = p.parentElement) {
                const oy = getComputedStyle(p).overflowY;
                if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight)
                    return p;
            }
            return null;
        }
        /** The Context Lens View: always the Conversation's own session, always live. */
        function DetailPane(props) {
            const { ctx, t } = props;
            useLocaleTick(ctx);
            const sessionId = typeof props.sessionId === 'string' ? props.sessionId : '';
            const [nav, setNavState] = useState(() => {
                try {
                    const v = localStorage.getItem(NAV_STORE);
                    return NAVS.includes(v) ? v : NAV_OLD[v] || 'overview';
                }
                catch {
                    return 'overview';
                }
            });
            const paneRef = useRef(null);
            const setNav = (k) => {
                setNavState(k);
                try {
                    localStorage.setItem(NAV_STORE, k);
                }
                catch { }
            };
            // each section opens at its top, not at the scroll offset the last one left
            const firstNav = useRef(true);
            useLayoutEffect(() => {
                if (firstNav.current) {
                    firstNav.current = false;
                    return;
                }
                const pane = paneRef.current;
                const sc = scrollParent(pane);
                if (!pane || !sc)
                    return;
                const top = pane.getBoundingClientRect().top - sc.getBoundingClientRect().top;
                if (top < 0)
                    sc.scrollTop += top;
            }, [nav]);
            const [focus, setFocus] = useState(null);
            // the selected section's pill slides between buttons
            const navRef = useRef(null);
            useLayoutEffect(() => {
                const el = navRef.current;
                if (!el)
                    return undefined;
                const place = () => {
                    const b = el.querySelector('button[aria-selected=true]');
                    if (!b)
                        return;
                    el.style.setProperty('--ind-x', `${b.offsetLeft}px`);
                    el.style.setProperty('--ind-w', `${b.offsetWidth}px`);
                    el.setAttribute('data-ind', '');
                };
                place();
                const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
                ro?.observe(el);
                return () => ro?.disconnect();
            });
            const pressure = useSafeProjection(props, 'contextPressure');
            const liveKey = pressure ? `${pressure.pressureTokens}:${pressure.projectedTokens}` : '';
            const { data, error, loading, reload } = useBreakdown(sessionId, liveKey, !!sessionId, pressure ? 0 : 5000);
            const live = data ? `${liveKey}|${data.logRevision}` : liveKey;
            const { flow } = useFlow(sessionId, live);
            const series = useStepSeries(data, flow);
            const [stepKey, setStepKey] = useState(null);
            const [stepOnly, setStepOnly] = useState(false);
            const [askSeqs, setAskSeqs] = useState([]);
            const ask = (seq) => { setAskSeqs((a) => (a.includes(seq) ? a : [...a, seq].slice(-6))); setNav('analyze'); };
            const selIdx = series.length ? (stepKey === null ? series.length - 1 : Math.max(0, series.findIndex((x) => x.st.startSeq === stepKey))) : -1;
            const diff = useMemo(() => (data && selIdx >= 0 ? stepDiff(data, series, selIdx) : null), [data, series, selIdx]);
            const onSel = (i) => {
                if (i === null || i >= series.length - 1) {
                    setStepKey(null);
                    setStepOnly(false);
                }
                else
                    setStepKey(series[i].st.startSeq);
            };
            const [updated, setUpdated] = useState(0);
            useEffect(() => { if (data)
                setUpdated(Date.now()); }, [data]);
            const [preset, setPreset] = useState(null);
            const jump = (seq) => {
                setFocus(null);
                requestAnimationFrame(() => setFocus(seq));
                setNav('messages');
            };
            const showCat = (cat) => {
                setFocus(null);
                setPreset({ cat });
                setNav('messages');
            };
            let body;
            if (!sessionId)
                body = h('div', { className: 'clx-muted' }, t('session.none'));
            else if (!data) {
                body = error
                    ? h('div', null, h('div', { className: 'clx-err' }, fmt(t('failed'), { msg: error })), h('button', { className: 'clx-chipbtn', onClick: reload }, t('retry')))
                    : h('div', { className: 'clx-muted' }, t('loading'));
            }
            else if (!data.contextWindow && !data.measured?.totalTokens) {
                body = h('div', { className: 'clx-muted' }, t('pop.empty'));
            }
            else {
                body = h(React.Fragment, null, error ? h('div', { className: 'clx-err', style: { fontSize: 12, marginBottom: 8 } }, fmt(t('failed'), { msg: error })) : null, nav === 'analyze' ? h(AnalyzeView, { data, t, sessionId, onJump: jump, seqs: askSeqs, setSeqs: setAskSeqs })
                    : nav === 'prompt' ? h(PromptView, { data, t, diff, series, onSel, sessionId, ctx, cwd: data.cwd, onJump: jump, onAsk: ask })
                        : nav === 'messages' ? h(Messages, { data, flow, t, focus, sessionId, preset, ctx, cwd: data.cwd, diff, stepOnly })
                            : nav === 'tools' ? h(Tools, { data, t, sessionId, ctx, cwd: data.cwd, diff })
                                : nav === 'sources' ? h(SourcesTab, { sessionId, liveKey: live, bd: data, t, onJump: jump, ctx })
                                    : h(Overview, { data, flow, t, onJump: jump, onShowCat: showCat, onNav: setNav, sessionId, liveKey: live, series, diff, onSel }));
            }
            const s = data ? summarize(data) : null;
            const counts = data ? {
                messages: (data.nodes || []).length,
                tools: (data.invocations || []).length,
            } : {};
            const toolbar = h('div', { className: 'clx-toolbar' }, h('div', { className: 'clx-col clx-toolbar-in' }, h('nav', { className: 'clx-segnav', role: 'tablist', 'aria-label': t('tab.title'), ref: navRef }, NAVS.map((k) => h('button', { key: k, role: 'tab', 'aria-selected': nav === k, onClick: () => setNav(k) }, h(NavIcon, { k }), h('span', null, t(`nav.${k}`)), counts[k] ? h('small', { className: 'clx-navcount' }, counts[k] > 999 ? `${Math.floor(counts[k] / 1000)}k+` : counts[k]) : null))), h('div', { className: 'clx-toolbar-meta', title: updated ? fmt(t('live.updated'), { time: new Date(updated).toLocaleString() }) : '' }, s && s.win ? h(React.Fragment, null, h(Ring, { ratio: s.used / s.win, size: 16, stroke: 2.6 }), h('b', null, pct(s.used, s.win)), h('span', { className: 'clx-muted' }, `${fmtK(s.used)} / ${fmtK(s.win)}`)) : null, h('span', { className: 'clx-toolbar-live' }, h('i', { className: `clx-live-dot${loading ? ' on' : ''}`, style: { background: error ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-success-primary)' } }), t('live.on')))));
            return h('div', { className: 'clx-pane notranslate', translate: 'no', ref: paneRef }, h(Style), toolbar, h('main', { className: 'clx-main' }, h('div', { className: 'clx-col' }, data && diff ? h(StepBar, { series, diff, onSel, t, onNav: setNav, stepOnly, setStepOnly, nav }) : null, body)));
        }
        // ================================================================== registration
        return {
            inject: ['slots', 'locale'],
            apply(ctx) {
                ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'context-lens: dictionaries');
                const t = ctx.locale.bind(NS);
                function Button(props) {
                    return h(CompactButton, { ...props, ctx, t });
                }
                // The ring takes the place of the composer dock's built-in context meter
                // (that meter is not a slot; CSS hides it only while this ring is mounted).
                ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
                    name: 'conversation.composer.dock',
                    id: 'context-lens',
                    order: 1000,
                    label: () => t('button.unknown'),
                }, Button));
                // Detailed view: one more tab in the Conversation's top View row
                // (对话 / 轨迹 / ...), bound to that Conversation's session.
                function Pane(props) {
                    return h(DetailPane, { ...props, ctx, t });
                }
                ctx.slots.inject('conversation.view', () => ctx.slots.register({
                    name: 'conversation.view',
                    id: KIND,
                    order: 25,
                    label: () => t('tab.title'),
                }, Pane));
            },
        };
    },
});

window.__ModuleLoader__.load({
  id: BUNDLE,
  factory(require) {
    const kit = makeKit(require, BUNDLE)
    const store = featureStore()
    const mods = []
    for (const p of parts) {
      try {
        store.declare(BUNDLE, p.id, p.feature)
        mods.push({ id: p.id, feature: p.feature, ...p.factory(require, kit) })
      } catch (e) { console.error(`[${BUNDLE}] ${p.id} failed to load`, e) }
    }
    return {
      inject: [...new Set(mods.flatMap((m) => m.inject || []))],
      apply(ctx) {
        // one part failing must not take the others down
        for (const m of mods) {
          try {
            if (m.feature) gateFeature(ctx, store, m)
            else m.apply(ctx)
          } catch (e) { console.error(`[${BUNDLE}] ${m.id}`, e) }
        }
      },
    }
  },
})
})()
