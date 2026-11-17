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
    const { React, h, portal: toBody } = kit
    const {
      useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore, useLayoutEffect,
    } = React

function useLocaleTick(ctx) {
  return useSyncExternalStore(
    useCallback((fn) => ctx.locale.subscribe(fn), [ctx]),
    () => ctx.locale.getSnapshot(),
  )
}

/** Projection selector that never throws and works when the host gives no hook. */
function useSafeProjection(props, name) {
  const hook = typeof props.useProjection === 'function' ? props.useProjection : null
  let value = null
  try {
    value = hook ? hook(name) : null
  } catch {
    value = null
  }
  return value
}

function useBreakdown(sessionId, liveKey, active, pollMs) {
  const [state, setState] = useState<any>({ data: null, error: null, loading: false })
  const [nonce, setNonce] = useState(0)
  const has = useRef(false)
  useEffect(() => {
    if (!active || !sessionId) return undefined
    let dead = false
    const run = () => {
      setState((s) => ({ ...s, loading: true }))
      call('breakdown', { sessionId }).then(
        (data) => { if (!dead) { has.current = true; setState({ data, error: null, loading: false }) } },
        (e) => { if (!dead) setState((s) => ({ ...s, error: String(e?.message || e), loading: false })) },
      )
    }
    const timer = setTimeout(run, has.current ? 450 : 0)
    const poll = pollMs ? setInterval(run, pollMs) : undefined
    return () => {
      dead = true
      clearTimeout(timer)
      if (poll) clearInterval(poll)
    }
  }, [sessionId, liveKey, active, nonce, pollMs])
  const data = state.data && state.data.sessionId === sessionId ? state.data : null
  return { data, error: state.error, loading: state.loading, reload: () => setNonce((n) => n + 1) }
}

function Style() {
  return h('style', null, CSS_TEXT)
}

function Ring({ ratio, size = 16, stroke = 2.6, warn }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, ratio || 0))
  const color = warn === 2 ? 'var(--dsw-alias-state-error-primary)' : warn === 1 ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-state-business-primary)'
  return h('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, 'aria-hidden': true, style: { flex: 'none' } },
    h('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'var(--dsw-alias-border-l2)', strokeWidth: stroke }),
    h('circle', {
      cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, strokeWidth: stroke,
      strokeDasharray: `${c * v} ${c}`, strokeLinecap: 'round',
      transform: `rotate(-90 ${size / 2} ${size / 2})`,
    }))
}


/** Stacked usage bar: segments in window units, then buffer (hatched) and free space. */
function UsageBar({ segments, win, buffer, height, anim }) {
  if (!win) return null
  return h('div', { className: `clx-bar${anim ? ' anim' : ''}`, style: height ? { height } : undefined },
    segments.filter((s) => s.tokens > 0).map((s) => h('span', {
      key: s.key, title: `${s.label}: ${fmtInt(s.tokens)}`,
      style: { width: `${s.tokens / win * 100}%`, background: s.color },
    })),
    h('span', { key: 'free', style: { flex: '1 1 auto' } }),
    buffer > 0 ? h('span', { key: 'buffer', className: 'clx-hatch', title: `buffer: ${fmtInt(buffer)}`, style: { width: `${buffer / win * 100}%` } }) : null)
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
}

/** Chinese name plus the muted English term (one name when the UI is English). */
function BiName({ zh, en: term }) {
  return h('span', { className: 'clx-catname' },
    h('span', { className: 'zh' }, zh),
    term && term !== zh ? h('span', { className: 'en' }, term) : null)
}

/** A dot for a group: its categories' colours in proportion, like a tiny pie. */
function groupDot(children) {
  const total = children.reduce((a, c) => a + c.tokens, 0)
  if (children.length < 2 || !total) return { background: children[0]?.color || 'var(--dsw-alias-border-l3)' }
  let at = 0
  const stops = children.map((c) => {
    const from = at
    at += c.tokens / total * 360
    return `${c.color} ${from}deg ${at}deg`
  })
  return { background: `conic-gradient(${stops.join(',')})` }
}

function PopBody({ data, t }) {
  const s = summarize(data)
  const [hov, setHov] = useState(null)
  const [open, setOpen] = useState(() => new Set())
  const usedAnim = useCountUp(s.used, 700)
  const toggle = (k) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n })
  // level 1: the standard groups; level 2: the overview's categories (or a group's files)
  const memoryFiles = data.memoryFiles || []
  const groups = GROUPS.map((g) => {
    const children = g.cats.map((k) => ({ key: k, color: CAT_COLOR[k], tokens: s.byCat[k]?.tokens || 0, count: s.byCat[k]?.count || 0 }))
      .filter((c) => c.tokens > 0).sort((a, b) => b.tokens - a.tokens)
    const tokens = children.reduce((a, c) => a + c.tokens, 0)
    const files = g.key === 'memory' ? memoryFiles : []
    return { key: g.key, tokens, children, files, cats: new Set(children.map((c) => c.key)), expandable: children.length > 1 || files.length > 0 }
  }).filter((g) => g.tokens > 0).sort((a, b) => b.tokens - a.tokens)
  const groupOf = {}
  for (const g of groups) for (const c of g.children) groupOf[c.key] = g.key
  const deferred = data.deferred || []
  const defRows = ['mcpTools', 'systemTools'].map((k) => {
    const list = deferred.filter((d) => (d.kind === 'mcp') === (k === 'mcpTools'))
    return { key: `def-${k}`, cat: k, n: list.length, tokens: list.reduce((a, d) => a + (d.tokens || 0), 0) }
  }).filter((r) => r.n)
  const comp = s.comp
  const m = data.measured || {}
  const auto = comp && comp.auto && typeof comp.thresholdTokens === 'number'
  const over = auto && comp.remainingTokens === 0
  const caption = !comp ? t('pop.noCompaction') : !comp.auto ? t('pop.autoOff')
    : fmt(t(comp.engine === 'billion-context' ? 'pop.autoAtBili' : 'pop.autoAt'), { t: fmtK(comp.thresholdTokens) })
  const captionTip = [t(`pop.src.${m.usedSource || 'estimate'}`), m.rawTotalTokens > s.used * 1.05 ? fmt(t('pop.raw'), { t: fmtK(m.rawTotalTokens) }) : null].filter(Boolean).join(' · ')
  const nameOf = (k) => t(k === 'buffer' || k === 'free' ? `g.${k}` : `c.${k}`)
  const tip = (k, tokens) => [`${nameOf(k)} · ${fmtInt(Math.round(tokens))}`, fmt(t('ov.bar.ofWin'), { p: pct(tokens, s.win) })].join(' · ')
  const enOf = (key, fallback) => (t(key) !== en[key] ? fallback : null)
  // a hovered group lights all of its segments; a hovered category lights its own and its group row
  const isOn = (k) => hov === k || (hov && groups.some((g) => g.key === hov && g.cats.has(k)))
  const hover = (k) => ({ onMouseEnter: () => setHov(k), onMouseLeave: () => setHov(null) })
  const seg = (k, tokens, extra = undefined) => ({ 'data-k': k, title: tip(k, tokens), className: [extra, isOn(k) ? 'on' : ''].filter(Boolean).join(' ') || undefined, ...hover(k) })
  const keyToggle = (k) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(k) } }
  let i = 0
  const row = ({ k, lead, dotStyle, dotCls = 'clx-dot', name, tokens, share, color, title, sub, on, onClick, expanded }: any) => h('div', {
    key: k, title,
    className: ['clx-prow', sub ? 'sub' : '', on ? 'on' : '', onClick ? 'tog' : ''].filter(Boolean).join(' '),
    style: { '--i': sub ? 0 : i++, '--cat': color || 'var(--dsw-alias-border-l3)' },
    ...(onClick ? { role: 'button', tabIndex: 0, 'aria-expanded': expanded, onClick, onKeyDown: keyToggle(k) } : null),
    ...hover(k),
  },
    sub ? null : h('span', { className: dotCls, style: dotStyle }),
    h('span', { className: 'clx-pop-name' }, sub ? h('span', { className: dotCls, style: dotStyle }) : null, name, lead ? h('span', { className: 'lead' }, lead) : null),
    h('span', { className: 'clx-num' }, fmtK(tokens)),
    h('span', { className: 'clx-num clx-muted' }, share))
  const lines = []
  for (const g of groups) {
    const isOpen = open.has(g.key)
    const single = g.children.length === 1 ? g.children[0] : null
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
    }))
    if (!isOpen) continue
    const kids = g.files.length
      ? g.files.map((f) => row({ k: `file:${f.path}`, sub: true, dotStyle: { background: CAT_COLOR.memory }, color: CAT_COLOR.memory,
        name: h('code', { className: 'clx-pfile' }, f.path), tokens: f.tokens, share: pct(f.tokens, s.win), title: f.loads > 1 ? `${f.path} ×${f.loads}` : f.path,
        on: hov === g.key }))
      : g.children.map((c) => row({ k: c.key, sub: true, dotStyle: { background: c.color }, color: c.color,
        name: h(CatName, { t, k: c.key }), tokens: c.tokens, share: pct(c.tokens, s.win),
        title: c.count ? fmt(t('ov.bar.items'), { n: c.count }) : undefined, on: isOn(c.key) }))
    lines.push(h('div', { key: `${g.key}-kids`, className: 'clx-pkids' }, kids))
  }
  return h(React.Fragment, null,
    h('div', { className: 'clx-pop-usage' },
      h('span', { className: 'clx-big' }, pct(usedAnim, s.win, 0)),
      h('span', { className: 'clx-sub' }, ` ${t('pop.used')} `),
      h('span', { className: 'clx-sub', style: { fontVariantNumeric: 'tabular-nums' } }, `${fmtK(usedAnim)} / ${fmtK(s.win)}`),
      auto ? h('span', { className: `clx-pop-chip${over ? ' warn' : ''}`, title: fmt(t('pop.until'), { t: fmtK(comp.remainingTokens) }) },
        over ? t('pop.overShort') : fmt(t('pop.untilShort'), { t: fmtK(comp.remainingTokens) })) : null),
    s.win ? h('div', { className: 'clx-bar anim clx-ibar clx-pbar', 'data-active': hov ? '' : undefined, 'aria-hidden': true },
      groups.flatMap((g) => g.children).map((c) => h('span', { key: c.key, ...seg(c.key, c.tokens), style: { width: `${c.tokens / s.win * 100}%`, background: c.color } })),
      h('span', { key: 'free', ...seg('free', s.free, 'free'), style: { flex: '1 1 auto' } }),
      s.buffer > 0 ? h('span', { key: 'buffer', ...seg('buffer', s.buffer, 'clx-hatch'), style: { width: `${s.buffer / s.win * 100}%` } }) : null) : null,
    h('div', { className: 'clx-pop-caption', title: captionTip }, caption, ' · ', t(`pop.srcShort.${m.usedSource || 'estimate'}`)),
    h('div', { className: 'clx-prows', 'data-active': hov ? '' : undefined },
      lines,
      h('div', { key: 'sep', className: 'clx-sep', style: { '--i': i++ } }),
      s.buffer > 0 ? row({ k: 'buffer', dotCls: 'clx-dot clx-hatch', name: h(CatName, { t, k: 'buffer' }), tokens: s.buffer, share: pct(s.buffer, s.win), on: hov === 'buffer' }) : null,
      row({ k: 'free', dotCls: 'clx-dot free', name: h(CatName, { t, k: 'free' }), tokens: s.free, share: pct(s.free, s.win), on: hov === 'free' }),
      defRows.map((r) => row({ k: r.key, dotCls: 'clx-dot hollow', dotStyle: { borderColor: CAT_COLOR[r.cat] }, color: CAT_COLOR[r.cat],
        name: h(BiName, { zh: fmt(t('pop.deferredName'), { name: t(`g.${r.cat}`) }), en: enOf(`g.${r.cat}`, 'deferred') }),
        tokens: r.tokens, share: '—', title: fmt(t('pop.deferredTip'), { n: r.n }), on: hov === r.key }))))
}

function CompactPopover({ data, error, loading, reload, t, onOpen, style, popRef }) {
  let body
  if (!data) {
    body = error
      ? h('div', null, h('div', { className: 'clx-err' }, fmt(t('failed'), { msg: error })), h('button', { className: 'clx-link', onClick: reload }, t('retry')))
      : h('div', { className: 'clx-muted' }, t('loading'))
  } else if (!data.contextWindow && !data.measured?.totalTokens) {
    body = h('div', { className: 'clx-muted' }, t('pop.empty'))
  } else {
    body = h(PopBody, { data, t })
  }
  return h('div', { ref: popRef, className: 'clx-pop notranslate', translate: 'no', style, role: 'dialog', 'aria-label': t('pop.title') },
    h('div', { className: 'clx-pop-head' },
      h('span', { className: 'clx-pop-title' }, t('pop.title'),
        t('pop.title') !== en['pop.title'] ? h('span', { className: 'clx-pop-title-en' }, en['pop.title']) : null,
        loading ? h('span', { className: 'clx-muted clx-spin' }, ' ·') : null),
      data ? h('button', { className: 'clx-link clx-pop-open', onClick: onOpen, title: [data.model, data.contextWindow ? fmtK(data.contextWindow) : null].filter(Boolean).join(' · ') }, `${t('pop.open')} →`) : null),
    body)
}

function CompactButton(props) {
  const { ctx, t } = props
  useLocaleTick(ctx)
  const sessionId = typeof props.sessionId === 'string' ? props.sessionId : ''
  const pressure = useSafeProjection(props, 'contextPressure')
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const popRef = useRef(null)
  const liveKey = pressure ? `${pressure.pressureTokens}:${pressure.projectedTokens}:${pressure.contextWindow}` : ''
  const { data, error, loading, reload } = useBreakdown(sessionId, liveKey, open && !!sessionId, open && !pressure ? 5000 : 0)

  const used = pressure?.pressureTokens ?? pressure?.projectedTokens ?? data?.measured?.totalTokens
  const win = pressure?.contextWindow ?? data?.contextWindow
  const ratio = used !== undefined && win ? used / win : 0
  const threshold = data?.compaction?.thresholdTokens
  const warn = threshold && used ? (used >= threshold ? 2 : used >= threshold * 0.85 ? 1 : 0) : (ratio > 0.9 ? 2 : ratio > 0.75 ? 1 : 0)

  const place = useCallback(() => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.min(368, window.innerWidth - 24)
    const left = Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12))
    setPos({ left, bottom: Math.max(12, window.innerHeight - r.top + 8), width })
  }, [])

  useLayoutEffect(() => {
    if (!open) return undefined
    place()
    const onDown = (e) => {
      if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('resize', place)
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', place)
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, place])

  // The composer has no View-switching hook, so select our tab in the
  // header's own tab row (the same click a user would make).
  const openLens = () => {
    setOpen(false)
    try {
      const label = t('tab.title')
      // nearest enclosing Conversation's tab row (split views have several)
      let node = btnRef.current
      let row = null
      while (node && !row) {
        row = node.querySelector?.('[data-conversation-tabs]') ?? null
        node = node.parentElement
      }
      const tabs = row ? [...row.querySelectorAll('[role="tab"]')] : []
      const tab = tabs.find((el) => el.textContent.trim() === label)
      if (tab) tab.click()
    } catch {}
  }

  if (!sessionId) return null
  const label = win ? `${Math.round(ratio * 100)}%` : ''
  return h(React.Fragment, null,
    h(Style),
    h('button', {
      ref: btnRef,
      type: 'button',
      className: 'clx-btn dock clx-dock-ring',
      'aria-expanded': open,
      'aria-haspopup': 'dialog',
      title: win ? fmt(t('button.title'), { used: fmtK(used), window: fmtK(win) }) : t('button.unknown'),
      onClick: () => setOpen((v) => !v),
    }, h(Ring, { ratio, warn, size: 14, stroke: 2 }), label ? h('span', null, label) : null),
    open && pos ? toBody(h(CompactPopover, {
      data, error, loading, reload, t, onOpen: openLens, popRef,
      style: { left: pos.left, bottom: pos.bottom, width: pos.width },
    })) : null)
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
}

