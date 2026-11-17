// ------------------------------------------------------------------ data
const CATS = ['system', 'systemTools', 'mcpTools', 'skills', 'memory', 'injected', 'summary', 'user', 'assistantText', 'reasoning', 'toolCalls', 'toolResults', 'other']
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
}
const GROUPS = [
  { key: 'system', color: '#8E99AB', cats: ['system'] },
  { key: 'systemTools', color: '#4E79A7', cats: ['systemTools'] },
  { key: 'mcpTools', color: '#A0CBE8', cats: ['mcpTools'] },
  { key: 'skills', color: '#EDC948', cats: ['skills'] },
  { key: 'memory', color: '#B6992D', cats: ['memory'] },
  { key: 'messages', color: '#9D7BD8', cats: ['user', 'assistantText', 'reasoning', 'toolCalls', 'toolResults', 'injected', 'summary', 'other'] },
]

function fmt(text, params) {
  return String(text).replace(/\{(\w+)\}/g, (_, k) => (params && params[k] !== undefined ? String(params[k]) : `{${k}}`))
}
function fmtK(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  if (a < 1000) return String(Math.round(n))
  if (a < 1e6) return `${(n / 1000).toFixed(a < 10000 ? 2 : 1).replace(/\.?0+$/, '')}k`
  return `${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`
}
function fmtInt(n) {
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n).toLocaleString() : '—'
}
function pct(part, whole, digits = 1) {
  if (!whole || !Number.isFinite(part)) return '—'
  return `${(part / whole * 100).toFixed(digits)}%`
}
function fmtTime(t) {
  if (!t) return ''
  const d = new Date(t)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

async function call(route, body) {
  const res = await fetch(`api/context-lens/${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body || {}),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const payload = await res.json()
  if (!payload || payload.ok !== true) throw new Error(payload?.error?.message || 'request failed')
  return payload.value
}

/** Category totals plus the derived buffer / free figures for one breakdown. */
function summarize(data) {
  const byCat = {}
  for (const c of data?.categories || []) byCat[c.key] = c
  const used = data?.measured?.totalTokens ?? 0
  const win = data?.contextWindow ?? 0
  const comp = data?.compaction
  const buffer = comp && comp.auto && typeof comp.bufferTokens === 'number' ? comp.bufferTokens : 0
  const free = win ? Math.max(0, win - used - buffer) : 0
  const groups = GROUPS.map((g) => ({
    ...g,
    tokens: g.cats.reduce((s, k) => s + (byCat[k]?.tokens || 0), 0),
  }))
  return { byCat, used, win, buffer, free, groups, comp }
}
