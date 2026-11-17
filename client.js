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
};

// ===== src/styles/00-text.scss
/* compiled from src/styles/00-text.scss by build.mjs — edit the .scss, not this file */
const CSS_TEXT = ".clx-btn {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  height: 28px;\n  padding: 0 8px;\n  border-radius: 14px;\n  border: none;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  line-height: 1;\n  cursor: pointer;\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n\n.clx-btn:hover, .clx-btn[aria-expanded=true] {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-btn.dock {\n  height: 22px;\n  padding: 1px 8px;\n  gap: 6px;\n  border-radius: var(--dsw-radius-sm, 6px);\n  color: var(--dsw-alias-label-tertiary);\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n}\n\n.clx-btn.dock:hover, .clx-btn.dock[aria-expanded=true] {\n  color: var(--dsw-alias-label-secondary);\n}\n\n[data-composer-dock]:has(.clx-dock-ring) > :not([data-slot]) {\n  display: none;\n}\n\n.clx-pop {\n  position: fixed;\n  z-index: 1000;\n  box-sizing: border-box;\n  width: 340px;\n  max-width: calc(100vw - 24px);\n  max-height: min(600px, 100vh - 96px);\n  overflow: auto;\n  border: 0;\n  border-radius: var(--dsw-radius-lg, 16px);\n  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-2));\n  backdrop-filter: var(--dsw-menu-backdrop-filter);\n  -webkit-backdrop-filter: var(--dsw-menu-backdrop-filter);\n  --dsw-elevation-stroke-color:var(--dsw-alias-border-l1);\n  box-shadow: var(--dsw-elevation-prominent, 0 8px 28px rgba(0, 0, 0, 0.18));\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-secondary);\n  padding: 16px;\n  text-align: left;\n}\n\n.clx-pop-head {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 16px;\n  padding-bottom: 8px;\n  margin-bottom: 10px;\n  border-bottom: 0.5px solid var(--dsw-alias-border-l2);\n}\n\n.clx-pop-title {\n  font-weight: 500;\n  font-size: 12px;\n  color: var(--dsw-alias-label-primary);\n  display: inline-flex;\n  align-items: baseline;\n  gap: 6px;\n}\n\n.clx-pop-title-en {\n  font-weight: 400;\n  font-size: 12px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-pop-open {\n  font-size: 12px;\n  white-space: nowrap;\n  padding: 2px 6px;\n  margin: -2px -6px -2px 0;\n  border-radius: 6px;\n  transition: background-color 0.15s ease;\n}\n\n.clx-pop-open:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-pop {\n  animation: clx-pop-in 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) both;\n  transform-origin: bottom right;\n}\n\n@keyframes clx-pop-in {\n  from {\n    opacity: 0;\n    transform: translateY(6px) scale(0.98);\n  }\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n.clx-pop-usage {\n  display: flex;\n  align-items: baseline;\n  flex-wrap: wrap;\n  gap: 0 4px;\n}\n\n.clx-pop-usage .clx-sub {\n  white-space: pre;\n}\n\n.clx-pop-chip {\n  margin-left: auto;\n  align-self: center;\n  font-size: 11.5px;\n  padding: 2px 8px;\n  border-radius: 999px;\n  corner-shape: round;\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-bg-layer-2);\n  border: 1px solid var(--dsw-alias-border-l1);\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n\n.clx-pop-chip.warn {\n  color: var(--dsw-alias-state-warn-primary);\n  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent);\n}\n\n.clx-pop-caption {\n  font-size: 12px;\n  color: var(--dsw-alias-label-tertiary);\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  cursor: default;\n}\n\n.clx-prows {\n  margin-top: 10px;\n  display: flex;\n  flex-direction: column;\n  gap: 1px;\n}\n\n.clx-prows > * {\n  animation: clx-fade 0.3s ease both;\n  animation-delay: calc(0.12s + var(--i, 0) * 35ms);\n}\n\n.clx-prows > .clx-sep {\n  margin: 4px 0;\n}\n\n.clx-prow {\n  display: grid;\n  grid-template-columns: 10px minmax(0, 1fr) 58px 46px;\n  column-gap: 10px;\n  align-items: center;\n  padding: 3px 6px;\n  margin: 0 -6px;\n  border-radius: 6px;\n  font-variant-numeric: tabular-nums;\n  cursor: default;\n  transition: background-color 0.15s ease, opacity 0.2s ease;\n}\n\n.clx-prow.on {\n  background: color-mix(in srgb, var(--cat) 14%, transparent);\n}\n\n.clx-prows[data-active] .clx-prow:not(.on) {\n  opacity: 0.45;\n}\n\n.clx-pbar {\n  height: 10px;\n}\n\n.clx-pbar > span {\n  cursor: default;\n}\n\n.clx-pop-name {\n  min-width: 0;\n  overflow: hidden;\n}\n\n.clx-dot.hollow {\n  background: transparent;\n  border: 1.5px solid;\n  box-sizing: border-box;\n}\n\n.clx-prow .clx-pop-name {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n}\n\n.clx-prow .lead {\n  display: inline-flex;\n  align-items: center;\n  margin-left: 2px;\n  color: var(--dsw-alias-label-tertiary);\n  transition: color 0.15s ease;\n}\n\n.clx-prow.tog {\n  cursor: pointer;\n}\n\n.clx-prow.tog:hover .lead {\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-prow.sub {\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-prow.sub .clx-pop-name {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding-left: 2px;\n}\n\n.clx-prow.sub .clx-dot {\n  width: 7px;\n  height: 7px;\n  flex: none;\n}\n\n.clx-pkids {\n  display: flex;\n  flex-direction: column;\n  gap: 1px;\n  margin-left: 4px;\n  padding-left: 16px !important;\n  padding-left: 0;\n  border-left: 1px solid var(--dsw-alias-border-l1);\n  animation: clx-drop 0.2s ease both !important;\n}\n\n.clx-pkids > .clx-prow {\n  margin-left: -6px;\n  grid-template-columns: minmax(0, 1fr) 58px 46px;\n  column-gap: 10px;\n}\n\n.clx-pfile {\n  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);\n  font-size: 11.5px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  min-width: 0;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .clx-pop, .clx-pop * {\n    animation: none !important;\n    transition: none !important;\n  }\n}\n.clx-muted {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-sub {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-big {\n  font-size: 16px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-bar {\n  display: flex;\n  height: 10px;\n  border-radius: 5px;\n  overflow: hidden;\n  background: var(--dsw-alias-border-l1);\n  margin: 8px 0 6px;\n}\n\n.clx-bar > span {\n  height: 100%;\n  min-width: 0;\n}\n\n.clx-bar > span + span {\n  box-shadow: inset 1px 0 0 var(--dsw-alias-bg-layer-1);\n}\n\n.clx-hatch {\n  background: repeating-linear-gradient(135deg, var(--dsw-alias-border-l3) 0 3px, transparent 3px 6px);\n}\n\n.clx-rows {\n  display: grid;\n  grid-template-columns: auto 1fr auto auto;\n  column-gap: 10px;\n  row-gap: 5px;\n  align-items: center;\n  margin-top: 10px;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-dot {\n  width: 9px;\n  height: 9px;\n  border-radius: 3px;\n  display: inline-block;\n}\n\n.clx-dot.free {\n  border: 1px solid var(--dsw-alias-border-l3);\n}\n\n.clx-num {\n  text-align: right;\n}\n\n.clx-sep {\n  grid-column: 1/-1;\n  height: 1px;\n  background: var(--dsw-alias-border-l1);\n  margin: 3px 0;\n}\n\n.clx-foot {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  margin-top: 12px;\n  padding-top: 10px;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n}\n\n.clx-link {\n  border: none;\n  background: transparent;\n  color: var(--dsw-alias-state-business-primary);\n  cursor: pointer;\n  font-size: 12.5px;\n  padding: 4px 6px;\n  border-radius: 6px;\n}\n\n.clx-link:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-chipbtn {\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  border-radius: 7px;\n  padding: 3px 9px;\n  font-size: 12px;\n  cursor: pointer;\n}\n\n.clx-chipbtn:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-chipbtn[aria-pressed=true] {\n  background: var(--dsw-alias-interactive-bg-active);\n  color: var(--dsw-alias-label-primary);\n  border-color: var(--dsw-alias-border-l3);\n}\n\n.clx-pane {\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  line-height: 1.5;\n  padding: 0 0 48px;\n  box-sizing: border-box;\n  min-height: 100%;\n}\n\n/* this view only reads the context and spans the full width, so the conversation it sits in drops\n   its composer and its chat-width drag handles while it is open */\n[data-conversation-content]:has(.clx-pane) [data-composer-seat],\n[data-conversation-content]:has(.clx-pane) > [data-width-handle] {\n  display: none;\n}\n\n.clx-toolbar {\n  position: sticky;\n  top: 0;\n  z-index: 4;\n  padding: 10px var(--dsh-composer-side-clearance, 16px);\n  background: var(--dsw-alias-bg-base);\n}\n\n.clx-col {\n  box-sizing: border-box;\n  width: 100%;\n  margin: 0 auto;\n}\n\n.clx-toolbar-in {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n}\n\n.clx-segnav {\n  display: inline-flex;\n  gap: 2px;\n  padding: 3px;\n  border-radius: 10px;\n  background: var(--dsw-alias-bg-layer-2);\n  border: 1px solid var(--dsw-alias-border-l1);\n  overflow-x: auto;\n  scrollbar-width: none;\n  min-width: 0;\n  max-width: 100%;\n}\n\n.clx-segnav button {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  border: 0;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  padding: 5px 11px;\n  border-radius: 7px;\n  font-size: 12.5px;\n  cursor: pointer;\n  white-space: nowrap;\n}\n\n.clx-segnav button:hover {\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-segnav {\n  position: relative;\n}\n\n.clx-segnav::before {\n  content: \"\";\n  position: absolute;\n  left: 0;\n  top: 3px;\n  bottom: 3px;\n  width: var(--ind-w, 0);\n  transform: translateX(var(--ind-x, 0));\n  border-radius: 7px;\n  background: var(--dsw-alias-bg-layer-1);\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), 0 0 0 1px var(--dsw-alias-border-l1);\n  opacity: 0;\n  transition: transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1), width 0.32s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s;\n}\n\n.clx-segnav[data-ind]::before {\n  opacity: 1;\n}\n\n.clx-segnav button {\n  position: relative;\n  z-index: 1;\n  transition: color 0.2s ease;\n}\n\n.clx-segnav[data-ind] button[aria-selected=true] {\n  background: transparent !important;\n  box-shadow: none !important;\n}\n\n.clx-segnav button[aria-selected=true] {\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), 0 0 0 1px var(--dsw-alias-border-l1);\n}\n\n.clx-segnav button svg {\n  display: none;\n}\n\n.clx-toolbar-meta {\n  margin-left: auto;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 12px;\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-toolbar-live {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  margin-left: 6px;\n  padding-left: 10px;\n  border-left: 1px solid var(--dsw-alias-border-l1);\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-main {\n  min-width: 0;\n  padding: 4px var(--dsh-composer-side-clearance, 16px) 0;\n}\n\n.clx-main > .clx-col {\n  container-type: inline-size;\n}\n\n@container (max-width: 760px) {\n  .clx-segnav button {\n    padding: 5px 9px;\n  }\n  .clx-toolbar-meta > :not(.clx-toolbar-live) {\n    display: none;\n  }\n  .clx-toolbar-live {\n    border-left: 0;\n    padding-left: 0;\n    margin-left: 0;\n  }\n}\n.clx-card {\n  background: var(--dsw-alias-settings-card-fill);\n  border: 1px solid var(--dsw-alias-settings-card-stroke);\n  border-radius: 10px;\n  padding: 12px;\n  margin-bottom: 12px;\n}\n\n.clx-subh {\n  margin: 4px 0 8px;\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-subh.sep {\n  margin-top: 14px;\n  padding-top: 12px;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n}\n\n.clx-card h4 {\n  margin: 0 0 8px;\n  font-size: 12.5px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-kv {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));\n  gap: 8px 14px;\n}\n\n.clx-kv > div {\n  min-width: 0;\n}\n\n.clx-kv .k {\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-kv .v {\n  font-variant-numeric: tabular-nums;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-table {\n  width: 100%;\n  border-collapse: collapse;\n  font-variant-numeric: tabular-nums;\n  font-size: 12.5px;\n}\n\n.clx-table th {\n  font-weight: 500;\n  color: var(--dsw-alias-label-tertiary);\n  text-align: right;\n  padding: 4px 6px;\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  white-space: nowrap;\n}\n\n.clx-table th:first-child, .clx-table td:first-child {\n  text-align: left;\n}\n\n.clx-table td {\n  padding: 4px 6px;\n  text-align: right;\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  white-space: nowrap;\n}\n\n.clx-table td.wrap {\n  white-space: normal;\n  word-break: break-word;\n}\n\n.clx-table tr:last-child td {\n  border-bottom: none;\n}\n\n.clx-scroll {\n  overflow-x: auto;\n}\n\n.clx-gauge {\n  display: flex;\n  align-items: center;\n  gap: 14px;\n  flex-wrap: wrap;\n}\n\n.clx-card-head {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex-wrap: wrap;\n  margin-bottom: 8px;\n}\n\n.clx-card-head h4 {\n  margin: 0;\n  flex: 1;\n  min-width: 0;\n}\n\n.clx-card-head > .clx-muted {\n  font-size: 11.5px;\n}\n\n.clx-segmini {\n  display: inline-flex;\n  gap: 4px;\n}\n\n.clx-hero {\n  display: flex;\n  align-items: center;\n  gap: 16px;\n  margin-bottom: 12px;\n}\n\n.clx-hero-main {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n\n.clx-hero-pct {\n  font-size: 26px;\n  font-weight: 650;\n  letter-spacing: -0.01em;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-hero-side {\n  display: grid;\n  grid-template-columns: auto auto;\n  gap: 3px 14px;\n  font-size: 12px;\n  align-self: center;\n  padding-left: 16px;\n  border-left: 1px solid var(--dsw-alias-border-l1);\n}\n\n.clx-hero-kv {\n  display: contents;\n}\n\n.clx-hero-kv .k {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-hero-kv .v {\n  color: var(--dsw-alias-label-primary);\n  font-variant-numeric: tabular-nums;\n  text-align: right;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  max-width: 220px;\n}\n\n.clx-hero-card .clx-legend {\n  margin-top: 8px;\n}\n\n.clx-catrow {\n  display: grid;\n  grid-template-columns: minmax(0, 1.5fr) minmax(40px, 1fr) 58px 52px 34px;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 10px;\n  border-radius: 10px;\n  font-size: 12.5px;\n}\n\n.clx-catrow.head {\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n  padding: 0 10px 4px;\n}\n\n.clx-catrow.head > span:nth-child(n+3) {\n  text-align: right;\n}\n\n.clx-catrow[role=button] {\n  cursor: pointer;\n}\n\n.clx-catrow[role=button]:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-catrow[role=button]:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -2px;\n}\n\n.clx-catrow .num {\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-catrow.static {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-catcell {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n}\n\n.clx-caret {\n  width: 12px;\n  height: 12px;\n  flex: none;\n  display: inline-flex;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-caret svg {\n  transition: transform 0.15s;\n}\n\n.clx-catblock.open .clx-caret svg {\n  transform: rotate(90deg);\n}\n\n.clx-catname {\n  display: flex;\n  align-items: baseline;\n  gap: 6px;\n  min-width: 0;\n  overflow: hidden;\n}\n\n.clx-catname .zh {\n  white-space: nowrap;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-catname .en {\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-catbar {\n  height: 6px;\n  border-radius: 3px;\n  background: var(--dsw-alias-border-l1);\n  overflow: hidden;\n}\n\n.clx-catbar > span {\n  display: block;\n  height: 100%;\n  border-radius: 3px;\n}\n\n.clx-catitem {\n  display: flex;\n  align-items: flex-start;\n  gap: 10px;\n  padding: 6px 10px 6px 24px;\n  border-radius: 8px;\n}\n\n/* ---- list items: one look everywhere (概览 分类明细, 消息, 工具, 技能, 记忆文件, 轨迹) ----\n   rows are rounded, no hairlines; an open item is the same row grown into a block tinted\n   in its colour, its content aligned with the row's text column; nested lists put their\n   arrows under the parent's dot; a nested open item is a lighter block inside the tint */\n.clx-catblock, .clx-node, .clx-tblock, .clx-disc, .clx-flow-tgroup {\n  border: 0;\n  border-radius: 10px;\n  margin: 0;\n  transition: background-color 0.2s ease;\n}\n\n:is(.clx-catblock, .clx-node, .clx-tblock, .clx-disc, .clx-flow-tgroup) + :is(.clx-catblock, .clx-node, .clx-tblock, .clx-disc, .clx-flow-tgroup) {\n  margin-top: 2px;\n}\n\n:is(.clx-catblock, .clx-node, .clx-tblock, .clx-disc, .clx-flow-tgroup).open {\n  background: color-mix(in srgb, var(--cat, var(--dsw-alias-label-tertiary)) 8%, transparent);\n}\n\n:is(.clx-catblock, .clx-node, .clx-tblock, .clx-disc).open :is(.clx-node, .clx-tblock, .clx-disc).open {\n  background: color-mix(in srgb, var(--cat, var(--dsw-alias-label-tertiary)) 7%, var(--dsw-alias-bg-layer-1));\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);\n}\n\n:is(.clx-catblock, .clx-node, .clx-tblock, .clx-disc).open > :is(.clx-catrow, .clx-node-row, .clx-trow, .clx-urow, .clx-disc-head) {\n  background: transparent;\n}\n\n:is(.clx-catblock, .clx-node, .clx-tblock, .clx-disc).open > :is(.clx-catrow, .clx-node-row, .clx-trow, .clx-urow, .clx-disc-head):hover {\n  background: color-mix(in srgb, var(--cat, var(--dsw-alias-label-tertiary)) 8%, transparent);\n}\n\n:is(.clx-catblock, .clx-node, .clx-tblock, .clx-disc).open :is(.clx-node-row, .clx-trow, .clx-urow, .clx-disc-head, .clx-catitem):hover {\n  background: color-mix(in srgb, var(--cat, var(--dsw-alias-label-tertiary)) 9%, transparent);\n}\n\n.clx-catdetail {\n  margin: 0;\n  padding: 0 8px 8px 18px;\n}\n\n.clx-detail {\n  margin: 0;\n  padding: 0 12px 12px 74px;\n  cursor: auto;\n  animation: clx-drop 0.26s cubic-bezier(0.2, 0.8, 0.2, 1) both;\n}\n\n.clx-expand {\n  margin: 0;\n  padding: 2px 12px 12px 32px;\n  animation: clx-drop 0.26s cubic-bezier(0.2, 0.8, 0.2, 1) both;\n}\n\n.clx-expand > .clx-node:first-of-type, .clx-catdetail > .clx-node:first-of-type {\n  margin-top: 0;\n}\n\n.clx-disc-body {\n  margin: 0;\n  padding: 0 12px 12px 30px;\n  animation: clx-drop 0.26s cubic-bezier(0.2, 0.8, 0.2, 1) both;\n}\n\n@container (max-width: 560px) {\n  .clx-detail {\n    padding-left: 12px;\n  }\n  .clx-expand {\n    padding-left: 12px;\n  }\n  .clx-disc-body {\n    padding-left: 12px;\n  }\n}\n.clx-flow-tgroup {\n  --cat:var(--dsw-alias-state-business-primary);\n}\n\n.clx-flow-turn {\n  padding: 8px 10px;\n  border-radius: 10px;\n  cursor: pointer;\n  transition: background-color 0.15s ease;\n}\n\n.clx-flow-steps .clx-flow-tgroup > .clx-flow-turn {\n  position: sticky;\n  top: 0;\n  z-index: 1;\n  background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1));\n}\n\n.clx-flow-steps .clx-flow-tgroup.open > .clx-flow-turn {\n  background: linear-gradient(color-mix(in srgb, var(--cat) 8%, transparent), color-mix(in srgb, var(--cat) 8%, transparent)), var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1));\n}\n\n.clx-flow-steps .clx-flow-tgroup > .clx-flow-turn:hover {\n  background: linear-gradient(color-mix(in srgb, var(--cat) 14%, transparent), color-mix(in srgb, var(--cat) 14%, transparent)), var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1));\n}\n\n.clx-flow-tgroup.open {\n  padding-bottom: 6px;\n}\n\n.clx-flow-tgroup.open .clx-flow-step:hover {\n  background: color-mix(in srgb, var(--cat) 9%, transparent);\n}\n\n.clx-flow-step.sel {\n  background: color-mix(in srgb, var(--cat, var(--dsw-alias-state-business-primary)) 18%, transparent);\n}\n\n.clx-catitem .main {\n  flex: 1;\n  min-width: 0;\n}\n\n/* a call and its result read as one unit */\n.clx-pair {\n  border-radius: 9px;\n  background: color-mix(in srgb, var(--cat, var(--dsw-alias-label-tertiary)) 4%, var(--dsw-alias-bg-layer-1));\n  padding: 6px 10px 8px;\n  margin-top: 6px;\n}\n\n.clx-pair:first-child {\n  margin-top: 0;\n}\n\n.clx-pair > .clx-rich.bare + .clx-rich.bare {\n  border-top: 1px dashed var(--dsw-alias-border-l2);\n}\n\n.clx-pair .clx-rich.bare > .clx-rich-body.flush, .clx-pair .clx-rich.bare .clx-code pre, .clx-pair .clx-rich.bare .clx-code [data-code-block-content] {\n  background: var(--dsw-alias-bg-layer-2) !important;\n}\n\n.clx-pair-note {\n  font-size: 12px;\n  color: var(--dsw-alias-label-tertiary);\n  padding: 6px 0 2px;\n  border-top: 1px dashed var(--dsw-alias-border-l2);\n  margin-top: 6px;\n}\n\n.clx-pair-note:first-child {\n  border-top: 0;\n  margin-top: 0;\n}\n\n.clx-node.paired {\n  margin-left: 30px;\n}\n\n.clx-node.paired > .clx-node-row .seq::before {\n  content: \"↳ \";\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-inv-row .prev.res {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  overflow: hidden;\n  white-space: nowrap;\n}\n\n.clx-inv-row .prev.res .clx-dot {\n  flex: none;\n  width: 6px;\n  height: 6px;\n}\n\n.clx-inv-row .prev.err {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-cmdcard {\n  container-type: inline-size;\n}\n\n.clx-cmdcard > .clx-card-head h4 {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.clx-cmd-icon {\n  font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;\n  color: var(--dsw-alias-label-tertiary);\n  letter-spacing: -0.5px;\n}\n\n.clx-cmd-status {\n  display: inline-flex;\n  gap: 2px;\n  padding: 2px;\n  border-radius: 9px;\n  background: var(--dsw-alias-bg-layer-1);\n  border: 1px solid var(--dsw-alias-border-l1);\n}\n\n.clx-cmd-sbtn {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  border: 0;\n  background: transparent;\n  border-radius: 7px;\n  padding: 3px 10px;\n  font-size: 12px;\n  cursor: pointer;\n  color: var(--dsw-alias-label-secondary);\n  transition: background-color 0.15s ease, color 0.15s ease;\n}\n\n.clx-cmd-sbtn b {\n  font-weight: 600;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-cmd-sbtn.bad {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-cmd-sbtn.slow {\n  color: #C98A1E;\n}\n\n.clx-cmd-sbtn.bg {\n  color: #2B93C4;\n}\n\n.clx-cmd-sbtn:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-cmd-sbtn[aria-pressed=true] {\n  background: var(--dsw-alias-state-business-primary);\n  color: #fff;\n}\n\n.clx-cmd-sbtn.bad[aria-pressed=true] {\n  background: var(--dsw-alias-state-error-primary);\n}\n\n.clx-cmd-sbtn.slow[aria-pressed=true] {\n  background: #D6951F;\n}\n\n.clx-cmd-sbtn.bg[aria-pressed=true] {\n  background: #2B93C4;\n}\n\n.clx-cmd {\n  display: grid;\n  grid-template-columns: minmax(210px, 270px) minmax(0, 1fr);\n  gap: 18px;\n  align-items: start;\n}\n\n.clx-cmd-side {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  min-width: 0;\n}\n\n.clx-cmd-h {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-secondary);\n  margin: 6px 2px 0;\n}\n\n.clx-cmd-h:first-child {\n  margin-top: 0;\n}\n\n.clx-cmd-h > span {\n  flex: 1;\n}\n\n.clx-cmd-tiles {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 6px;\n}\n\n.clx-cmd-tile {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  padding: 8px 10px;\n  border-radius: 10px;\n  background: var(--dsw-alias-bg-layer-1);\n}\n\n.clx-cmd-tile[role=button] {\n  cursor: pointer;\n}\n\n.clx-cmd-tile[role=button]:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-cmd-tile b {\n  font-size: 18px;\n  font-weight: 650;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-cmd-tile b.accent {\n  color: var(--dsw-alias-state-business-primary);\n}\n\n.clx-cmd-tile b.bad {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-cmd-tile b.bgc {\n  color: #2B93C4;\n}\n\n.clx-cmd-tile span {\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-cmd-notes {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n\n.clx-cmd-note {\n  display: grid;\n  grid-template-columns: 8px auto minmax(0, 1fr) auto;\n  align-items: center;\n  gap: 8px;\n  padding: 6px 10px;\n  border-radius: 10px;\n  font-size: 12px;\n  cursor: pointer;\n  background: var(--dsw-alias-bg-layer-1);\n}\n\n.clx-cmd-note:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-cmd-note .clx-dot {\n  width: 7px;\n  height: 7px;\n}\n\n.clx-cmd-note .k {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-cmd-note code {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-cmd-note b {\n  font-weight: 600;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-cmd-note b.slow, .clx-cmd-row .dur.slow, .clx-cmd-meta b.slow {\n  color: #C98A1E;\n}\n\n.clx-cmd-note b.bad, .clx-cmd-meta b.bad {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-cmd-pq {\n  width: 120px;\n  min-width: 0;\n  font-size: 11.5px;\n  padding: 2px 8px;\n  border-radius: 6px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  font-weight: 400;\n}\n\n.clx-cmd-progs {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  max-height: 360px;\n  overflow: auto;\n  margin: 0 -2px;\n  padding: 0 2px;\n}\n\n.clx-cmd-prog {\n  display: grid;\n  grid-template-columns: 8px minmax(0, 1fr) auto auto;\n  grid-template-rows: auto 3px;\n  align-items: center;\n  column-gap: 8px;\n  row-gap: 4px;\n  padding: 6px 10px;\n  border-radius: 10px;\n  cursor: pointer;\n  font-size: 12.5px;\n}\n\n.clx-cmd-prog:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-cmd-prog.on {\n  background: color-mix(in srgb, var(--pc) 14%, transparent);\n}\n\n.clx-cmd-prog .clx-dot {\n  background: var(--pc);\n  width: 7px;\n  height: 7px;\n}\n\n.clx-cmd-prog code {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-cmd-prog .n {\n  grid-column: 4;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  white-space: nowrap;\n}\n\n.clx-cmd-prog .n em {\n  font-style: normal;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-cmd-prog .clx-cmd-badge {\n  grid-column: 3;\n}\n\n.clx-cmd-prog .bar {\n  grid-column: 2/5;\n  grid-row: 2;\n  height: 3px;\n  border-radius: 2px;\n  background: color-mix(in srgb, var(--pc) 12%, transparent);\n  overflow: hidden;\n}\n\n.clx-cmd-prog .bar > span {\n  display: block;\n  height: 100%;\n  border-radius: 2px;\n  background: var(--pc);\n  opacity: 0.75;\n}\n\n.clx-cmd-main {\n  min-width: 0;\n}\n\n.clx-cmd-main > .clx-msgtools {\n  margin-bottom: 6px;\n}\n\n.clx-cmd-filt {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 12px;\n  margin: 0 2px 6px;\n}\n\n.clx-linkbtn {\n  border: 0;\n  background: transparent;\n  padding: 0;\n  font-size: 12px;\n  color: var(--dsw-alias-state-business-primary);\n  cursor: pointer;\n}\n\n.clx-linkbtn:hover {\n  text-decoration: underline;\n}\n\n.clx-cmd-row {\n  display: grid;\n  grid-template-columns: 12px 14px minmax(0, 1fr) auto 56px auto;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 10px;\n  border-radius: 10px;\n  font-size: 12.5px;\n  cursor: pointer;\n  transition: background-color 0.15s ease;\n}\n\n.clx-cmd-row:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-cmd-row:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -2px;\n}\n\n.clx-cmd-row .cmd {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-cmd-row .tags {\n  display: inline-flex;\n  gap: 4px;\n}\n\n.clx-cmd-row .dur {\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-cmd-row .when {\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11.5px;\n  white-space: nowrap;\n}\n\n.clx-cmd-st {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 14px;\n  font-size: 12px;\n  font-weight: 700;\n}\n\n.clx-cmd-st.ok {\n  color: #3FB37F;\n}\n\n.clx-cmd-st.bad {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-cmd-st.run::before {\n  content: \"\";\n  width: 9px;\n  height: 9px;\n  border-radius: 50%;\n  corner-shape: round;\n  border: 2px solid #3BA7D9;\n  border-right-color: transparent;\n  animation: clx-spin 0.8s linear infinite;\n}\n\n@keyframes clx-spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n.clx-cmd-badge {\n  display: inline-flex;\n  align-items: center;\n  padding: 0 6px;\n  border-radius: 999px;\n  corner-shape: round;\n  font-size: 10.5px;\n  line-height: 17px;\n  white-space: nowrap;\n  border: 1px solid var(--dsw-alias-border-l2);\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-cmd-badge.bad {\n  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-cmd-badge.bg {\n  border-color: color-mix(in srgb, #2B93C4 40%, transparent);\n  color: #2B93C4;\n}\n\n.clx-cmd-dir {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  vertical-align: 1px;\n  max-width: min(40%, 180px);\n  margin-right: 6px;\n  padding: 0 6px;\n  border-radius: 5px;\n  font: 500 11px/18px var(--dsw-font-family, inherit);\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-bg-layer-1);\n  border: 1px solid var(--dsw-alias-border-l1);\n  white-space: nowrap;\n}\n\n.clx-cmd-dir svg {\n  flex: none;\n  opacity: 0.7;\n}\n\n.clx-cmd-dir > span {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.clx-cmdtext .prog {\n  color: var(--dsw-alias-state-business-primary);\n  font-weight: 600;\n}\n\n.clx-cmdtext .op {\n  color: var(--dsw-alias-label-tertiary);\n  font-weight: 600;\n}\n\n.clx-cmdtext .redir {\n  color: #D2555A;\n}\n\n.clx-cmdtext .str {\n  color: #2F8F5B;\n}\n\n.clx-cmdtext .flag {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-cmd-item.failed > .clx-cmd-row .cmd {\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-node.open > .clx-cmd-row {\n  background: transparent;\n}\n\n.clx-node.open > .clx-cmd-row:hover {\n  background: color-mix(in srgb, var(--cat) 9%, transparent);\n}\n\n.clx-cmd-detail {\n  padding: 0 12px 12px 54px;\n}\n\n.clx-cmd-desc {\n  font-size: 12.5px;\n  color: var(--dsw-alias-label-secondary);\n  margin-bottom: 6px;\n}\n\n.clx-cmd-meta {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 16px;\n  font-size: 12px;\n  margin-bottom: 8px;\n}\n\n.clx-cmd-meta span {\n  display: inline-flex;\n  gap: 6px;\n  min-width: 0;\n}\n\n.clx-cmd-meta i {\n  font-style: normal;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-cmd-meta b {\n  font-weight: 500;\n  color: var(--dsw-alias-label-primary);\n  overflow-wrap: anywhere;\n}\n\n@container (max-width: 880px) {\n  .clx-cmd {\n    grid-template-columns: minmax(0, 1fr);\n  }\n  .clx-cmd-tiles {\n    grid-template-columns: repeat(4, minmax(0, 1fr));\n  }\n  .clx-cmd-progs {\n    display: grid;\n    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));\n    column-gap: 8px;\n  }\n  .clx-cmd-progs {\n    max-height: 220px;\n  }\n}\n@container (max-width: 560px) {\n  .clx-cmd-tiles {\n    grid-template-columns: 1fr 1fr;\n  }\n  .clx-cmd-row {\n    grid-template-columns: 12px 14px minmax(0, 1fr) 52px;\n  }\n  .clx-cmd-row .tags, .clx-cmd-row .when {\n    display: none;\n  }\n  .clx-cmd-detail {\n    padding: 0 10px 10px 12px;\n  }\n}\n.clx-minibar.two {\n  display: flex;\n  gap: 2px;\n  background: none;\n}\n\n.clx-minibar.two > span {\n  border-radius: 2px;\n}\n\n.clx-catitem .name {\n  font-weight: 550;\n  font-size: 12.5px;\n  word-break: break-all;\n}\n\n.clx-catitem .desc {\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n  display: -webkit-box;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n}\n\n.clx-catitem .tok {\n  font-size: 12px;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-secondary);\n  white-space: nowrap;\n}\n\n.clx-catfoot {\n  display: flex;\n  gap: 6px;\n  flex-wrap: wrap;\n  margin-top: 8px;\n}\n\n@container (max-width: 560px) {\n  .clx-catrow {\n    grid-template-columns: minmax(0, 1fr) 58px 52px;\n  }\n  .clx-catrow > :nth-child(2), .clx-catrow > :nth-child(5) {\n    display: none;\n  }\n  .clx-hero {\n    flex-wrap: wrap;\n  }\n  .clx-hero-side {\n    border-left: 0;\n    padding-left: 0;\n    width: 100%;\n  }\n}\n.clx-legend {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 12px;\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-legend span {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n}\n\n.clx-msgtools {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n  align-items: center;\n  margin-bottom: 8px;\n}\n\n.clx-msgtools input {\n  flex: 1 1 160px;\n  min-width: 0;\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 7px;\n  padding: 5px 8px;\n  font-size: 12.5px;\n}\n\n.clx-chips {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n  margin-bottom: 8px;\n}\n\n.clx-chip {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 999px;\n  corner-shape: round;\n  padding: 2px 8px;\n  font-size: 11.5px;\n  cursor: pointer;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-chip[aria-pressed=true] {\n  background: var(--dsw-alias-interactive-bg-active);\n  color: var(--dsw-alias-label-primary);\n  border-color: var(--dsw-alias-border-l3);\n}\n\n.clx-node-row {\n  display: grid;\n  grid-template-columns: 12px 36px minmax(0, 1fr) 64px;\n  gap: 8px;\n  align-items: center;\n  padding: 8px 10px;\n  cursor: pointer;\n  border-radius: 10px;\n  transition: background-color 0.15s ease, box-shadow 0.15s ease;\n}\n\n.clx-node-row:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-node-row .seq {\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-node-row .main {\n  min-width: 0;\n}\n\n.clx-node-row .line1 {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n  min-width: 0;\n}\n\n.clx-node-row .prev {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 12.5px;\n}\n\n.clx-node-row .tok {\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n  font-size: 12.5px;\n}\n\n.clx-minibar {\n  height: 3px;\n  border-radius: 2px;\n  margin-top: 3px;\n  background: var(--dsw-alias-border-l1);\n  overflow: hidden;\n}\n\n.clx-minibar > span {\n  display: block;\n  height: 100%;\n}\n\n.clx-tag {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  white-space: nowrap;\n}\n\n.clx-callid {\n  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);\n  font-size: 11px;\n  max-width: 24ch;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-detail-meta {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 10px;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n  margin-bottom: 6px;\n}\n\n.clx-part {\n  margin-top: 8px;\n}\n\n.clx-part-head {\n  display: flex;\n  gap: 8px;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n  margin-bottom: 3px;\n}\n\n.clx-pre {\n  margin: 0;\n  max-height: 360px;\n  overflow: auto;\n  white-space: pre-wrap;\n  word-break: break-word;\n  background: var(--dsw-alias-bg-layer-2);\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 7px;\n  padding: 8px;\n  font-size: 12px;\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n}\n\n.clx-rich.bare {\n  margin-top: 0;\n  border: 0;\n  border-radius: 0;\n  background: none;\n  overflow: visible;\n}\n\n.clx-rich.bare + .clx-rich.bare {\n  margin-top: 10px;\n  padding-top: 8px;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n}\n\n.clx-rich.bare > .clx-rich-head {\n  padding: 4px 0 6px;\n  background: none;\n  border-bottom: 0;\n  font-size: 11.5px;\n}\n\n.clx-rich.bare > .clx-rich-note {\n  margin: 0 0 8px;\n  border-radius: 7px;\n  border-bottom: 0;\n}\n\n.clx-rich.bare > .clx-rich-body {\n  padding: 2px 2px 4px;\n  font-size: 13px;\n}\n\n.clx-rich.bare > .clx-rich-body:has(> [class*=json], > .clx-plain.mono) {\n  padding: 8px 10px;\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-1);\n}\n\n.clx-rich.bare > .clx-rich-body.flush {\n  padding: 0;\n  border-radius: 8px;\n  overflow: hidden;\n  background: var(--dsw-alias-bg-layer-1);\n}\n\n.clx-rich.bare .clx-code [data-code-block-content], .clx-rich.bare .clx-code pre {\n  background: var(--dsw-alias-bg-layer-1) !important;\n}\n\n.clx-rich.bare > .clx-rich-more {\n  border-top: 0;\n  border-radius: 6px;\n  margin-top: 4px;\n}\n\n.clx-rich {\n  margin-top: 8px;\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 10px;\n  background: var(--dsw-alias-bg-layer-1);\n  overflow: hidden;\n}\n\n.clx-rich-head {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 8px;\n  row-gap: 4px;\n  padding: 6px 10px;\n  font-size: 12px;\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  background: var(--dsw-alias-bg-layer-2);\n}\n\n.clx-rich-head b {\n  font-weight: 600;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-rich-modes {\n  margin-left: auto;\n  display: inline-flex;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 6px;\n  overflow: hidden;\n}\n\n.clx-seg {\n  border: 0;\n  background: transparent;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11.5px;\n  padding: 2px 8px;\n  cursor: pointer;\n}\n\n.clx-seg + .clx-seg {\n  border-left: 1px solid var(--dsw-alias-border-l2);\n}\n\n.clx-seg[aria-pressed=true] {\n  background: var(--dsw-alias-interactive-bg-active);\n  color: var(--dsw-alias-label-primary);\n}\n\n/* 「↗ 预览」: opens the file a tool touched in dsh's right Sidebar (the snapshot stays inline) */\n.clx-filepreview {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n}\n\n.clx-filebtn {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-state-business-primary);\n  font-size: 11.5px;\n  line-height: 1.4;\n  padding: 2px 8px;\n  border-radius: 6px;\n  cursor: pointer;\n  white-space: nowrap;\n  transition: background-color 0.15s ease, border-color 0.15s ease;\n}\n\n.clx-filebtn:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n  border-color: var(--dsw-alias-state-business-primary);\n}\n\n.clx-filebtn:focus-visible {\n  outline: 2px solid var(--dsw-alias-border-focus, #4d8cff);\n  outline-offset: 1px;\n}\n\n.clx-filebtn svg {\n  flex: none;\n}\n\n.clx-filepreview-note {\n  font-size: 11px;\n  color: var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary));\n  overflow-wrap: anywhere;\n}\n\n.clx-rich-body {\n  padding: 10px 14px;\n  font-size: 13.5px;\n  line-height: 1.6;\n  color: var(--dsw-alias-label-primary);\n  overflow-wrap: anywhere;\n}\n\n.clx-rich-body.folded {\n  max-height: 420px;\n  overflow: hidden;\n  -webkit-mask-image: linear-gradient(#000 78%, transparent);\n  mask-image: linear-gradient(#000 78%, transparent);\n}\n\n.clx-rich-more {\n  display: block;\n  width: 100%;\n  border: 0;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  padding: 6px;\n  cursor: pointer;\n}\n\n.clx-rich-more:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-md {\n  min-width: 0;\n}\n\n.clx-rich-body.flush {\n  padding: 0;\n}\n\n.clx-code {\n  position: relative;\n}\n\n.clx-code :has(> [data-code-block-banner]) {\n  position: absolute;\n  top: 6px;\n  right: 8px;\n  z-index: 1;\n  height: auto;\n  min-height: 0;\n  padding: 0;\n  margin: 0;\n  background: none;\n  border: 0;\n}\n\n.clx-code [data-code-block-banner] {\n  padding: 0;\n  background: none;\n  border: 0;\n  min-height: 0;\n}\n\n.clx-code [data-code-block-banner] > :first-child {\n  display: none;\n}\n\n.clx-code > * {\n  margin: 0 !important;\n  border: 0 !important;\n  border-radius: 0 !important;\n}\n\n.clx-rich-note {\n  font-size: 11.5px;\n  padding: 6px 10px;\n  color: var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary));\n  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent);\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  overflow-wrap: anywhere;\n}\n\n.clx-md > :first-child {\n  margin-top: 0;\n}\n\n.clx-md > :last-child {\n  margin-bottom: 0;\n}\n\n.clx-plain {\n  margin: 0;\n  white-space: pre-wrap;\n  word-break: break-word;\n  font-size: 12.5px;\n  line-height: 1.55;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-plain.mono {\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-size: 12px;\n}\n\n.clx-disc-head {\n  display: flex;\n  gap: 8px;\n  align-items: flex-start;\n  padding: 8px 10px;\n  cursor: pointer;\n  border-radius: 10px;\n  transition: background-color 0.15s ease, box-shadow 0.15s ease;\n}\n\n.clx-disc-head:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -2px;\n}\n\n.clx-disc-head:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-disc-caret {\n  display: inline-flex;\n  width: 12px;\n  flex: none;\n  padding-top: 3px;\n}\n\n.clx-disc-head > :last-child {\n  flex: 1;\n  min-width: 0;\n}\n\n.clx-src-row {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 4px 10px;\n  font-size: 12.5px;\n}\n\n.clx-src-name {\n  font-weight: 600;\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-size: 12.5px;\n  overflow-wrap: anywhere;\n}\n\n.clx-src-tok {\n  margin-left: auto;\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-src-meta {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 12px;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n  margin-bottom: 2px;\n  overflow-wrap: anywhere;\n}\n\n.clx-src-meta a, .clx-link {\n  color: var(--dsw-alias-state-business-primary);\n  cursor: pointer;\n  font-size: 11.5px;\n}\n\n.clx-src-path {\n  font-size: 12px;\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  overflow-wrap: anywhere;\n  margin-bottom: 8px;\n}\n\n.clx-skill-desc {\n  font-size: 12.5px;\n  color: var(--dsw-alias-label-secondary);\n  margin-top: 3px;\n  line-height: 1.5;\n  overflow-wrap: anywhere;\n}\n\n.clx-badge {\n  font-size: 11px;\n  padding: 0 7px;\n  border-radius: 9px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  color: var(--dsw-alias-label-secondary);\n  white-space: nowrap;\n}\n\n.clx-badge.ok {\n  border-color: transparent;\n  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, transparent);\n  color: var(--dsw-alias-state-success-primary);\n}\n\n.clx-badge.dim {\n  color: var(--dsw-alias-label-tertiary);\n  border-style: dashed;\n}\n\n.clx-empty {\n  font-size: 12.5px;\n  color: var(--dsw-alias-label-tertiary);\n  padding: 10px;\n  border: 1px dashed var(--dsw-alias-border-l2);\n  border-radius: 8px;\n}\n\n.clx-memtab {\n  display: grid;\n  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);\n  gap: 12px;\n  align-items: start;\n}\n\n.clx-memtab-l, .clx-memtab-r {\n  min-width: 0;\n  container-type: inline-size;\n}\n\n.clx-ft {\n  grid-template-columns: max-content 32px minmax(0, 1fr) !important;\n}\n\n@container (max-width: 1020px) {\n  .clx-memtab {\n    grid-template-columns: minmax(0, 1fr);\n  }\n}\n.clx-ftcard > .clx-card-head {\n  margin-bottom: 2px;\n}\n\n.clx-ft-legend {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  font-size: 11.5px;\n}\n\n.clx-ft-legend {\n  flex-wrap: wrap;\n}\n\n.clx-ft-legend .clx-chip {\n  margin-left: 6px;\n  white-space: nowrap;\n}\n\n.clx-ft {\n  display: grid;\n  grid-template-columns: max-content minmax(28px, 110px) minmax(0, 1fr);\n  row-gap: 1px;\n  padding: 4px 0 2px;\n}\n\n.clx-ft-row {\n  display: grid;\n  grid-column: 1/-1;\n  grid-template-columns: subgrid;\n  align-items: center;\n  min-height: 32px;\n  padding: 0 10px;\n  border-radius: 9px;\n  transition: background-color 0.15s ease;\n  animation: clx-fade 0.35s ease both;\n  animation-delay: calc(var(--i, 0) * 12ms);\n}\n\n.clx-ft-row:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-ft-row.open {\n  cursor: pointer;\n}\n\n.clx-ft-row.open:hover .clx-ft-name {\n  text-decoration: underline;\n  text-underline-offset: 2px;\n  text-decoration-color: color-mix(in srgb, var(--ft) 60%, transparent);\n}\n\n.clx-ft-st.link {\n  cursor: pointer;\n}\n\n.clx-ft-st.link:hover {\n  box-shadow: 0 0 0 1px color-mix(in srgb, #C9772F 55%, transparent);\n}\n\n.clx-ft-st.link:focus-visible {\n  outline: 2px solid color-mix(in srgb, #C9772F 55%, transparent);\n  outline-offset: 1px;\n}\n\n.clx-ft-note {\n  margin: 2px 2px 6px;\n  font-size: 12px;\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-ft-row.top {\n  min-height: 40px;\n  margin-top: 10px;\n  background: color-mix(in srgb, var(--ft) 8%, transparent);\n}\n\n.clx-ft-row.top:first-child {\n  margin-top: 0;\n}\n\n.clx-ft-row.top:hover {\n  background: color-mix(in srgb, var(--ft) 12%, transparent);\n}\n\n.clx-ft-tree {\n  display: flex;\n  align-items: center;\n  gap: 7px;\n  min-width: 0;\n  align-self: stretch;\n}\n\n.clx-ft-g {\n  position: relative;\n  align-self: stretch;\n  flex: none;\n  width: 20px;\n  margin-right: -7px;\n}\n\n.clx-ft-g.pipe::before, .clx-ft-g.tee::before, .clx-ft-g.elbow::before {\n  content: \"\";\n  position: absolute;\n  left: 8px;\n  top: 0;\n  bottom: 0;\n  border-left: 1.5px solid color-mix(in srgb, var(--dsw-alias-label-tertiary) 35%, transparent);\n}\n\n.clx-ft-g.elbow::before {\n  bottom: 50%;\n  border-bottom-left-radius: 5px;\n}\n\n.clx-ft-g.tee::after, .clx-ft-g.elbow::after {\n  content: \"\";\n  position: absolute;\n  left: 8px;\n  right: 3px;\n  top: 50%;\n  border-top: 1.5px solid color-mix(in srgb, var(--dsw-alias-label-tertiary) 35%, transparent);\n}\n\n.clx-ft-g + .clx-ft-icon, .clx-ft-g + .clx-linkbtn {\n  margin-left: 7px;\n}\n\n.clx-ft-icon {\n  flex: none;\n}\n\n.clx-ft-row.top .clx-ft-icon {\n  width: 17px;\n  height: 17px;\n}\n\n.clx-ft-name {\n  font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;\n  color: var(--dsw-alias-label-primary);\n  white-space: nowrap;\n}\n\n.clx-ft-name.dir {\n  font-weight: 600;\n}\n\n.clx-ft-row.top .clx-ft-name {\n  font-size: 13.5px;\n  font-weight: 650;\n}\n\n.clx-ft-st {\n  flex: none;\n  display: inline-flex;\n  align-items: center;\n  padding: 0 7px;\n  border-radius: 999px;\n  corner-shape: round;\n  font-size: 11px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-bg-layer-1);\n  white-space: nowrap;\n}\n\n.clx-ft-st.loaded {\n  color: #fff;\n  background: #C9772F;\n  font-weight: 600;\n}\n\n.clx-ft-st.missing {\n  background: transparent;\n  border: 1px dashed var(--dsw-alias-border-l3, var(--dsw-alias-border-l2));\n  line-height: 16px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-ft-row.missing .clx-ft-name {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-ft-row.missing .clx-ft-icon {\n  opacity: 0.5;\n}\n\n.clx-ft-lead {\n  align-self: center;\n  margin: 0 10px;\n  border-top: 1.5px dotted color-mix(in srgb, var(--dsw-alias-label-tertiary) 40%, transparent);\n}\n\n.clx-ft-pill {\n  justify-self: start;\n  max-width: 100%;\n  padding: 3px 12px;\n  border-radius: 999px;\n  corner-shape: round;\n  font-size: 12.5px;\n  line-height: 1.45;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  background: color-mix(in srgb, var(--ft) 14%, transparent);\n  color: color-mix(in srgb, var(--ft) 70%, var(--dsw-alias-label-primary));\n}\n\n.clx-ft-row.top .clx-ft-pill {\n  font-weight: 600;\n  background: color-mix(in srgb, var(--ft) 20%, transparent);\n}\n\n.clx-ft-row.missing .clx-ft-pill {\n  background: transparent;\n  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ft) 28%, transparent);\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-ft-row.more {\n  min-height: 26px;\n}\n\n.clx-ft-row.more:hover {\n  background: transparent;\n}\n\n.clx-ft-row.more > .clx-ft-tree {\n  grid-column: 1/-1;\n}\n\n@container (max-width: 620px) {\n  .clx-ft {\n    display: flex;\n    flex-direction: column;\n  }\n  .clx-ft-row {\n    display: flex;\n    flex-wrap: wrap;\n    padding: 4px 8px;\n  }\n  .clx-ft-lead {\n    display: none;\n  }\n  .clx-ft-tree {\n    flex: 1 1 100%;\n  }\n  .clx-ft-pill {\n    margin: 2px 0 2px 26px;\n    font-size: 11.5px;\n    white-space: normal;\n  }\n  .clx-ft-tree {\n    min-width: 0;\n  }\n  .clx-ft-name {\n    min-width: 0;\n    overflow: hidden;\n    text-overflow: ellipsis;\n  }\n}\n.clx-mem-hint {\n  font-size: 12px;\n  color: var(--dsw-alias-label-tertiary);\n  margin: -2px 2px 10px;\n}\n\n.clx-mem-files {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  margin-bottom: 10px;\n}\n\n.clx-mem-loc-head {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 4px 10px;\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-secondary);\n  margin: 4px 2px 6px;\n}\n\n.clx-mem-loc-head > .clx-muted {\n  font-weight: 400;\n  font-size: 11.5px;\n}\n\n.clx-mem-legend {\n  margin-left: auto;\n  display: inline-flex;\n  gap: 4px;\n  font-weight: 400;\n}\n\n.clx-mem-legend .clx-mem-pill {\n  font-size: 10.5px;\n  line-height: 16px;\n  padding: 0 6px;\n}\n\n.clx-mem-empty {\n  font-size: 12.5px;\n  color: var(--dsw-alias-label-secondary);\n  padding: 8px 10px;\n  margin-bottom: 6px;\n  border-radius: 10px;\n  background: color-mix(in srgb, var(--cat-memory, #B6992D) 8%, transparent);\n}\n\n.clx-mem-locs {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n\n.clx-mem-loc {\n  display: grid;\n  grid-template-columns: 112px minmax(0, 1fr) auto;\n  align-items: center;\n  gap: 10px;\n  padding: 7px 10px;\n  border-radius: 10px;\n  font-size: 12.5px;\n}\n\n.clx-mem-loc:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-mem-loc .scope {\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n  white-space: nowrap;\n}\n\n.clx-mem-loc .dir {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-mem-loc .dir svg {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.clx-mem-loc .dir > span {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-mem-loc .files {\n  display: inline-flex;\n  flex-wrap: wrap;\n  justify-content: flex-end;\n  gap: 4px;\n}\n\n.clx-mem-pill {\n  display: inline-flex;\n  align-items: center;\n  padding: 0 7px;\n  border-radius: 999px;\n  corner-shape: round;\n  font: 11px/18px ui-monospace, SFMono-Regular, Menlo, monospace;\n  white-space: nowrap;\n  border: 1px solid transparent;\n}\n\n.clx-mem-pill.loaded {\n  background: color-mix(in srgb, #B6992D 18%, transparent);\n  color: color-mix(in srgb, #B6992D 70%, var(--dsw-alias-label-primary));\n  border-color: color-mix(in srgb, #B6992D 35%, transparent);\n}\n\n.clx-mem-pill.exists {\n  border-color: color-mix(in srgb, #B6992D 55%, transparent);\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-mem-pill.missing {\n  color: var(--dsw-alias-label-tertiary);\n  border-color: var(--dsw-alias-border-l1);\n  opacity: 0.75;\n}\n\n.clx-rt-list {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n\n.clx-rt {\n  display: grid;\n  grid-template-columns: 112px minmax(0, 1fr);\n  gap: 10px;\n  padding: 7px 10px;\n  border-radius: 10px;\n  font-size: 12.5px;\n  line-height: 1.55;\n}\n\n.clx-rt:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-rt .k {\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-tertiary);\n  padding-top: 1px;\n}\n\n.clx-rt .v {\n  min-width: 0;\n  color: var(--dsw-alias-label-primary);\n  overflow-wrap: anywhere;\n}\n\n.clx-card-head > .clx-link {\n  font-size: 11.5px;\n}\n\n@container (max-width: 560px) {\n  .clx-mem-loc {\n    grid-template-columns: minmax(0, 1fr) auto;\n  }\n  .clx-mem-loc .scope {\n    grid-column: 1/-1;\n  }\n  .clx-rt {\n    grid-template-columns: minmax(0, 1fr);\n    gap: 2px;\n  }\n  .clx-mem-legend {\n    margin-left: 0;\n  }\n}\n.clx-err {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.clx-warn {\n  color: var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary));\n}\n\n.clx-ok {\n  color: var(--dsw-alias-state-success-primary);\n}\n\n.clx-svg text {\n  fill: var(--dsw-alias-label-tertiary);\n  font-size: 10px;\n}\n\n.clx-tip {\n  font-size: 12px;\n  min-height: 36px;\n  color: var(--dsw-alias-label-secondary);\n  margin-top: 6px;\n  word-break: break-word;\n}\n\n.clx-spin {\n  opacity: 0.6;\n}\n\n.clx-pane {\n  container-type: inline-size;\n}\n\n.clx-flow-wrap {\n  display: grid;\n  grid-template-columns: minmax(0, 600px) minmax(260px, 1fr);\n  gap: 12px;\n  align-items: start;\n}\n\n@container (max-width: 860px) {\n  .clx-flow-wrap {\n    grid-template-columns: minmax(0, 1fr);\n  }\n}\n.clx-flow-diagram {\n  padding: 8px;\n}\n\n.clx-flow-node text {\n  pointer-events: none;\n}\n\n.clx-flow-label {\n  font-size: 12.5px;\n  font-weight: 600;\n  fill: var(--dsw-alias-label-primary);\n}\n\n.clx-flow-label.side {\n  font-size: 11.5px;\n  font-weight: 500;\n  fill: var(--dsw-alias-label-secondary);\n}\n\n.clx-flow-label.inv, .clx-flow-count.inv {\n  fill: #fff;\n}\n\n.clx-flow-count {\n  font-size: 10.5px;\n  fill: var(--dsw-alias-label-tertiary);\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-flow-boxlabel {\n  font-size: 11px;\n  font-weight: 700;\n  letter-spacing: 0.08em;\n}\n\n.clx-flow-side {\n  font-size: 10px;\n  fill: var(--dsw-alias-label-tertiary);\n}\n\n.clx-flow-glow {\n  animation: clx-pulse 1.1s ease-in-out infinite;\n}\n\n.clx-flow-tok {\n  font-size: 11px;\n  font-weight: 600;\n  fill: var(--dsw-alias-label-secondary);\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-flow-tok.inv {\n  fill: #fff;\n}\n\n.clx-flow-num {\n  font-size: 10px;\n  font-weight: 700;\n  fill: #fff;\n}\n\n.clx-flow-trace {\n  fill: none;\n  stroke-width: 2.4;\n  stroke-dasharray: 7 5;\n  animation: clx-dash 0.9s linear infinite;\n}\n\n@keyframes clx-dash {\n  to {\n    stroke-dashoffset: -12;\n  }\n}\n.clx-flow-status {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n  align-items: center;\n  font-size: 13px;\n}\n\n.clx-live-dot {\n  display: inline-block;\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  corner-shape: round;\n  flex: none;\n}\n\n.clx-live-dot.on {\n  animation: clx-pulse 1.1s ease-in-out infinite;\n}\n\n.clx-flow-big {\n  font-size: 13px;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-flow-big b {\n  font-size: 18px;\n}\n\n.clx-flow-comp {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px 12px;\n  font-size: 11.5px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.clx-flow-path {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n}\n\n.clx-flow-chip {\n  font-size: 11.5px;\n  padding: 1px 7px;\n  border-radius: 10px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  white-space: nowrap;\n}\n\n.clx-flow-chip b {\n  color: var(--dsw-alias-state-business-primary);\n}\n\n.clx-flow-steps {\n  max-height: 460px;\n  overflow: auto;\n  margin: 0 -6px;\n  padding: 0 6px;\n}\n\n.clx-flow-step {\n  display: grid;\n  grid-template-columns: 34px minmax(0, 1fr) auto;\n  gap: 8px;\n  align-items: center;\n  padding: 4px 10px 4px 30px;\n  border-radius: 8px;\n  cursor: pointer;\n  font-size: 12px;\n}\n\n.clx-flow-step:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-flow-step-tools {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-flow-step-ctx {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  font-variant-numeric: tabular-nums;\n  font-size: 11.5px;\n}\n\n.clx-flow-mini {\n  display: inline-block;\n  width: 46px;\n  height: 4px;\n  border-radius: 2px;\n  background: var(--dsw-alias-border-l1);\n  overflow: hidden;\n}\n\n.clx-flow-mini > span {\n  display: block;\n  height: 100%;\n  background: var(--dsw-alias-state-business-primary);\n  opacity: 0.75;\n}\n\n.clx-flow-job {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n}\n\n.clx-flow-job .clx-live-dot {\n  margin-right: 2px;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .clx-flow-trace, .clx-flow-glow, .clx-live-dot.on {\n    animation: none;\n  }\n}\n/* 概览 motion: cards rise in, the usage bar sweeps open, category rows and bars stagger in, the growth line draws itself */\n.clx-ov > .clx-card {\n  animation: clx-rise 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) both;\n}\n\n.clx-ov > .clx-card:nth-child(2) {\n  animation-delay: 0.07s;\n}\n\n.clx-ov > .clx-card:nth-child(3) {\n  animation-delay: 0.14s;\n}\n\n.clx-ov > .clx-card:nth-child(4) {\n  animation-delay: 0.21s;\n}\n\n.clx-ov > .clx-card:nth-child(n+5) {\n  animation-delay: 0.28s;\n}\n\n@keyframes clx-rise {\n  from {\n    opacity: 0;\n    transform: translateY(10px);\n  }\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n.clx-bar.anim {\n  animation: clx-reveal 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) 0.12s both;\n}\n\n@keyframes clx-reveal {\n  from {\n    clip-path: inset(0 100% 0 0);\n  }\n  to {\n    clip-path: inset(0 0 0 0);\n  }\n}\n.clx-bar > span {\n  transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);\n}\n\n.clx-ov .clx-catblock, .clx-ov .clx-catrow.static {\n  animation: clx-slide 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both;\n  animation-delay: calc(0.18s + var(--i, 0) * 40ms);\n}\n\n@keyframes clx-slide {\n  from {\n    opacity: 0;\n    transform: translateX(-6px);\n  }\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n.clx-catbar > span {\n  transform-origin: left center;\n  animation: clx-grow 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both;\n  animation-delay: calc(0.28s + var(--i, 0) * 50ms);\n  transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);\n}\n\n@keyframes clx-grow {\n  from {\n    transform: scaleX(0);\n  }\n  to {\n    transform: scaleX(1);\n  }\n}\n.clx-catrow {\n  transition: background-color 0.15s ease;\n}\n\n.clx-catrow[role=button]:active {\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\n.clx-catdetail {\n  animation: clx-drop 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) both;\n}\n\n@keyframes clx-drop {\n  from {\n    opacity: 0;\n    transform: translateY(-6px);\n  }\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n.clx-trend-line {\n  stroke-dasharray: 1;\n  stroke-dashoffset: 1;\n  animation: clx-draw 1.4s cubic-bezier(0.45, 0, 0.2, 1) 0.3s forwards;\n}\n\n@keyframes clx-draw {\n  to {\n    stroke-dashoffset: 0;\n  }\n}\n.clx-trend-area {\n  animation: clx-fadein 0.9s ease 0.8s both;\n}\n\n@keyframes clx-fadein {\n  from {\n    opacity: 0;\n  }\n}\n.clx-ibar {\n  height: 14px;\n}\n\n.clx-ibar > span {\n  cursor: pointer;\n  transition: width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s ease, filter 0.2s ease;\n}\n\n.clx-ibar > span[data-k]:not(.free) {\n  min-width: 3px;\n}\n\n.clx-ibar > span:hover {\n  filter: brightness(1.08) saturate(1.1);\n}\n\n.clx-ibar[data-active] > span:not(.on) {\n  opacity: 0.22;\n}\n\n.clx-ibar > span.free.on {\n  background: var(--dsw-alias-border-l2);\n}\n\n.clx-ilegend {\n  gap: 2px 2px;\n  margin-left: -6px;\n}\n\n.clx-ilegend button {\n  all: unset;\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  padding: 2px 6px;\n  border-radius: 6px;\n  cursor: pointer;\n  transition: opacity 0.2s ease, background-color 0.15s ease, color 0.15s ease;\n}\n\n.clx-ilegend button:hover, .clx-ilegend button.on {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-ilegend button[aria-pressed=true] {\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\n.clx-ilegend button:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -2px;\n}\n\n.clx-ilegend[data-active] button:not(.on) {\n  opacity: 0.45;\n}\n\n.clx-catblock.hl > .clx-catrow {\n  background: color-mix(in srgb, var(--cat) 12%, transparent);\n}\n\n.clx-catblock > .clx-catrow {\n  transition: background-color 0.2s ease;\n}\n\n.clx-chev {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 12px;\n  height: 12px;\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), color 0.15s;\n}\n\n.clx-chev svg {\n  display: block;\n}\n\n.clx-chev.open {\n  transform: rotate(90deg);\n  color: var(--dsw-alias-label-primary);\n}\n\n:is(.clx-node-row, .clx-catrow, .clx-trow, .clx-urow, .clx-disc-head, .clx-flow-turn):hover .clx-chev {\n  color: var(--dsw-alias-label-primary);\n}\n\n.clx-node-row:focus-visible, .clx-trow:focus-visible, .clx-urow:focus-visible, .clx-flow-turn:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -2px;\n}\n\n.clx-trow, .clx-urow {\n  display: grid;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 10px;\n  border-radius: 10px;\n  font-size: 12.5px;\n  cursor: pointer;\n  transition: background-color 0.15s ease, box-shadow 0.15s ease;\n}\n\n.clx-trow {\n  grid-template-columns: 12px minmax(0, 1.4fr) minmax(70px, 0.6fr) 44px minmax(50px, 1fr) 56px;\n}\n\n.clx-urow {\n  grid-template-columns: 12px minmax(0, 1.6fr) 44px 64px 44px 64px 64px;\n}\n\n.clx-trow.head, .clx-urow.head {\n  cursor: default;\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary);\n  padding: 0 10px 4px;\n}\n\n.clx-trow.head > span:nth-child(n+4), .clx-urow.head > span:nth-child(n+3) {\n  text-align: right;\n}\n\n.clx-trow[role=button]:hover, .clx-urow[role=button]:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-trow .num, .clx-urow .num {\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n}\n\n.clx-tblock {\n  animation: clx-fade 0.35s ease both;\n  animation-delay: calc(var(--i, 0) * 18ms);\n}\n\n.clx-tname {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  min-width: 0;\n}\n\n.clx-tname code, .clx-tcode {\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-size: 12px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-ubar {\n  display: flex;\n  gap: 1px;\n  flex: 1;\n  min-width: 30px;\n  max-width: 160px;\n  height: 5px;\n  margin-left: auto;\n  border-radius: 3px;\n  overflow: hidden;\n  background: var(--dsw-alias-border-l1);\n}\n\n.clx-ubar > span {\n  transform-origin: left;\n  animation: clx-grow 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.15s both;\n}\n\n.clx-params {\n  margin-top: 10px;\n}\n\n.clx-params-head {\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-secondary);\n  margin-bottom: 4px;\n}\n\n.clx-param {\n  padding: 6px 0;\n  border-top: 1px dashed var(--dsw-alias-border-l1);\n}\n\n.clx-param-head {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  flex-wrap: wrap;\n}\n\n.clx-param-head code {\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-size: 12px;\n  font-weight: 600;\n}\n\n.clx-param-desc {\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary);\n  margin-top: 2px;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n}\n\n.clx-param-enum {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n  margin-top: 4px;\n}\n\n.clx-param-enum code {\n  font-size: 11px;\n  padding: 1px 5px;\n  border-radius: 4px;\n  background: var(--dsw-alias-bg-layer-2);\n}\n\n.clx-badge.warn {\n  color: var(--dsw-alias-state-warn-primary);\n  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent);\n}\n\n@container (max-width: 620px) {\n  .clx-trow {\n    grid-template-columns: 12px minmax(0, 1fr) 44px 56px;\n  }\n  .clx-trow > :nth-child(3), .clx-trow > :nth-child(5) {\n    display: none;\n  }\n  .clx-urow {\n    grid-template-columns: 12px minmax(0, 1fr) 44px 44px 64px;\n  }\n  .clx-urow > :nth-child(4), .clx-urow > :nth-child(7) {\n    display: none;\n  }\n}\n/* every section: cards rise in, list rows fade in, bars grow; state changes ease */\n.clx-main .clx-col > .clx-card, .clx-flow-side-panel > .clx-card, .clx-flow-wrap > .clx-card {\n  animation: clx-rise 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;\n}\n\n.clx-main .clx-col > .clx-card:nth-child(2), .clx-flow-side-panel > .clx-card:nth-child(2) {\n  animation-delay: 0.07s;\n}\n\n.clx-main .clx-col > .clx-card:nth-child(3), .clx-flow-side-panel > .clx-card:nth-child(3) {\n  animation-delay: 0.14s;\n}\n\n.clx-main .clx-col > .clx-card:nth-child(n+4) {\n  animation-delay: 0.2s;\n}\n\n.clx-flow-side-panel > .clx-card:first-child {\n  animation-delay: 0.05s;\n}\n\n.clx-node {\n  animation: clx-fade 0.3s ease both;\n  animation-delay: calc(var(--i, 0) * 16ms);\n}\n\n@keyframes clx-fade {\n  from {\n    opacity: 0;\n  }\n  to {\n    opacity: 1;\n  }\n}\n.clx-minibar > span {\n  transform-origin: left center;\n  animation: clx-grow 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) 0.1s both;\n  transition: width 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);\n}\n\n.clx-flow-mini > span {\n  transition: width 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);\n}\n\n.clx-chipbtn, .clx-chip, .clx-seg {\n  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;\n}\n\n.clx-flow-step {\n  transition: background-color 0.15s ease, box-shadow 0.15s ease;\n}\n\n.clx-flow-log {\n  transition: background-color 0.15s ease;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .clx-pane *, .clx-pane *::before {\n    animation: none !important;\n    transition: none !important;\n  }\n  .clx-trend-line {\n    stroke-dasharray: none !important;\n    stroke-dashoffset: 0 !important;\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  .clx-ov, .clx-ov * {\n    animation: none !important;\n    transition: none !important;\n  }\n  .clx-trend-line {\n    stroke-dasharray: none;\n    stroke-dashoffset: 0;\n  }\n}\n@keyframes clx-pulse {\n  0%, 100% {\n    opacity: 0.95;\n  }\n  50% {\n    opacity: 0.2;\n  }\n}\n.clx-flow-now {\n  margin-top: 8px;\n  padding: 8px 10px;\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-2);\n  border: 1px solid var(--dsw-alias-border-l1);\n}\n\n.clx-flow-now-head {\n  display: flex;\n  gap: 8px;\n  align-items: baseline;\n  flex-wrap: wrap;\n  margin-bottom: 2px;\n}\n\n.clx-flow-now-text {\n  word-break: break-word;\n  font-size: 12.5px;\n}\n\n.clx-flow-turn-head .clx-chev {\n  align-self: center;\n}\n\n.clx-flow-tgroup.open > .clx-flow-step, .clx-flow-tgroup > .clx-flow-step {\n  animation: clx-fade 0.25s ease both;\n}\n\n.clx-flow-turn:hover, .clx-flow-log:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.clx-flow-turn.cur, .clx-flow-log.cur {\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\n.clx-flow-turn-head {\n  display: flex;\n  gap: 8px;\n  align-items: baseline;\n  flex-wrap: wrap;\n  font-size: 12.5px;\n}\n\n.clx-flow-turn-prompt {\n  font-size: 12px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.clx-flow-log {\n  font-size: 12px;\n  padding: 2px 4px;\n  border-radius: 5px;\n  cursor: pointer;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}"

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
        const SPLIT_CATS = new Set(['assistantText', 'reasoning', 'toolCalls']);
        /** Category name; outside the English UI the English term follows in muted type. */
        function CatName({ t, k }) {
            const key = k === 'buffer' || k === 'free' ? `g.${k}` : `c.${k}`;
            const label = t(key);
            const term = label !== en[key] ? CAT_EN[k] : null;
            return h('span', { className: 'clx-catname' }, h('span', { className: 'zh' }, label), term ? h('span', { className: 'en' }, term) : null);
        }
        /** Nodes holding a category, with the share of each node that belongs to it. */
        function catNodes(data, k) {
            const out = [];
            for (const n of data.nodes || []) {
                let tok = 0;
                if (n.split) {
                    if (!SPLIT_CATS.has(k))
                        continue;
                    const cal = n.tokens ? (n.tokensCal ?? n.tokens) / n.tokens : 1;
                    tok = (n.split[k] || 0) * cal;
                }
                else if (n.category === k) {
                    tok = n.tokensCal ?? n.tokens ?? 0;
                }
                if (tok >= 0.5)
                    out.push({ n, tok });
            }
            return out.sort((a, b) => b.tok - a.tok);
        }
        function CategoryDetail({ k, data, t, sessionId, onShowAll }) {
            const [openSeq, setOpenSeq] = useState(null);
            const [limit, setLimit] = useState(8);
            const color = CAT_COLOR[k] || CAT_COLOR.other;
            if (k === 'systemTools' || k === 'mcpTools') {
                const tools = (data.tools || []).filter((x) => (k === 'mcpTools') === (x.kind === 'mcp'));
                const max = Math.max(1, ...tools.map((x) => x.tokensCal));
                return h('div', { className: 'clx-catdetail', style: { '--cat': color } }, h('div', { className: 'clx-muted', style: { fontSize: 12, marginBottom: 6 } }, fmt(t('ov.cat.tools'), { n: tools.length })), tools.slice(0, limit).map((x) => h('div', { key: x.name, className: 'clx-catitem', title: x.description }, h('div', { className: 'main' }, h('div', { className: 'name' }, x.name, x.kind === 'mcp' ? h('span', { className: 'clx-muted' }, ` · ${x.server}`) : null), x.description ? h('div', { className: 'desc' }, x.description) : null, h('div', { className: 'clx-minibar' }, h('span', { style: { width: `${Math.max(1, x.tokensCal / max * 100)}%`, background: color } }))), h('span', { className: 'tok' }, fmtK(x.tokensCal)))), tools.length > limit ? h('button', { className: 'clx-rich-more', onClick: () => setLimit(limit + 30) }, fmt(t('msg.more'), { n: Math.min(30, tools.length - limit) })) : null);
            }
            if (k === 'skills') {
                const skills = data.skills || [];
                const max = Math.max(1, ...skills.map((x) => x.tokensCal));
                return h('div', { className: 'clx-catdetail', style: { '--cat': color } }, h('div', { className: 'clx-muted', style: { fontSize: 12, marginBottom: 6 } }, t('ov.cat.skills')), skills.map((x) => h('div', { key: x.name, className: 'clx-catitem' }, h('div', { className: 'main' }, h('div', { className: 'name' }, x.name), h('div', { className: 'desc' }, x.description), h('div', { className: 'clx-minibar' }, h('span', { style: { width: `${Math.max(1, x.tokensCal / max * 100)}%`, background: color } }))), h('span', { className: 'tok' }, fmtK(x.tokensCal)))));
            }
            const list = catNodes(data, k);
            const max = Math.max(1, ...list.map((x) => x.tok));
            const files = k === 'memory' ? (data.memoryFiles || []) : [];
            const fileMax = Math.max(1, ...files.map((x) => x.tokens));
            return h('div', { className: 'clx-catdetail', style: { '--cat': color } }, files.length ? h('div', { style: { marginBottom: 8 } }, h('div', { className: 'clx-muted', style: { fontSize: 12, marginBottom: 6 } }, fmt(t('ov.cat.memory'), { n: files.length })), files.map((x) => h('div', { key: x.path, className: 'clx-catitem' }, h('div', { className: 'main' }, h('div', { className: 'name' }, x.path, x.loads > 1 ? h('span', { className: 'clx-muted' }, ` ×${x.loads}`) : null), h('div', { className: 'clx-minibar' }, h('span', { style: { width: `${Math.max(1, x.tokens / fileMax * 100)}%`, background: color } }))), h('span', { className: 'tok' }, fmtK(x.tokens))))) : null, k === 'injected' && (data.injectedKinds || []).length ? h('div', { className: 'clx-chips', style: { marginBottom: 6 } }, data.injectedKinds.map((x) => h('span', { key: x.kind, className: 'clx-chip', style: { cursor: 'default' } }, `${x.kind} ×${x.count} · ${fmtK(x.tokens)}`))) : null, SPLIT_CATS.has(k) ? h('div', { className: 'clx-muted', style: { fontSize: 11.5, marginBottom: 4 } }, t('ov.cat.splitNote')) : null, list.length ? list.slice(0, limit).map(({ n, tok }) => h('div', { key: n.seq, className: `clx-node${openSeq === n.seq ? ' open' : ''}`, style: { '--cat': CAT_COLOR[n.category] || CAT_COLOR.other } }, h(NodeRowSimple, { n: { ...n, tokensCal: tok }, t, max, open: openSeq === n.seq, onClick: () => setOpenSeq(openSeq === n.seq ? null : n.seq) }), openSeq === n.seq ? h(NodeDetail, { sessionId, seq: n.seq, t }) : null))
                : h('div', { className: 'clx-muted', style: { fontSize: 12 } }, t('ov.cat.empty')), h('div', { className: 'clx-catfoot' }, list.length > limit ? h('button', { className: 'clx-chipbtn', onClick: () => setLimit(limit + 20) }, fmt(t('msg.more'), { n: Math.min(20, list.length - limit) })) : null, list.length ? h('button', { className: 'clx-chipbtn', onClick: () => onShowAll(k) }, fmt(t('ov.cat.showAll'), { n: list.length })) : null));
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
        function Overview({ data, t, onJump, onShowCat, sessionId }) {
            const [openCat, setOpenCat] = useState(null);
            const [pick, setPick] = useState(null);
            const [hov, setHov] = useState(null);
            const s = summarize(data);
            const m = data.measured || {};
            const usage = m.lastRequest;
            const cats = CATS.map((k) => ({ key: k, label: t(`c.${k}`), color: CAT_COLOR[k], ...(s.byCat[k] || { tokens: 0, raw: 0, count: 0 }) }));
            const shown = cats.filter((c) => c.tokens > 0 || c.count > 0).sort((a, b) => b.tokens - a.tokens);
            const catMax = Math.max(1, ...shown.map((c) => c.tokens));
            const comp = s.comp;
            const inputTotal = usage ? (usage.inputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.cacheWriteTokens || 0) : 0;
            const warn = comp && comp.thresholdTokens ? (s.used >= comp.thresholdTokens ? 2 : s.used >= comp.thresholdTokens * 0.85 ? 1 : 0) : 0;
            const usedAnim = useCountUp(s.used);
            const side = (k, v, cls = '') => h('div', { className: 'clx-hero-kv' }, h('span', { className: 'k' }, k), h('span', { className: `v${cls ? ` ${cls}` : ''}` }, v));
            return h('div', { className: 'clx-ov' }, h('div', { className: 'clx-card clx-hero-card' }, h('div', { className: 'clx-hero' }, h(Ring, { ratio: s.win ? usedAnim / s.win : 0, size: 76, stroke: 8, warn }), h('div', { className: 'clx-hero-main' }, h('div', null, h('span', { className: 'clx-hero-pct' }, pct(usedAnim, s.win)), h('span', { className: 'clx-sub' }, ` ${t('pop.used')}`)), h('div', { className: 'clx-sub', style: { fontVariantNumeric: 'tabular-nums' } }, `${fmtInt(Math.round(usedAnim))} / ${fmtInt(s.win)} tokens`), h('div', { className: 'clx-muted', style: { fontSize: 12 } }, t(`pop.src.${m.usedSource || 'estimate'}`))), h('div', { className: 'clx-hero-side' }, side(t('ov.model'), [data.model, data.reasoningEffort].filter(Boolean).join(' · ') || '—'), side(t('ov.maxOut'), fmtK(data.maxTokens)), comp && comp.thresholdTokens ? side(t('ov.threshold'), `${fmtK(comp.thresholdTokens)} · ${comp.engine || ''}`) : null, comp && comp.auto && comp.thresholdTokens ? side(t('ov.remaining'), comp.remainingTokens > 0 ? fmtK(comp.remainingTokens) : t('pop.over'), comp.remainingTokens > 0 ? '' : 'clx-warn') : null)), h(HeroBar, {
                cats, s, t, active: hov || pick, pick,
                onHover: setHov,
                onPick: (k) => setPick(pick === k ? null : k),
            })), h('div', { className: 'clx-card' }, h('div', { className: 'clx-card-head' }, h('h4', null, t('ov.categories')), h('span', { className: 'clx-muted' }, t('ov.cat.hint'))), h('div', { className: 'clx-catrow head' }, h('span', null, t('ov.col.cat')), h('span', null, ''), h('span', null, t('ov.col.tokens')), h('span', null, t('ov.col.used')), h('span', null, t('ov.col.count'))), shown.map((c, i) => {
                const open = openCat === c.key;
                return h('div', { key: c.key, id: `clx-cat-${c.key}`, className: `clx-catblock${open ? ' open' : ''}${(hov || pick) === c.key ? ' hl' : ''}`, style: { '--i': i, '--cat': c.color } }, h('div', {
                    className: 'clx-catrow', role: 'button', tabIndex: 0, 'aria-expanded': open,
                    title: `${CAT_EN[c.key]} · ${t('ov.col.window')} ${pct(c.tokens, s.win)} · ${t('ov.col.raw')} ${fmtInt(c.raw)}`,
                    onClick: () => setOpenCat(open ? null : c.key),
                    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpenCat(open ? null : c.key);
                    } },
                }, h('span', { className: 'clx-catcell' }, h(Chevron, { open }), h('i', { className: 'clx-dot', style: { background: c.color } }), h(CatName, { t, k: c.key })), h('span', { className: 'clx-catbar' }, h('span', { style: { width: `${Math.max(1, c.tokens / catMax * 100)}%`, background: c.color } })), h('span', { className: 'num' }, fmtK(c.tokens)), h('span', { className: 'num clx-muted' }, pct(c.tokens, s.used)), h('span', { className: 'num clx-muted' }, c.count || '')), open ? h(CategoryDetail, { k: c.key, data, t, sessionId, onShowAll: onShowCat }) : null);
            }), h('div', { className: 'clx-catrow static', style: { '--i': shown.length } }, h('span', { className: 'clx-catcell' }, h('span', { className: 'clx-caret' }), h('i', { className: 'clx-dot clx-hatch' }), h(CatName, { t, k: 'buffer' })), h('span', { className: 'clx-muted', style: { fontSize: 11.5 } }, pct(s.buffer, s.win)), h('span', { className: 'num' }, fmtK(s.buffer)), h('span', null), h('span', null)), h('div', { className: 'clx-catrow static', style: { '--i': shown.length } }, h('span', { className: 'clx-catcell' }, h('span', { className: 'clx-caret' }), h('i', { className: 'clx-dot free' }), h(CatName, { t, k: 'free' })), h('span', { className: 'clx-muted', style: { fontSize: 11.5 } }, pct(s.free, s.win)), h('span', { className: 'num' }, fmtK(s.free)), h('span', null), h('span', null))), h(Trend, { data, t, onJump }), comp ? h('div', { className: 'clx-card' }, h('h4', null, t('ov.compaction')), h('div', { className: 'clx-kv' }, kv(t('ov.engine'), comp.engine || '—'), kv(t('ov.auto'), comp.auto ? t('ov.on') : t('ov.off')), kv(t('ov.ratio'), typeof comp.thresholdRatio === 'number' ? `${Math.round(comp.thresholdRatio * 100)}%` : '—'), comp.headroomTokens !== undefined ? kv(t('ov.headroom'), fmtInt(comp.headroomTokens)) : null, kv(t('ov.threshold'), fmtInt(comp.thresholdTokens)), comp.emergencyTokens ? kv(t('ov.emergency'), `${fmtInt(comp.emergencyTokens)} (${Math.round(comp.emergencyRatio * 100)}%)`) : null, kv(t('ov.buffer'), fmtInt(comp.bufferTokens)), kv(t('ov.remaining'), fmtInt(comp.remainingTokens)), comp.retainBudget !== undefined ? kv(t('ov.retain'), comp.retainTokens !== undefined ? fmtInt(comp.retainTokens) : `${Math.round((comp.retainRatio || 0) * 100)}% ≈ ${fmtK(comp.retainBudget)}`) : null, comp.summaryMaxTokens ? kv(t('ov.summaryMax'), fmtInt(comp.summaryMaxTokens)) : null, comp.override ? kv(t('ov.override'), `${comp.override.provider}/${comp.override.model}`) : null, kv(t('ov.compactions'), String((data.compactionEvents || []).length))), h('div', { className: 'clx-muted', style: { fontSize: 11.5, marginTop: 8 } }, comp.engine === 'billion-context' ? `${t('ov.biliNote')}${comp.defaults ? ` ${t('ov.biliDefaults')}` : ''}` : t('ov.formula'))) : null, h('div', { className: 'clx-card' }, h(React.Fragment, null, h('h4', null, t('ov.details')), h('h5', { className: 'clx-subh' }, t('ov.measure')), h('div', { className: 'clx-kv' }, kv(t('ov.used'), fmtInt(m.totalTokens)), kv(t('ov.usedSource'), t(`pop.src.${m.usedSource || 'estimate'}`)), kv(t('ov.rawTotal'), fmtInt(m.rawTotalTokens)), m.rawTotalTokens > m.totalTokens ? kv(t('ov.saved'), `${fmtInt(m.rawTotalTokens - m.totalTokens)} (${pct(m.rawTotalTokens - m.totalTokens, m.rawTotalTokens, 0)})`) : null, kv(t('ov.baseline'), t(`ov.baseline.${m.baselineKind || 'none'}`)), kv(t('ov.baselineTokens'), fmtInt(m.baselineTokens)), kv(t('ov.delta'), fmtInt(m.surfaceDeltaTokens)), kv(t('ov.estSum'), fmtInt(m.estimatedSum)), kv(t('ov.factor'), `×${(m.factor || 1).toFixed(3)}`), kv(t('ov.window'), fmtInt(data.contextWindow)), kv(t('ov.events'), `${fmtInt(data.eventCount)} / ${fmtInt((data.nodes || []).length)}`)), h('div', { className: 'clx-muted', style: { fontSize: 11.5, marginTop: 8 } }, t('ov.calNote')), usage ? h(React.Fragment, null, h('h5', { className: 'clx-subh sep' }, fmt(t('ov.lastReq'), { seq: usage.seq, time: fmtTime(usage.time) })), h('div', { className: 'clx-kv' }, kv(t('ov.uncached'), fmtInt(usage.inputTokens)), kv(t('ov.cacheRead'), fmtInt(usage.cacheReadTokens)), kv(t('ov.cacheWrite'), fmtInt(usage.cacheWriteTokens)), kv(t('ov.output'), fmtInt(usage.outputTokens)), kv(t('ov.hit'), pct(usage.cacheReadTokens || 0, inputTotal)))) : null, h('h5', { className: 'clx-subh sep' }, t('ov.types')), h('div', { className: 'clx-kv' }, Object.entries(data.typeCounts || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => kv(k, fmtInt(v)))))));
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
        function catLabel(t, n) {
            return t(`c.${n.category}`);
        }
        /** The one expand affordance used everywhere: a chevron that turns down when open. */
        function Chevron({ open, size = 12 }) {
            return h('span', { className: `clx-chev${open ? ' open' : ''}`, 'aria-hidden': true }, h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: 'M9 6l6 6-6 6' })));
        }
        function NodeRowSimple({ n, t, max, onClick, open }) {
            const color = CAT_COLOR[n.category] || CAT_COLOR.other;
            return h('div', {
                className: `clx-node-row${open ? ' open' : ''}`, onClick, role: 'button', tabIndex: 0, 'aria-expanded': !!open,
                onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick?.();
                } },
            }, h(Chevron, { open }), h('span', { className: 'seq' }, `#${n.seq}`), h('div', { className: 'main' }, h('div', { className: 'line1' }, h('span', { className: 'clx-tag' }, h('i', { className: 'clx-dot', style: { background: color } }), catLabel(t, n)), n.tool ? h('span', null, `· ${n.callSeq !== undefined ? fmt(t('pair.of'), { name: n.tool, seq: n.callSeq }) : n.tool}`) : null, n.tools && n.tools.length ? h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `· ${fmt(t('pair.calls'), { names: groupNames(n.tools) })}`) : null, n.source && n.source !== 'user' && n.source !== 'model' && n.category !== 'toolResults' ? h('span', null, `· ${n.source}`) : null, n.time ? h('span', { style: { marginLeft: 'auto' } }, fmtTime(n.time)) : null), h('div', { className: 'prev' }, n.preview || h('span', { className: 'clx-muted' }, '—')), h('div', { className: 'clx-minibar' }, h('span', { style: { width: `${Math.max(1, n.tokensCal / max * 100)}%`, background: color } }))), h('span', { className: 'tok' }, fmtK(n.tokensCal)));
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
        function Messages({ data, t, focus, sessionId, preset, ctx, cwd }) {
            const [query, setQuery] = useState('');
            const [sort, setSort] = useState('order');
            const [cats, setCats] = useState(() => new Set());
            const [limit, setLimit] = useState(200);
            const [openSeq, setOpenSeq] = useState(focus ?? null);
            useEffect(() => { if (focus !== undefined && focus !== null)
                setOpenSeq(focus); }, [focus]);
            useEffect(() => {
                if (!preset)
                    return;
                setCats(new Set([preset.cat]));
                setSort('size');
                setQuery('');
                requestAnimationFrame(() => document.querySelector('.clx-pane')?.scrollIntoView({ block: 'start' }));
            }, [preset]);
            const nodes = data.nodes || [];
            const present = useMemo(() => {
                const m = {};
                for (const n of nodes)
                    m[n.category] = (m[n.category] || 0) + n.tokensCal;
                return m;
            }, [nodes]);
            const list = useMemo(() => {
                const q = query.trim().toLowerCase();
                const inCat = (n) => cats.has(n.category) || (n.split && Object.entries(n.split).some(([k, v]) => v > 0 && cats.has(k)));
                let out = nodes.filter((n) => (cats.size === 0 || inCat(n))
                    && (!q || (n.preview || '').toLowerCase().includes(q) || (n.tool || '').toLowerCase().includes(q)
                        || (n.tools || []).some((x) => x.toLowerCase().includes(q)) || String(n.seq) === q));
                if (sort === 'size')
                    out = [...out].sort((a, b) => b.tokensCal - a.tokensCal);
                return out;
            }, [nodes, query, sort, cats]);
            useEffect(() => {
                if (openSeq === null || openSeq === undefined)
                    return;
                const idx = list.findIndex((n) => n.seq === openSeq);
                if (idx >= limit)
                    setLimit(idx + 50);
                requestAnimationFrame(() => document.getElementById(`clx-node-${openSeq}`)?.scrollIntoView({ block: 'center' }));
            }, [openSeq]);
            const max = useMemo(() => Math.max(1, ...nodes.map((n) => n.tokensCal)), [nodes]);
            const shownSeqs = useMemo(() => new Set(list.slice(0, limit).map((n) => n.seq)), [list, limit]);
            const total = list.reduce((s, n) => s + n.tokensCal, 0);
            const toggle = (k) => setCats((prev) => {
                const next = new Set(prev);
                if (next.has(k))
                    next.delete(k);
                else
                    next.add(k);
                return next;
            });
            return h(React.Fragment, null, h('div', { className: 'clx-msgtools' }, h('input', { value: query, placeholder: t('msg.search'), onChange: (e) => setQuery(e.target.value) }), h('button', { className: 'clx-chipbtn', 'aria-pressed': sort === 'order', onClick: () => setSort('order') }, t('msg.sort.order')), h('button', { className: 'clx-chipbtn', 'aria-pressed': sort === 'size', onClick: () => setSort('size') }, t('msg.sort.size'))), h('div', { className: 'clx-chips' }, h('button', { className: 'clx-chip', 'aria-pressed': cats.size === 0, onClick: () => setCats(new Set()) }, t('msg.all')), CATS.filter((k) => present[k]).map((k) => h('button', { key: k, className: 'clx-chip', 'aria-pressed': cats.has(k), onClick: () => toggle(k) }, h('i', { className: 'clx-dot', style: { background: CAT_COLOR[k] } }), `${t(`c.${k}`)} ${fmtK(present[k])}`))), h('div', { className: 'clx-muted', style: { fontSize: 12, marginBottom: 4 } }, fmt(t('msg.count'), { n: list.length, t: fmtK(total) }), data.nodesTruncated ? ` · ${fmt(t('msg.trunc'), { n: data.nodesTruncated })}` : ''), list.slice(0, limit).map((n, i) => h('div', { key: n.seq, id: `clx-node-${n.seq}`, className: `clx-node${openSeq === n.seq ? ' open' : ''}${sort === 'order' && n.callSeq !== undefined && shownSeqs.has(n.callSeq) ? ' paired' : ''}`, style: { '--cat': CAT_COLOR[n.category] || CAT_COLOR.other, '--i': Math.min(i, 24) } }, h(NodeRowSimple, { n, t, max, open: openSeq === n.seq, onClick: () => setOpenSeq(openSeq === n.seq ? null : n.seq) }), openSeq === n.seq ? h(NodeDetail, { sessionId, seq: n.seq, t, ctx, cwd }) : null)), list.length > limit ? h('button', { className: 'clx-chipbtn', style: { marginTop: 8 }, onClick: () => setLimit(limit + 200) }, fmt(t('msg.more'), { n: Math.min(200, list.length - limit) })) : null);
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
        function Tools({ data, t, sessionId, ctx, cwd }) {
            const [openDef, setOpenDef] = useState(null);
            const [openUse, setOpenUse] = useState(null);
            const tools = data.tools || [];
            const shellSet = new Set(data.shellTools || []);
            const stats = (data.toolStats || []).filter((x) => !shellSet.has(x.name));
            const kind = (x) => (x.kind === 'mcp' ? `MCP · ${x.server}` : t('tools.system'));
            const defMax = Math.max(1, ...tools.map((x) => x.tokensCal));
            const useMax = Math.max(1, ...stats.map((x) => x.callTokens + x.resultTokens));
            const toggle = (cur, set, k) => set(cur === k ? null : k);
            const keyOpen = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fn();
            } };
            return h(React.Fragment, null, h('div', { className: 'clx-card' }, h('div', { className: 'clx-card-head' }, h('h4', null, `${t('tools.defs')} · ${tools.length} · ${fmtK(data.toolsTokens)}`), h('span', { className: 'clx-muted' }, t('tools.expandHint'))), tools.length ? h(React.Fragment, null, h('div', { className: 'clx-trow head' }, h('span', null), h('span', null, t('tools.col.name')), h('span', null, t('tools.col.kind')), h('span', null, t('tools.col.params')), h('span', null), h('span', null, 'Tokens')), tools.map((x, i) => {
                const open = openDef === x.name;
                const color = x.kind === 'mcp' ? CAT_COLOR.mcpTools : CAT_COLOR.systemTools;
                const fn = () => toggle(openDef, setOpenDef, x.name);
                return h('div', { key: x.name, className: `clx-tblock${open ? ' open' : ''}`, style: { '--cat': color, '--i': Math.min(i, 24) } }, h('div', { className: 'clx-trow', role: 'button', tabIndex: 0, 'aria-expanded': open, title: x.description, onClick: fn, onKeyDown: keyOpen(fn) }, h(Chevron, { open }), h('span', { className: 'clx-tname' }, h('i', { className: 'clx-dot', style: { background: color } }), h('code', null, x.name)), h('span', { className: 'clx-muted' }, kind(x)), h('span', { className: 'num' }, x.params), h('span', { className: 'clx-catbar' }, h('span', { style: { width: `${Math.max(1, x.tokensCal / defMax * 100)}%`, background: color } })), h('span', { className: 'num' }, fmtInt(x.tokensCal))), open ? h(ToolDetail, { sessionId, name: x.name, t }) : null);
            })) : h('div', { className: 'clx-muted' }, t('tools.none'))), h('div', { className: 'clx-card' }, h('div', { className: 'clx-card-head' }, h('h4', null, t('tools.usage')), stats.length ? h('span', { className: 'clx-muted' }, t('tools.expandHint')) : null), stats.length ? h(React.Fragment, null, h('div', { className: 'clx-urow head' }, h('span', null), h('span', null, t('tools.col.name')), h('span', null, t('tools.col.calls')), h('span', null, t('tools.col.callTok')), h('span', null, t('tools.col.results')), h('span', null, t('tools.col.resTok')), h('span', null, t('tools.col.max'))), stats.map((x, i) => {
                const open = openUse === x.name;
                const fn = () => toggle(openUse, setOpenUse, x.name);
                return h('div', { key: x.name, className: `clx-tblock${open ? ' open' : ''}`, style: { '--cat': CAT_COLOR.toolResults, '--i': Math.min(i, 24) } }, h('div', { className: 'clx-urow', role: 'button', tabIndex: 0, 'aria-expanded': open, onClick: fn, onKeyDown: keyOpen(fn) }, h(Chevron, { open }), h('span', { className: 'clx-tname' }, h('code', null, x.name), h('span', { className: 'clx-ubar' }, h('span', { style: { width: `${x.callTokens / useMax * 100}%`, background: CAT_COLOR.toolCalls } }), h('span', { style: { width: `${x.resultTokens / useMax * 100}%`, background: CAT_COLOR.toolResults } }))), h('span', { className: 'num' }, x.calls), h('span', { className: 'num clx-muted' }, fmtInt(x.callTokens)), h('span', { className: 'num' }, x.results), h('span', { className: 'num clx-muted' }, fmtInt(x.resultTokens)), h('span', { className: 'num clx-muted' }, fmtInt(x.maxResult))), open ? h(ToolInvocations, { data, name: x.name, sessionId, t, ctx, cwd }) : null);
            })) : h('div', { className: 'clx-muted' }, t('tools.none'))), h(Commands, { data, t, sessionId }), (data.deferred || []).length ? h('div', { className: 'clx-card' }, h('h4', null, `${t('tools.deferred')} · ${data.deferred.length}`), h('table', { className: 'clx-table' }, h('tbody', null, data.deferred.map((x) => h('tr', { key: x.name, title: x.description }, h('td', null, h('code', { className: 'clx-tcode' }, x.name)), h('td', { className: 'clx-muted wrap', style: { textAlign: 'left' } }, kind(x))))))) : null);
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
        function oneLineText(text, cap) {
            const x = String(text || '').replace(/\s+/g, ' ').trim();
            const first = /^(.{12,}?[。.!?！？])(\s|$)/.exec(x)?.[1] || x;
            return first.length > cap ? `${first.slice(0, cap - 1)}…` : first;
        }
        function fmtBytes(n) {
            if (!(n >= 0))
                return '—';
            return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
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
        // ------------------------------------------------------------- file structure
        const FT_COLOR = {
            root: '#4FA35B', memory: '#C9772F', git: '#8A8F98', dir: '#5DA9A0', skills: CAT_COLOR.skills,
            config: '#2BA3A0', data: '#4E8FD6', skill: CAT_COLOR.skills,
        };
        const FT_GROUP = {
            projectRoot: 'root', workdirRoot: 'root', dshHome: 'root', agentsHome: 'root',
            memProject: 'memory', memClaude: 'memory', memLocal: 'memory', memNested: 'memory', memGlobal: 'memory', memShared: 'memory',
            git: 'git', gitMissing: 'git',
            projDsh: 'dir', projAgents: 'dir', subDir: 'dir', cwdDir: 'dir', profiles: 'dir', profile: 'dir',
            skillsProjectDsh: 'skills', skillsProjectAgents: 'skills', skillsUser: 'skills', skillsShared: 'skills',
            patchGlobal: 'config', patchProfile: 'config', env: 'config', sessions: 'data', skillItem: 'skill',
        };
        const FILE_PATH = 'M4 1.5h5.2L12.5 4.8v9.2a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5zM9 1.7V5h3.3M5.6 8h4.8M5.6 10.5h4.8';
        function FtIcon({ dir, color }) {
            return dir
                ? h('svg', { viewBox: '0 0 16 16', width: 15, height: 15, 'aria-hidden': true, className: 'clx-ft-icon' }, h('path', { d: 'M1.5 4a1 1 0 0 1 1-1h3.7l1.5 1.6h5.8a1 1 0 0 1 1 1v6.9a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1z', fill: color, opacity: .9 }))
                : h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, className: 'clx-ft-icon' }, h('path', { d: FILE_PATH, fill: `color-mix(in srgb, ${color} 14%, transparent)`, stroke: color, strokeWidth: 1.1, strokeLinejoin: 'round' }));
        }
        function FileTree({ src, t, onJump, ctx, sessionId }) {
            const st = src.structure;
            const [more, setMore] = useState(() => new Set());
            const [onlyExisting, setOnlyExisting] = useState(false);
            const [noteLine, preview] = useSidebarPreview(ctx, sessionId, src.cwd, t);
            const regByPath = useMemo(() => {
                const m = new Map();
                for (const r of src.skills?.registry || [])
                    if (r.path)
                        m.set(r.path.replace(/\/SKILL\.md$/i, ''), r);
                return m;
            }, [src]);
            if (!st || !st.trees?.length)
                return null;
            const homeRe = st.home ? new RegExp(`^${st.home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=/|$)`) : null;
            const tilde = (p) => (homeRe ? p.replace(homeRe, '~') : p);
            const rows = [];
            // guides: one entry per ancestor level (true = that ancestor has later siblings → draw a line)
            const walk = (n, guides, last, depth) => {
                rows.push({ n, guides, last, depth });
                let kids = (n.children || []).filter((k) => !onlyExisting || k.exists);
                if (n.items) {
                    const all = more.has(n.path);
                    const shown = all ? n.items : n.items.slice(0, 5);
                    kids = shown.map((x) => ({ name: x.bundle ? `${x.name}/` : `${x.name}.md`, role: 'skillItem', path: x.path, dir: x.bundle, exists: true, skill: x }));
                    const rest = (n.count || n.items.length) - shown.length;
                    if (rest > 0 || all)
                        kids = [...kids, { more: true, rest, parent: n.path, all }];
                }
                kids.forEach((k, i) => walk(k, depth === 0 ? [] : [...guides, !last], i === kids.length - 1, depth + 1));
            };
            st.trees.forEach((r) => walk(r, [], true, 0));
            const toggleMore = (p) => setMore((prev) => { const next = new Set(prev); if (next.has(p))
                next.delete(p);
            else
                next.add(p); return next; });
            return h('div', { className: 'clx-card clx-ftcard' }, h('div', { className: 'clx-card-head' }, h('h4', null, t('ft.title')), h('span', { className: 'clx-ft-legend' }, h('span', { className: 'clx-ft-st loaded' }, `✓ ${t('ft.loaded')}`), h('span', { className: 'clx-ft-st' }, t('ft.exists')), h('span', { className: 'clx-ft-st missing' }, t('ft.missing')), h('button', { className: 'clx-chip', 'aria-pressed': onlyExisting, onClick: () => setOnlyExisting(!onlyExisting) }, t('ft.onlyExisting')))), h('div', { className: 'clx-mem-hint' }, t('ft.hint')), noteLine, h('div', { className: 'clx-ft' }, rows.map(({ n, guides, last, depth }, i) => {
                const conn = depth === 0 ? null : h(React.Fragment, null, guides.map((g, j) => h('span', { key: j, className: `clx-ft-g${g ? ' pipe' : ''}` })), h('span', { className: `clx-ft-g ${last ? 'elbow' : 'tee'}` }));
                if (n.more) {
                    return h('div', { key: `more-${n.parent}`, className: 'clx-ft-row more' }, h('span', { className: 'clx-ft-tree' }, conn, h('button', { className: 'clx-linkbtn', onClick: () => toggleMore(n.parent) }, n.all ? t('ft.less') : fmt(t('ft.more'), { n: n.rest }))));
                }
                const group = FT_GROUP[n.role] || 'dir';
                const color = FT_COLOR[group];
                const reg = n.skill ? regByPath.get(n.path) || regByPath.get(n.path.replace(/\.md$/i, '')) : undefined;
                const desc = n.role === 'skillItem'
                    ? (reg?.description ? oneLineText(reg.description, 80) : t('ft.r.skillItem'))
                    : n.role === 'profile' ? `${t('ft.r.profile')} · ${st.profile}` : t(`ft.r.${n.role}`);
                const jumpSeq = n.loaded && n.seq !== undefined ? n.seq : undefined;
                const status = n.loaded ? h('span', {
                    className: `clx-ft-st loaded${jumpSeq !== undefined ? ' link' : ''}`,
                    ...(jumpSeq !== undefined ? {
                        role: 'button', tabIndex: 0, title: fmt(t('ft.jump'), { seq: jumpSeq }),
                        onClick: (e) => { e.stopPropagation(); onJump(jumpSeq); },
                        onKeyDown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            e.stopPropagation();
                            onJump(jumpSeq);
                        } },
                    } : null),
                }, `✓ ${t('ft.loaded')}${n.tokens ? ` · ≈${fmtK(n.tokens)}` : ''}`)
                    : !n.exists ? h('span', { className: 'clx-ft-st missing' }, t('ft.missing'))
                        : n.count !== undefined ? h('span', { className: 'clx-ft-st' }, fmt(t('ft.skills'), { n: n.count }))
                            : n.size !== undefined && group !== 'skill' ? h('span', { className: 'clx-ft-st' }, fmtBytes(n.size)) : null;
                // existing files open in dsh's own right Sidebar preview instead of being
                // rendered here; directories and missing files stay plain rows.
                const previewable = !!n.exists && !n.dir;
                return h('div', {
                    key: `${n.path}-${i}`, className: `clx-ft-row${n.exists ? '' : ' missing'}${depth === 0 ? ' top' : ''}${previewable ? ' open' : ''}`,
                    style: { '--ft': color, '--i': Math.min(i, 30) }, title: previewable ? `${n.path}\n${t('ft.preview')}` : n.path,
                    ...(previewable ? {
                        role: 'button', tabIndex: 0, 'aria-label': `${n.name} · ${t('ft.preview')}`,
                        onClick: () => preview(n.path),
                        onKeyDown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            preview(n.path);
                        } },
                    } : null),
                }, h('span', { className: 'clx-ft-tree' }, conn, h(FtIcon, { dir: n.dir, color }), h('span', { className: `clx-ft-name${n.dir ? ' dir' : ''}` }, depth === 0 ? `${tilde(n.path)}/` : n.name), status), h('span', { className: 'clx-ft-lead' }), h('span', { className: 'clx-ft-pill' }, desc));
            })));
        }
        function MemoryCard({ src, t, onJump, ctx, sessionId }) {
            const mem = src.memory;
            const [noteLine, preview] = useSidebarPreview(ctx, sessionId, src.cwd, t);
            const active = mem.files.filter((f) => f.status === 'active');
            const total = active.reduce((s, f) => s + (f.tokens || 0), 0);
            const statusCls = { active: 'clx-ok', removed: 'clx-warn', replaced: 'clx-muted' };
            const notice = mem.events.filter((e) => e.budgetNotice).slice(-1)[0]?.budgetNotice;
            return h('div', { className: 'clx-card clx-memcard' }, h('div', { className: 'clx-card-head' }, h('h4', null, t('nav.memory')), h('span', { className: 'clx-muted' }, active.length ? fmt(t('src.memoryCount'), { n: active.length, t: fmtK(total) }) : t('src.memoryZero'))), mem.files.length ? h('div', { className: 'clx-mem-hint', title: t('src.memoryHint') }, t('src.memoryHintShort')) : null, noteLine, mem.files.length ? h('div', { className: 'clx-mem-files' }, mem.files.map((f) => h(Disclosure, {
                key: f.displayPath,
                color: CAT_COLOR.memory,
                open: mem.files.length <= 2,
                head: h('div', { className: 'clx-src-row' }, h('span', { className: 'clx-src-name' }, f.displayPath), h('span', { className: statusCls[f.status] || 'clx-muted' }, t(`src.mem.${f.status}`)), f.updates ? h('span', { className: 'clx-muted' }, fmt(t('src.updates'), { n: f.updates })) : null, h('span', { className: 'clx-src-tok' }, f.tokens ? `≈${fmtK(f.tokens)}` : '—')),
            }, h('div', { className: 'clx-src-meta' }, f.path ? h('span', null, f.path) : null, f.path ? h('a', { className: 'clx-link', title: f.path, onClick: () => preview(f.path) }, `↗ ${t('ft.preview')}`) : null, h('a', { onClick: () => onJump(f.lastSeq) }, `#${f.lastSeq} ${t('src.inMessages')}`)), f.status === 'removed' ? h('div', { className: 'clx-muted' }, t('src.mem.removedHint'))
                : h(RichText, { text: f.content || '', hint: 'md', t, defaultOpen: true, bare: true })))) : null, notice ? h('div', { className: 'clx-warn', style: { fontSize: 12, margin: '6px 2px' } }, notice) : null, !mem.files.length ? h('div', { className: 'clx-mem-empty' }, t('src.memoryNoneTree')) : null);
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
        function SkillsCard({ src, bd, sessionId, t, onJump }) {
            const sk = src.skills;
            const [query, setQuery] = useState('');
            const [filter, setFilter] = useState('all');
            const catalogCost = useMemo(() => {
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
            const rows = useMemo(() => {
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
                return [...by.values()].sort((a, b) => (b.loads.length - a.loads.length) || a.name.localeCompare(b.name));
            }, [src]);
            const loadedNames = rows.filter((r) => r.loads.length).length;
            const inCatalog = rows.filter((r) => r.cat).length;
            const loadTok = (sk.loaded || []).reduce((s, l) => s + (nodeTok[l.seq] ?? l.tokensEst ?? 0), 0);
            const catTok = Object.values(catalogCost).reduce((a, b) => a + b, 0);
            const q = query.trim().toLowerCase();
            const shown = rows.filter((r) => (filter === 'all' || (filter === 'loaded' ? r.loads.length : filter === 'catalog' ? r.cat : !r.cat))
                && (!q || r.name.toLowerCase().includes(q) || (r.reg?.description || r.cat?.description || '').toLowerCase().includes(q)));
            return h('div', { className: 'clx-card' }, h('h4', null, `${t('src.skills')} · ${fmt(t('src.skillsSummary'), { n: rows.length, c: inCatalog, l: loadedNames, ct: fmtK(catTok), lt: fmtK(loadTok) })}`), sk.registryAvailable ? null : h('div', { className: 'clx-warn', style: { fontSize: 12 } }, t('src.noRegistry')), sk.registryError ? h('div', { className: 'clx-err', style: { fontSize: 12 } }, fmt(t('failed'), { msg: sk.registryError })) : null, h('div', { className: 'clx-msgtools' }, h('input', { value: query, placeholder: t('src.skillSearch'), onChange: (e) => setQuery(e.target.value) }), ['all', 'loaded', 'catalog', 'hidden'].map((k) => h('button', { key: k, className: 'clx-chipbtn', 'aria-pressed': filter === k, onClick: () => setFilter(k) }, t(`src.f.${k}`)))), shown.length ? shown.map((r) => {
                const desc = r.reg?.description ?? r.cat?.description ?? '';
                return h(Disclosure, {
                    key: r.name,
                    color: CAT_COLOR.skills,
                    head: h('div', { className: 'clx-skill-head' }, h('div', { className: 'clx-src-row' }, h('span', { className: 'clx-src-name' }, r.name), r.loads.length ? h('span', { className: 'clx-badge ok' }, fmt(t('src.loadedN'), { n: r.loads.length })) : null, r.cat ? h('span', { className: 'clx-badge' }, t('src.inCatalog')) : h('span', { className: 'clx-badge dim' }, r.reg && !r.reg.modelInvocable ? t('src.userOnly') : t('src.notInCatalog')), h('span', { className: 'clx-src-tok', title: t('src.catCostHint') }, catalogCost[r.name] ? fmtK(catalogCost[r.name]) : '')), h('div', { className: 'clx-skill-desc' }, desc)),
                }, h('div', { className: 'clx-src-path' }, h('span', { className: 'clx-muted' }, `${t('src.k.path')} `), r.reg?.path || r.loads[0]?.base || '—'), h('div', { className: 'clx-kv', style: { marginBottom: 8 } }, kv(t('src.k.provider'), r.reg?.provider || '—'), kv(t('src.k.source'), r.reg?.source || '—'), kv(t('src.k.invocation'), r.reg ? [r.reg.modelInvocable ? t('src.inv.model') : null, r.reg.userInvocable ? t('src.inv.user') : null].filter(Boolean).join(' · ') || '—' : '—')), r.reg?.whenToUse ? h('div', { style: { fontSize: 12.5, marginBottom: 8 } }, h('span', { className: 'clx-muted' }, `${t('src.k.whenToUse')}: `), r.reg.whenToUse) : null, r.cat && r.reg && r.cat.description !== r.reg.description ? h('div', { style: { fontSize: 12, marginBottom: 8 } }, h('span', { className: 'clx-muted' }, `${t('src.k.catalogDesc')}: `), r.cat.description) : null, r.loads.length ? h('div', { style: { fontSize: 12, marginBottom: 8 } }, h('div', { className: 'clx-muted' }, t('src.loads')), r.loads.map((l) => h('div', { key: l.seq, className: 'clx-flow-log', onClick: () => onJump(l.seq) }, `#${l.seq} · ${fmtTime(l.time)} · ${t(`src.via.${l.via}`)} · ${fmtK(nodeTok[l.seq] ?? l.tokensEst)} tok${l.isError ? ' · ⚠' : ''}`))) : null, sk.registryAvailable ? h(SkillBody, { sessionId, name: r.name, t }) : null);
            }) : h('div', { className: 'clx-empty' }, t('src.skillsNone')));
        }
        const RT_NAME = {
            'working-directory:current': 'rt.cwd', 'sandbox:policy': 'rt.sandbox', 'approval:policy': 'rt.approval',
            'harness:source': 'rt.harness', 'app:web-surface': 'rt.web', 'time-context': 'rt.time',
        };
        function RuntimeCard({ src, t, onJump }) {
            const rt = src.runtime;
            if (!rt && !src.timeContext)
                return null;
            const items = [...(rt?.sections || []), ...(src.timeContext ? [{ name: 'time-context', text: src.timeContext.text }] : [])];
            return h('div', { className: 'clx-card' }, h('div', { className: 'clx-card-head' }, h('h4', null, t('src.runtime')), rt ? h('a', { className: 'clx-link', onClick: () => onJump(rt.seq) }, `#${rt.seq} ${t('src.inMessages')}`) : null), h('div', { className: 'clx-mem-hint' }, t('src.runtimeHint')), h('div', { className: 'clx-rt-list' }, items.map((s) => h('div', { key: s.name, className: 'clx-rt' }, h('span', { className: 'k', title: s.name }, RT_NAME[s.name] ? t(RT_NAME[s.name]) : s.name), h('span', { className: 'v' }, s.text)))));
        }
        /** 记忆: the instruction files dsh-agent-instructions loaded, plus the runtime context. */
        function MemoryTab({ sessionId, liveKey, t, onJump, ctx }) {
            const { data, error } = useSources(sessionId, liveKey);
            if (error && !data)
                return h('div', { className: 'clx-err' }, fmt(t('failed'), { msg: error }));
            if (!data)
                return h('div', { className: 'clx-muted' }, t('loading'));
            return h('div', { className: 'clx-memtab' }, h('div', { className: 'clx-memtab-l' }, h(FileTree, { src: data, t, onJump, ctx, sessionId })), h('div', { className: 'clx-memtab-r' }, h(MemoryCard, { src: data, t, onJump, ctx, sessionId }), h(RuntimeCard, { src: data, t, onJump })));
        }
        /** 技能: every skill this session's agent can see, what the model was offered, and what it loaded. */
        function SkillsTab({ sessionId, liveKey, bd, t, onJump }) {
            const { data, error } = useSources(sessionId, liveKey);
            if (error && !data)
                return h('div', { className: 'clx-err' }, fmt(t('failed'), { msg: error }));
            if (!data)
                return h('div', { className: 'clx-muted' }, t('loading'));
            return h(SkillsCard, { src: data, bd, sessionId, t, onJump });
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
        function FlowTab({ sessionId, liveKey, bd, t }) {
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
                    return h('div', { className: 'clx-card' }, h('div', { className: 'clx-flow-status' }, h('b', null, fmt(t('flow.where'), { t: sel.turn, s: sel.step })), h('span', { className: sel.status === 'error' ? 'clx-err' : sel.status === 'interrupted' ? 'clx-warn' : 'clx-muted' }, t(`flow.status.${sel.status}`)), h('span', { style: { marginLeft: 'auto', display: 'flex', gap: 6 } }, h('button', { className: 'clx-chipbtn', disabled: selIdx <= 0, onClick: () => pick(steps[selIdx - 1]) }, `‹ ${t('flow.prev')}`), h('button', { className: 'clx-chipbtn', disabled: selIdx >= steps.length - 1, onClick: () => pick(steps[selIdx + 1]) }, `${t('flow.next')} ›`), h('button', { className: 'clx-chipbtn', 'aria-pressed': true, onClick: () => pick(null) }, t('flow.backLive')))), h('div', { className: 'clx-muted', style: { fontSize: 12, margin: '2px 0 8px' } }, [sel.startTime ? new Date(sel.startTime).toLocaleString() : null, dur !== undefined ? fmtDur(dur) : null, `#${sel.startSeq}${sel.endSeq ? `–${sel.endSeq}` : ''}`].filter(Boolean).join(' · ')), h('h4', null, t('flow.path')), h('div', { className: 'clx-flow-path' }, sel.stages.map((x, i) => h('span', { key: i, className: 'clx-flow-chip' }, h('b', null, i + 1), ` ${t(`flow.n.${x}`)}`))), sel.tools.length ? h('div', { style: { fontSize: 12, marginTop: 8 } }, h('span', { className: 'clx-muted' }, `${t('flow.calls')}: `), sel.tools.join(', ')) : null, sel.turnEnd ? h('div', { style: { fontSize: 12, marginTop: 4 } }, h('span', { className: 'clx-muted' }, `${t('flow.n.turnEnd')}: `), sel.turnEnd) : null, h('h4', { style: { marginTop: 12 } }, t('flow.ctxAt')), h('div', { className: 'clx-flow-big' }, h('b', null, fmtK(comp.total)), h('span', { className: 'clx-muted' }, ` / ${fmtK(win)} · ${pct(comp.total, win)}`)), u ? h('div', { className: 'clx-muted', style: { fontSize: 12 } }, fmt(t('flow.request'), { c: fmtK(u.cacheRead || 0), r: pct(u.cacheRead || 0, sel.promptTokens || 0, 0), o: fmtK(u.output || 0) })) : null, h(CompositionBar, { by: comp.by, win, t }), h('div', { className: 'clx-muted', style: { fontSize: 11.5 } }, t(comp.exact ? 'flow.ctxEst' : 'flow.ctxEstNoUsage')));
                })()
                : (() => {
                    const ph = live?.phase || 'idle';
                    return h('div', { className: 'clx-card' }, h('h4', null, t('flow.live')), h('div', { className: 'clx-flow-status' }, h('i', { className: `clx-live-dot${ph === 'idle' ? '' : ' on'}`, style: { background: LIVE_COLOR[ph] } }), h('b', null, t(`flow.live.${ph}`)), live?.turn ? h('span', { className: 'clx-muted' }, live.step ? fmt(t('flow.where'), { t: live.turn, s: live.step }) : fmt(t('msg.turn'), { n: live.turn })) : null), h('div', { style: { fontSize: 12.5, marginTop: 6 } }, h('span', { className: 'clx-muted' }, `${t('flow.stage')}: `), h('b', null, t(`flow.n.${live?.stage}`) || '—'), ph === 'idle' ? h('span', { className: 'clx-muted' }, ` · ${t('flow.idleHint')}`) : null), curStep ? h('div', { className: 'clx-muted', style: { fontSize: 12, marginTop: 2 } }, `${fmt(t('flow.stepFor'), { d: fmtDur(now - curStep.startTime) })}${curStep.tools.length ? ` · ${curStep.tools.join(', ')}` : ''}`) : null, live?.jobs?.length ? h('div', { style: { marginTop: 8, fontSize: 12 } }, h('div', { className: 'clx-muted' }, t('flow.jobs')), live.jobs.map((j) => h('div', { key: j.job, className: 'clx-flow-job' }, h('i', { className: 'clx-live-dot on', style: { background: LIVE_COLOR.tool } }), ` ${j.label} `, h('span', { className: 'clx-muted' }, fmtDur(now - j.startedAt))))) : null, live?.approvals?.length ? h('div', { style: { marginTop: 8, fontSize: 12 } }, h('div', { className: 'clx-warn' }, t('flow.approvals')), live.approvals.map((a) => h('div', { key: a.seq }, a.title))) : null, live?.lastSeq !== undefined ? h('div', { className: 'clx-flow-now', style: { fontSize: 12 } }, h('span', { className: 'clx-muted' }, `${t('flow.lastEvent')} · #${live.lastSeq} · ${fmt(t('flow.ago'), { d: fmtDur(Math.max(0, now - live.lastTime)) })}`), h('div', { className: 'clx-flow-now-text' }, h('b', null, t(`flow.n.${live.lastStage}`)), ' ', live.lastTitle)) : null, h('h4', { style: { marginTop: 12 } }, t('flow.ctxNow')), h('div', { className: 'clx-flow-big' }, h('b', null, fmtK(s.used)), h('span', { className: 'clx-muted' }, ` / ${fmtK(win)} · ${pct(s.used, win)}`), s.comp?.auto && s.comp.thresholdTokens ? h('span', { className: s.used >= s.comp.thresholdTokens ? 'clx-warn' : 'clx-muted', style: { fontSize: 12 } }, ` · ${fmt(t('flow.threshold'), { t: fmtK(s.comp.thresholdTokens) })}`) : null), h(CompositionBar, { by: s.byCat ? Object.fromEntries(Object.entries(s.byCat).map(([k, c]) => [k, c.tokens])) : {}, win, t }));
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
        /** The Context Lens View: always the Conversation's own session. */
        const NAV_ICON = {
            overview: ['M12 3a9 9 0 1 0 9 9', 'M12 3a9 9 0 0 1 9 9h-9z'],
            flow: ['M6 4h5v5H6z', 'M13 15h5v5h-5z', 'M8.5 9v3.5h7V15', 'M17 6.5h3'],
            messages: ['M4 6h16', 'M4 11h16', 'M4 16h10'],
            tools: ['M8 5 4 12l4 7', 'M16 5l4 7-4 7', 'M13.5 5l-3 14'],
            skills: ['M12 3.5l2.4 5.1 5.6.7-4.1 3.9 1 5.6-4.9-2.7-4.9 2.7 1-5.6L4 9.3l5.6-.7z'],
            memory: ['M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', 'M5 17a3 3 0 0 1 3-3h9', 'M19 7v13'],
        };
        const NAVS = ['overview', 'flow', 'messages', 'tools', 'skills', 'memory'];
        const NAV_STORE = 'dsh-context-lens:nav';
        function NavIcon({ k }) {
            return h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, (NAV_ICON[k] || []).map((d, i) => h('path', { key: i, d })));
        }
        /** The Context Lens View: always the Conversation's own session, always live. */
        function DetailPane(props) {
            const { ctx, t } = props;
            useLocaleTick(ctx);
            const sessionId = typeof props.sessionId === 'string' ? props.sessionId : '';
            const [nav, setNavState] = useState(() => {
                try {
                    const v = localStorage.getItem(NAV_STORE);
                    return NAVS.includes(v) ? v : v === 'system' ? 'memory' : 'overview';
                }
                catch {
                    return 'overview';
                }
            });
            const setNav = (k) => {
                setNavState(k);
                try {
                    localStorage.setItem(NAV_STORE, k);
                }
                catch { }
            };
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
            const [updated, setUpdated] = useState(0);
            useEffect(() => { if (data)
                setUpdated(Date.now()); }, [data]);
            const [preset, setPreset] = useState(null);
            const jump = (seq) => {
                setFocus(seq);
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
                const live = `${liveKey}|${data.logRevision}`;
                body = h(React.Fragment, null, error ? h('div', { className: 'clx-err', style: { fontSize: 12, marginBottom: 8 } }, fmt(t('failed'), { msg: error })) : null, nav === 'overview' ? h(Overview, { data, t, onJump: jump, onShowCat: showCat, sessionId })
                    : nav === 'flow' ? h(FlowTab, { sessionId, liveKey: live, bd: data, t })
                        : nav === 'messages' ? h(Messages, { data, t, focus, sessionId, preset, ctx, cwd: data.cwd })
                            : nav === 'tools' ? h(Tools, { data, t, sessionId, ctx, cwd: data.cwd })
                                : nav === 'skills' ? h(SkillsTab, { sessionId, liveKey: live, bd: data, t, onJump: jump })
                                    : nav === 'memory' ? h(MemoryTab, { sessionId, liveKey: live, t, onJump: jump, ctx })
                                        : h(Overview, { data, t, onJump: jump, onShowCat: showCat, sessionId }));
            }
            const s = data ? summarize(data) : null;
            const toolbar = h('div', { className: 'clx-toolbar' }, h('div', { className: 'clx-col clx-toolbar-in' }, h('nav', { className: 'clx-segnav', role: 'tablist', 'aria-label': t('tab.title'), ref: navRef }, NAVS.map((k) => h('button', { key: k, role: 'tab', 'aria-selected': nav === k, onClick: () => setNav(k) }, h(NavIcon, { k }), h('span', null, t(`nav.${k}`))))), h('div', { className: 'clx-toolbar-meta', title: updated ? fmt(t('live.updated'), { time: new Date(updated).toLocaleString() }) : '' }, s && s.win ? h(React.Fragment, null, h(Ring, { ratio: s.used / s.win, size: 16, stroke: 2.6 }), h('b', null, pct(s.used, s.win)), h('span', { className: 'clx-muted' }, `${fmtK(s.used)} / ${fmtK(s.win)}`)) : null, h('span', { className: 'clx-toolbar-live' }, h('i', { className: `clx-live-dot${loading ? ' on' : ''}`, style: { background: error ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-success-primary)' } }), t('live.on')))));
            return h('div', { className: 'clx-pane notranslate', translate: 'no' }, h(Style), toolbar, h('main', { className: 'clx-main' }, h('div', { className: 'clx-col' }, body)));
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