/** Category name; outside the English UI the English term follows in muted type. */
function CatName({ t, k }) {
  const key = k === 'buffer' || k === 'free' ? `g.${k}` : `c.${k}`
  const label = t(key)
  const term = label !== en[key] ? CAT_EN[k] : null
  return h('span', { className: 'clx-catname' },
    h('span', { className: 'zh' }, label),
    term ? h('span', { className: 'en' }, term) : null)
}

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/** Eases a number toward its target (from 0 on mount, then from wherever it is on each change). */
function useCountUp(target, ms = 900) {
  const [v, setV] = useState(() => (reducedMotion() ? target : 0))
  const cur = useRef(v)
  useEffect(() => {
    if (reducedMotion()) { cur.current = target; setV(target); return undefined }
    const from = cur.current
    const start = performance.now()
    let raf = 0
    const step = (now) => {
      const p = Math.min(1, (now - start) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      cur.current = from + (target - from) * e
      setV(cur.current)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return v
}

/**
 * The overview's stacked usage bar, made interactive: hover a segment or legend
 * item to preview it, click to pin it; the rest dims and the matching 分类明细
 * row is tinted (numbers are in the tooltip).
 */
function HeroBar({ cats, s, t, active, pick, onHover, onPick }) {
  if (!s.win) return null
  const parts = cats.filter((c) => c.tokens > 0)
  const info: any = {}
  for (const c of parts) info[c.key] = { key: c.key, color: c.color, tokens: c.tokens, count: c.count, cat: true }
  info.free = { key: 'free', tokens: s.free }
  if (s.buffer > 0) info.buffer = { key: 'buffer', tokens: s.buffer }
  const tip = (k) => {
    const x = info[k]
    const name = t(k === 'buffer' || k === 'free' ? `g.${k}` : `c.${k}`)
    return [`${name} · ${fmtInt(Math.round(x.tokens))}`, fmt(t('ov.bar.ofWin'), { p: pct(x.tokens, s.win) }),
      x.cat ? fmt(t('ov.bar.ofUsed'), { p: pct(x.tokens, s.used) }) : null,
      x.cat && x.count ? fmt(t('ov.bar.items'), { n: x.count }) : null].filter(Boolean).join(' · ')
  }
  const seg = (k, extra = undefined) => ({
    'data-k': k,
    title: tip(k),
    className: [extra, active === k ? 'on' : ''].filter(Boolean).join(' ') || undefined,
    onMouseEnter: () => onHover(k),
    onMouseLeave: () => onHover(null),
    onClick: () => onPick(k),
  })
  const legendItem = (k, dot, label) => h('button', {
    key: k, type: 'button', title: tip(k), 'aria-pressed': pick === k,
    className: active === k ? 'on' : undefined,
    onMouseEnter: () => onHover(k), onMouseLeave: () => onHover(null),
    onFocus: () => onHover(k), onBlur: () => onHover(null),
    onClick: () => onPick(k),
  }, dot, label)
  return h(React.Fragment, null,
    h('div', { className: 'clx-bar anim clx-ibar', 'data-active': active ? '' : undefined, 'aria-hidden': true },
      parts.map((c) => h('span', { key: c.key, ...seg(c.key), style: { width: `${c.tokens / s.win * 100}%`, background: c.color } })),
      h('span', { key: 'free', ...seg('free', 'free'), style: { flex: '1 1 auto' } }),
      s.buffer > 0 ? h('span', { key: 'buffer', ...seg('buffer', 'clx-hatch'), style: { width: `${s.buffer / s.win * 100}%` } }) : null),
    h('div', { className: 'clx-legend clx-ilegend', 'data-active': active ? '' : undefined },
      [...parts].sort((a, b) => b.tokens - a.tokens).map((c) => legendItem(c.key, h('i', { className: 'clx-dot', style: { background: c.color } }), c.label)),
      s.buffer > 0 ? legendItem('buffer', h('i', { className: 'clx-dot clx-hatch' }), t('g.buffer')) : null,
      legendItem('free', h('i', { className: 'clx-dot free' }), t('g.free'))))
}

/** The breakdown's flow data (steps, turns, live state), refreshed while a turn runs. */
function useFlow(sessionId, liveKey) {
  const [st, setSt] = useState<any>({ data: null, error: null, sid: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!sessionId) return undefined
    let dead = false
    call('flow', { sessionId }).then(
      (v) => { if (!dead) setSt({ data: v, error: null, sid: sessionId }) },
      (e) => { if (!dead) setSt((s) => ({ ...s, error: String(e?.message || e) })) },
    )
    return () => { dead = true }
  }, [sessionId, liveKey, tick])
  const data = st.sid === sessionId ? st.data : null
  const busy = !!data?.live && data.live.phase !== 'idle'
  useEffect(() => {
    if (!busy) return undefined
    const id = setTimeout(() => setTick((x) => x + 1), 2500)
    return () => clearTimeout(id)
  }, [busy, data])
  return { flow: data, flowError: st.error }
}

/** One line of what the conversation is doing right now. */
function LiveLine({ flow, t }) {
  const live = flow?.live
  const ph = live?.phase || 'idle'
  const now = useNow(ph !== 'idle')
  if (!live) return null
  const where = live.turn ? (live.step ? fmt(t('flow.where'), { t: live.turn, s: live.step }) : fmt(t('msg.turn'), { n: live.turn })) : null
  const last = live.lastSeq !== undefined
    ? `${t(`flow.n.${live.lastStage}`) || ''} ${live.lastTitle || ''}`.trim()
    : ''
  return h('div', { className: 'clx-liveline' },
    h('i', { className: `clx-live-dot${ph === 'idle' ? '' : ' on'}`, style: { background: LIVE_COLOR[ph] } }),
    h('b', null, t(`flow.live.${ph}`)),
    where ? h('span', { className: 'clx-muted' }, where) : null,
    last ? h('span', { className: 'clx-liveline-last', title: last }, last) : null,
    live.lastTime ? h('span', { className: 'clx-muted clx-liveline-ago' }, fmt(t('flow.ago'), { d: fmtDur(Math.max(0, now - live.lastTime)) })) : null)
}

function Stat({ k, v, sub = undefined, tone = '' }) {
  return h('div', { className: `clx-stat${tone ? ` ${tone}` : ''}` },
    h('div', { className: 'k' }, k),
    h('div', { className: 'v' }, v, sub ? h('small', null, sub) : null))
}

/** Context composition at every step that sent a request, grouped for stacking. */
/** Stacking order for the per-step bars: fixed preamble at the bottom, the conversation on top. */
const SERIES_CATS = ['system', 'systemTools', 'mcpTools', 'skills', 'memory', 'injected', 'summary', 'user', 'reasoning', 'assistantText', 'toolCalls', 'toolResults', 'other']

function useStepSeries(bd, flow) {
  return useMemo(() => {
    const steps = flow?.steps || []
    return steps.map((st, i) => {
      const comp = compositionAt(bd, st)
      const groups = SERIES_CATS.map((k) => comp.by[k] || 0)
      return { st, i, comp, groups }
    })
  }, [bd, flow])
}

/** What one request added to the context compared with the one before it. */
function stepDiff(bd, series, idx) {
  const cur = series[idx]
  if (!cur) return null
  const prev = idx > 0 ? series[idx - 1] : null
  const cutOf = (x) => x.st.requestSeq ?? x.st.endSeq ?? x.st.startSeq
  const cut = cutOf(cur)
  const prevCut = prev ? cutOf(prev) : 0
  const added = (bd.nodes || []).filter((n) => n.seq >= prevCut && n.seq < cut)
  const addedTok = added.reduce((a, n) => a + n.tokensCal, 0)
  const byCat = SERIES_CATS.map((k, gi) => ({ k, v: cur.groups[gi], d: prev ? cur.groups[gi] - prev.groups[gi] : cur.groups[gi] })).filter((x) => Math.abs(x.d) >= 1)
  const compacted = (bd.compactionEvents || []).filter((c) => c.seq >= prevCut && c.seq <= Math.max(cut, cur.st.endSeq ?? cut))
  const delta = prev ? cur.comp.total - prev.comp.total : cur.comp.total
  return { idx, cur, prev, cut, prevCut, added, addedTok, byCat, compacted, delta, last: idx === series.length - 1 }
}

const dsign = (v) => (Math.abs(v) < 0.5 ? "±0" : `${v > 0 ? "+" : "−"}${fmtK(Math.abs(v))}`)

/** The step every page follows: a strip of requests, and what the picked one changed. */
function StepBar({ series, diff, onSel, t, onNav, stepOnly, setStepOnly, nav }) {
  const scroller = useRef(null)
  useLayoutEffect(() => {
    const el = scroller.current
    const b = el?.querySelector(".on")
    if (el && b) el.scrollLeft = Math.max(0, b.offsetLeft - el.clientWidth / 2)
  }, [diff?.idx, series.length])
  if (!diff) return null
  const peak = Math.max(1, ...series.map((x) => x.comp.total))
  const st = diff.cur.st
  const go = (i) => onSel(Math.min(series.length - 1, Math.max(0, i)))
  return h("div", { className: "clx-stepbar" },
    h("div", { className: "clx-stepbar-top" },
      h("button", { className: "clx-chipbtn", disabled: diff.idx <= 0, onClick: () => go(diff.idx - 1), "aria-label": "‹" }, "‹"),
      h("button", { className: "clx-chipbtn", disabled: diff.last, onClick: () => go(diff.idx + 1), "aria-label": "›" }, "›"),
      h("b", null, fmt(t("flow.where"), { t: st.turn, s: st.step })),
      h("span", { className: "clx-stchip" }, h("span", { className: "k" }, t("st.ctx")), fmtK(diff.cur.comp.total)),
      h("span", { className: `clx-stchip${diff.delta > 0 ? " up" : ""}` }, h("span", { className: "k" }, t("st.delta")), dsign(diff.delta)),
      diff.compacted.length ? h("span", { className: "clx-stchip warn" }, "✂ ", t("sd.compacted")) : null,
      st.tools.length ? h("span", { className: "clx-stepbar-tools", title: st.tools.join(", ") }, groupNames(st.tools)) : null,
      diff.last ? h("span", { className: "clx-muted clx-stepbar-now" }, t("sd.now")) : h("button", { className: "clx-chipbtn clx-stepbar-now", onClick: () => onSel(null) }, t("sd.backNow"))),
    h("div", { className: "clx-stepbar-strip", ref: scroller },
      series.map((x) => h("button", {
        key: x.st.startSeq, type: "button", className: `b${x.i === diff.idx ? " on" : ""}${x.i > diff.idx ? " later" : ""}`,
        title: `${fmt(t("flow.where"), { t: x.st.turn, s: x.st.step })} · ${fmtK(x.comp.total)}`, onClick: () => onSel(x.i),
      }, h("i", { style: { height: `${Math.max(6, x.comp.total / peak * 100)}%` } })))),
    h("div", { className: "clx-stepbar-diff" },
      h("span", { className: "clx-muted" }, t("sd.added")),
      diff.added.length
        ? h("button", { className: `clx-chipbtn${stepOnly && nav === "messages" ? " on" : ""}`, "aria-pressed": stepOnly, onClick: () => { setStepOnly(true); onNav("messages") }, title: t("sd.onlyNew") },
          fmt(t("sd.items"), { n: diff.added.length, k: fmtK(diff.addedTok) }))
        : h("span", { className: "clx-muted" }, t("sd.none")),
      diff.byCat.sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 5).map((g) => h("span", { key: g.k, className: "clx-stchip" },
        h("i", { className: "clx-dot", style: { background: CAT_COLOR[g.k] } }), t(`c.${g.k}`), h("em", { className: g.d > 0 ? "up" : "down" }, dsign(g.d)))),
      stepOnly ? h("button", { className: "clx-chipbtn clx-stepbar-now", onClick: () => setStepOnly(false) }, t("sd.showAll")) : null))
}

/** Per-step stacked bars (what each request carried), with the picked step's detail under them. */
/** The message a step is about: what the model said or called in it, else its first message. */
function stepNode(bd, st) {
  const inStep = (bd.nodes || []).filter((n) => n.seq >= st.startSeq && (st.endSeq === undefined || n.seq <= st.endSeq))
  const own = inStep.find((n) => n.category === 'toolCalls' || n.category === 'assistantText' || n.category === 'reasoning')
  return (own || inStep[0])?.seq ?? st.startSeq
}

function StepTrend({ data, flow, t, onJump, series, pickIdx, onSel }) {
  const [hover, setHover] = useState(null)
  const scroller = useRef(null)
  const s = summarize(data)
  const comp = s.comp
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [series.length])
  if (!series.length) return h(Trend, { data, t, onJump })
  const peak = Math.max(1, ...series.map((x) => x.comp.total))
  const yMax = Math.max(peak * 1.08, comp?.thresholdTokens && comp.thresholdTokens < peak * 1.6 ? comp.thresholdTokens * 1.04 : 0)
  const cur = series[hover ?? pickIdx]
  const prev = cur && cur.i > 0 ? series[cur.i - 1] : null
  const st = cur.st
  const u = st.usage
  const delta = prev ? cur.comp.total - prev.comp.total : cur.comp.total
  const thY = comp?.thresholdTokens && comp.thresholdTokens <= yMax ? comp.thresholdTokens / yMax * 100 : null
  const segs = SERIES_CATS.map((k, gi) => ({ key: k, label: t(`c.${k}`), color: CAT_COLOR[k], tokens: cur.groups[gi], d: prev ? cur.groups[gi] - prev.groups[gi] : cur.groups[gi] }))
  return h('div', { className: 'clx-card clx-steptrend' },
    h('div', { className: 'clx-card-head' },
      h(CardTitle, { icon: 'trend', text: t('st.title') }),
      h('span', { className: 'clx-muted' }, fmt(t('st.count'), { n: series.length }))),
    h('div', { className: 'clx-stbars-wrap' },
      thY !== null ? h('div', { className: 'clx-stbars-th', style: { bottom: `${thY}%` } }, h('span', null, `${t('trend.threshold')} ${fmtK(comp.thresholdTokens)}`)) : null,
      h('div', { className: 'clx-stbars', ref: scroller, onMouseLeave: () => setHover(null) },
        series.map((x) => {
          const newTurn = x.i === 0 || series[x.i - 1].st.turn !== x.st.turn
          const on = x.i === pickIdx
          return h('button', {
            key: x.st.startSeq, type: 'button',
            className: `clx-stbar${on ? ' on' : ''}${newTurn ? ' turn' : ''}${x.st.errors ? ' err' : ''}`,
            title: `${fmt(t('flow.where'), { t: x.st.turn, s: x.st.step })} · ${fmtK(x.comp.total)}`,
            onMouseEnter: () => setHover(x.i),
            onClick: () => onSel(x.i),
          },
            h('span', { className: 'col', style: { height: `${Math.max(2, x.comp.total / yMax * 100)}%` } },
              SERIES_CATS.map((k, gi) => (x.groups[gi] > 0 ? h('i', { key: k, style: { flexGrow: x.groups[gi], background: CAT_COLOR[k] } }) : null))),
            newTurn ? h('span', { className: 'lbl' }, `T${x.st.turn}`) : null)
        }))),
    h('div', { className: 'clx-stdetail' },
      h('div', { className: 'clx-stdetail-head' },
        h('b', null, fmt(t('flow.where'), { t: st.turn, s: st.step })),
        st.status !== 'done' ? h('span', { className: st.status === 'error' ? 'clx-err' : st.status === 'running' ? 'clx-live' : 'clx-warn' }, t(`flow.status.${st.status}`)) : null,
        h('span', { className: 'clx-stchip' }, h('span', { className: 'k' }, t('st.ctx')), fmtK(cur.comp.total)),
        h('span', { className: `clx-stchip${delta > 0 ? ' up' : ''}` }, h('span', { className: 'k' }, t('st.delta')), dsign(delta)),
        u ? h('span', { className: 'clx-stchip' }, h('span', { className: 'k' }, t('st.output')), fmtK(u.output || 0)) : null,
        u ? h('span', { className: 'clx-stchip' }, h('span', { className: 'k' }, t('st.cache')), pct(u.cacheRead || 0, st.promptTokens || 0, 0)) : null,
        h('button', { className: 'clx-chipbtn clx-stdetail-go', onClick: () => onJump(stepNode(data, st)) }, `${t('st.viewMsgs')} ›`)),
      st.tools.length ? h('div', { className: 'clx-stdetail-tools', title: st.tools.join(', ') }, h('span', { className: 'clx-muted' }, `${t('flow.calls')} `), groupNames(st.tools)) : null,
      h(UsageBar, { segments: segs, win: s.win, buffer: 0 }),
      h('div', { className: 'clx-stlegend' }, [...segs].sort((p, q) => q.tokens - p.tokens).filter((g) => g.tokens >= 1 || Math.abs(g.d) >= 1).map((g) => h('span', { key: g.key },
        h('i', { className: 'clx-dot', style: { background: g.color } }), g.label,
        h('b', null, fmtK(g.tokens)),
        prev && Math.abs(g.d) >= 1 ? h('em', { className: g.d > 0 ? 'up' : 'down' }, dsign(g.d)) : null))),
      !cur.comp.exact ? h('div', { className: 'clx-muted', style: { fontSize: 11 } }, t('flow.ctxEstNoUsage')) : null))
}

/** Where the context sits against the compaction triggers, and the policy behind them. */
function CompactionCard({ data, comp, s, t }) {
  const win = s.win || 1
  const at = (v) => `${Math.min(100, Math.max(0, v / win * 100))}%`
  const marks = [
    comp.thresholdTokens ? { k: 'th', v: comp.thresholdTokens, label: t('ov.threshold'), cls: 'warn' } : null,
    comp.emergencyTokens ? { k: 'em', v: comp.emergencyTokens, label: t('ov.emergency'), cls: 'err' } : null,
  ].filter(Boolean)
  const over = comp.thresholdTokens && s.used >= comp.thresholdTokens
  const ratio = typeof comp.thresholdRatio === 'number' ? `${Math.round(comp.thresholdRatio * 100)}%` : null
  return h('div', { className: 'clx-card clx-infocard' },
    h('div', { className: 'clx-card-head' },
      h(CardTitle, { icon: 'compress', text: t('ov.compaction') }),
      h('span', { className: 'clx-pill' }, comp.engine || '—'),
      h('span', { className: `clx-pill ${comp.auto ? 'on' : 'off'}` }, `${t('ov.auto')} · ${comp.auto ? t('ov.on') : t('ov.off')}`)),
    h('div', { className: 'clx-cgauge' },
      h('div', { className: 'track' },
        h('span', { className: `fill${over ? ' over' : ''}`, style: { width: at(s.used) } }),
        marks.map((x) => h('i', { key: x.k, className: x.cls, style: { left: at(x.v) }, title: `${x.label} ${fmtInt(x.v)}` }))),
      h('div', { className: 'scale' },
        h('span', null, `${t('ov.used')} ${fmtK(s.used)}`),
        marks.map((x) => h('span', { key: x.k, className: x.cls, style: { left: at(x.v) } }, fmtK(x.v))),
        h('span', { className: 'end' }, fmtK(s.win)))),
    h('div', { className: 'clx-tiles' },
      comp.thresholdTokens ? h(Stat, { k: t('ov.threshold'), v: fmtK(comp.thresholdTokens), sub: ratio ? ` ${ratio}` : undefined }) : null,
      h(Stat, { k: t('ov.remaining'), v: comp.remainingTokens > 0 ? fmtK(comp.remainingTokens) : t('pop.over'), tone: comp.remainingTokens > 0 ? '' : 'warn' }),
      comp.emergencyTokens ? h(Stat, { k: t('ov.emergency'), v: fmtK(comp.emergencyTokens), sub: comp.emergencyRatio ? ` ${Math.round(comp.emergencyRatio * 100)}%` : undefined }) : null,
      h(Stat, { k: t('ov.buffer'), v: fmtK(comp.bufferTokens) }),
      comp.headroomTokens !== undefined ? h(Stat, { k: t('ov.headroom'), v: fmtK(comp.headroomTokens) }) : null,
      comp.retainBudget !== undefined ? h(Stat, { k: t('ov.retain'), v: comp.retainTokens !== undefined ? fmtK(comp.retainTokens) : fmtK(comp.retainBudget), sub: comp.retainTokens === undefined ? ` ${Math.round((comp.retainRatio || 0) * 100)}%` : undefined }) : null,
      comp.summaryMaxTokens ? h(Stat, { k: t('ov.summaryMax'), v: fmtK(comp.summaryMaxTokens) }) : null,
      h(Stat, { k: t('ov.compactions'), v: String((data.compactionEvents || []).length) }),
      comp.override ? h(Stat, { k: t('ov.override'), v: comp.override.model, sub: ` ${comp.override.provider}` }) : null),
    h('div', { className: 'clx-note' },
      comp.engine === 'billion-context' ? `${t('ov.biliNote')}${comp.defaults ? ` ${t('ov.biliDefaults')}` : ''}` : t('ov.formula')))
}

/** How "used" was measured, how the estimate was calibrated to it, and what the last request cost. */
function MeasureCard({ data, s, t }) {
  const m = data.measured || {}
  const u = m.lastRequest
  const inTot = u ? (u.inputTokens || 0) + (u.cacheReadTokens || 0) + (u.cacheWriteTokens || 0) : 0
  const seg = (v, cls) => (v > 0 ? h('span', { className: cls, style: { flexGrow: v } }) : null)
  const types = Object.entries<any>(data.typeCounts || {}).sort((a, b) => b[1] - a[1])
  return h('div', { className: 'clx-card clx-infocard' },
    h('div', { className: 'clx-card-head' },
      h(CardTitle, { icon: 'gauge', text: t('ov.measure') }),
      h('span', { className: 'clx-pill' }, t(`pop.src.${m.usedSource || 'estimate'}`)),
      h('span', { className: 'clx-pill', title: t('ov.baseline') }, t(`ov.baseline.${m.baselineKind || 'none'}`))),
    h('div', { className: 'clx-tiles' },
      h(Stat, { k: t('ov.used'), v: fmtK(m.totalTokens) }),
      h(Stat, { k: t('ov.rawTotal'), v: fmtK(m.rawTotalTokens), sub: m.rawTotalTokens > m.totalTokens ? ` −${pct(m.rawTotalTokens - m.totalTokens, m.rawTotalTokens, 0)}` : undefined }),
      h(Stat, { k: t('ov.estSum'), v: fmtK(m.estimatedSum) }),
      h(Stat, { k: t('ov.factor'), v: `×${(m.factor || 1).toFixed(3)}` }),
      h(Stat, { k: t('ov.baseline'), v: fmtK(m.baselineTokens) }),
      h(Stat, { k: t('ov.delta'), v: fmtK(m.surfaceDeltaTokens) }),
      h(Stat, { k: t('ov.window'), v: fmtK(data.contextWindow) }),
      h(Stat, { k: t('ov.maxOut'), v: fmtK(data.maxTokens) })),
    u ? h('div', { className: 'clx-req' },
      h('div', { className: 'clx-req-head' },
        h('span', null, fmt(t('ov.lastReq'), { seq: u.seq, time: fmtTime(u.time) })),
        h('b', null, `${t('ov.hit')} ${pct(u.cacheReadTokens || 0, inTot, 0)}`)),
      h('div', { className: 'clx-req-bar' }, seg(u.cacheReadTokens, 'cr'), seg(u.cacheWriteTokens, 'cw'), seg(u.inputTokens, 'in'), seg(u.outputTokens, 'out')),
      h('div', { className: 'clx-req-legend' },
        h('span', null, h('i', { className: 'cr' }), t('ov.cacheRead'), h('b', null, fmtK(u.cacheReadTokens || 0))),
        h('span', null, h('i', { className: 'cw' }), t('ov.cacheWrite'), h('b', null, fmtK(u.cacheWriteTokens || 0))),
        h('span', null, h('i', { className: 'in' }), t('ov.uncached'), h('b', null, fmtK(u.inputTokens || 0))),
        h('span', null, h('i', { className: 'out' }), t('ov.output'), h('b', null, fmtK(u.outputTokens || 0))))) : null,
    types.length ? h('div', { className: 'clx-types', title: t('ov.types') },
      h('span', { className: 'clx-muted' }, `${t('ov.types')} · ${fmtInt(data.eventCount)}`),
      types.slice(0, 8).map(([k, v]) => h('span', { key: k, className: 'clx-type' }, k, h('b', null, fmtInt(v)))),
      types.length > 8 ? h('span', { className: 'clx-type more', title: types.slice(8).map(([k, v]) => `${k} ${v}`).join('\n') }, `+${types.length - 8}`) : null) : null,
    h('div', { className: 'clx-note' }, t('ov.calNote')))
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
}

function CardTitle({ icon, text }) {
  return h('h4', { className: 'clx-ctitle' },
    h('span', { className: 'ic' }, h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      (CARD_ICON[icon] || []).map((d, i) => h('path', { key: i, d })))),
    text)
}

function CardHead({ icon, title, meta = null, more = null, t }) {
  return h('div', { className: 'clx-card-head' },
    h(CardTitle, { icon, text: title }),
    meta ? h('span', { className: 'clx-chead-meta' }, meta) : null,
    more ? h('button', { className: 'clx-more', onClick: more }, `${t('ov.more')} ›`) : null)
}

/** Category shares as a ring, the used total in its middle; the legend opens that category's messages. */
function CompositionCard({ data, s, t, onShowCat, stepLabel = null }) {
  const [hov, setHov] = useState(null)
  const parts = CATS.map((k) => ({ k, v: s.byCat[k]?.tokens || 0, n: s.byCat[k]?.count || 0 })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v)
  const total = parts.reduce((a, b) => a + b.v, 0) || 1
  const R = 50
  const C = 2 * Math.PI * R
  let off = 0
  const segs = parts.map((x) => {
    const len = x.v / total * C
    const seg = { ...x, dash: `${Math.max(0, len - (parts.length > 1 ? 1.2 : 0))} ${C}`, off: -off }
    off += len
    return seg
  })
  const cur = hov ? parts.find((x) => x.k === hov) : null
  return h('div', { className: 'clx-card' },
    h(CardHead, { t, icon: 'donut', title: t('ov.composition'), meta: `${stepLabel ? stepLabel + ' · ' : ''}${fmtK(s.used)} · ${pct(s.used, s.win)}` }),
    h('div', { className: 'clx-donutwrap' },
      h('svg', { className: 'clx-donut', viewBox: '0 0 128 128', width: 128, height: 128 },
        h('circle', { cx: 64, cy: 64, r: R, fill: 'none', stroke: 'var(--dsw-alias-border-l1)', strokeWidth: 16 }),
        segs.map((x) => h('circle', {
          key: x.k, cx: 64, cy: 64, r: R, fill: 'none', stroke: CAT_COLOR[x.k], strokeWidth: hov === x.k ? 20 : 16,
          strokeDasharray: x.dash, strokeDashoffset: x.off, transform: 'rotate(-90 64 64)', opacity: hov && hov !== x.k ? 0.35 : 1,
          onMouseEnter: () => setHov(x.k), onMouseLeave: () => setHov(null), onClick: () => onShowCat(x.k), style: { cursor: 'pointer' },
        }, h('title', null, `${t(`c.${x.k}`)} ${fmtInt(x.v)}`))),
        h('text', { x: 64, y: 62, textAnchor: 'middle', className: 'clx-donut-v' }, cur ? fmtK(cur.v) : fmtK(s.used)),
        h('text', { x: 64, y: 78, textAnchor: 'middle', className: 'clx-donut-k' }, cur ? t(`c.${cur.k}`) : t('ov.usedShort'))),
      h('div', { className: 'clx-dlegend' }, parts.map((x) => h('button', {
        key: x.k, type: 'button', className: hov === x.k ? 'on' : undefined, title: `${CAT_EN[x.k]} · ${fmtInt(x.v)} · ${t('ov.openCat')}`,
        onMouseEnter: () => setHov(x.k), onMouseLeave: () => setHov(null), onClick: () => onShowCat(x.k),
      },
        h('i', { className: 'clx-dot', style: { background: CAT_COLOR[x.k] } }),
        h('span', { className: 'nm' }, t(`c.${x.k}`)),
        h('span', { className: 'pc' }, pct(x.v, total, 1)),
        h('span', { className: 'tk' }, fmtK(x.v)))))))
}

/** The heaviest tools of the session, as on the tools page. */
function ToolsPeek({ data, t, onNav }) {
  const stats = [...(data.toolStats || [])].sort((a, b) => (b.callTokens + b.resultTokens) - (a.callTokens + a.resultTokens))
  const errsBy = {}
  for (const x of data.invocations || []) if (x.isError) errsBy[x.name] = (errsBy[x.name] || 0) + 1
  const max = Math.max(1, ...stats.map((x) => x.callTokens + x.resultTokens))
  const cmds = data.commands || []
  const calls = stats.reduce((a, x) => a + x.calls, 0)
  return h('div', { className: 'clx-card clx-peek' },
    h(CardHead, { t, icon: 'tools', title: t('nav.tools'), meta: fmt(t('ov.peek.tools'), { n: stats.length, c: calls }), more: () => onNav('tools') }),
    stats.length ? stats.slice(0, 5).map((x) => h(ToolLine, {
      key: x.name, name: x.name, color: CAT_COLOR.toolResults, sel: false, onClick: () => onNav('tools'),
      title: `${t('pair.call')} ${fmtInt(x.callTokens)} + ${t('pair.result')} ${fmtInt(x.resultTokens)}`,
      bar: h(React.Fragment, null,
        h('span', { style: { width: `${x.callTokens / max * 100}%`, background: CAT_COLOR.toolCalls } }),
        h('span', { style: { width: `${x.resultTokens / max * 100}%`, background: CAT_COLOR.toolResults } })),
      count: `×${x.calls}`, errs: errsBy[x.name], tok: fmtK(x.callTokens + x.resultTokens),
    })) : h('div', { className: 'clx-tempty clx-muted' }, t('tools.noUse')),
    cmds.length ? h('div', { className: 'clx-peek-foot' },
      h(CardTitle, { icon: 'cmd', text: t('cmd.title') }),
      h('span', null, fmt(t('ov.peek.cmds'), { n: cmds.length, d: fmtMs(cmds.reduce((a, c) => a + (c.durationMs || 0), 0)), f: cmds.filter((c) => c.status === 'failed').length }))) : null)
}

/** The biggest messages in the context: where the tokens actually sit. */
function MessagesPeek({ data, t, onJump, onNav }) {
  const nodes = data.nodes || []
  const top = [...nodes].sort((a, b) => b.tokensCal - a.tokensCal).slice(0, 6)
  const sum = nodes.reduce((a, n) => a + n.tokensCal, 0)
  return h('div', { className: 'clx-card clx-peek' },
    h(CardHead, { t, icon: 'messages', title: t('ov.peek.bigMsgs'), meta: fmt(t('msg.count'), { n: nodes.length, t: fmtK(sum) }), more: () => onNav('messages') }),
    top.map((n) => h('div', { key: n.seq, className: 'clx-mrow clx-peekrow', role: 'button', tabIndex: 0, onClick: () => onJump(n.seq), title: `#${n.seq}` },
      h('span', { className: 'clx-mrow-kind', style: { '--cat': CAT_COLOR[n.category] || CAT_COLOR.other } }, t(`k.${n.category}`)),
      h('span', { className: 'clx-mrow-text' }, n.tool ? h('b', { className: 'clx-mrow-tool' }, `${n.tool} `) : null, n.preview || '—'),
      h('span', { className: 'clx-peek-pct' }, pct(n.tokensCal, sum, 0)),
      h('span', { className: 'clx-mrow-tok' }, fmtK(n.tokensCal)))))
}

/** Memory files, skills and runtime facts in three lines. */
function SourcesPeek({ sessionId, liveKey, bd, t, onNav }) {
  const { data: src } = useSources(sessionId, liveKey)
  const rows = useMemo(() => (src ? skillRows(src) : []), [src])
  if (!src) return h('div', { className: 'clx-card clx-peek' }, h(CardHead, { t, icon: 'sources', title: t('nav.sources'), more: () => onNav('sources') }), h('div', { className: 'clx-muted' }, t('loading')))
  const active = (src.memory?.files || []).filter((f) => f.status === 'active')
  const memTok = active.reduce((a, f) => a + (f.tokens || 0), 0)
  const loaded = rows.filter((r) => r.loads.length)
  const inCat = rows.filter((r) => r.cat).length
  const catTok = (bd?.skills || []).reduce((a, x) => a + (x.tokensCal || 0), 0)
  const rt = (src.runtime?.sections || []).length + (src.timeContext ? 1 : 0)
  const line = (color, name, badge, tok) => h(SrcLine, { key: name, color, name, badge, tok, sel: false, onClick: () => onNav('sources') })
  return h('div', { className: 'clx-card clx-peek' },
    h(CardHead, { t, icon: 'sources', title: t('nav.sources'), meta: fmtK(memTok + catTok), more: () => onNav('sources') }),
    line(CAT_COLOR.memory, t('nav.memory'), active.length ? active.map((f) => f.displayPath).slice(0, 2).join(', ') + (active.length > 2 ? ` +${active.length - 2}` : '') : t('src.memoryZero'), active.length ? fmtK(memTok) : '—'),
    line(CAT_COLOR.skills, t('src.skills'), rows.length ? fmt(t('ov.peek.skills'), { l: loaded.length, c: inCat, n: rows.length }) : t('src.skillsZero'), catTok ? fmtK(catTok) : '—'),
    line(CAT_COLOR.injected, t('src.runtime'), fmt(t('src.itemsN'), { n: rt }), ''))
}

/** What happened inside one step: what the model said, what it called, what came back. */
function stepStory(bd, st) {
  const inRange = (q) => q !== undefined && q >= st.startSeq && (st.endSeq === undefined || q <= st.endSeq)
  const said = []
  for (const n of bd.nodes || []) {
    if (!inRange(n.seq) || !n.split) continue
    if ((n.split.assistantText || 0) > 0 || (n.split.reasoning || 0) > 0) {
      const kind = (n.split.assistantText || 0) >= (n.split.reasoning || 0) ? "answer" : "thinking"
      if (n.preview && !(n.tools || []).length || (n.preview && n.preview !== (n.tools || []).join(", "))) said.push({ seq: n.seq, kind, text: n.preview, tok: n.tokensCal })
    }
  }
  const calls = (bd.invocations || []).filter((x) => inRange(x.callSeq) || (x.callSeq === undefined && inRange(x.resultSeq)))
  return { said, calls }
}

function StepStory({ bd, st, t, onJump }) {
  if (!st) return null
  const { said, calls } = stepStory(bd, st)
  if (!said.length && !calls.length) return h("div", { className: "clx-muted clx-tempty" }, t("sd.storyNone"))
  return h("div", { className: "clx-story" },
    said.map((x) => h("div", { key: "s" + x.seq, className: "clx-story-row said", role: "button", onClick: () => onJump(x.seq) },
      h("span", { className: "k" }, t(x.kind === "answer" ? "sd.said" : "sd.thought")), h("span", { className: "tx" }, x.text))),
    calls.map((x, i) => h("div", { key: "c" + i, className: `clx-story-row call${x.isError ? " err" : ""}`, role: "button", onClick: () => onJump(x.resultSeq ?? x.callSeq) },
      h("span", { className: "k" }, t("sd.called")),
      h("span", { className: "tx" },
        h("b", null, x.name), " ", h("code", null, x.args || ""),
        x.resultSeq !== undefined
          ? h("span", { className: "res" }, x.isError ? "⚠ " : "→ ", h("span", { className: "tk" }, fmtK(x.resultTokens || 0)), " ", x.resultPreview || "")
          : h("span", { className: "res clx-muted" }, "…")))))
}

/** The prompt the model read, in the order it read it; picking a step shows that request. */
function PromptView({ data, t, diff, series, onSel, sessionId, ctx, cwd, onJump, onAsk }) {
  const [open, setOpen] = useState<number | null>(null)
  const [hide, setHide] = useState<Record<string, boolean>>({})
  const [toolsOpen, setToolsOpen] = useState(false)
  const all = data.nodes || []
  const cut = diff && !diff.last ? diff.cut : Infinity
  const sent = all.filter((n) => n.seq < cut)
  const later = all.length - sent.length
  const laterTok = all.filter((n) => n.seq >= cut).reduce((a, n) => a + n.tokensCal, 0)
  const sys = sent.filter((n) => n.category === "system")
  const rest = sent.filter((n) => n.category !== "system")
  const tools = data.tools || []
  const toolTok = tools.reduce((a, x) => a + (x.tokensCal || 0), 0)
  const total = sent.reduce((a, n) => a + n.tokensCal, 0) + toolTok || 1
  const present = {}
  for (const n of sent) present[n.category] = (present[n.category] || 0) + 1
  const shown = (n) => !hide[n.category]
  const cutOf = (x) => x.st.requestSeq ?? x.st.endSeq ?? x.st.startSeq
  const dividers = new Map()
  for (const x of series) {
    const c = cutOf(x)
    const first = rest.find((n) => n.seq >= c)
    const key = first ? first.seq : "end"
    if (!dividers.has(key)) dividers.set(key, [])
    dividers.get(key).push(x)
  }
  const goto = (id) => document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" })
  const segs = [
    ...sys.map((n) => ({ id: `pv-${n.seq}`, w: n.tokensCal, c: CAT_COLOR.system, title: `${t("c.system")} · ${fmtInt(n.tokensCal)}` })),
    { id: "pv-tools", w: toolTok, c: CAT_COLOR.systemTools, title: `${t("c.systemTools")} · ${fmtInt(toolTok)}` },
    ...rest.map((n) => ({ id: `pv-${n.seq}`, w: n.tokensCal, c: CAT_COLOR[n.category] || CAT_COLOR.other, title: `#${n.seq} ${t(`c.${n.category}`)} · ${fmtInt(n.tokensCal)}` })),
  ].filter((x) => x.w > 0)
  const itemEl = (n) => {
    const isOpen = open === n.seq
    const color = CAT_COLOR[n.category] || CAT_COLOR.other
    const fresh = diff && n.seq >= diff.prevCut && n.seq < diff.cut
    return h("div", { key: n.seq, id: `pv-${n.seq}`, className: `clx-pv-item${isOpen ? " open" : ""}${fresh ? " fresh" : ""}`, style: { "--cat": color } },
      h("div", { className: "clx-pv-head", role: "button", tabIndex: 0, onClick: () => setOpen(isOpen ? null : n.seq),
        onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(isOpen ? null : n.seq) } } },
        h(Chevron, { open: isOpen, size: 10 }),
        h("span", { className: "clx-mrow-kind", style: { "--cat": color } }, t(`k.${n.category}`)),
        n.tool ? h("b", { className: "clx-mrow-tool" }, n.tool) : null,
        (n.tools || []).length ? h("b", { className: "clx-mrow-tool" }, groupNames(n.tools)) : null,
        fresh ? h("span", { className: "clx-pill" }, t("sd.fresh")) : null,
        h("span", { className: "sq" }, `#${n.seq}`),
        h("button", { className: "clx-pv-ask", title: t("az.askThis"), onClick: (e) => { e.stopPropagation(); onAsk(n.seq) } }, "✦"),
        h("span", { className: "tk" }, fmtK(n.tokensCal), h("small", null, ` ${pct(n.tokensCal, total, 1)}`))),
      isOpen ? h("div", { className: "clx-pv-body" }, h(NodeDetail, { sessionId, seq: n.seq, t, ctx, cwd }))
        : h("div", { className: "clx-pv-text", onClick: () => setOpen(n.seq) }, n.preview || "—"))
  }
  const rows = []
  for (const n of sys) if (shown(n)) rows.push(itemEl(n))
  rows.push(h("div", { key: "tools", id: "pv-tools", className: `clx-pv-item tools${toolsOpen ? " open" : ""}`, style: { "--cat": CAT_COLOR.systemTools } },
    h("div", { className: "clx-pv-head", role: "button", tabIndex: 0, onClick: () => setToolsOpen(!toolsOpen) },
      h(Chevron, { open: toolsOpen, size: 10 }),
      h("span", { className: "clx-mrow-kind", style: { "--cat": CAT_COLOR.systemTools } }, t("c.systemTools")),
      h("span", { className: "clx-muted" }, fmt(t("sd.toolDefs"), { n: tools.length })),
      h("span", { className: "tk" }, fmtK(toolTok), h("small", null, ` ${pct(toolTok, total, 1)}`))),
    h("div", { className: "clx-pv-text" }, tools.slice().sort((a, b) => b.tokensCal - a.tokensCal).slice(0, toolsOpen ? 999 : 12).map((x) => h("code", { key: x.name, className: "clx-pv-tool" }, x.name, h("small", null, ` ${fmtK(x.tokensCal)}`))),
      !toolsOpen && tools.length > 12 ? h("span", { className: "clx-muted" }, ` +${tools.length - 12}`) : null)))
  for (const n of rest) {
    const ds = dividers.get(n.seq)
    if (ds) for (const x of ds) rows.push(h("div", { key: `d${x.st.startSeq}`, className: `clx-pv-div${diff && x.i === diff.idx ? " on" : ""}`, role: "button", onClick: () => onSel(x.i) },
      h("span", null, fmt(t("flow.where"), { t: x.st.turn, s: x.st.step })), h("span", { className: "clx-muted" }, `${t("sd.request")} · ${fmtK(x.comp.total)}`)))
    if (shown(n)) rows.push(itemEl(n))
  }
  const endDs = dividers.get("end")
  if (endDs) for (const x of endDs) rows.push(h("div", { key: `d${x.st.startSeq}`, className: `clx-pv-div${diff && x.i === diff.idx ? " on" : ""}`, role: "button", onClick: () => onSel(x.i) },
    h("span", null, fmt(t("flow.where"), { t: x.st.turn, s: x.st.step })), h("span", { className: "clx-muted" }, `${t("sd.request")} · ${fmtK(x.comp.total)}`)))
  return h("div", { className: "clx-pv" },
    h("div", { className: "clx-card" },
      h(CardHead, { t, icon: "messages", title: t("sd.promptTitle"), meta: `${fmtK(total)} · ${fmt(t("sd.itemsN"), { n: sent.length })}` }),
      h("div", { className: "clx-muted", style: { fontSize: 11.5, marginBottom: 6 } }, diff && !diff.last ? fmt(t("sd.promptAt"), { t: diff.cur.st.turn, s: diff.cur.st.step }) : t("sd.promptNow")),
      h("div", { className: "clx-pv-map" }, segs.map((x, i) => h("button", { key: i, type: "button", title: x.title, style: { flexGrow: x.w, background: x.c }, onClick: () => goto(x.id) }))),
      h("div", { className: "clx-pv-chips" }, CATS.filter((k) => present[k]).map((k) => h("button", {
        key: k, type: "button", className: `clx-chipbtn${hide[k] ? "" : " on"}`, "aria-pressed": !hide[k], onClick: () => setHide({ ...hide, [k]: !hide[k] }),
      }, h("i", { className: "clx-dot", style: { background: CAT_COLOR[k] } }), ` ${t(`c.${k}`)} ${present[k]}`)))),
    diff ? h("div", { className: "clx-card" },
      h(CardHead, { t, icon: "flow", title: t("sd.story"), meta: fmt(t("flow.where"), { t: diff.cur.st.turn, s: diff.cur.st.step }) }),
      h(StepStory, { bd: data, st: diff.cur.st, t, onJump })) : null,
    h("div", { className: "clx-pv-list" }, rows),
    later > 0 ? h("div", { className: "clx-muted clx-pv-later" }, fmt(t("sd.later"), { n: later, k: fmtK(laterTok) })) : null)
}

/** Ask the session's model about this context. Off until enabled; each send is one explicit call. */
const AZ_ASKS = ['az.q1', 'az.q2', 'az.q3', 'az.q4']

function AnalyzeView({ data, t, sessionId, onJump, seqs, setSeqs }) {
  const key = `dsh-context-lens:az:${sessionId}`
  const [enabled, setEnabledState] = useState(() => { try { return sessionStorage.getItem(key) === "1" } catch { return false } })
  const setEnabled = (v) => { setEnabledState(v); try { sessionStorage.setItem(key, v ? "1" : "0") } catch {} }
  const [msgs, setMsgs] = useState<any[]>([])
  const [input, setInput] = useState("")
  const [inc, setInc] = useState({ system: false, tools: false })
  const [prev, setPrev] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const job = useRef<string | null>(null)
  const endRef = useRef<any>(null)
  const lang = /[一-鿿]/.test(t("nav.prompt")) ? "zh" : "en"
  const include = { ...inc, seqs }

  // the estimate costs nothing: it only measures what a send would carry
  useEffect(() => {
    let dead = false
    const id = setTimeout(() => {
      call("analyze-preview", { sessionId, include, question: input, history: msgs.filter((m) => !m.busy).map((m) => ({ role: m.role, text: m.text })) })
        .then((v) => { if (!dead) setPrev(v) }, () => { if (!dead) setPrev(null) })
    }, 350)
    return () => { dead = true; clearTimeout(id) }
  }, [sessionId, inc.system, inc.tools, seqs.join(","), msgs.length, input.length > 0])
  useEffect(() => () => { if (job.current) call("analyze-stop", { jobId: job.current }).catch(() => {}) }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }) }, [msgs])

  const patch = (id, v) => setMsgs((xs) => xs.map((m) => (m.id === id ? { ...m, ...v } : m)))
  const send = async (q?: string) => {
    const question = (q ?? input).trim()
    if (!question || busy) return
    const history = msgs.filter((m) => !m.busy && !m.error).map((m) => ({ role: m.role, text: m.text }))
    const uid = `u${Date.now()}`
    const aid = `a${Date.now()}`
    setMsgs((xs) => [...xs, { id: uid, role: "user", text: question }, { id: aid, role: "assistant", text: "", busy: true }])
    setInput("")
    setBusy(true)
    try {
      const { jobId, inputTokens } = await call("analyze-start", { sessionId, question, history, include, lang })
      job.current = jobId
      patch(aid, { inputTokens })
      for (;;) {
        await new Promise((r) => setTimeout(r, 450))
        if (job.current !== jobId) break
        const v = await call("analyze-poll", { jobId })
        patch(aid, { text: v.text, reasoning: v.reasoning, usage: v.usage, error: v.error, busy: !v.done })
        if (v.done) break
      }
    } catch (e) {
      patch(aid, { error: String(e?.message || e), busy: false })
    } finally {
      job.current = null
      setBusy(false)
    }
  }
  const stop = () => { if (job.current) call("analyze-stop", { jobId: job.current }).catch(() => {}) }

  if (!enabled) {
    return h("div", { className: "clx-card clx-az-intro" },
      h(CardHead, { t, icon: "gauge", title: t("az.title"), meta: prev?.model ? `${prev.model}` : null }),
      h("ul", null,
        h("li", null, t("az.i1")), h("li", null, t("az.i2")), h("li", null, t("az.i3")),
        prev?.tokens ? h("li", null, fmt(t("az.i4"), { k: fmtK(prev.tokens), m: prev.model || "" })) : null),
      prev && !prev.ready ? h("div", { className: "clx-err", style: { fontSize: 12 } }, t("az.noLlm")) : null,
      h("button", { className: "clx-chipbtn clx-az-go", disabled: !!prev && !prev.ready, onClick: () => setEnabled(true) }, t("az.enable")))
  }
  const tokens = prev?.tokens || 0
  const refs = (text) => [...new Set([...String(text || "").matchAll(/#(\d{1,6})/g)].map((m) => Number(m[1])))].filter((n) => (data.nodes || []).some((x) => x.seq === n)).slice(0, 8)
  return h("div", { className: "clx-az" },
    h("div", { className: "clx-card clx-az-bar" },
      h("span", { className: "clx-pill" }, t("az.on")),
      prev?.model ? h("span", { className: "clx-muted" }, prev.model) : null,
      h("span", { className: "clx-muted" }, t("az.attach")),
      h("button", { className: `clx-chipbtn${inc.system ? " on" : ""}`, "aria-pressed": inc.system, onClick: () => setInc({ ...inc, system: !inc.system }) }, t("az.sys")),
      h("button", { className: `clx-chipbtn${inc.tools ? " on" : ""}`, "aria-pressed": inc.tools, onClick: () => setInc({ ...inc, tools: !inc.tools }) }, t("az.toolDesc")),
      seqs.map((q) => h("button", { key: q, className: "clx-chipbtn on", title: t("az.detach"), onClick: () => setSeqs(seqs.filter((x) => x !== q)) }, `#${q} ×`)),
      h("span", { className: "clx-az-tok clx-muted" }, tokens ? fmt(t("az.cost"), { k: fmtK(tokens) }) : ""),
      msgs.length ? h("button", { className: "clx-chipbtn", disabled: busy, onClick: () => setMsgs([]) }, t("az.clear")) : null,
      h("button", { className: "clx-chipbtn", disabled: busy, onClick: () => { setEnabled(false); setMsgs([]) } }, t("az.off"))),
    msgs.length === 0 ? h("div", { className: "clx-card" },
      h("div", { className: "clx-muted", style: { fontSize: 12, marginBottom: 8 } }, t("az.hint")),
      h("div", { className: "clx-az-asks" }, AZ_ASKS.map((k) => h("button", { key: k, className: "clx-chipbtn", disabled: busy, onClick: () => send(t(k)) }, t(k))))) : null,
    msgs.map((m) => m.role === "user"
      ? h("div", { key: m.id, className: "clx-az-user" }, m.text)
      : h("div", { key: m.id, className: "clx-card clx-az-ans" },
        m.reasoning ? h("details", { className: "clx-az-think", open: m.busy && !m.text }, h("summary", null, t("az.thinking")), h("div", null, m.reasoning)) : null,
        m.text ? h(RichText, { text: m.text, hint: "md", t, bare: true }) : m.busy ? h("div", { className: "clx-muted" }, t("az.working")) : null,
        m.error ? h("div", { className: "clx-err" }, fmt(t("failed"), { msg: m.error })) : null,
        !m.busy && refs(m.text).length ? h("div", { className: "clx-az-refs" }, h("span", { className: "clx-muted" }, t("az.refs")), refs(m.text).map((n) => h("button", { key: n, className: "clx-chipbtn", onClick: () => onJump(n) }, `#${n}`))) : null,
        m.usage ? h("div", { className: "clx-muted clx-az-use" }, fmt(t("az.usage"), { i: fmtK((m.usage.inputTokens || 0) + (m.usage.cacheReadTokens || 0)), o: fmtK(m.usage.outputTokens || 0) })) : null)),
    h("div", { ref: endRef }),
    h("div", { className: "clx-card clx-az-input" },
      h("textarea", {
        value: input, rows: 2, placeholder: t("az.placeholder"), onChange: (e) => setInput(e.target.value),
        onKeyDown: (e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } },
      }),
      busy ? h("button", { className: "clx-chipbtn", onClick: stop }, t("az.stop"))
        : h("button", { className: "clx-chipbtn on", disabled: !input.trim(), onClick: () => send() }, t("az.send"))))
}

/** Plain-language findings: what is making the context heavy, and what to do about it. */
function diagnose(data, s, series, t) {
  const out = []
  const used = s.used || 0
  if (!used) return out
  const comp = s.comp
  const tok = (k) => s.byCat[k]?.tokens || 0
  // runway to the compaction trigger, from the recent growth
  if (comp?.auto && comp.thresholdTokens && series.length >= 3) {
    const recent = series.slice(-6)
    const g = (recent[recent.length - 1].comp.total - recent[0].comp.total) / (recent.length - 1)
    const left = comp.thresholdTokens - used
    if (g > 50 && left > 0) {
      const n = Math.ceil(left / g)
      if (n <= 50) out.push({ id: "runway", level: n <= 5 ? "warn" : "info", text: fmt(t("dg.runway"), { g: fmtK(g), n, r: fmtK(left) }), nav: "overview" })
    } else if (left <= 0) out.push({ id: "runway", level: "warn", text: t("dg.over"), nav: "overview" })
  }
  // what is there before any work happens
  const fixed = tok("system") + tok("systemTools") + tok("mcpTools") + tok("skills") + tok("memory")
  if (fixed / used >= 0.25) {
    out.push({ id: "fixed", level: fixed / used >= 0.4 ? "warn" : "info", text: fmt(t("dg.fixed"), { k: fmtK(fixed), p: pct(fixed, used, 0), tk: fmtK(tok("systemTools") + tok("mcpTools")), sk: fmtK(tok("skills") + tok("memory")) }), nav: "tools" })
  }
  // tool results dominate
  const res = tok("toolResults")
  if (res / used >= 0.45) {
    const top = [...(data.toolStats || [])].sort((a, b) => b.resultTokens - a.resultTokens)[0]
    out.push({ id: "results", level: "warn", text: fmt(t("dg.results"), { p: pct(res, used, 0), name: top?.name || "—", k: fmtK(top?.resultTokens || 0) }), nav: "tools" })
  }
  // one message that is a big share
  const big = [...(data.nodes || [])].sort((a, b) => b.tokensCal - a.tokensCal)[0]
  if (big && big.tokensCal >= 2000 && big.tokensCal / used >= 0.1) {
    out.push({ id: "big", level: big.tokensCal / used >= 0.2 ? "warn" : "info", text: fmt(t("dg.big"), { seq: big.seq, p: pct(big.tokensCal, used, 0), k: fmtK(big.tokensCal), what: (big.tool ? big.tool + " " : "") + (big.preview || "").slice(0, 60) }), seq: big.seq })
  }
  // the same call made again and again
  const seen = new Map()
  for (const x of data.invocations || []) {
    const key = x.name + " " + (x.args || "")
    seen.set(key, (seen.get(key) || 0) + 1)
  }
  const rep = [...seen.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1])[0]
  if (rep) out.push({ id: "repeat", level: "warn", text: fmt(t("dg.repeat"), { n: rep[1], what: rep[0].slice(0, 70) }), nav: "tools" })
  // tool definitions nobody called
  const called = new Set((data.toolStats || []).map((x) => x.name))
  const idle = (data.tools || []).filter((x) => !called.has(x.name))
  const idleTok = idle.reduce((a, x) => a + (x.tokensCal || 0), 0)
  if (idle.length >= 3 && idleTok >= 1500) out.push({ id: "idle", level: "info", text: fmt(t("dg.idle"), { n: idle.length, k: fmtK(idleTok) }), nav: "tools" })
  // failing calls
  const errs = (data.invocations || []).filter((x) => x.isError)
  if (errs.length) out.push({ id: "errors", level: "warn", text: fmt(t("dg.errors"), { n: errs.length, names: [...new Set(errs.map((x) => x.name))].slice(0, 3).join(", ") }), nav: "tools" })
  // cache
  const u = data.measured?.lastRequest
  if (u) {
    const inTot = (u.inputTokens || 0) + (u.cacheReadTokens || 0) + (u.cacheWriteTokens || 0)
    if (inTot >= 4000 && (u.cacheReadTokens || 0) / inTot < 0.5) out.push({ id: "cache", level: "info", text: fmt(t("dg.cache"), { p: pct(u.cacheReadTokens || 0, inTot, 0) }), nav: "overview" })
  }
  return out
}

function DiagnosisCard({ data, s, series, t, onJump, onNav }) {
  const items = useMemo(() => diagnose(data, s, series, t), [data, s, series, t])
  return h("div", { className: "clx-card clx-diag span2" },
    h(CardHead, { t, icon: "gauge", title: t("dg.title"), meta: items.length ? fmt(t("dg.count"), { n: items.length }) : null }),
    items.length
      ? items.map((x) => h("div", { key: x.id, className: `clx-diag-row ${x.level}`, role: x.seq !== undefined || x.nav !== "overview" ? "button" : undefined,
        onClick: () => (x.seq !== undefined ? onJump(x.seq) : x.nav !== "overview" ? onNav(x.nav) : undefined) },
        h("i", { className: "clx-dot" }), h("span", { className: "tx" }, x.text),
        x.seq !== undefined || x.nav !== "overview" ? h("span", { className: "go" }, `${t("dg.view")} ›`) : null))
      : h("div", { className: "clx-muted clx-tempty" }, t("dg.ok")))
}

function Overview({ data, flow, t, onJump, onShowCat, onNav, sessionId, liveKey, series, diff, onSel }) {
  const [pick, setPick] = useState(null)
  const [hov, setHov] = useState(null)
  const s = summarize(data)
  const m = data.measured || {}
  const usage = m.lastRequest
  const cats = CATS.map((k) => ({ key: k, label: t(`c.${k}`), color: CAT_COLOR[k], ...(s.byCat[k] || { tokens: 0, raw: 0, count: 0 }) }))
  const comp = s.comp
  const inputTotal = usage ? (usage.inputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.cacheWriteTokens || 0) : 0
  const warn = comp && comp.thresholdTokens ? (s.used >= comp.thresholdTokens ? 2 : s.used >= comp.thresholdTokens * 0.85 ? 1 : 0) : 0
  const usedAnim = useCountUp(s.used)
  const turnCount = (flow?.turns || []).length || new Set((data.nodes || []).map((n) => n.turn).filter((x) => x !== undefined)).size
  const stepCount = flow ? (flow.steps || []).length + (flow.stepsTruncated || 0) : null
  const calls = (data.invocations || []).length
  const errs = (data.invocations || []).filter((x) => x.isError).length
  const g = flow?.goal
  const sView = diff && !diff.last
    ? { ...s, used: diff.cur.comp.total, byCat: Object.fromEntries(CATS.map((k) => [k, { tokens: diff.cur.comp.by[k] || 0, count: 0 }])) }
    : s
  return h('div', { className: 'clx-dash' },
    h('div', { className: 'clx-card clx-hero-card span2' },
      h(CardHead, { t, icon: 'stats', title: t('ov.statsTitle'), meta: [data.model, data.reasoningEffort].filter(Boolean).join(' · ') }),
      h(LiveLine, { flow, t }),
      h('div', { className: 'clx-hero' },
        h(Ring, { ratio: s.win ? usedAnim / s.win : 0, size: 58, stroke: 7, warn }),
        h('div', { className: 'clx-hero-main' },
          h('div', null,
            h('span', { className: 'clx-hero-pct' }, fmtK(usedAnim)),
            h('span', { className: 'clx-sub' }, ` / ${fmtK(s.win)} · ${pct(usedAnim, s.win)}`)),
          h('div', { className: 'clx-muted', style: { fontSize: 11.5 } }, t(`pop.src.${m.usedSource || 'estimate'}`))),
        h('div', { className: 'clx-stats' },
          h(Stat, { k: t('ov.stat.turns'), v: fmtInt(turnCount) }),
          h(Stat, { k: t('ov.stat.steps'), v: stepCount === null ? '—' : fmtInt(stepCount) }),
          h(Stat, { k: t('ov.stat.calls'), v: fmtInt(calls), sub: errs ? ` ⚠${errs}` : undefined, tone: errs ? 'warn' : '' }),
          usage ? h(Stat, { k: t('ov.stat.hit'), v: pct(usage.cacheReadTokens || 0, inputTotal, 0) }) : null,
          comp && comp.auto && comp.thresholdTokens
            ? h(Stat, { k: t('ov.stat.left'), v: comp.remainingTokens > 0 ? fmtK(comp.remainingTokens) : t('pop.over'), tone: warn ? 'warn' : '' })
            : null)),
      h(HeroBar, { cats, s, t, active: hov || pick, pick, onHover: setHov, onPick: (k) => setPick(pick === k ? null : k) }),
      g ? h('div', { className: 'clx-goalline' },
        h('b', null, t('flow.goal')),
        h('span', { className: 'clx-pill' }, `${t(`flow.phase.${g.phase}`) || g.phase} · ${g.roundsStarted ?? 0}/${g.maxGoalRounds ?? '∞'}`),
        h('span', { className: 'txt' }, g.objective)) : null),
    h(DiagnosisCard, { data, s, series, t, onJump, onNav }),
    h(CompositionCard, { data, s: sView, t, onShowCat, stepLabel: diff && !diff.last ? fmt(t('flow.where'), { t: diff.cur.st.turn, s: diff.cur.st.step }) : null }),
    h(StepTrend, { data, flow, t, onJump, series, pickIdx: diff ? diff.idx : 0, onSel }),
    h(ToolsPeek, { data, t, onNav }),
    h(MessagesPeek, { data, t, onJump, onNav }),
    h(SourcesPeek, { sessionId, liveKey, bd: data, t, onNav }),
    comp ? h(CompactionCard, { data, comp, s, t }) : null,
    h('div', { className: 'span2' }, h(MeasureCard, { data, s, t })),
    h('section', { className: 'clx-card span2 clx-flowsec' },
      h(CardHead, { t, icon: 'flow', title: t('nav.flow'), meta: flow?.live ? t(`flow.live.${flow.live.phase || 'idle'}`) : null }),
      h(FlowTab, { sessionId, liveKey, bd: data, t, onJump })))
}

function kv(k, v, title = undefined) {
  return h('div', { key: k, title: title || (typeof v === 'string' ? v : undefined) }, h('div', { className: 'k' }, k), h('div', { className: 'v' }, v ?? '—'))
}

/** "read×2, bash" from a list of tool names. */
function groupNames(names) {
  const m = new Map()
  for (const x of names) m.set(x, (m.get(x) || 0) + 1)
  return [...m].map(([k, v]) => (v > 1 ? `${k}×${v}` : k)).join(', ')
}

/** The one expand affordance used everywhere: a chevron that turns down when open. */
function Chevron({ open, size = 12 }) {
  return h('span', { className: `clx-chev${open ? ' open' : ''}`, 'aria-hidden': true },
    h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: 'M9 6l6 6-6 6' })))
}

// ================================================================== rich content
// dsh's own renderers (the ones 轨迹 uses), with a plain fallback.
let UI = null
try {
  UI = require('@deepseek-ai/dsh-client-ui-primitives')
} catch {
  UI = null
}

function parseJson(text) {
  const s = String(text || '').trim()
  if (!/^[[{]/.test(s) || s.length > 400000) return undefined
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? v : undefined
  } catch {
    return undefined
  }
}

function mdLabels(t) {
  return { code: { copyLabel: t('ui.copy'), copiedLabel: t('ui.copied') }, footnotes: t('ui.footnotes') }
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
  }
}

/** Pick how a text looks best: a JSON tree, Markdown, or plain monospace output. */
function guessMode(text, hint) {
  if (parseJson(text) !== undefined) return 'json'
  if (hint === 'code') {
    const s = String(text || '')
    const md = /<skill_content|^#{1,6} \S|^```|^\s*[-*] \S[\s\S]*\n\s*[-*] \S|\*\*[^*\n]+\*\*/m.test(s)
    return md ? 'md' : 'code'
  }
  return 'md'
}

class RenderBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function PlainText({ text, mono }) {
  return h('pre', { className: `clx-plain${mono ? ' mono' : ''}` }, text)
}

/**
 * One block of model-visible text, rendered like the conversation renders it,
 * with a 渲染 / 原文 switch and a fold for long content.
 */
function RichText({ text, hint, t, label, meta, metaTitle, defaultOpen, bare, lang: langHint, action }) {
  const auto = useMemo(() => guessMode(text, hint), [text, hint])
  const [mode, setMode] = useState(auto)
  const [full, setFull] = useState(!!defaultOpen)
  useEffect(() => setMode(auto), [auto])
  const long = String(text || '').length > 2400
  const json = mode === 'json' ? parseJson(text) : undefined
  const plain = h(PlainText, { text, mono: true })
  let body
  if (mode === 'raw') body = plain
  else if (mode === 'json' && json !== undefined && UI?.JsonTree) {
    body = h(RenderBoundary, { fallback: plain }, h(UI.JsonTree, { data: json, labels: jsonLabels(t), collapsedStringLines: 12 }))
  } else if (mode === 'json' && json !== undefined) {
    body = h(PlainText, { text: JSON.stringify(json, null, 2), mono: true })
  } else if (mode === 'md' && UI?.MarkdownText) {
    body = h(RenderBoundary, { fallback: plain }, h('div', { className: 'clx-md' }, h(UI.MarkdownText, { text: String(text || ''), labels: mdLabels(t) })))
  } else if (mode === 'code' && UI?.CodeBlock) {
    const lang = langHint || (/^\s*[[{]/.test(String(text || '')) ? 'json' : 'text')
    body = h(RenderBoundary, { fallback: plain }, h('div', { className: 'clx-code' }, h(UI.CodeBlock, { code: String(text || ''), lang, copyLabel: t('ui.copy'), copiedLabel: t('ui.copied') })))
  } else {
    body = plain
  }
  // dsh keeps the head and tail of oversized tool output and spills the rest to a file
  const spill = /(\/\S*dsh-spill\S*?)\.?\s+Use read/.exec(String(text || ''))?.[1]
  const modes = [auto, 'raw'].filter((m, i, a) => a.indexOf(m) === i)
  return h('div', { className: `clx-rich${bare ? ' bare' : ''}` },
    h('div', { className: 'clx-rich-head' },
      label ? h('b', null, label) : null,
      meta ? h('span', { className: 'clx-muted', title: metaTitle }, meta) : null,
      h('span', { className: 'clx-rich-modes' }, modes.length > 1 ? modes.map((m) => h('button', {
        key: m, className: 'clx-seg', 'aria-pressed': mode === m, onClick: (e) => { e.stopPropagation(); setMode(m) },
      }, t(`ui.mode.${m}`))) : null),
      action || null),
    spill ? h('div', { className: 'clx-rich-note' }, fmt(t('ui.spilled'), { path: spill })) : null,
    h('div', { className: `clx-rich-body${long && !full ? ' folded' : ''}${mode === 'code' ? ' flush' : ''}` }, body),
    long ? h('button', { className: 'clx-rich-more', onClick: (e) => { e.stopPropagation(); setFull(!full) } }, full ? t('ui.collapseAll') : t('ui.expandAll')) : null)
}

function NodeDetail({ sessionId, seq, t, ctx, cwd }) {
  const [state, setState] = useState<any>({ loading: true })
  useEffect(() => {
    let dead = false
    call('node', { sessionId, seq }).then(
      (v) => { if (!dead) setState({ value: v }) },
      (e) => { if (!dead) setState({ error: String(e?.message || e) }) },
    )
    return () => { dead = true }
  }, [sessionId, seq])
  if (state.loading) return h('div', { className: 'clx-detail clx-muted' }, t('loading'))
  if (state.error) return h('div', { className: 'clx-detail clx-err' }, fmt(t('failed'), { msg: state.error }))
  const v = state.value
  const isTool = v.type === 'tool/result' || v.role === 'tool'
  // the row above already shows kind, tool and time; label parts only when there are several
  const many = v.parts.length > 1
  const when = v.time ? new Date(v.time).toLocaleString() : ''
  const meta = (p) => `${fmtInt(p.chars)} ${t('ui.chars')} · ≈${fmtK(p.tokensEst)} tok${p.truncated ? ` · ${t('msg.truncated')}` : ''}`
  // a tool result opens with the call that asked for it
  if (isTool) {
    const resultText = v.parts.map((p) => p.text || '').join('\n')
    const callFile = v.call ? toolFilePath(v.call.name, v.call.text, resultText, cwd) : null
    // the call was compacted out, but a file/image read still carries <path>
    const orphan = !v.call ? absPath(/<path>\s*([^<]+?)\s*<\/path>/.exec(resultText)?.[1], cwd) : null
    return h('div', { className: 'clx-detail', onClick: (e) => e.stopPropagation() },
      h('div', { className: 'clx-pair' },
        v.call
          ? h(RichText, { t, bare: true, text: v.call.text, hint: 'code', label: `${t('pair.call')} · ${v.call.name || '?'} · #${v.call.seq}`, meta: meta(v.call), metaTitle: v.call.time ? new Date(v.call.time).toLocaleString() : '', action: h(FilePreview, { ctx, sessionId, cwd, t, file: callFile }) })
          : h('div', { className: 'clx-pair-note' }, t('pair.noCall')),
        v.parts.map((p, i) => h(RichText, {
          key: `${seq}-${i}`, t, bare: true, text: p.text || '', hint: 'code',
          label: `${t('pair.result')} · #${seq}`, meta: meta(p), metaTitle: [when, v.toolCallId].filter(Boolean).join(' · '),
          action: i === 0 && orphan ? h(FilePreview, { ctx, sessionId, cwd, t, file: orphan }) : null,
        }))))
  }
  return h('div', { className: 'clx-detail', onClick: (e) => e.stopPropagation() },
    v.parts.map((p, i) => {
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
      })
      // a call carries its result right under it
      if (p.type !== 'tool-call') return text
      return h('div', { key: `${seq}-${i}`, className: 'clx-pair' },
        text,
        p.resultSeq !== undefined
          ? h(PairedResult, { sessionId, seq: p.resultSeq, t })
          : h('div', { className: 'clx-pair-note' }, t('pair.pending')))
    }))
}

/** The result half of a call, fetched when the call is shown. */
function PairedResult({ sessionId, seq, t }) {
  const [st, setSt] = useState<any>({ loading: true })
  useEffect(() => {
    let dead = false
    call('node', { sessionId, seq }).then((v) => { if (!dead) setSt({ v }) }, (e) => { if (!dead) setSt({ error: String(e?.message || e) }) })
    return () => { dead = true }
  }, [sessionId, seq])
  if (st.loading) return h('div', { className: 'clx-pair-note' }, t('loading'))
  if (st.error) return h('div', { className: 'clx-pair-note clx-err' }, fmt(t('failed'), { msg: st.error }))
  const v = st.v
  return h(React.Fragment, null, v.parts.map((p, i) => h(RichText, {
    key: i, t, bare: true, text: p.text || '', hint: 'code',
    label: `${t('pair.result')} · #${seq}`,
    meta: `${fmtInt(p.chars)} ${t('ui.chars')} · ≈${fmtK(p.tokensEst)} tok${p.truncated ? ` · ${t('msg.truncated')}` : ''}`,
    metaTitle: v.time ? new Date(v.time).toLocaleString() : '',
  })))
}

/** One tool call as a row: what was asked, what came back, what both cost. */
function InvocationRow({ x, t, max, open, onClick }) {
  const callTok = x.callTokens || 0
  const resTok = x.resultTokens || 0
  return h('div', {
    className: `clx-node-row clx-inv-row${open ? ' open' : ''}`, onClick, role: 'button', tabIndex: 0, 'aria-expanded': !!open,
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } },
    title: `${t('pair.call')} ${fmtInt(callTok)} + ${t('pair.result')} ${fmtInt(resTok)} tok`,
  },
    h(Chevron, { open }),
    h('span', { className: 'seq' }, x.callSeq !== undefined ? `#${x.callSeq}` : '—'),
    h('div', { className: 'main' },
      h('div', { className: 'line1' },
        h('span', { className: 'clx-tag' }, h('i', { className: 'clx-dot', style: { background: CAT_COLOR.toolCalls } }), x.name),
        x.resultSeq !== undefined ? h('span', null, `→ #${x.resultSeq}`) : null,
        x.isError ? h('span', { className: 'clx-err' }, t('pair.error')) : null,
        x.time ? h('span', { style: { marginLeft: 'auto' } }, fmtTime(x.time)) : null),
      h('div', { className: 'prev' }, x.args || h('span', { className: 'clx-muted' }, '—')),
      h('div', { className: `prev res${x.isError ? ' err' : ''}` }, h('i', { className: 'clx-dot', style: { background: CAT_COLOR.toolResults } }),
        x.resultSeq !== undefined ? (x.resultPreview || '—') : t('pair.pending')),
      h('div', { className: 'clx-minibar two' },
        h('span', { style: { width: `${Math.max(callTok ? 1 : 0, callTok / max * 100)}%`, background: CAT_COLOR.toolCalls } }),
        h('span', { style: { width: `${Math.max(resTok ? 1 : 0, resTok / max * 100)}%`, background: CAT_COLOR.toolResults } }))),
    h('span', { className: 'tok' }, fmtK(callTok + resTok)))
}

/** Both halves of one call, opened in place: the arguments, then the result. */
function InvocationDetail({ sessionId, x, t, ctx, cwd }) {
  const [st, setSt] = useState<any>({ loading: true })
  useEffect(() => {
    let dead = false
    if (x.callSeq === undefined) { setSt({ v: null }); return undefined }
    call('node', { sessionId, seq: x.callSeq }).then((v) => { if (!dead) setSt({ v }) }, (e) => { if (!dead) setSt({ error: String(e?.message || e) }) })
    return () => { dead = true }
  }, [sessionId, x.callSeq])
  if (st.loading) return h('div', { className: 'clx-detail clx-muted' }, t('loading'))
  if (st.error) return h('div', { className: 'clx-detail clx-err' }, fmt(t('failed'), { msg: st.error }))
  const part = st.v?.parts.find((p) => p.type === 'tool-call' && p.callId !== undefined && p.callId === x.id)
    ?? st.v?.parts.find((p) => p.type === 'tool-call' && p.name === x.name)
  return h('div', { className: 'clx-detail', onClick: (e) => e.stopPropagation() },
    h('div', { className: 'clx-pair' },
      part
        ? h(RichText, { t, bare: true, text: part.text || '', hint: 'code', label: `${t('pair.call')} · ${x.name} · #${x.callSeq}`, meta: `${fmtInt(part.chars)} ${t('ui.chars')} · ≈${fmtK(part.tokensEst)} tok`, metaTitle: x.id, action: h(FilePreview, { ctx, sessionId, cwd, t, file: toolFilePath(x.name, part.text, null, cwd) }) })
        : h('div', { className: 'clx-pair-note' }, t('pair.noCall')),
      x.resultSeq !== undefined ? h(PairedResult, { sessionId, seq: x.resultSeq, t }) : h('div', { className: 'clx-pair-note' }, t('pair.pending'))))
}

/** Every call of one tool, oldest first, each with its result. */
function ToolInvocations({ data, name, sessionId, t, ctx, cwd }) {
  const [openKey, setOpenKey] = useState(null)
  const [limit, setLimit] = useState(20)
  const list = useMemo(() => (data.invocations || []).filter((x) => x.name === name), [data.invocations, name])
  const max = Math.max(1, ...list.map((x) => (x.callTokens || 0) + (x.resultTokens || 0)))
  const from = Math.max(0, list.length - limit)
  return h('div', { className: 'clx-expand' },
    h('div', { className: 'clx-muted', style: { fontSize: 12, marginBottom: 4 } }, fmt(t('tools.invocations'), { n: list.length })),
    from > 0 ? h('button', { className: 'clx-chipbtn', style: { marginBottom: 6 }, onClick: () => setLimit(limit + 30) }, fmt(t('tools.earlier'), { n: Math.min(30, from) })) : null,
    list.slice(from).map((x) => {
      const key = x.id ?? `${x.callSeq}-${x.resultSeq}`
      const open = openKey === key
      return h('div', { key, className: `clx-node${open ? ' open' : ''}`, style: { '--cat': CAT_COLOR.toolResults } },
        h(InvocationRow, { x, t, max, open, onClick: () => setOpenKey(open ? null : key) }),
        open ? h(InvocationDetail, { sessionId, x, t, ctx, cwd }) : null)
    }))
}

/** A message on one line: what kind it is, what it says, what it costs. A call carries its results. */
function MsgRow({ n, t, open, onClick, invs, merged }) {
  // a message that made calls reads as the call, whatever else it says
  const kind = invs && invs.length ? 'toolCalls' : n.category
  const color = CAT_COLOR[kind] || CAT_COLOR.other
  let text: any = n.preview || ''
  let extra = null
  let tok = n.tokensCal
  if (invs && invs.length) {
    const first = invs[0]
    text = h(React.Fragment, null,
      h('b', { className: 'clx-mrow-tool' }, first.name),
      ` ${first.args || ''}`,
      invs.length > 1 ? h('span', { className: 'clx-muted' }, `  +${groupNames(invs.slice(1).map((x) => x.name))}`) : null)
    if (merged) {
      const res = invs.reduce((s, x) => s + (x.resultTokens || 0), 0)
      const errs = invs.filter((x) => x.isError).length
      const pending = invs.some((x) => x.resultSeq === undefined)
      tok += res
      extra = h('span', { className: `clx-mrow-res${errs ? ' err' : ''}`, title: `${t('pair.call')} ${fmtInt(n.tokensCal)} + ${t('pair.result')} ${fmtInt(res)}` },
        h('i', { className: 'clx-dot', style: { background: CAT_COLOR.toolResults } }),
        errs ? `⚠ ${t('pair.error')}` : pending ? t('pair.pending') : fmtK(res))
    }
  } else if (n.category === 'toolResults' && n.tool) {
    text = h(React.Fragment, null, h('b', { className: 'clx-mrow-tool' }, n.tool), ` ${n.preview || ''}`)
  }
  return h('div', {
    className: `clx-mrow${open ? ' open' : ''}`, onClick, role: 'button', tabIndex: 0, 'aria-expanded': !!open,
    title: `#${n.seq}${n.time ? ` · ${new Date(n.time).toLocaleString()}` : ''}`,
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } },
  },
    h(Chevron, { open, size: 10 }),
    h('span', { className: 'clx-mrow-kind', style: { '--cat': color } }, t(`k.${kind}`)),
    h('span', { className: 'clx-mrow-text' }, text || h('span', { className: 'clx-muted' }, '—')),
    extra,
    h('span', { className: 'clx-mrow-tok' }, fmtK(tok)))
}


function Messages({ data, flow, t, focus, sessionId, preset, ctx, cwd, diff, stepOnly }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('order')
  const [cat, setCat] = useState('')
  const [limit, setLimit] = useState(300)
  const [openSeq, setOpenSeq] = useState(focus ?? null)
  const [openTurns, setOpenTurns] = useState<Record<string, boolean>>({})
  const fromJump = useRef(false)
  useEffect(() => { if (focus !== undefined && focus !== null) { fromJump.current = true; setOpenSeq(focus) } }, [focus])
  useEffect(() => {
    if (!preset) return
    setCat(preset.cat)
    setSort('size')
    setQuery('')
  }, [preset])
  const nodes = data.nodes || []
  const present = useMemo(() => {
    const m = {}
    for (const n of nodes) m[n.category] = (m[n.category] || 0) + n.tokensCal
    return m
  }, [nodes])
  // calls by the node that made them, so a call row can carry its results
  const invsBySeq = useMemo(() => {
    const m = new Map()
    for (const x of data.invocations || []) {
      if (x.callSeq === undefined) continue
      if (!m.has(x.callSeq)) m.set(x.callSeq, [])
      m.get(x.callSeq).push(x)
    }
    return m
  }, [data.invocations])
  const stepMode = !!diff && !diff.last
  const inStep = (n) => !!diff && n.seq >= diff.prevCut && n.seq < diff.cut
  const stepFilter = !!stepOnly && !!diff
  const filtering = !!query.trim() || !!cat || stepFilter
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const inCat = (n) => n.category === cat || (n.split && (n.split[cat] || 0) > 0)
    let out = nodes.filter((n) => (!cat || inCat(n)) && (!stepFilter || inStep(n))
      && (!q || (n.preview || '').toLowerCase().includes(q) || (n.tool || '').toLowerCase().includes(q)
        || (n.tools || []).some((x) => x.toLowerCase().includes(q)) || String(n.seq) === q))
    if (sort === 'size') out = [...out].sort((a, b) => b.tokensCal - a.tokensCal)
    return out
  }, [nodes, query, sort, cat, stepFilter, diff?.prevCut, diff?.cut])
  // in order, a result whose call is listed folds into the call's row
  const shownSet = useMemo(() => new Set(list.map((n) => n.seq)), [list])
  const rows = useMemo(() => (sort === 'order'
    ? list.filter((n) => !(n.category === 'toolResults' && n.callSeq !== undefined && shownSet.has(n.callSeq) && invsBySeq.has(n.callSeq)))
    : list), [list, sort, shownSet, invsBySeq])
  const total = list.reduce((s, n) => s + n.tokensCal, 0)

  // turn → step grouping (order only)
  const stepsByTurn = useMemo(() => {
    const m = new Map()
    for (const st of flow?.steps || []) {
      if (!m.has(st.turn)) m.set(st.turn, [])
      m.get(st.turn).push(st)
    }
    return m
  }, [flow])
  const turnInfo = useMemo(() => new Map((flow?.turns || []).map((x) => [x.turn, x])), [flow])
  const stepOf = (n) => {
    const ss = stepsByTurn.get(n.turn)
    if (!ss) return null
    let hit = null
    for (const st of ss) if (st.startSeq <= n.seq) hit = st
    return hit
  }
  const lastTurn = useMemo(() => {
    let x
    for (const n of nodes) if (n.turn !== undefined) x = n.turn
    return x
  }, [nodes])
  const focusTurn = useMemo(() => {
    const n = openSeq !== null ? nodes.find((y) => y.seq === openSeq) : null
    if (!n) return undefined
    if (n.category === 'toolResults' && n.callSeq !== undefined) return nodes.find((y) => y.seq === n.callSeq)?.turn ?? n.turn
    return n.turn
  }, [openSeq, nodes])
  const keyOf = (turn) => (turn === undefined ? 'pre' : String(turn))
  const isOpen = (k) => openTurns[k] ?? (filtering || k === keyOf(lastTurn) || k === keyOf(focusTurn))
  const from = sort === 'order' ? Math.max(0, rows.length - limit) : 0
  const visible = sort === 'order' ? rows.slice(from) : rows.slice(0, limit)

  // a jump opens its row, and a result jump lands on the call that carries it
  useEffect(() => {
    if (openSeq === null || openSeq === undefined) return
    const n = nodes.find((y) => y.seq === openSeq)
    if (n && sort === 'order' && n.category === 'toolResults' && n.callSeq !== undefined && invsBySeq.has(n.callSeq) && shownSet.has(n.callSeq)) {
      setOpenSeq(n.callSeq)
      return
    }
    const idx = rows.findIndex((y) => y.seq === openSeq)
    if (sort === 'order' && idx >= 0 && idx < rows.length - limit) setLimit(rows.length - idx + 20)
    else if (sort !== 'order' && idx >= limit) setLimit(idx + 50)
    if (!fromJump.current) return
    fromJump.current = false
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`clx-node-${openSeq}`)?.scrollIntoView({ block: 'center' })))
  }, [openSeq])

  const rowEl = (n, i) => {
    const open = openSeq === n.seq
    const invs = invsBySeq.get(n.seq)
    return h('div', { key: n.seq, id: `clx-node-${n.seq}`, className: `clx-mnode${open ? ' open' : ''}${diff && inStep(n) && !stepFilter ? ' instep' : ''}${stepMode && diff && n.seq >= diff.cut ? ' later' : ''}`, style: { '--cat': CAT_COLOR[invs ? 'toolCalls' : n.category] || CAT_COLOR.other } },
      h(MsgRow, { n, t, open, invs, merged: sort === 'order', onClick: () => setOpenSeq(open ? null : n.seq) }),
      open ? h('div', { className: 'clx-mopen' },
        h(NodeDetail, { sessionId, seq: n.seq, t, ctx, cwd }),
        h('button', { className: 'clx-mopen-close', onClick: () => { setOpenSeq(null); requestAnimationFrame(() => { const el = document.getElementById(`clx-node-${n.seq}`); if (el && el.getBoundingClientRect().top < 60) el.scrollIntoView({ block: 'center' }) }) } }, t('msg.collapse'))) : null)
  }

  let body
  if (sort !== 'order') {
    body = h('div', { className: 'clx-mlist' }, visible.map(rowEl))
  } else {
    // consecutive runs of one turn, then of one step inside it
    const groups = []
    for (const n of visible) {
      const k = keyOf(n.turn)
      let g = groups[groups.length - 1]
      if (!g || g.key !== k) groups.push(g = { key: k, turn: n.turn, items: [], tok: 0 })
      g.items.push(n)
      g.tok += n.tokensCal + (invsBySeq.get(n.seq) || []).reduce((s, x) => s + (x.resultTokens || 0), 0)
    }
    body = h('div', { className: 'clx-mlist' }, groups.map((g, gi) => {
      const opened = isOpen(g.key)
      const tu: any = g.turn !== undefined ? turnInfo.get(g.turn) || {} : {}
      const ss = g.turn !== undefined ? stepsByTurn.get(g.turn) || [] : []
      const children = []
      if (opened) {
        let curStep
        for (const n of g.items) {
          const st = stepOf(n)
          if (st && st !== curStep) {
            curStep = st
            children.push(h('div', { key: `s${st.startSeq}`, className: 'clx-mstep' },
              h('span', { className: 'n' }, fmt(t('msg.step'), { n: st.step })),
              st.tools.length ? h('span', { className: 'tools' }, groupNames(st.tools)) : h('span', { className: 'tools clx-muted' }, st.stages.includes('assistant') ? t('flow.textOnly') : ''),
              st.errors ? h('span', { className: 'clx-err' }, `⚠${st.errors}`) : null,
              st.promptTokens ? h('span', { className: 'ctx', title: t('st.ctx') }, fmtK(st.promptTokens)) : null))
          }
          children.push(rowEl(n, 0))
        }
      }
      return h('section', { key: `${g.key}-${gi}`, className: `clx-mturn${opened ? ' open' : ''}` },
        h('div', {
          className: 'clx-mturn-head', role: 'button', tabIndex: 0, 'aria-expanded': opened,
          onClick: () => setOpenTurns({ ...openTurns, [g.key]: !opened }),
          onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenTurns({ ...openTurns, [g.key]: !opened }) } },
        },
          h(Chevron, { open: opened }),
          h('b', null, g.turn === undefined ? t('msg.pre') : fmt(t('msg.turn'), { n: g.turn })),
          h('span', { className: 'clx-mturn-prompt' }, tu.prompt || ''),
          h('span', { className: 'clx-mturn-meta' },
            [ss.length ? fmt(t('msg.stepsN'), { n: ss.length }) : fmt(t('msg.itemsN'), { n: g.items.length }), tu.start && tu.end ? fmtDur(tu.end - tu.start) : null].filter(Boolean).join(' · ')),
          h('span', { className: 'clx-mturn-tok' }, fmtK(g.tok))),
        opened ? h('div', { className: 'clx-mturn-body' }, children) : null)
    }))
  }

  const allTok = nodes.reduce((a, n) => a + n.tokensCal, 0)
  const biggest = nodes.reduce((a, n) => (!a || n.tokensCal > a.tokensCal ? n : a), null)
  const turnsN = (flow?.turns || []).length || new Set(nodes.map((n) => n.turn).filter((x) => x !== undefined)).size
  return h(React.Fragment, null,
    h('div', { className: 'clx-tiles clx-tsum' },
      h(Stat, { k: t('msg.sum.nodes'), v: fmtInt(nodes.length) }),
      h(Stat, { k: t('msg.sum.tok'), v: fmtK(allTok) }),
      h(Stat, { k: t('msg.sum.turns'), v: fmtInt(turnsN) }),
      h(Stat, { k: t('msg.sum.steps'), v: flow ? fmtInt((flow.steps || []).length) : '—' }),
      h(Stat, { k: t('msg.sum.calls'), v: fmtInt((data.invocations || []).length) }),
      biggest ? h('div', { className: 'clx-stat clx-stat-link', role: 'button', tabIndex: 0, onClick: () => { fromJump.current = true; setOpenSeq(biggest.seq) }, title: biggest.preview },
        h('div', { className: 'k' }, t('msg.sum.max')),
        h('div', { className: 'v' }, fmtK(biggest.tokensCal), h('small', null, ` #${biggest.seq}`))) : null),
  h('div', { className: 'clx-msgs' },
    h('div', { className: 'clx-mmain' },
    h('div', { className: 'clx-msgbar' },
      h('div', { className: 'clx-msgsearch' },
        h('svg', { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': true }, h('circle', { cx: 11, cy: 11, r: 6.5 }), h('path', { d: 'M16 16l4 4' })),
        h('input', { value: query, placeholder: t('msg.search'), onChange: (e) => setQuery(e.target.value) }),
        query ? h('button', { className: 'clx-msgclear', 'aria-label': '×', onClick: () => setQuery('') }, '×') : null),
      h('span', { className: 'clx-segmini' },
        h('button', { className: 'clx-chipbtn', 'aria-pressed': sort === 'order', onClick: () => setSort('order') }, t('msg.sort.order')),
        h('button', { className: 'clx-chipbtn', 'aria-pressed': sort === 'size', onClick: () => setSort('size') }, t('msg.sort.size'))),
      h('label', { className: 'clx-msgcat', style: { '--cat': cat ? CAT_COLOR[cat] : 'transparent' } },
        h('i', { className: 'clx-dot' }),
        h('select', { value: cat, onChange: (e) => setCat(e.target.value) },
          h('option', { value: '' }, t('msg.allCats')),
          CATS.filter((k) => present[k]).map((k) => h('option', { key: k, value: k }, `${t(`c.${k}`)} · ${fmtK(present[k])}`)))),
      h('span', { className: 'clx-msgcount' },
        fmt(t('msg.count'), { n: list.length, t: fmtK(total) }),
        data.nodesTruncated ? ` · ${fmt(t('msg.trunc'), { n: data.nodesTruncated })}` : '')),
    sort === 'order' && from > 0 ? h('button', { className: 'clx-chipbtn clx-mmore', onClick: () => setLimit(limit + 300) }, fmt(t('msg.earlier'), { n: Math.min(300, from) })) : null,
    rows.length ? body : h('div', { className: 'clx-muted', style: { fontSize: 12, padding: '12px 2px' } }, t('msg.none')),
    sort !== 'order' && rows.length > limit ? h('button', { className: 'clx-chipbtn clx-mmore', onClick: () => setLimit(limit + 300) },
      fmt(t('msg.more'), { n: Math.min(300, rows.length - limit) })) : null)))
}

/** A tool's full definition, fetched when its row is opened. */
function ToolDetail({ sessionId, name, t }) {
  const [st, setSt] = useState<any>({ loading: true })
  useEffect(() => {
    let dead = false
    setSt({ loading: true })
    call('tool', { sessionId, name }).then(
      (v) => { if (!dead) setSt({ data: v }) },
      (e) => { if (!dead) setSt({ error: String(e?.message || e) }) },
    )
    return () => { dead = true }
  }, [sessionId, name])
  if (st.loading) return h('div', { className: 'clx-expand clx-muted' }, t('loading'))
  if (st.error) return h('div', { className: 'clx-expand clx-err' }, fmt(t('failed'), { msg: st.error }))
  const d = st.data
  return h('div', { className: 'clx-expand' },
    d.description ? h(RichText, { text: d.description, hint: 'md', t, label: t('tools.desc'), bare: true }) : null,
    h('div', { className: 'clx-params' },
      h('div', { className: 'clx-params-head' }, d.params.length ? fmt(t('tools.paramsN'), { n: d.params.length }) : t('tools.noParams')),
      d.params.map((p) => h('div', { key: p.name, className: 'clx-param' },
        h('div', { className: 'clx-param-head' },
          h('code', null, p.name),
          p.type ? h('span', { className: 'clx-badge' }, p.type) : null,
          p.required ? h('span', { className: 'clx-badge warn' }, t('tools.required')) : h('span', { className: 'clx-muted', style: { fontSize: 11 } }, t('tools.optional'))),
        p.description ? h('div', { className: 'clx-param-desc' }, p.description) : null,
        p.enum ? h('div', { className: 'clx-param-enum' }, p.enum.map((e) => h('code', { key: e }, e))) : null))),
    d.schema ? h(Disclosure, { head: h('span', { className: 'clx-sub', style: { fontSize: 12 } }, 'JSON Schema') }, h(RichText, { text: d.schema, hint: 'code', t, bare: true })) : null)
}

// ------------------------------------------------------------ command runs
const PROG_COLORS = ['#E8833A', '#E9A23B', '#2BAE9F', '#3BA7D9', '#3FB37F', '#E2558F', '#6573E0', '#9B6BD6', '#C46F3B', '#5B9E4A']
function progColor(name) {
  let x = 0
  for (const ch of String(name)) x = (x * 31 + ch.charCodeAt(0)) >>> 0
  return PROG_COLORS[x % PROG_COLORS.length]
}
function fmtMs(ms) {
  if (!(ms >= 0)) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1).replace(/\.?0+$/, '')}s`
  const s = Math.round(ms / 1000)
  if (s < 3600) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(s / 3600)}h${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`
}

/** A command line with its programs and shell operators picked out (no full parser: just enough to scan). */
function CmdText({ text, programs }) {
  const progs = new Set(programs || [])
  const tokens = String(text || '').replace(/\s+/g, ' ').match(/"(?:[^"\\]|\\.)*"?|'[^']*'?|\d*>>?&?\d*\S*|&&|\|\||[|;&]|[^\s|;&"'>]+|\s+/g) || []
  let expectProgram = true
  return h('span', { className: 'clx-cmdtext' }, tokens.map((tok, i) => {
    if (/^\s+$/.test(tok)) return tok
    if (/^(&&|\|\||[|;&])$/.test(tok)) { expectProgram = true; return h('span', { key: i, className: 'op' }, tok) }
    if (/^\d*>/.test(tok)) return h('span', { key: i, className: 'redir' }, tok)
    if (/^["']/.test(tok)) { expectProgram = false; return h('span', { key: i, className: 'str' }, tok) }
    const base = tok.split('/').pop()
    if (expectProgram && !/^[A-Za-z_]\w*=/.test(tok)) {
      expectProgram = false
      if (progs.has(base) || base === 'cd') return h('span', { key: i, className: 'prog' }, tok)
    }
    if (/^-/.test(tok)) return h('span', { key: i, className: 'flag' }, tok)
    return tok
  }))
}

/** `cd <dir> [2>/dev/null] && rest` → { dir, rest }: the directory is shown as a chip so the command itself is visible. */
function splitCd(command) {
  const m = /^\s*cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))(?:\s+2>\s*\/dev\/null)?\s*(?:&&|;)\s*([\s\S]+)$/.exec(String(command || ''))
  return m ? { dir: m[1] ?? m[2] ?? m[3], rest: m[4] } : { dir: undefined, rest: String(command || '') }
}
function DirChip({ dir }) {
  if (!dir) return null
  const parts = dir.replace(/\/+$/, '').split('/')
  const last = parts.pop() || '/'
  // a scope like @deepseek-ai alone says little, keep its parent too
  const name = /^@/.test(last) && parts.length ? `${parts.pop()}/${last}` : last
  return h('span', { className: 'clx-cmd-dir', title: `cd ${dir}` }, h('svg', { viewBox: '0 0 16 16', width: 11, height: 11, 'aria-hidden': true }, h('path', { d: 'M1.5 4.5a1 1 0 0 1 1-1h3.6l1.5 1.6h5.9a1 1 0 0 1 1 1v6.4a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1z', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 })), h('span', null, name))
}

function CmdStatus({ c, t }) {
  if (c.status === 'running') return h('span', { className: 'clx-cmd-st run', title: t('cmd.running') })
  if (c.status === 'failed') return h('span', { className: 'clx-cmd-st bad', title: c.exitCode !== undefined ? fmt(t('cmd.exit'), { n: c.exitCode }) : t('cmd.failed') }, '✕')
  return h('span', { className: 'clx-cmd-st ok', title: c.exitCode !== undefined ? fmt(t('cmd.exit'), { n: c.exitCode }) : '' }, '✓')
}

function CmdRow({ c, t, open, onClick }) {
  const where = [c.turn !== undefined ? `T${c.turn}` : '', c.step !== undefined ? `S${c.step}` : ''].filter(Boolean).join(' ')
  return h('div', {
    className: 'clx-cmd-row', role: 'button', tabIndex: 0, 'aria-expanded': !!open, onClick,
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } },
    title: c.description || c.command,
  },
    h(Chevron, { open }),
    h(CmdStatus, { c, t }),
    h('span', { className: 'cmd' }, (() => { const x = splitCd(c.command); return h(React.Fragment, null, h(DirChip, { dir: x.dir }), h(CmdText, { text: x.rest, programs: c.programs })) })()),
    h('span', { className: 'tags' },
      c.status === 'failed' && c.exitCode !== undefined && c.exitCode !== 0 ? h('span', { className: 'clx-cmd-badge bad' }, fmt(t('cmd.exit'), { n: c.exitCode })) : null,
      c.background ? h('span', { className: 'clx-cmd-badge bg', title: t('cmd.bgTip') }, t('cmd.bg')) : null,
      c.inline ? h('span', { className: 'clx-cmd-badge', title: t('cmd.inlineTip') }, t('cmd.inline')) : null),
    h('span', { className: `dur${c.slow ? ' slow' : ''}` }, c.status === 'running' ? t('cmd.running') : fmtMs(c.durationMs)),
    h('span', { className: 'when' }, [where, fmtTime(c.time)].filter(Boolean).join(' · ')))
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
  ].filter(Boolean)
  return h('div', { className: 'clx-detail clx-cmd-detail', onClick: (e) => e.stopPropagation() },
    c.description ? h('div', { className: 'clx-cmd-desc' }, c.description) : null,
    h('div', { className: 'clx-cmd-meta' }, meta.map(([k, v, cls]) => h('span', { key: k }, h('i', null, k), h('b', { className: cls || '' }, v)))),
    h('div', { className: 'clx-pair' },
      h(RichText, { t, bare: true, text: c.command, hint: 'code', lang: 'bash', label: `${t('pair.call')} · ${t('cmd.command')}${c.callSeq !== undefined ? ` · #${c.callSeq}` : ''}`, metaTitle: c.id }),
      c.resultSeq !== undefined ? h(PairedResult, { sessionId, seq: c.resultSeq, t }) : h('div', { className: 'clx-pair-note' }, c.status === 'running' ? t('cmd.stillRunning') : t('pair.pending'))))
}

function Commands({ data, t, sessionId }) {
  const cmds = data.commands || []
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  const [prog, setProg] = useState(null)
  const [progQuery, setProgQuery] = useState('')
  const [sort, setSort] = useState('latest')
  const [openId, setOpenId] = useState(null)
  const [limit, setLimit] = useState(60)
  const counts = useMemo(() => ({
    all: cmds.length,
    failed: cmds.filter((c) => c.status === 'failed').length,
    slow: cmds.filter((c) => c.slow).length,
    bg: cmds.filter((c) => c.background).length,
  }), [cmds])
  const total = cmds.reduce((s, c) => s + (c.durationMs || 0), 0)
  const programs = useMemo(() => {
    const m = new Map()
    for (const c of cmds) {
      for (const p of c.programs || []) { const x = m.get(p) || { name: p, times: 0, runs: 0, failed: 0 }; x.times++; m.set(p, x) }
      for (const p of new Set(c.programs || [])) m.get(p).runs++
      // a command line's exit code is its last command's, so a failure is charged to that program
      const last = (c.programs || [])[(c.programs || []).length - 1]
      if (c.status === 'failed' && last) m.get(last).failed++
    }
    return [...m.values()].sort((a, b) => b.times - a.times || a.name.localeCompare(b.name))
  }, [cmds])
  const slowest = useMemo(() => cmds.reduce((a, c) => (c.durationMs !== undefined && (!a || c.durationMs > a.durationMs) ? c : a), null), [cmds])
  const mostFailed = programs.filter((p) => p.failed).sort((a, b) => b.failed - a.failed)[0]
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out = cmds.filter((c) => (status === 'all' || (status === 'failed' && c.status === 'failed') || (status === 'slow' && c.slow) || (status === 'bg' && c.background))
      && (!prog || (c.programs || []).includes(prog))
      && (!q || c.command.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q)))
    return sort === 'slowest'
      ? out.sort((a, b) => (b.durationMs ?? -1) - (a.durationMs ?? -1))
      : out.sort((a, b) => (b.time || 0) - (a.time || 0))
  }, [cmds, status, prog, query, sort])
  if (!cmds.length) return h('div', { className: 'clx-card' }, h('div', { className: 'clx-card-head' }, h('h4', null, t('cmd.title'))), h('div', { className: 'clx-muted' }, t('cmd.none')))
  const maxTimes = Math.max(1, ...programs.map((p) => p.times))
  const pq = progQuery.trim().toLowerCase()
  const reveal = (c) => { setStatus('all'); setProg(null); setQuery(''); setOpenId(c.id) }
  const filtered = status !== 'all' || prog || query
  const STATUS = [['all', ''], ['failed', 'bad'], ['slow', 'slow'], ['bg', 'bg']]
  return h('div', { className: 'clx-card clx-cmdcard' },
    h('div', { className: 'clx-card-head' },
      h('h4', null, h('span', { className: 'clx-cmd-icon' }, '>_'), t('cmd.title')),
      h('span', { className: 'clx-cmd-status' }, STATUS.map(([k, cls]) => h('button', {
        key: k, className: `clx-cmd-sbtn ${cls}`, 'aria-pressed': status === k, onClick: () => setStatus(status === k && k !== 'all' ? 'all' : k),
        title: k === 'slow' ? fmt(t('cmd.slowTip'), { s: Math.round((data.slowMs || 10000) / 1000) }) : k === 'bg' ? t('cmd.bgTip') : undefined,
      }, t(`cmd.${k}`), h('b', null, counts[k]))))),
    h('div', { className: 'clx-cmd' },
      h('div', { className: 'clx-cmd-side' },
        h('div', { className: 'clx-cmd-h' }, t('cmd.summary')),
        h('div', { className: 'clx-cmd-tiles' },
          h('div', { className: 'clx-cmd-tile' }, h('b', null, fmtInt(counts.all)), h('span', null, t('cmd.runs'))),
          h('div', { className: 'clx-cmd-tile' }, h('b', { className: 'accent' }, fmtMs(total)), h('span', null, t('cmd.totalTime'))),
          h('div', { className: 'clx-cmd-tile', role: 'button', tabIndex: 0, onClick: () => setStatus('failed') }, h('b', { className: counts.failed ? 'bad' : '' }, counts.failed), h('span', null, fmt(t('cmd.failRate'), { p: pct(counts.failed, counts.all) }))),
          h('div', { className: 'clx-cmd-tile', role: 'button', tabIndex: 0, onClick: () => setStatus('bg') }, h('b', { className: counts.bg ? 'bgc' : '' }, counts.bg), h('span', null, t('cmd.bg')))),
        h('div', { className: 'clx-cmd-h' }, t('cmd.notable')),
        slowest && slowest.slow || mostFailed ? h('div', { className: 'clx-cmd-notes' },
          slowest && slowest.slow ? h('div', { className: 'clx-cmd-note', role: 'button', tabIndex: 0, onClick: () => reveal(slowest), title: slowest.command },
            h('i', { className: 'clx-dot', style: { background: '#E9A23B' } }), h('span', { className: 'k' }, t('cmd.slowest')),
            h('code', null, splitCd(slowest.command).rest), h('b', { className: 'slow' }, fmtMs(slowest.durationMs))) : null,
          mostFailed ? h('div', { className: 'clx-cmd-note', role: 'button', tabIndex: 0, onClick: () => { setStatus('failed'); setProg(mostFailed.name) } },
            h('i', { className: 'clx-dot', style: { background: 'var(--dsw-alias-state-error-primary)' } }), h('span', { className: 'k' }, t('cmd.mostFailed')),
            h('code', null, mostFailed.name), h('b', { className: 'bad' }, `×${mostFailed.failed}`)) : null)
          : h('div', { className: 'clx-muted', style: { fontSize: 12, padding: '2px 2px 4px' } }, t('cmd.noneNotable')),
        h('div', { className: 'clx-cmd-h' }, h('span', null, fmt(t('cmd.programs'), { n: programs.length })),
          programs.length > 8 ? h('input', { className: 'clx-cmd-pq', value: progQuery, placeholder: t('cmd.filterPrograms'), onChange: (e) => setProgQuery(e.target.value) }) : null),
        h('div', { className: 'clx-cmd-progs' }, programs.filter((p) => !pq || p.name.toLowerCase().includes(pq)).map((p) => h('div', {
          key: p.name, className: `clx-cmd-prog${prog === p.name ? ' on' : ''}`, role: 'button', tabIndex: 0, 'aria-pressed': prog === p.name,
          onClick: () => setProg(prog === p.name ? null : p.name), style: { '--pc': progColor(p.name) },
        },
          h('i', { className: 'clx-dot' }), h('code', null, p.name),
          p.failed ? h('span', { className: 'clx-cmd-badge bad' }, `✕${p.failed}`) : null,
          h('span', { className: 'n' }, fmt(t('cmd.times'), { n: p.times }), h('em', null, ` · ${fmt(t('cmd.records'), { n: p.runs })}`)),
          h('span', { className: 'bar' }, h('span', { style: { width: `${p.times / maxTimes * 100}%` } })))))),
      h('div', { className: 'clx-cmd-main' },
        h('div', { className: 'clx-msgtools' },
          h('input', { value: query, placeholder: t('cmd.filter'), onChange: (e) => setQuery(e.target.value) }),
          h('button', { className: 'clx-chipbtn', 'aria-pressed': sort === 'latest', onClick: () => setSort('latest') }, t('cmd.sort.latest')),
          h('button', { className: 'clx-chipbtn', 'aria-pressed': sort === 'slowest', onClick: () => setSort('slowest') }, t('cmd.sort.slowest'))),
        filtered ? h('div', { className: 'clx-muted clx-cmd-filt' }, `${list.length} / ${cmds.length}`,
          prog ? h('span', { className: 'clx-chip', style: { '--pc': progColor(prog), cursor: 'default' } }, h('i', { className: 'clx-dot', style: { background: progColor(prog) } }), prog) : null,
          h('button', { className: 'clx-linkbtn', onClick: () => { setStatus('all'); setProg(null); setQuery('') } }, t('cmd.clear'))) : null,
        list.length ? list.slice(0, limit).map((c, i) => {
          const open = openId === c.id
          const cat = c.status === 'failed' ? 'var(--dsw-alias-state-error-primary)' : c.status === 'running' || c.background ? '#3BA7D9' : '#3FB37F'
          return h('div', { key: c.id, className: `clx-node clx-cmd-item${open ? ' open' : ''}${c.status === 'failed' ? ' failed' : ''}`, style: { '--cat': cat, '--i': Math.min(i, 24) } },
            h(CmdRow, { c, t, open, onClick: () => setOpenId(open ? null : c.id) }),
            open ? h(CmdDetail, { c, t, sessionId }) : null)
        }) : h('div', { className: 'clx-muted', style: { padding: '12px 4px' } }, t('cmd.empty')),
        list.length > limit ? h('button', { className: 'clx-chipbtn', style: { marginTop: 8 }, onClick: () => setLimit(limit + 100) }, fmt(t('cmd.more'), { n: Math.min(100, list.length - limit) })) : null)))
}

/** One tool on one line: name, what it costs, how often it ran. */
function ToolLine({ name, color, kind, bar, count, errs, tok, sel, onClick, title, hot = false }) {
  return h('div', {
    className: `clx-tl${sel ? ' sel' : ''}${hot ? ' hot' : ''}`, role: 'button', tabIndex: 0, 'aria-pressed': !!sel, onClick, title,
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } },
  },
    h('i', { className: 'clx-dot', style: { background: color } }),
    h('code', { className: 'nm' }, name),
    h('span', { className: 'kd' }, kind || ''),
    h('span', { className: 'bar' }, bar),
    count !== undefined ? h('span', { className: 'ct' }, count) : null,
    errs ? h('span', { className: 'er' }, `⚠${errs}`) : h('span', { className: 'er' }),
    h('span', { className: 'tk' }, tok))
}

/** A tool opened: its calls this session (each with its result), then its definition. */
function ToolPanel({ data, name, t, sessionId, ctx, cwd }) {
  const def = (data.tools || []).find((x) => x.name === name)
  const st = (data.toolStats || []).find((x) => x.name === name)
  const errs = (data.invocations || []).filter((x) => x.name === name && x.isError).length
  return h(React.Fragment, null,
    h('div', { className: 'clx-mside-head' },
      h('code', { className: 'clx-mrow-tool', style: { fontSize: 13 } }, name),
      def ? h('span', { className: 'clx-pill' }, def.kind === 'mcp' ? `MCP · ${def.server}` : t('tools.system')) : null,
      st ? h('span', { className: 'clx-muted' }, `${fmt(t('tools.callsN'), { n: st.calls })}${errs ? ` · ⚠${errs}` : ''}`) : null,
      h('span', { className: 'clx-mside-tok' }, [def ? `${t('tools.defTok')} ${fmtK(def.tokensCal)}` : null, st ? `${t('tools.useTok')} ${fmtK(st.callTokens + st.resultTokens)}` : null].filter(Boolean).join(' · '))),
    h('div', { className: 'clx-mside-body' },
      st && st.calls ? h(ToolInvocations, { data, name, sessionId, t, ctx, cwd }) : null,
      def ? h('div', { className: 'clx-tp-def' },
        h('div', { className: 'clx-tp-h' }, t('tools.definition')),
        h(ToolDetail, { sessionId, name, t })) : h('div', { className: 'clx-muted', style: { fontSize: 12 } }, t('tools.noDef'))))
}

function Tools({ data, t, sessionId, ctx, cwd, diff }) {
  const hotTools = useMemo(() => new Set(diff && !diff.last ? diff.cur.st.tools : diff ? diff.cur.st.tools : []), [diff])
  const [rootRef, rootW] = useWidth(800)
  const wide = rootW >= 760
  const [sel, setSel] = useState(null)
  const [q, setQ] = useState('')
  const [allDefs, setAllDefs] = useState(false)
  const tools = data.tools || []
  const stats = useMemo(() => [...(data.toolStats || [])].sort((a, b) => (b.callTokens + b.resultTokens) - (a.callTokens + a.resultTokens)), [data.toolStats])
  const errsBy = useMemo(() => {
    const m = {}
    for (const x of data.invocations || []) if (x.isError) m[x.name] = (m[x.name] || 0) + 1
    return m
  }, [data.invocations])
  const defBy = useMemo(() => new Map<string, any>(tools.map((x) => [x.name, x])), [tools])
  const query = q.trim().toLowerCase()
  const match = (x) => !query || x.name.toLowerCase().includes(query) || (x.description || '').toLowerCase().includes(query)
  const used = stats.filter((x) => match({ name: x.name, description: defBy.get(x.name)?.description }))
  const defs = [...tools].sort((a, b) => b.tokensCal - a.tokensCal).filter(match)
  const defsShown = allDefs || query ? defs : defs.slice(0, 10)
  const useMax = Math.max(1, ...stats.map((x) => x.callTokens + x.resultTokens))
  const defMax = Math.max(1, ...tools.map((x) => x.tokensCal))
  const callsTotal = stats.reduce((s, x) => s + x.calls, 0)
  const resTotal = stats.reduce((s, x) => s + x.resultTokens, 0)
  const errTotal = Object.values<any>(errsBy).reduce((a, b) => a + b, 0)
  const mcp = tools.filter((x) => x.kind === 'mcp').length
  const cmds = data.commands || []
  // on a wide pane the most used tool is open from the start
  const current = sel ?? (wide && stats[0] ? stats[0].name : null)
  const pick = (name) => setSel(current === name && !wide ? null : name)
  const panel = (name) => h(ToolPanel, { key: name, data, name, t, sessionId, ctx, cwd })
  const inline = (name) => (!wide && current === name ? h('div', { className: 'clx-tl-inline' }, panel(name)) : null)

  const list = h('div', { className: 'clx-tlists' },
    h('div', { className: 'clx-msgsearch clx-tsearch' },
      h('svg', { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': true }, h('circle', { cx: 11, cy: 11, r: 6.5 }), h('path', { d: 'M16 16l4 4' })),
      h('input', { value: q, placeholder: t('tools.search'), onChange: (e) => setQ(e.target.value) }),
      q ? h('button', { className: 'clx-msgclear', onClick: () => setQ('') }, '×') : null),

    h('div', { className: 'clx-card clx-tcard' },
      h('div', { className: 'clx-card-head' },
        h('h4', null, t('tools.usage')),
        h('span', { className: 'clx-tlegend' },
          h('span', null, h('i', { style: { background: CAT_COLOR.toolCalls } }), t('pair.call')),
          h('span', null, h('i', { style: { background: CAT_COLOR.toolResults } }), t('pair.result')))),
      used.length ? used.map((x) => h(React.Fragment, { key: x.name },
        h(ToolLine, {
          name: x.name, color: CAT_COLOR.toolResults, sel: current === x.name, onClick: () => pick(x.name), hot: hotTools.has(x.name),
          title: `${t('pair.call')} ${fmtInt(x.callTokens)} + ${t('pair.result')} ${fmtInt(x.resultTokens)} · ${t('tools.col.max')} ${fmtInt(x.maxResult)}`,
          bar: h(React.Fragment, null,
            h('span', { style: { width: `${x.callTokens / useMax * 100}%`, background: CAT_COLOR.toolCalls } }),
            h('span', { style: { width: `${x.resultTokens / useMax * 100}%`, background: CAT_COLOR.toolResults } })),
          count: `×${x.calls}`, errs: errsBy[x.name], tok: fmtK(x.callTokens + x.resultTokens),
        }),
        inline(x.name))) : h('div', { className: 'clx-muted clx-tempty' }, query ? t('msg.none') : t('tools.noUse'))),

    h('div', { className: 'clx-card clx-tcard' },
      h('div', { className: 'clx-card-head' },
        h('h4', null, t('tools.defsShort')),
        h('span', { className: 'clx-muted' }, t('tools.defsNote'))),
      defsShown.map((x) => {
        const color = x.kind === 'mcp' ? CAT_COLOR.mcpTools : CAT_COLOR.systemTools
        return h(React.Fragment, { key: x.name },
          h(ToolLine, {
            name: x.name, color, kind: x.kind === 'mcp' ? `MCP · ${x.server}` : null, sel: current === x.name, onClick: () => pick(x.name), title: x.description,
            bar: h('span', { style: { width: `${x.tokensCal / defMax * 100}%`, background: color } }),
            count: fmt(t('tools.paramsShort'), { n: x.params }), tok: fmtK(x.tokensCal),
          }),
          inline(x.name))
      }),
      !query && defs.length > 10 ? h('button', { className: 'clx-chipbtn clx-tmore', onClick: () => setAllDefs(!allDefs) },
        allDefs ? t('ui.collapseAll') : fmt(t('tools.showAllDefs'), { n: defs.length })) : null,
      (data.deferred || []).length ? h('div', { className: 'clx-tdeferred' },
        h('span', { className: 'clx-muted' }, fmt(t('tools.deferredN'), { n: data.deferred.length })),
        data.deferred.map((x) => h('code', { key: x.name, title: x.description }, x.name))) : null))

  return h('div', { className: 'clx-tools', ref: rootRef },
    h('div', { className: 'clx-tiles clx-tsum' },
      h(Stat, { k: t('tools.sum.defs'), v: fmtInt(tools.length), sub: mcp ? ` MCP ${mcp}` : undefined }),
      h(Stat, { k: t('tools.sum.defTok'), v: fmtK(data.toolsTokens) }),
      h(Stat, { k: t('tools.sum.used'), v: fmtInt(stats.length) }),
      h(Stat, { k: t('tools.sum.calls'), v: fmtInt(callsTotal), sub: errTotal ? ` ⚠${errTotal}` : undefined, tone: errTotal ? 'warn' : '' }),
      h(Stat, { k: t('tools.sum.resTok'), v: fmtK(resTotal) }),
      h(Stat, { k: t('tools.sum.cmds'), v: fmtInt(cmds.length), sub: cmds.length ? ` ${fmtMs(cmds.reduce((s, c) => s + (c.durationMs || 0), 0))}` : undefined })),
    wide
      ? h('div', { className: 'clx-tsplit' }, list,
        h('aside', { className: 'clx-mside' }, current ? panel(current) : h('div', { className: 'clx-mside-empty' }, t('tools.pick'))))
      : list,
    h(Commands, { data, t, sessionId }))
}

function useSources(sessionId, liveKey) {
  const [state, setState] = useState({ data: null, error: null })
  useEffect(() => {
    let dead = false
    call('sources', { sessionId }).then(
      (v) => { if (!dead) setState({ data: v, error: null }) },
      (e) => { if (!dead) setState((s) => ({ data: s.data, error: String(e?.message || e) })) },
    )
    return () => { dead = true }
  }, [sessionId, liveKey])
  return state
}

function Disclosure({ head, children, open: initial, color }) {
  const [open, setOpen] = useState(!!initial)
  return h('div', { className: `clx-disc${open ? ' open' : ''}`, style: color ? { '--cat': color } : undefined },
    h('div', {
      className: 'clx-disc-head', role: 'button', tabIndex: 0, 'aria-expanded': open, onClick: () => setOpen(!open),
      onKeyDown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(!open) } },
    },
      h('span', { className: 'clx-disc-caret' }, h(Chevron, { open })), head),
    open ? h('div', { className: 'clx-disc-body' }, children) : null)
}


// ------------------------------------------------------------------ file preview
// File contents are not rendered here: a click opens the file in dsh's right
// Sidebar, whose document preview already renders Markdown, code, images, PDF
// and Office files (and shows its own state when it cannot). The address is
// built like dsh's own `fileAddressFor(sessionId, cwd, path)`, so a file opened
// here and the same file opened from a `@` reference are one tab.
function sidebarFileAddress(sessionId, cwd, absPath) {
  let normalized = String(absPath).replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
  const root = cwd ? String(cwd).replace(/\\/g, '/').replace(/\/+$/, '') : ''
  if (root && normalized === root) normalized = ''
  else if (root && normalized.startsWith(`${root}/`)) normalized = normalized.slice(root.length + 1)
  const encoded = normalized.split('/').map((s) => encodeURIComponent(s).replace(/%3A/gi, ':')).join('/')
  return `dsh-resource://file/session/${encodeURIComponent(sessionId)}/${encoded}`
}
/** Open one file in the right sidebar; a returned key names what went wrong. */
function openInSidebar(ctx, sessionId, cwd, absPath) {
  if (!ctx || !sessionId || !absPath) return 'openFailed'
  let nav
  let tabs
  try {
    nav = ctx.get('sidebarRight')
    tabs = ctx.get('sidebarRightTabs')
  } catch {
    return 'noSidebar'
  }
  if (!nav || !tabs) return 'noSidebar'
  const address = sidebarFileAddress(sessionId, cwd, absPath)
  try {
    if (!tabs.candidates(address).length) return 'noViewer'
    nav.openResource(address)
    return null
  } catch {
    return 'openFailed'
  }
}
/** `[failure line, open(path)]` for one card, so each surface reports its own failures. */
function useSidebarPreview(ctx, sessionId, cwd, t) {
  const [note, setNote] = useState(null)
  const open = (file) => setNote(openInSidebar(ctx, sessionId, cwd, file))
  return [note ? h('div', { className: 'clx-ft-note' }, t(`ft.${note}`)) : null, open]
}

// Tools whose call touches one file. The model-visible snapshot stays inline,
// but the real file can also be opened in dsh's right Sidebar, whose preview
// renders Markdown / code / images / PDF / Office properly (an image result is
// only metadata here, so the sidebar is the one way to actually see it).
const FILE_TOOL = /^(read|read_file|read_image|view|open|open_file|cat|edit|write|multi_edit|notebook_edit|notebook_read|file_read|load_file|str_replace_editor)$/i
/** A path made absolute against cwd (null when relative with no cwd). */
function absPath(p, cwd) {
  p = String(p || '').trim().replace(/^\.\//, '')
  if (!p) return null
  if (p.startsWith('/')) return p
  return cwd ? `${String(cwd).replace(/\/+$/, '')}/${p}` : null
}
/** The absolute path a file tool touched: the resolved <path>…</path> the result
 *  carries, else file_path / path from the call args; relative paths use cwd. */
function toolFilePath(name, argsText, resultText, cwd) {
  if (!FILE_TOOL.test(String(name || ''))) return null
  let p = /<path>\s*([^<]+?)\s*<\/path>/.exec(String(resultText || ''))?.[1] || ''
  if (!p) {
    const a = parseJson(argsText)
    if (a && typeof a === 'object') p = String(a.file_path ?? a.path ?? a.filePath ?? a.filename ?? a.notebook_path ?? '').trim()
    if (!p) {
      // a write/edit arg can be too big to JSON.parse; pull just the path token
      const m = /"(?:file_path|filePath|path|filename|notebook_path)"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(String(argsText || ''))
      if (m) { try { p = JSON.parse(`"${m[1]}"`) } catch { p = m[1] } }
    }
  }
  return absPath(p, cwd)
}
/** A 「↗ 预览」 button for a file a tool touched: opens dsh's right Sidebar and
 *  reports noSidebar / noViewer in place. The in-context snapshot is left as is. */
function FilePreview({ ctx, sessionId, cwd, file, t }) {
  const [note, setNote] = useState(null)
  if (!file) return null
  const open = () => setNote(openInSidebar(ctx, sessionId, cwd, file))
  return h('span', { className: 'clx-filepreview', onClick: (e) => e.stopPropagation() },
    h('button', { type: 'button', className: 'clx-filebtn', title: `${file}\n${t('ft.preview')}`, onClick: open },
      h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M6.5 2.5h-3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3' }),
        h('path', { d: 'M9.5 2.5h4v4M13.2 2.8 7.5 8.5' })),
      t('ft.previewShort')),
    note ? h('span', { className: 'clx-filepreview-note' }, t(`ft.${note}`)) : null)
}

function SkillBody({ sessionId, name, t }) {
  const [state, setState] = useState<any>({ loading: true })
  useEffect(() => {
    let dead = false
    call('skill', { sessionId, name }).then(
      (v) => { if (!dead) setState({ value: v }) },
      (e) => { if (!dead) setState({ error: String(e?.message || e) }) },
    )
    return () => { dead = true }
  }, [sessionId, name])
  if (state.loading) return h('div', { className: 'clx-muted' }, t('loading'))
  if (state.error) return h('div', { className: 'clx-err', style: { fontSize: 12 } }, fmt(t('failed'), { msg: state.error }))
  const v = state.value
  return h(RichText, { bare: true, text: v.content, hint: 'md', t, label: 'SKILL.md', meta: `${fmtInt(v.chars)} ${t('ui.chars')} · ≈${fmtK(v.tokensEst)} tok${v.truncated ? ` · ${t('msg.truncated')}` : ''}` })
}

const RT_NAME = {
  'working-directory:current': 'rt.cwd', 'sandbox:policy': 'rt.sandbox', 'approval:policy': 'rt.approval',
  'harness:source': 'rt.harness', 'app:web-surface': 'rt.web', 'time-context': 'rt.time',
}
/** What this agent reads and where, laid out by the rules of the plugins that read it. */
function AgentLayout({ src, t, onJump, ctx, sessionId }) {
  const L = src.layout
  const [noteLine, preview] = useSidebarPreview(ctx, sessionId, src.cwd, t)
  if (!L) return h('div', { className: 'clx-muted' }, t('lay.none'))
  const home = L.home || ''
  const tilde = (p) => (home && String(p).startsWith(home) ? `~${String(p).slice(home.length)}` : String(p))
  const row = (f, label = undefined) => {
    const st = f.loaded ? 'loaded' : f.exists ? 'exists' : 'missing'
    return h('div', { key: f.path, className: `clx-lay-row ${st}`, title: f.path },
      h('i', { className: 'st' }),
      h('span', { className: 'nm' }, label || f.name),
      h('span', { className: 'ss' }, f.loaded ? `${t('ft.loaded')}${f.tokens ? ` · ≈${fmtK(f.tokens)}` : ''}` : f.exists ? t('lay.notLoaded') : t('ft.missing')),
      h('span', { className: 'ac' },
        f.exists ? h('button', { className: 'clx-more', onClick: () => preview(f.path) }, t('ft.previewShort')) : null,
        f.loaded && f.seq !== undefined ? h('button', { className: 'clx-more', onClick: () => onJump(f.seq) }, `#${f.seq}`) : null))
  }
  const gl = L.global || []
  const loadedN = [...gl, ...(L.levels || []).flatMap((l) => l.files), ...(L.deeper || [])].filter((f) => f.loaded).length
  const SRC_LABEL = { 'project-dsh': 'lay.sk.projectDsh', 'project-agents': 'lay.sk.projectAgents', custom: 'lay.sk.custom', 'user-dsh': 'lay.sk.userDsh', 'user-agents': 'lay.sk.userAgents', bundled: 'lay.sk.bundled' }
  return h('div', { className: 'clx-lay' },
    noteLine,
    h('section', null,
      h('div', { className: 'clx-lay-h' }, h('b', null, t('nav.memory')), h('span', { className: 'clx-muted' }, fmt(t('lay.memSum'), { n: loadedN }))),
      h('div', { className: 'clx-lay-rule' }, t('lay.memRule')),
      h('div', { className: 'clx-lay-group' },
        h('div', { className: 'clx-lay-gh' }, t('lay.global'), h('span', { className: 'clx-muted' }, t('lay.globalNote'))),
        gl.map((g) => row(g, tilde(g.path)))),
      h('div', { className: 'clx-lay-group' },
        h('div', { className: 'clx-lay-gh' }, t('lay.project'), h('span', { className: 'clx-muted' }, L.root ? fmt(t('lay.rootBy'), { m: L.rootMarker }) : t('lay.noRoot'))),
        (L.levels || []).map((lv) => {
          const present = lv.files.filter((f) => f.exists || f.loaded)
          const absent = lv.files.filter((f) => !f.exists && !f.loaded)
          return h('div', { key: lv.dir, className: 'clx-lay-level' },
            h('div', { className: 'clx-lay-dir', title: lv.dir },
              h('span', { className: 'p' }, `${tilde(lv.dir)}/`),
              lv.isRoot ? h('span', { className: 'clx-pill' }, t('lay.root')) : null,
              lv.isCwd ? h('span', { className: 'clx-pill on' }, t('lay.cwd')) : null),
            present.map((f) => row(f)),
            absent.length ? h('div', { className: 'clx-lay-absent' }, `${t('lay.canPlace')} `, absent.map((f) => h('code', { key: f.name }, f.name))) : null)
        })),
      (L.deeper || []).length ? h('div', { className: 'clx-lay-group' },
        h('div', { className: 'clx-lay-gh' }, t('lay.deeper'), h('span', { className: 'clx-muted' }, t('lay.deeperNote'))),
        L.deeper.map((f) => row(f, `${f.rel ? `${f.rel}/` : ''}${f.name}`))) : null),
    h('section', null,
      h('div', { className: 'clx-lay-h' }, h('b', null, t('lay.skillRoots')), h('span', { className: 'clx-muted' }, t('lay.skillRule'))),
      (L.skillRoots || []).map((r, i) => h('div', { key: `${r.source}-${r.path}`, className: `clx-lay-row ${r.registered ? 'loaded' : r.exists ? 'exists' : 'missing'}`, title: r.path },
        h('span', { className: 'rk' }, i + 1),
        h('span', { className: 'nm' }, t(SRC_LABEL[r.source] || r.source), h('code', null, tilde(r.path))),
        h('span', { className: 'ss' }, !r.exists ? t('ft.missing') : r.registered ? fmt(t('lay.skillsN'), { n: r.registered }) : r.onDisk ? fmt(t('lay.onDisk'), { n: r.onDisk }) : t('lay.empty')),
        h('span', { className: 'ac' }))),
      (L.otherSkillSources || []).length ? h('div', { className: 'clx-lay-absent' }, `${t('lay.otherSources')} `, L.otherSkillSources.map((x) => h('code', { key: x.source }, `${x.source} ×${x.count}`))) : null))
}

/** Skills by name: registry, catalog entry and every load, most-loaded first. */
function skillRows(src) {
  const sk = src.skills || {}
  const by = new Map()
  const get = (name) => {
    if (!by.has(name)) by.set(name, { name, loads: [] })
    return by.get(name)
  }
  for (const s of sk.registry || []) Object.assign(get(s.name), { reg: s })
  for (const e of sk.catalog?.entries || []) Object.assign(get(e.name), { cat: e })
  for (const l of sk.loaded || []) get(l.name).loads.push(l)
  return [...by.values()].sort((a, b) => (b.loads.length - a.loads.length) || ((b.cat ? 1 : 0) - (a.cat ? 1 : 0)) || a.name.localeCompare(b.name))
}

/** Every node of the file structure, flattened. */
function treeNodes(st) {
  const out = []
  const walk = (n) => { out.push(n); for (const k of n.children || []) walk(k) }
  for (const r of st?.trees || []) walk(r)
  return out
}

function SrcLine({ color, name, badge, tok, sel, onClick, title, dim = false }) {
  return h('div', {
    className: `clx-tl clx-sl${sel ? ' sel' : ''}${dim ? ' dim' : ''}`, role: 'button', tabIndex: 0, 'aria-pressed': !!sel, onClick, title,
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } },
  },
    h('i', { className: 'clx-dot', style: { background: color } }),
    h('span', { className: 'nm' }, name),
    h('span', { className: 'bd' }, badge),
    h('span', { className: 'tk' }, tok))
}

function MemPanel({ f, t, onJump, preview, noteLine }) {
  return h(React.Fragment, null,
    h('div', { className: 'clx-mside-head' },
      h('b', { className: 'clx-sp-title' }, f.displayPath),
      h('span', { className: `clx-pill ${f.status === 'active' ? 'on' : 'off'}` }, t(`src.mem.${f.status}`)),
      f.updates ? h('span', { className: 'clx-muted' }, fmt(t('src.updates'), { n: f.updates })) : null,
      h('span', { className: 'clx-mside-tok' }, f.tokens ? `≈${fmtK(f.tokens)} tok` : '')),
    h('div', { className: 'clx-mside-body' },
      h('div', { className: 'clx-sp-meta' },
        f.path ? h('code', { title: f.path }, f.path) : null,
        f.path ? h('button', { className: 'clx-chipbtn', onClick: () => preview(f.path) }, `↗ ${t('ft.preview')}`) : null,
        f.lastSeq !== undefined ? h('button', { className: 'clx-chipbtn', onClick: () => onJump(f.lastSeq) }, `#${f.lastSeq} ${t('src.inMessages')}`) : null),
      noteLine,
      f.status === 'removed' ? h('div', { className: 'clx-muted' }, t('src.mem.removedHint'))
        : h(RichText, { text: f.content || '', hint: 'md', t, defaultOpen: true, bare: true })))
}

function SkillPanel({ r, sk, sessionId, t, onJump, nodeTok, cost }) {
  const desc = r.reg?.description ?? r.cat?.description ?? ''
  return h(React.Fragment, null,
    h('div', { className: 'clx-mside-head' },
      h('b', { className: 'clx-sp-title' }, r.name),
      r.loads.length ? h('span', { className: 'clx-pill on' }, fmt(t('src.loadedN'), { n: r.loads.length })) : null,
      h('span', { className: 'clx-pill' }, r.cat ? t('src.inCatalog') : r.reg && !r.reg.modelInvocable ? t('src.userOnly') : t('src.notInCatalog')),
      h('span', { className: 'clx-mside-tok', title: t('src.catCostHint') }, cost ? `${fmtK(cost)} tok` : '')),
    h('div', { className: 'clx-mside-body' },
      desc ? h('div', { className: 'clx-sp-desc' }, desc) : null,
      h('div', { className: 'clx-sp-kv' },
        h('span', null, h('i', null, t('src.k.provider')), r.reg?.provider || '—'),
        h('span', null, h('i', null, t('src.k.source')), r.reg?.source || '—'),
        h('span', null, h('i', null, t('src.k.invocation')), r.reg ? [r.reg.modelInvocable ? t('src.inv.model') : null, r.reg.userInvocable ? t('src.inv.user') : null].filter(Boolean).join(' · ') || '—' : '—')),
      h('div', { className: 'clx-sp-meta' }, h('code', null, r.reg?.path || r.loads[0]?.base || '—')),
      r.reg?.whenToUse ? h('div', { className: 'clx-sp-desc' }, h('span', { className: 'clx-muted' }, `${t('src.k.whenToUse')}: `), r.reg.whenToUse) : null,
      r.loads.length ? h('div', { className: 'clx-sp-loads' },
        h('div', { className: 'clx-tp-h' }, t('src.loads')),
        r.loads.map((l) => h('div', { key: l.seq, className: 'clx-tl clx-sl', role: 'button', tabIndex: 0, onClick: () => onJump(l.seq) },
          h('i', { className: 'clx-dot', style: { background: CAT_COLOR.skills } }),
          h('span', { className: 'nm' }, `#${l.seq} · ${fmtTime(l.time)}`),
          h('span', { className: 'bd' }, `${t(`src.via.${l.via}`)}${l.isError ? ' · ⚠' : ''}`),
          h('span', { className: 'tk' }, fmtK(nodeTok[l.seq] ?? l.tokensEst))))) : null,
      sk.registryAvailable ? h('div', { className: 'clx-tp-def' }, h(SkillBody, { sessionId, name: r.name, t })) : null))
}

/** 来源: what entered the context from outside the conversation, as a list on the left and the picked item on the right. */
function SourcesTab({ sessionId, liveKey, bd, t, onJump, ctx }) {
  const { data: src, error } = useSources(sessionId, liveKey)
  const [rootRef, rootW] = useWidth(800)
  const wide = rootW >= 760
  const [sel, setSel] = useState(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [allSkills, setAllSkills] = useState(false)
  const [noteLine, preview] = useSidebarPreview(ctx, sessionId, src?.cwd, t)
  const rows = useMemo(() => (src ? skillRows(src) : []), [src])
  const cost = useMemo(() => {
    const m = {}
    for (const s of bd?.skills || []) m[s.name] = s.tokensCal
    return m
  }, [bd])
  const nodeTok = useMemo(() => {
    const m = {}
    for (const n of bd?.nodes || []) m[n.seq] = n.tokensCal
    return m
  }, [bd])
  if (error && !src) return h('div', { className: 'clx-err' }, fmt(t('failed'), { msg: error }))
  if (!src) return h('div', { className: 'clx-muted' }, t('loading'))

  const sk = src.skills || {}
  const files = src.memory?.files || []
  const active = files.filter((f) => f.status === 'active')
  const memTok = active.reduce((s, f) => s + (f.tokens || 0), 0)
  const loaded = rows.filter((r) => r.loads.length)
  const inCat = rows.filter((r) => r.cat)
  const catTok = Object.values<any>(cost).reduce((a, b) => a + b, 0)
  const loadTok = (sk.loaded || []).reduce((s: number, l: any) => s + (nodeTok[l.seq] ?? l.tokensEst ?? 0), 0)
  const rt = [...(src.runtime?.sections || []), ...(src.timeContext ? [{ name: 'time-context', text: src.timeContext.text }] : [])]
  const L = src.layout
  const layFiles = L ? [...(L.global || []), ...(L.levels || []).flatMap((l) => l.files), ...(L.deeper || [])] : []
  const tree = L ? [1] : treeNodes(src.structure)
  const treeLoaded = layFiles.filter((f) => f.loaded).length
  const treeExists = layFiles.filter((f) => f.exists && !f.loaded).length
  const query = q.trim().toLowerCase()
  const skillShown = rows.filter((r) => (filter === 'all' || (filter === 'loaded' ? r.loads.length : filter === 'catalog' ? r.cat : !r.cat))
    && (!query || r.name.toLowerCase().includes(query) || (r.reg?.description || r.cat?.description || '').toLowerCase().includes(query)))
  const skillList = allSkills || query ? skillShown : skillShown.slice(0, 12)
  const memShown = files.filter((f) => !query || f.displayPath.toLowerCase().includes(query))

  const fallback = active[0] ? `m:${active[0].displayPath}` : loaded[0] ? `s:${loaded[0].name}` : rt.length ? 'rt' : tree.length ? 'ft' : null
  const current = sel ?? (wide ? fallback : null)
  const pick = (id) => setSel(current === id && !wide ? null : id)

  const panelFor = (id) => {
    if (!id) return null
    if (id.startsWith('m:')) {
      const f = files.find((x) => `m:${x.displayPath}` === id)
      return f ? h(MemPanel, { key: id, f, t, onJump, preview, noteLine }) : null
    }
    if (id.startsWith('s:')) {
      const r = rows.find((x) => `s:${x.name}` === id)
      return r ? h(SkillPanel, { key: id, r, sk, sessionId, t, onJump, nodeTok, cost: cost[r.name] }) : null
    }
    if (id === 'rt') {
      return h(React.Fragment, { key: id },
        h('div', { className: 'clx-mside-head' },
          h('b', { className: 'clx-sp-title' }, t('src.runtime')),
          src.runtime ? h('button', { className: 'clx-chipbtn', style: { marginLeft: 'auto' }, onClick: () => onJump(src.runtime.seq) }, `#${src.runtime.seq} ${t('src.inMessages')}`) : null),
        h('div', { className: 'clx-mside-body' },
          h('div', { className: 'clx-note', style: { marginBottom: 8 } }, t('src.runtimeHint')),
          h('div', { className: 'clx-rt-list' }, rt.map((s) => h('div', { key: s.name, className: 'clx-rt' },
            h('span', { className: 'k', title: s.name }, RT_NAME[s.name] ? t(RT_NAME[s.name]) : s.name),
            h('span', { className: 'v' }, s.text))))))
    }
    if (id === 'ft') {
      return h(React.Fragment, { key: id },
        h('div', { className: 'clx-mside-head' }, h('b', { className: 'clx-sp-title' }, t('lay.title')), h('span', { className: 'clx-muted' }, t('lay.sub'))),
        h('div', { className: 'clx-mside-body' }, h(AgentLayout, { src, t, onJump, ctx, sessionId })))
    }
    return null
  }
  const inline = (id) => (!wide && current === id ? h('div', { className: 'clx-tl-inline clx-sp-inline' }, panelFor(id)) : null)

  const list = h('div', { className: 'clx-tlists' },
    h('div', { className: 'clx-msgsearch clx-tsearch' },
      h('svg', { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': true }, h('circle', { cx: 11, cy: 11, r: 6.5 }), h('path', { d: 'M16 16l4 4' })),
      h('input', { value: q, placeholder: t('src.search'), onChange: (e) => setQ(e.target.value) }),
      q ? h('button', { className: 'clx-msgclear', onClick: () => setQ('') }, '×') : null),

    h('div', { className: 'clx-card clx-tcard' },
      h('div', { className: 'clx-card-head' },
        h('h4', null, t('nav.memory')),
        h('span', { className: 'clx-muted' }, active.length ? fmt(t('src.memoryCount'), { n: active.length, t: fmtK(memTok) }) : t('src.memoryZero'))),
      memShown.length ? memShown.map((f) => {
        const id = `m:${f.displayPath}`
        return h(React.Fragment, { key: id },
          h(SrcLine, {
            color: CAT_COLOR.memory, name: f.displayPath, title: f.path, sel: current === id, onClick: () => pick(id), dim: f.status !== 'active',
            badge: [t(`src.mem.${f.status}`), f.updates ? fmt(t('src.updates'), { n: f.updates }) : null].filter(Boolean).join(' · '),
            tok: f.tokens ? fmtK(f.tokens) : '—',
          }),
          inline(id))
      }) : h('div', { className: 'clx-tempty clx-muted' }, query ? t('msg.none') : t('src.memNoneShort'))),

    h('div', { className: 'clx-card clx-tcard' },
      h('div', { className: 'clx-card-head' },
        h('h4', null, t('src.skills')),
        h('span', { className: 'clx-muted' }, rows.length ? fmt(t('src.skillsShort'), { n: rows.length, l: loaded.length, lt: fmtK(loadTok), c: inCat.length, ct: fmtK(catTok) }) : '')),
      rows.length ? h('div', { className: 'clx-sp-filters' },
        ['all', 'loaded', 'catalog', 'hidden'].map((k) => h('button', { key: k, className: 'clx-chipbtn', 'aria-pressed': filter === k, onClick: () => setFilter(k) },
          t(`src.f.${k}`), h('small', null, ` ${k === 'all' ? rows.length : k === 'loaded' ? loaded.length : k === 'catalog' ? inCat.length : rows.length - inCat.length}`)))) : null,
      sk.registryAvailable === false ? h('div', { className: 'clx-note', style: { padding: '0 8px 4px' } }, t('src.noRegistry')) : null,
      skillList.length ? skillList.map((r) => {
        const id = `s:${r.name}`
        return h(React.Fragment, { key: id },
          h(SrcLine, {
            color: r.loads.length ? CAT_COLOR.skills : r.cat ? 'color-mix(in srgb, #EDC948 45%, transparent)' : 'var(--dsw-alias-border-l3)',
            name: r.name, title: r.reg?.description || r.cat?.description || '', sel: current === id, onClick: () => pick(id), dim: !r.cat && !r.loads.length,
            badge: r.loads.length ? fmt(t('src.loadedN'), { n: r.loads.length }) : r.cat ? t('src.inCatalog') : r.reg && !r.reg.modelInvocable ? t('src.userOnly') : t('src.notInCatalog'),
            tok: cost[r.name] ? fmtK(cost[r.name]) : '',
          }),
          inline(id))
      }) : h('div', { className: 'clx-tempty clx-muted' }, rows.length ? t('src.skillsNone') : t('src.skillsZero')),
      !query && skillShown.length > 12 ? h('button', { className: 'clx-chipbtn clx-tmore', onClick: () => setAllSkills(!allSkills) },
        allSkills ? t('ui.collapseAll') : fmt(t('tools.showAllDefs'), { n: skillShown.length })) : null),

    h('div', { className: 'clx-card clx-tcard' },
      h('div', { className: 'clx-card-head' }, h('h4', null, t('src.env'))),
      rt.length ? h(React.Fragment, null,
        h(SrcLine, { color: CAT_COLOR.injected, name: t('src.runtime'), badge: fmt(t('src.itemsN'), { n: rt.length }), tok: '', sel: current === 'rt', onClick: () => pick('rt') }),
        inline('rt')) : null,
      tree.length ? h(React.Fragment, null,
        h(SrcLine, { color: '#5DA9A0', name: t('lay.title'), badge: fmt(t('src.treeSum'), { e: treeExists, l: treeLoaded }), tok: '', sel: current === 'ft', onClick: () => pick('ft') }),
        inline('ft')) : null))

  return h('div', { className: 'clx-sources2', ref: rootRef },
    h('div', { className: 'clx-tiles clx-tsum' },
      h(Stat, { k: t('src.sum.mem'), v: fmtInt(active.length), sub: active.length ? ` ≈${fmtK(memTok)}` : undefined }),
      h(Stat, { k: t('src.sum.loaded'), v: fmtInt(loaded.length), sub: loaded.length ? ` ${fmtK(loadTok)}` : undefined }),
      h(Stat, { k: t('src.sum.catalog'), v: fmtInt(inCat.length), sub: catTok ? ` ${fmtK(catTok)}` : undefined }),
      h(Stat, { k: t('src.sum.all'), v: fmtInt(rows.length) }),
      h(Stat, { k: t('src.sum.rt'), v: fmtInt(rt.length) })),
    wide
      ? h('div', { className: 'clx-tsplit' }, list,
        h('aside', { className: 'clx-mside' }, current ? panelFor(current) : h('div', { className: 'clx-mside-empty' }, t('src.pick'))))
      : list)
}

/** Pixel width of an element, so charts draw at their real size (fixed text, fixed height). */
function useWidth(fallback) {
  const ref = useRef(null)
  const [w, setW] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([e]) => {
      const next = Math.round(e.contentRect.width)
      if (next > 0) setW(next)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

function Trend({ data, t, onJump }) {
  const [boxRef, boxW] = useWidth(640)
  const [scale, setScale] = useState('fit')
  const [mode, setMode] = useState('nodes')
  const [hover, setHover] = useState(null)
  const nodes = data.nodes || []
  const s = summarize(data)
  const comp = s.comp
  const W = Math.max(320, boxW)
  const H = 230
  const P = { l: 46, r: 10, t: 10, b: 52 }
  const strip = 34
  const last = nodes.length ? nodes[nodes.length - 1].cumulative : 0
  const base = Math.max(0, s.used - last)
  const yMax = scale === 'window' && s.win ? s.win : Math.max(1, (base + last) * 1.12)
  const n = Math.max(1, nodes.length)
  const x = (i) => P.l + (W - P.l - P.r) * (nodes.length <= 1 ? 0.5 : i / (nodes.length - 1))
  const y = (v) => P.t + (H - P.t - P.b - strip) * (1 - Math.min(1, v / yMax))
  const area = nodes.length
    ? `M${x(0)},${y(0)} ` + nodes.map((nd, i) => `L${x(i).toFixed(1)},${y(base + nd.cumulative).toFixed(1)}`).join(' ') + ` L${x(nodes.length - 1)},${y(0)} Z`
    : ''
  const line = nodes.map((nd, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(base + nd.cumulative).toFixed(1)}`).join(' ')
  const maxNode = Math.max(1, ...nodes.map((nd) => nd.tokensCal))
  const stripTop = H - P.b - strip + 6
  const bw = Math.max(0.6, (W - P.l - P.r) / n - 0.4)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax)
  const onMove = (e) => {
    const svg = e.currentTarget
    const r = svg.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width * W
    const i = Math.round((px - P.l) / (W - P.l - P.r) * (nodes.length - 1))
    setHover(i >= 0 && i < nodes.length ? i : null)
  }
  const hv = hover !== null ? nodes[hover] : null
  const turns = data.turns || []
  const tMax = Math.max(1, ...turns.map((x) => x.tokens))
  const TW = W
  const TH = 120
  const tbw = (TW - 50) / Math.max(1, turns.length)
  const modeBtn = (k) => h('button', { key: k, className: 'clx-chipbtn', 'aria-pressed': mode === k, onClick: () => setMode(k) }, t(`trend.mode.${k}`))
  return h('div', { className: 'clx-card', ref: boxRef },
    h('div', { className: 'clx-card-head' },
      h('h4', null, t('ov.trend')),
      h('span', { className: 'clx-segmini' }, modeBtn('nodes'), turns.length ? modeBtn('turns') : null),
      mode === 'nodes' ? h('span', { className: 'clx-segmini' },
        h('button', { className: 'clx-chipbtn', 'aria-pressed': scale === 'fit', onClick: () => setScale('fit') }, t('trend.scale.fit')),
        h('button', { className: 'clx-chipbtn', 'aria-pressed': scale === 'window', onClick: () => setScale('window') }, t('trend.scale.window'))) : null),
    mode === 'turns' && turns.length ? h(React.Fragment, null,
      h('div', { className: 'clx-muted', style: { fontSize: 12, marginBottom: 4 } }, t('trend.turns')),
      h('svg', { className: 'clx-svg', viewBox: `0 0 ${TW} ${TH}`, width: '100%', style: { display: 'block' } },
        h('text', { x: 44, y: 12, textAnchor: 'end' }, fmtK(tMax)),
        h('text', { x: 44, y: TH - 18, textAnchor: 'end' }, '0'),
        turns.map((tu, i) => {
          const hh = Math.max(1, tu.tokens / tMax * (TH - 30))
          return h('g', { key: tu.turn },
            h('rect', { x: 50 + i * tbw + 1, width: Math.max(1, tbw - 2), y: TH - 20 - hh, height: hh, rx: 2, fill: 'var(--dsw-alias-state-business-primary)', opacity: 0.75 },
              h('title', null, `${fmt(t('msg.turn'), { n: tu.turn })}: ${fmtInt(tu.tokens)} · ${tu.nodes}`)),
            turns.length <= 40 || i % Math.ceil(turns.length / 40) === 0
              ? h('text', { x: 50 + i * tbw + tbw / 2, y: TH - 6, textAnchor: 'middle' }, String(tu.turn)) : null)
        })))
    : h(React.Fragment, null,
      h('svg', { className: 'clx-svg', viewBox: `0 0 ${W} ${H}`, width: '100%', style: { display: 'block', cursor: 'crosshair' }, onMouseMove: onMove, onMouseLeave: () => setHover(null), onClick: () => { if (hv) onJump(hv.seq) } },
        ticks.map((v, i) => h('g', { key: i },
          h('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), stroke: 'var(--dsw-alias-border-l1)' }),
          h('text', { x: P.l - 6, y: y(v) + 3, textAnchor: 'end' }, fmtK(v)))),
        area ? h('path', { className: 'clx-trend-area', d: area, fill: 'var(--dsw-alias-state-business-primary)', opacity: 0.14 }) : null,
        line ? h('path', { className: 'clx-trend-line', pathLength: 1, d: line, fill: 'none', stroke: 'var(--dsw-alias-state-business-primary)', strokeWidth: 1.6 }) : null,
        comp && comp.thresholdTokens && comp.thresholdTokens <= yMax ? h('g', null,
          h('line', { x1: P.l, x2: W - P.r, y1: y(comp.thresholdTokens), y2: y(comp.thresholdTokens), stroke: 'var(--dsw-alias-state-warn-primary)', strokeDasharray: '4 3' }),
          h('text', { x: W - P.r, y: y(comp.thresholdTokens) - 3, textAnchor: 'end' }, `${t('trend.threshold')} ${fmtK(comp.thresholdTokens)}`)) : null,
        s.win && s.win <= yMax ? h('g', null,
          h('line', { x1: P.l, x2: W - P.r, y1: y(s.win), y2: y(s.win), stroke: 'var(--dsw-alias-state-error-primary)', strokeDasharray: '2 3' }),
          h('text', { x: W - P.r, y: y(s.win) + 11, textAnchor: 'end' }, `${t('trend.window')} ${fmtK(s.win)}`)) : null,
        nodes.map((nd, i) => h('rect', {
          key: nd.seq, x: x(i) - bw / 2, width: bw,
          y: stripTop + strip - 6 - Math.max(1, nd.tokensCal / maxNode * (strip - 6)),
          height: Math.max(1, nd.tokensCal / maxNode * (strip - 6)),
          fill: CAT_COLOR[nd.category] || CAT_COLOR.other,
        })),
        hv ? h('line', { x1: x(hover), x2: x(hover), y1: P.t, y2: stripTop + strip - 6, stroke: 'var(--dsw-alias-label-tertiary)', strokeWidth: 0.8 }) : null,
        hv ? h('circle', { cx: x(hover), cy: y(base + hv.cumulative), r: 3, fill: 'var(--dsw-alias-state-business-primary)' }) : null,
        h('text', { x: P.l, y: H - 6 }, nodes.length ? `#${nodes[0].seq}` : ''),
        h('text', { x: W - P.r, y: H - 6, textAnchor: 'end' }, nodes.length ? `#${nodes[nodes.length - 1].seq}` : '')),
      h('div', { className: 'clx-tip' }, hv
        ? h(React.Fragment, null,
          h('span', { className: 'clx-tag' }, h('i', { className: 'clx-dot', style: { background: CAT_COLOR[hv.category] } }), `#${hv.seq} ${t(`c.${hv.category}`)}`),
          ` · +${fmtK(hv.tokensCal)} → ${fmtK(base + hv.cumulative)}`,
          hv.time ? ` · ${fmtTime(hv.time)}` : '',
          h('div', { className: 'clx-muted' }, hv.tool || (hv.tools || []).join(', ') || hv.preview || ''))
        : h('span', { className: 'clx-muted' }, t('trend.hint'))),
      h('div', { className: 'clx-legend', style: { marginTop: 6 } },
        CATS.filter((k) => s.byCat[k]?.count).map((k) => h('span', { key: k }, h('i', { className: 'clx-dot', style: { background: CAT_COLOR[k] } }), t(`c.${k}`))))))
}

// ================================================================== execution flow
// Lifecycle diagram of this conversation showing where it is now, or where a
// chosen step of its trajectory went, with the context each stage holds.
const FW = 600
const MAIN_X = 345
const MAIN_W = 210
const SIDE_X = 88
const SIDE_W = 150
const NH = 34
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
]
const FLOW_H = 866
const NODE = Object.fromEntries(FLOW_NODES.map((n, i) => [n.key, { ...n, i, x: n.side ? SIDE_X : MAIN_X, w: n.side ? SIDE_W : MAIN_W }]))
const MAIN_ORDER = FLOW_NODES.filter((n) => !n.side).map((n) => n.key)
const TONE = {
  green: ['rgba(76,175,110,.20)', 'rgba(76,175,110,.75)'],
  grey: ['rgba(140,146,160,.16)', 'rgba(140,146,160,.55)'],
  cream: ['rgba(242,190,90,.17)', 'rgba(222,160,70,.75)'],
  blue: ['rgba(70,140,220,.85)', 'rgba(70,140,220,1)'],
  red: ['rgba(230,110,110,.22)', 'rgba(220,100,100,.8)'],
}
const LOOP_CH = MAIN_X + MAIN_W / 2 + 26
const TURN_CH = MAIN_X + MAIN_W / 2 + 58

/** Polyline a pulse travels from stage a to stage b. */
function flowRoute(a, b) {
  const A = NODE[a]
  const B = NODE[b]
  if (!A || !B) return null
  if (a === b) return [[A.x + A.w / 2, A.y], [A.x + A.w / 2 + 14, A.y], [A.x + A.w / 2, A.y]]
  if (A.side || B.side) {
    const ax = A.x < B.x ? A.x + A.w / 2 : A.x - A.w / 2
    const bx = A.x < B.x ? B.x - B.w / 2 : B.x + B.w / 2
    if (A.x === B.x) return [[A.x - A.w / 2, A.y], [A.x - A.w / 2 - 12, A.y], [B.x - B.w / 2 - 12, B.y], [B.x - B.w / 2, B.y]]
    return [[ax, A.y], [(ax + bx) / 2, A.y], [(ax + bx) / 2, B.y], [bx, B.y]]
  }
  const ia = MAIN_ORDER.indexOf(a)
  const ib = MAIN_ORDER.indexOf(b)
  if (ib === ia + 1) return [[A.x, A.y + NH / 2], [B.x, B.y - NH / 2]]
  const ch = A.loop && B.loop ? LOOP_CH : TURN_CH
  return [[A.x + A.w / 2, A.y], [ch, A.y], [ch, B.y], [B.x + B.w / 2, B.y]]
}

function arrowPath(points) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')
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
}

function stageTokens(byCat: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [stage, cats] of Object.entries(STAGE_CATS) as Array<[string, string[]]>) {
    const v = cats.reduce((s, k) => s + (byCat[k] || 0), 0)
    if (v > 0) out[stage] = v
  }
  return out
}

/**
 * Context composition as of one request: every node appended before it,
 * plus tool definitions. Scaled to the request's reported prompt when known.
 */
function compositionAt(bd, step) {
  const by = {}
  for (const k of CATS) by[k] = 0
  if (!bd) return { by, total: 0, exact: false }
  const cut = step.requestSeq ?? step.endSeq ?? step.startSeq
  for (const n of bd.nodes || []) {
    if (!(n.seq < cut)) continue
    const cal = n.tokens ? (n.tokensCal ?? n.tokens) / n.tokens : 1
    if (n.split) for (const [k, v] of Object.entries<any>(n.split)) by[k] = (by[k] || 0) + v * cal
    else by[n.category] = (by[n.category] || 0) + (n.tokensCal ?? n.tokens ?? 0)
  }
  for (const c of bd.categories || []) if (c.key === 'systemTools' || c.key === 'mcpTools') by[c.key] = c.tokens
  const est = Object.values<any>(by).reduce((a, b) => a + b, 0)
  const exact = typeof step.promptTokens === 'number' && step.promptTokens > 0 && est > 0
  if (exact) {
    const f = step.promptTokens / est
    for (const k of Object.keys(by)) by[k] *= f
  }
  return { by, total: exact ? step.promptTokens : est, exact }
}

function FlowDiagram({ t, totals, badges, path, focus, phase, goal, onPick }) {
  const edges = []
  for (let i = 0; i + 1 < MAIN_ORDER.length; i++) {
    const a = MAIN_ORDER[i]
    const b = MAIN_ORDER[i + 1]
    if (a === 'stepEnd') continue
    edges.push({ key: `${a}-${b}`, d: arrowPath(flowRoute(a, b)), dashed: b === 'compaction' })
  }
  edges.push({ key: 'stepEnd-turnEnd', d: arrowPath([[MAIN_X, NODE.stepEnd.y + NH / 2], [MAIN_X, NODE.turnEnd.y - NH / 2]]) })
  const loop = flowRoute('stepEnd', 'stepStart')
  const turnLoop = flowRoute('turnEnd', 'userPrompt')
  const side = (a, b, dashed = true) => ({ key: `${a}-${b}`, d: arrowPath(flowRoute(a, b)), dashed, side: true })
  edges.push(side('goal', 'goalRound'), side('goalRound', 'userPrompt'), side('inbox', 'turnStart'), side('context', 'stepStart'), side('toolCall', 'approval'), side('approval', 'toolExec'))
  const box = (x1, y1, x2, y2, color, label) => h('g', null,
    h('rect', { x: x1, y: y1, width: x2 - x1, height: y2 - y1, rx: 10, fill: 'none', stroke: color, strokeDasharray: '5 4', strokeWidth: 1.4, opacity: 0.8 }),
    h('text', { x: x1 + 12, y: y1 + 18, className: 'clx-flow-boxlabel', fill: color }, label))
  const loopX1 = MAIN_X - MAIN_W / 2 - 22

  // the highlighted trajectory: consecutive stages, numbered by first visit
  const order = {}
  const trace = []
  ;(path || []).forEach((s, i) => {
    if (!NODE[s]) return
    if (order[s] === undefined) order[s] = Object.keys(order).length + 1
    const prev = path[i - 1]
    if (prev && NODE[prev] && prev !== s) trace.push({ key: `${i}-${prev}-${s}`, d: arrowPath(flowRoute(prev, s)) })
  })
  const hasPath = trace.length > 0 || Object.keys(order).length > 0
  const accent = phase === 'approval' ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-state-business-primary)'

  return h('svg', { className: 'clx-flow', viewBox: `0 0 ${FW} ${FLOW_H}`, width: '100%', style: { display: 'block', maxWidth: FW } },
    h('defs', null,
      h('marker', { id: 'clx-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
        h('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--dsw-alias-label-tertiary)' })),
      h('marker', { id: 'clx-arrow-hot', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
        h('path', { d: 'M0,0 L10,5 L0,10 z', fill: accent }))),
    box(loopX1 - 14, NODE.userPrompt.y - 32, TURN_CH + 14, NODE.turnEnd.y + 30, 'rgba(70,140,220,.9)', t('flow.box.turn')),
    box(loopX1, NODE.stepStart.y - 42, LOOP_CH + 12, NODE.stepEnd.y + 30, 'rgba(222,150,90,.95)', t('flow.box.loop')),
    edges.map((e) => h('path', { key: e.key, d: e.d, fill: 'none', stroke: 'var(--dsw-alias-label-tertiary)', strokeWidth: 1.3, strokeDasharray: e.dashed ? '4 3' : undefined, opacity: hasPath ? 0.35 : e.side ? 0.6 : 0.85, markerEnd: 'url(#clx-arrow)' })),
    h('path', { d: arrowPath(loop), fill: 'none', stroke: 'rgba(222,150,90,.95)', strokeWidth: 1.4, opacity: hasPath ? 0.45 : 1, markerEnd: 'url(#clx-arrow)' }),
    h('path', { d: arrowPath(turnLoop), fill: 'none', stroke: 'rgba(70,140,220,.9)', strokeWidth: 1.4, opacity: hasPath ? 0.45 : 1, markerEnd: 'url(#clx-arrow)' }),
    h('text', { x: TURN_CH + 6, y: (NODE.userPrompt.y + NODE.turnEnd.y) / 2, className: 'clx-flow-side', transform: `rotate(90 ${TURN_CH + 6} ${(NODE.userPrompt.y + NODE.turnEnd.y) / 2})`, textAnchor: 'middle' }, t('flow.nextTurn')),
    trace.map((e) => h('path', { key: e.key, d: e.d, className: 'clx-flow-trace', style: { stroke: accent }, markerEnd: 'url(#clx-arrow-hot)' })),
    FLOW_NODES.map((n) => {
      const N = NODE[n.key]
      const total = totals[n.key] || 0
      const tokens = badges[n.key] || 0
      const [fill, stroke] = n.side ? ['transparent', 'var(--dsw-alias-border-l3)'] : TONE[n.tone]
      const isFocus = focus === n.key
      const inPath = order[n.key] !== undefined
      const dim = hasPath ? !inPath && !isFocus : !total && !tokens
      const inv = n.tone === 'blue'
      const label = n.key === 'goal' && goal ? `${t('flow.n.goal')} · ${t(`flow.phase.${goal.phase}`) || goal.phase}` : t(`flow.n.${n.key}`)
      const left = N.x - N.w / 2
      return h('g', {
        key: n.key, className: `clx-flow-node${isFocus ? ' active' : ''}`,
        opacity: dim ? (tokens ? 0.5 : 0.3) : 1, style: { cursor: total ? 'pointer' : 'default' },
        onClick: () => { if (total) onPick(n.key) },
      },
        h('title', null, `${t(`flow.n.${n.key}`)} — ${t(`flow.d.${n.key}`)}\n${fmt(t('flow.tip'), { n: fmtInt(total), k: tokens ? fmtInt(Math.round(tokens)) : '—' })}`),
        isFocus ? h('rect', { className: 'clx-flow-glow', x: left - 5, y: N.y - NH / 2 - 5, width: N.w + 10, height: NH + 10, rx: 12, fill: 'none', stroke: accent, strokeWidth: 2.4 }) : null,
        h('rect', { x: left, y: N.y - NH / 2, width: N.w, height: NH, rx: 8, fill, stroke: inPath || isFocus ? accent : stroke, strokeWidth: inPath || isFocus ? 1.8 : 1.1, strokeDasharray: n.side && !inPath ? '4 3' : undefined }),
        h('text', { x: left + (inPath ? 28 : 10), y: N.y + 4, className: `clx-flow-label${inv ? ' inv' : ''}${n.side ? ' side' : ''}` }, label),
        total || tokens ? h('text', { x: left + N.w - 8, y: N.y + 4, textAnchor: 'end' },
          total ? h('tspan', { className: `clx-flow-count${inv ? ' inv' : ''}` }, `×${total}`) : null,
          tokens ? h('tspan', { className: `clx-flow-tok${inv ? ' inv' : ''}`, dx: total ? 6 : 0 }, fmtK(tokens)) : null) : null,
        inPath ? h('g', null,
          h('circle', { cx: left + 14, cy: N.y, r: 8.5, fill: accent }),
          h('text', { x: left + 14, y: N.y + 3.5, textAnchor: 'middle', className: 'clx-flow-num' }, order[n.key])) : null)
    }))
}

const LIVE_COLOR = {
  idle: 'var(--dsw-alias-label-tertiary)',
  running: 'var(--dsw-alias-state-business-primary)',
  tool: 'rgba(70,140,220,1)',
  approval: 'var(--dsw-alias-state-warn-primary)',
}

function useNow(active) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

function CompositionBar({ by, win, t }) {
  const segs = GROUPS.map((g) => ({ key: g.key, label: t(`g.${g.key}`) || g.key, color: g.color, tokens: g.cats.reduce((s, k) => s + (by[k] || 0), 0) }))
  const rows = CATS.map((k) => ({ k, v: by[k] || 0 })).filter((r) => r.v >= 1).sort((a, b) => b.v - a.v).slice(0, 6)
  return h('div', null,
    h(UsageBar, { segments: segs, win, buffer: 0 }),
    h('div', { className: 'clx-flow-comp' }, rows.map((r) => h('span', { key: r.k },
      h('i', { className: 'clx-dot', style: { background: CAT_COLOR[r.k] } }), ` ${t(`c.${r.k}`)} `, h('b', null, fmtK(r.v))))))
}

function StepRow({ s, win, sel, onPick, t }) {
  const w = win && s.promptTokens ? Math.min(100, s.promptTokens / win * 100) : 0
  const tools = s.tools.length ? [...new Set(s.tools)].map((x) => {
    const n = s.tools.filter((y) => y === x).length
    return n > 1 ? `${x}×${n}` : x
  }).join(', ') : (s.stages.includes('assistant') ? t('flow.textOnly') : '—')
  return h('div', { className: `clx-flow-step${sel ? ' sel' : ''}`, onClick: onPick, title: s.stages.map((x) => t(`flow.n.${x}`)).join(' → ') },
    h('span', { className: 'clx-muted', style: { fontVariantNumeric: 'tabular-nums' } }, `#${s.step}`),
    h('span', { className: 'clx-flow-step-tools' },
      s.status === 'running' ? h('i', { className: 'clx-live-dot', style: { background: LIVE_COLOR.running, marginRight: 5 } }) : null,
      tools,
      s.errors ? h('span', { className: 'clx-err' }, ` ⚠${s.errors}`) : null,
      s.status === 'interrupted' ? h('span', { className: 'clx-warn' }, ` · ${t('flow.status.interrupted')}`) : null),
    h('span', { className: 'clx-flow-step-ctx', title: s.promptTokens ? fmtInt(s.promptTokens) : '' },
      h('span', { className: 'clx-flow-mini' }, h('span', { style: { width: `${w}%` } })),
      h('span', { className: 'clx-muted' }, s.promptTokens ? fmtK(s.promptTokens) : '—')))
}

function FlowTab({ sessionId, liveKey, bd, t, onJump }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [selKey, setSelKey] = useState(null)
  const [open, setOpen] = useState({})
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let dead = false
    call('flow', { sessionId }).then((v) => {
      if (dead) return
      setData(v)
      setError(null)
    }, (e) => { if (!dead) setError(String(e?.message || e)) })
    return () => { dead = true }
  }, [sessionId, liveKey, tick])

  const live = data?.live
  const busy = !!live && live.phase !== 'idle'
  // while a turn is open, keep the state current
  useEffect(() => {
    if (!busy) return undefined
    const id = setTimeout(() => setTick((x) => x + 1), 2500)
    return () => clearTimeout(id)
  }, [busy, data])
  const now = useNow(busy)
  const listRef = useRef(null)
  const stick = useRef(true)
  useEffect(() => {
    const el = listRef.current?.querySelector('.clx-flow-step.sel')
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selKey])
  // oldest first, like the conversation; stay pinned to the newest step unless scrolled up
  const stepCount = data?.steps?.length || 0
  useLayoutEffect(() => {
    const el = listRef.current
    if (el && stick.current && selKey === null) el.scrollTop = el.scrollHeight
  }, [stepCount, !!data])
  const onListScroll = (e) => {
    const el = e.currentTarget
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  const steps = data?.steps || []
  const selIdx = selKey === null ? -1 : steps.findIndex((s) => s.startSeq === selKey)
  const sel = selIdx >= 0 ? steps[selIdx] : null
  const s = summarize(bd)
  const win = s.win

  const badges = useMemo(() => {
    if (sel) return stageTokens(compositionAt(bd, sel).by)
    const by: any = {}
    for (const c of bd?.categories || []) by[c.key] = c.tokens
    return stageTokens(by)
  }, [bd, sel])

  const byTurn = useMemo(() => {
    const m = new Map()
    for (const st of steps) {
      if (!m.has(st.turn)) m.set(st.turn, [])
      m.get(st.turn).push(st)
    }
    return m
  }, [data])

  if (error && !data) return h('div', { className: 'clx-err' }, fmt(t('failed'), { msg: error }))
  if (!data) return h('div', { className: 'clx-muted' }, t('loading'))

  const curStep = live?.currentStep !== undefined ? steps[live.currentStep] : null
  const path = sel ? sel.stages : curStep ? curStep.stages : []
  const focus = sel ? sel.stages[sel.stages.length - 1] : live?.stage
  const phase = sel ? 'selected' : live?.phase
  const pick = (st) => setSelKey(st ? st.startSeq : null)
  const pickStage = (stage) => {
    // most recent step (before the selected one, cycling) that passed through this stage
    const from = selIdx >= 0 ? selIdx - 1 : steps.length - 1
    for (let k = 0; k < steps.length; k++) {
      const i = ((from - k) % steps.length + steps.length) % steps.length
      if (steps[i].stages.includes(stage)) { pick(steps[i]); return }
    }
  }
  const g = data.goal
  const turnsInfo = new Map((data.turns || []).map((x) => [x.turn, x]))
  const turnNums = [...byTurn.keys()].sort((a, b) => a - b)
  const lastTurn = turnNums[turnNums.length - 1]
  const isOpen = (n) => open[n] ?? (n === (sel?.turn ?? lastTurn))

  const statusCard = sel
    ? (() => {
      const comp = compositionAt(bd, sel)
      const u = sel.usage
      const dur = sel.endTime && sel.startTime ? sel.endTime - sel.startTime : sel.status === 'running' ? now - sel.startTime : undefined
      return h('div', { className: 'clx-card' },
        h('div', { className: 'clx-flow-status' },
          h('b', null, fmt(t('flow.where'), { t: sel.turn, s: sel.step })),
          h('span', { className: sel.status === 'error' ? 'clx-err' : sel.status === 'interrupted' ? 'clx-warn' : 'clx-muted' }, t(`flow.status.${sel.status}`)),
          h('span', { style: { marginLeft: 'auto', display: 'flex', gap: 6 } },
            h('button', { className: 'clx-chipbtn', disabled: selIdx <= 0, onClick: () => pick(steps[selIdx - 1]) }, `‹ ${t('flow.prev')}`),
            h('button', { className: 'clx-chipbtn', disabled: selIdx >= steps.length - 1, onClick: () => pick(steps[selIdx + 1]) }, `${t('flow.next')} ›`),
            h('button', { className: 'clx-chipbtn', 'aria-pressed': true, onClick: () => pick(null) }, t('flow.backLive')))),
        h('div', { className: 'clx-muted', style: { fontSize: 12, margin: '2px 0 8px' } },
          [sel.startTime ? new Date(sel.startTime).toLocaleString() : null, dur !== undefined ? fmtDur(dur) : null, `#${sel.startSeq}${sel.endSeq ? `–${sel.endSeq}` : ''}`].filter(Boolean).join(' · ')),
        h('h4', null, t('flow.path')),
        h('div', { className: 'clx-flow-path' }, sel.stages.map((x, i) => h('span', { key: i, className: 'clx-flow-chip' }, h('b', null, i + 1), ` ${t(`flow.n.${x}`)}`))),
        h('h4', { style: { marginTop: 10 } }, t('sd.story')),
        h(StepStory, { bd, st: sel, t, onJump }),
        sel.turnEnd ? h('div', { style: { fontSize: 12, marginTop: 4 } }, h('span', { className: 'clx-muted' }, `${t('flow.n.turnEnd')}: `), sel.turnEnd) : null,
        h('h4', { style: { marginTop: 12 } }, t('flow.ctxAt')),
        h('div', { className: 'clx-flow-big' },
          h('b', null, fmtK(comp.total)),
          h('span', { className: 'clx-muted' }, ` / ${fmtK(win)} · ${pct(comp.total, win)}`)),
        u ? h('div', { className: 'clx-muted', style: { fontSize: 12 } }, fmt(t('flow.request'), { c: fmtK(u.cacheRead || 0), r: pct(u.cacheRead || 0, sel.promptTokens || 0, 0), o: fmtK(u.output || 0) })) : null,
        h(CompositionBar, { by: comp.by, win, t }),
        h('div', { className: 'clx-muted', style: { fontSize: 11.5 } }, t(comp.exact ? 'flow.ctxEst' : 'flow.ctxEstNoUsage')))
    })()
    : (() => {
      const ph = live?.phase || 'idle'
      return h('div', { className: 'clx-card' },
        h('h4', null, t('flow.live')),
        h('div', { className: 'clx-flow-status' },
          h('i', { className: `clx-live-dot${ph === 'idle' ? '' : ' on'}`, style: { background: LIVE_COLOR[ph] } }),
          h('b', null, t(`flow.live.${ph}`)),
          live?.turn ? h('span', { className: 'clx-muted' }, live.step ? fmt(t('flow.where'), { t: live.turn, s: live.step }) : fmt(t('msg.turn'), { n: live.turn })) : null),
        h('div', { style: { fontSize: 12.5, marginTop: 6 } },
          h('span', { className: 'clx-muted' }, `${t('flow.stage')}: `),
          h('b', null, t(`flow.n.${live?.stage}`) || '—'),
          ph === 'idle' ? h('span', { className: 'clx-muted' }, ` · ${t('flow.idleHint')}`) : null),
        curStep ? h('div', { className: 'clx-muted', style: { fontSize: 12, marginTop: 2 } },
          `${fmt(t('flow.stepFor'), { d: fmtDur(now - curStep.startTime) })}${curStep.tools.length ? ` · ${curStep.tools.join(', ')}` : ''}`) : null,
        live?.jobs?.length ? h('div', { style: { marginTop: 8, fontSize: 12 } },
          h('div', { className: 'clx-muted' }, t('flow.jobs')),
          live.jobs.map((j) => h('div', { key: j.job, className: 'clx-flow-job' }, h('i', { className: 'clx-live-dot on', style: { background: LIVE_COLOR.tool } }), ` ${j.label} `, h('span', { className: 'clx-muted' }, fmtDur(now - j.startedAt))))) : null,
        live?.approvals?.length ? h('div', { style: { marginTop: 8, fontSize: 12 } },
          h('div', { className: 'clx-warn' }, t('flow.approvals')),
          live.approvals.map((a) => h('div', { key: a.seq }, a.title))) : null,
        live?.lastSeq !== undefined ? h('div', { className: 'clx-flow-now', style: { fontSize: 12 } },
          h('span', { className: 'clx-muted' }, `${t('flow.lastEvent')} · #${live.lastSeq} · ${fmt(t('flow.ago'), { d: fmtDur(Math.max(0, now - live.lastTime)) })}`),
          h('div', { className: 'clx-flow-now-text' }, h('b', null, t(`flow.n.${live.lastStage}`)), ' ', live.lastTitle)) : null,
        (curStep || steps[steps.length - 1]) ? h(React.Fragment, null, h('h4', { style: { marginTop: 10 } }, t('sd.story')), h(StepStory, { bd, st: curStep || steps[steps.length - 1], t, onJump })) : null,
        h('h4', { style: { marginTop: 12 } }, t('flow.ctxNow')),
        h('div', { className: 'clx-flow-big' },
          h('b', null, fmtK(s.used)),
          h('span', { className: 'clx-muted' }, ` / ${fmtK(win)} · ${pct(s.used, win)}`),
          s.comp?.auto && s.comp.thresholdTokens ? h('span', { className: s.used >= s.comp.thresholdTokens ? 'clx-warn' : 'clx-muted', style: { fontSize: 12 } }, ` · ${fmt(t('flow.threshold'), { t: fmtK(s.comp.thresholdTokens) })}`) : null),
        h(CompositionBar, { by: s.byCat ? Object.fromEntries(Object.entries<any>(s.byCat).map(([k, c]) => [k, c.tokens])) : {}, win, t }))
    })()

  return h('div', { className: 'clx-flow-wrap' },
    h('div', { className: 'clx-card clx-flow-diagram' },
      h('div', { className: 'clx-muted', style: { fontSize: 11.5, marginBottom: 4 } }, sel ? fmt(t('flow.legend.sel'), { t: sel.turn, s: sel.step }) : t('flow.legend.live')),
      h(FlowDiagram, { t, totals: data.counts || {}, badges, path, focus, phase, goal: g, onPick: pickStage })),
    h('div', { className: 'clx-flow-side-panel' },
      statusCard,

      g ? h('div', { className: 'clx-card' },
        h('h4', null, t('flow.goal')),
        h('div', { style: { fontWeight: 600, marginBottom: 4 } }, g.objective),
        h('div', { className: 'clx-kv' },
          kv(t('flow.goal.phase'), t(`flow.phase.${g.phase}`) || g.phase),
          kv(t('flow.goal.rounds'), `${g.roundsStarted ?? 0} / ${g.maxGoalRounds ?? '∞'}`),
          g.blockedReason ? kv(t('flow.goal.blocked'), typeof g.blockedReason === 'string' ? g.blockedReason : JSON.stringify(g.blockedReason)) : null),
        (data.goalHistory || []).length ? h('div', { style: { marginTop: 8, fontSize: 12 } }, data.goalHistory.map((x) => h('div', { key: x.seq, className: 'clx-flow-log' },
          h('span', { className: 'clx-muted' }, fmtTime(x.time)), ` ${x.operation}${x.phase ? ` → ${x.phase}` : ''}`))) : null) : null,

      h('div', { className: 'clx-card' },
        h('h4', null, `${t('flow.trajectory')} · ${fmt(t('flow.stepCount'), { n: steps.length + (data.stepsTruncated || 0) })}`),
        data.stepsTruncated ? h('div', { className: 'clx-muted', style: { fontSize: 11.5 } }, fmt(t('flow.stepsTruncated'), { n: data.stepsTruncated })) : null,
        steps.length ? h('div', { className: 'clx-flow-steps', ref: listRef, onScroll: onListScroll }, turnNums.map((n) => {
          const tu = turnsInfo.get(n) || ({} as any)
          const list = byTurn.get(n)
          const opened = isOpen(n)
          return h('div', { key: n, className: `clx-flow-tgroup${opened ? ' open' : ''}` },
            h('div', { className: 'clx-flow-turn', role: 'button', tabIndex: 0, 'aria-expanded': opened, onClick: () => setOpen({ ...open, [n]: !opened }) },
              h('div', { className: 'clx-flow-turn-head' },
                h(Chevron, { open: opened }),
                h('b', null, fmt(t('msg.turn'), { n })),
                h('span', { className: 'clx-tag' }, t(`flow.trigger.${tu.trigger || 'none'}`)),
                h('span', { className: tu.reason && /abort|error|fail/.test(tu.reason) ? 'clx-warn' : 'clx-muted' }, tu.reason || t('flow.running')),
                h('span', { className: 'clx-muted', style: { marginLeft: 'auto' } }, `${fmt(t('flow.stepCount'), { n: list.length })}${tu.start && tu.end ? ` · ${fmtDur(tu.end - tu.start)}` : ''}`)),
              tu.prompt ? h('div', { className: 'clx-flow-turn-prompt' }, tu.prompt) : null),
            opened ? list.map((st) => h(StepRow, { key: st.startSeq, s: st, win, sel: st === sel, t, onPick: () => pick(st === sel ? null : st) })) : null)
        })) : h('div', { className: 'clx-muted' }, t('flow.noSteps')))))
}

function fmtDur(ms) {
  if (!(ms >= 0)) return ''
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

const NAV_ICON = {
  overview: ['M12 3a9 9 0 1 0 9 9', 'M12 3a9 9 0 0 1 9 9h-9z'],
  analyze: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z'],
  prompt: ['M6 3h9l4 4v14H6z', 'M9 11h7', 'M9 15h7', 'M9 7h3'],
  flow: ['M6 4h5v5H6z', 'M13 15h5v5h-5z', 'M8.5 9v3.5h7V15', 'M17 6.5h3'],
  messages: ['M4 6h16', 'M4 11h16', 'M4 16h10'],
  tools: ['M8 5 4 12l4 7', 'M16 5l4 7-4 7', 'M13.5 5l-3 14'],
  sources: ['M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', 'M5 17a3 3 0 0 1 3-3h9', 'M19 7v13'],
}
const NAVS = ['overview', 'prompt', 'messages', 'tools', 'sources', 'analyze']
const NAV_STORE = 'dsh-context-lens:nav'
const NAV_OLD = { flow: 'overview', skills: 'sources', memory: 'sources', system: 'sources' }

function NavIcon({ k }) {
  return h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    (NAV_ICON[k] || []).map((d, i) => h('path', { key: i, d })))
}

/** Nearest ancestor that scrolls, so a section switch can start at the top. */
function scrollParent(el) {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

/** The Context Lens View: always the Conversation's own session, always live. */
function DetailPane(props) {
  const { ctx, t } = props
  useLocaleTick(ctx)
  const sessionId = typeof props.sessionId === 'string' ? props.sessionId : ''
  const [nav, setNavState] = useState(() => {
    try {
      const v = localStorage.getItem(NAV_STORE)
      return NAVS.includes(v) ? v : NAV_OLD[v] || 'overview'
    } catch {
      return 'overview'
    }
  })
  const paneRef = useRef(null)
  const setNav = (k) => {
    setNavState(k)
    try { localStorage.setItem(NAV_STORE, k) } catch {}
  }
  // each section opens at its top, not at the scroll offset the last one left
  const firstNav = useRef(true)
  useLayoutEffect(() => {
    if (firstNav.current) { firstNav.current = false; return }
    const pane = paneRef.current
    const sc = scrollParent(pane)
    if (!pane || !sc) return
    const top = pane.getBoundingClientRect().top - sc.getBoundingClientRect().top
    if (top < 0) sc.scrollTop += top
  }, [nav])
  const [focus, setFocus] = useState(null)
  // the selected section's pill slides between buttons
  const navRef = useRef(null)
  useLayoutEffect(() => {
    const el = navRef.current
    if (!el) return undefined
    const place = () => {
      const b = el.querySelector('button[aria-selected=true]')
      if (!b) return
      el.style.setProperty('--ind-x', `${b.offsetLeft}px`)
      el.style.setProperty('--ind-w', `${b.offsetWidth}px`)
      el.setAttribute('data-ind', '')
    }
    place()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    ro?.observe(el)
    return () => ro?.disconnect()
  })
  const pressure = useSafeProjection(props, 'contextPressure')
  const liveKey = pressure ? `${pressure.pressureTokens}:${pressure.projectedTokens}` : ''
  const { data, error, loading, reload } = useBreakdown(sessionId, liveKey, !!sessionId, pressure ? 0 : 5000)
  const live = data ? `${liveKey}|${data.logRevision}` : liveKey
  const { flow } = useFlow(sessionId, live)
  const series = useStepSeries(data, flow)
  const [stepKey, setStepKey] = useState(null)
  const [stepOnly, setStepOnly] = useState(false)
  const [askSeqs, setAskSeqs] = useState<number[]>([])
  const ask = (seq) => { setAskSeqs((a) => (a.includes(seq) ? a : [...a, seq].slice(-6))); setNav('analyze') }
  const selIdx = series.length ? (stepKey === null ? series.length - 1 : Math.max(0, series.findIndex((x) => x.st.startSeq === stepKey))) : -1
  const diff = useMemo(() => (data && selIdx >= 0 ? stepDiff(data, series, selIdx) : null), [data, series, selIdx])
  const onSel = (i) => {
    if (i === null || i >= series.length - 1) { setStepKey(null); setStepOnly(false) } else setStepKey(series[i].st.startSeq)
  }
  const [updated, setUpdated] = useState(0)
  useEffect(() => { if (data) setUpdated(Date.now()) }, [data])

  const [preset, setPreset] = useState(null)
  const jump = (seq) => {
    setFocus(null)
    requestAnimationFrame(() => setFocus(seq))
    setNav('messages')
  }
  const showCat = (cat) => {
    setFocus(null)
    setPreset({ cat })
    setNav('messages')
  }

  let body
  if (!sessionId) body = h('div', { className: 'clx-muted' }, t('session.none'))
  else if (!data) {
    body = error
      ? h('div', null, h('div', { className: 'clx-err' }, fmt(t('failed'), { msg: error })), h('button', { className: 'clx-chipbtn', onClick: reload }, t('retry')))
      : h('div', { className: 'clx-muted' }, t('loading'))
  } else if (!data.contextWindow && !data.measured?.totalTokens) {
    body = h('div', { className: 'clx-muted' }, t('pop.empty'))
  } else {
    body = h(React.Fragment, null,
      error ? h('div', { className: 'clx-err', style: { fontSize: 12, marginBottom: 8 } }, fmt(t('failed'), { msg: error })) : null,
      nav === 'analyze' ? h(AnalyzeView, { data, t, sessionId, onJump: jump, seqs: askSeqs, setSeqs: setAskSeqs })
      : nav === 'prompt' ? h(PromptView, { data, t, diff, series, onSel, sessionId, ctx, cwd: data.cwd, onJump: jump, onAsk: ask })
      : nav === 'messages' ? h(Messages, { data, flow, t, focus, sessionId, preset, ctx, cwd: data.cwd, diff, stepOnly })
        : nav === 'tools' ? h(Tools, { data, t, sessionId, ctx, cwd: data.cwd, diff })
          : nav === 'sources' ? h(SourcesTab, { sessionId, liveKey: live, bd: data, t, onJump: jump, ctx })
            : h(Overview, { data, flow, t, onJump: jump, onShowCat: showCat, onNav: setNav, sessionId, liveKey: live, series, diff, onSel }))
  }
  const s = data ? summarize(data) : null
  const counts = data ? {
    messages: (data.nodes || []).length,
    tools: (data.invocations || []).length,
  } : {}
  const toolbar = h('div', { className: 'clx-toolbar' }, h('div', { className: 'clx-col clx-toolbar-in' },
    h('nav', { className: 'clx-segnav', role: 'tablist', 'aria-label': t('tab.title'), ref: navRef },
      NAVS.map((k) => h('button', { key: k, role: 'tab', 'aria-selected': nav === k, onClick: () => setNav(k) },
        h(NavIcon, { k }), h('span', null, t(`nav.${k}`)),
        counts[k] ? h('small', { className: 'clx-navcount' }, counts[k] > 999 ? `${Math.floor(counts[k] / 1000)}k+` : counts[k]) : null))),
    h('div', { className: 'clx-toolbar-meta', title: updated ? fmt(t('live.updated'), { time: new Date(updated).toLocaleString() }) : '' },
      s && s.win ? h(React.Fragment, null,
        h(Ring, { ratio: s.used / s.win, size: 16, stroke: 2.6 }),
        h('b', null, pct(s.used, s.win)),
        h('span', { className: 'clx-muted' }, `${fmtK(s.used)} / ${fmtK(s.win)}`)) : null,
      h('span', { className: 'clx-toolbar-live' },
        h('i', { className: `clx-live-dot${loading ? ' on' : ''}`, style: { background: error ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-success-primary)' } }),
        t('live.on')))))
  return h('div', { className: 'clx-pane notranslate', translate: 'no', ref: paneRef }, h(Style), toolbar, h('main', { className: 'clx-main' }, h('div', { className: 'clx-col' }, data && diff ? h(StepBar, { series, diff, onSel, t, onNav: setNav, stepOnly, setStepOnly, nav }) : null, body)))
}

// ================================================================== registration
return {
  inject: ['slots', 'locale'],
  apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'context-lens: dictionaries')
    const t = ctx.locale.bind(NS)

    function Button(props) {
      return h(CompactButton, { ...props, ctx, t })
    }
    // The ring takes the place of the composer dock's built-in context meter
    // (that meter is not a slot; CSS hides it only while this ring is mounted).
    ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
      name: 'conversation.composer.dock',
      id: 'context-lens',
      order: 1000,
      label: () => t('button.unknown'),
    }, Button))

    // Detailed view: one more tab in the Conversation's top View row
    // (对话 / 轨迹 / ...), bound to that Conversation's session.
    function Pane(props) {
      return h(DetailPane, { ...props, ctx, t })
    }
    ctx.slots.inject('conversation.view', () => ctx.slots.register({
      name: 'conversation.view',
      id: KIND,
      order: 25,
      label: () => t('tab.title'),
    }, Pane))
  },
}
  },
})
