/**
 * Host half of dsh-context-monitor.
 *
 * Serves read-only context breakdowns for a live session on exact routes
 * of the shared (owner-authenticated) connection:
 *
 *   POST /api/context-lens/breakdown  { sessionId }      -> full per-category / per-node breakdown
 *   POST /api/context-lens/node       { sessionId, seq } -> one surface node's model-visible content
 *   POST /api/context-lens/flow       { sessionId }      -> lifecycle stages, steps, live state
 *   POST /api/context-lens/sources    { sessionId }      -> memory files, skills, runtime context, file structure
 *   POST /api/context-lens/skill      { sessionId, name } -> one skill's full instructions
 *   POST /api/context-lens/tool       { sessionId, name } -> one tool's full description and parameters
 *   POST /api/context-lens/sessions   {}                 -> live sessions the Host currently holds
 *   POST /api/context-lens/analyze-*  {...}              -> an on-demand, session-independent model analysis of the context (manual start only)
 *
 * Numbers come from the `tokenMeter` service (the same measurement compaction
 * uses). Per-node tokens are split into categories by event type and message
 * source; tool definitions are priced with the same character heuristic and the
 * whole set is calibrated so the categories sum to the meter's total (which is
 * anchored to provider-reported usage when available).
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const name = 'dsh-context-monitor'
export const inject = ['sessions', 'tokenMeter']

const BASE = '/api/context-lens'
const PREVIEW = 160
const NODE_TEXT_CAP = 120000
const MAX_NODES = 6000

const CJK = /[ᄀ-ᇿ⺀-鿿ꥠ-꥿가-힯豈-﫿︰-﹏＀-￯]/g

function safe(fn, fallback) {
  try {
    const value = fn()
    return value === undefined ? fallback : value
  } catch {
    return fallback
  }
}

/** Character heuristic: one token per CJK character, four characters per token otherwise. */
function estText(text) {
  if (!text) return 0
  const s = String(text)
  const cjk = (s.match(CJK) || []).length
  return Math.ceil(cjk + (s.length - cjk) / 4)
}

function json(value) {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value) ?? ''
  } catch {
    return ''
  }
}

function errorText(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 2000)
  return String(error).slice(0, 2000)
}

function oneLine(text, cap = PREVIEW) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  return s.length > cap ? `${s.slice(0, cap - 1)}…` : s
}

function partName(part) {
  return part?.name ?? part?.toolName ?? undefined
}

function partArgs(part) {
  const value = part?.arguments ?? part?.input ?? part?.args
  return value === undefined ? '' : json(value)
}

function partId(part) {
  return part?.id ?? part?.callId ?? part?.toolCallId ?? undefined
}

/** Model-visible text of one content part (images and files contribute their textual stand-in only). */
function partText(part) {
  if (!part || typeof part !== 'object') return ''
  switch (part.type) {
    case 'text':
    case 'reasoning':
      return part.text ?? ''
    case 'tool-call':
      return `${partName(part) ?? ''} ${partArgs(part)}`
    case 'image':
    case 'file':
      return part.text ?? part.alt ?? ''
    default:
      return typeof part.text === 'string' ? part.text : json(part)
  }
}

function contentParts(message) {
  const content = message?.content
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  return Array.isArray(content) ? content : []
}

function messageText(message) {
  return contentParts(message).map(partText).join('\n')
}

function mcpServer(toolName) {
  const m = /^mcp__(.+?)__(.+)$/.exec(toolName)
  return m ? m[1] : undefined
}

/** Category of a whole surface node (assistant nodes are split further by part). */
// ------------------------------------------------------------------ shell commands
// A shell call is not like the other tools: it runs a program that can fail, take long,
// or keep running in the background. These turn the call / job / result events into one
// record per command.
const SHELL_TOOL = /^(bash|shell|sh|zsh|exec|exec_command|run_command|run_shell|terminal|powershell)$/i
const SHELL_JOB = /^(bash|shell|sh|zsh|exec|terminal|powershell)$/i
const SLOW_MS = 10000
const NOT_PROGRAMS = new Set(['cd', 'export', 'set', 'unset', 'source', '.', 'then', 'do', 'done', 'fi', 'else', 'elif', 'if', 'for', 'while', 'until', 'case', 'esac', 'in', 'function', 'local', 'return', 'exit', 'true', 'false', ':', 'test', '[', '[['])
const WRAPPERS = new Set(['sudo', 'env', 'time', 'nohup', 'xargs', 'exec', 'command', 'builtin', 'nice', 'timeout', 'caffeinate'])

function parseArgs(value) {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string') return {}
  try { const v = JSON.parse(value); return v && typeof v === 'object' ? v : {} } catch { return { command: value } }
}

/** Split a command line into simple commands at |, ||, &&, ;, & and newlines, outside quotes. */
function shellSegments(command) {
  const out = []
  let cur = ''
  let quote = null
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (quote) {
      cur += ch
      if (ch === '\\' && quote === '"' && i + 1 < command.length) cur += command[++i]
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '\\' && i + 1 < command.length) { cur += ch + command[++i]; continue }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue }
    if (ch === '|' || ch === ';' || ch === '\n' || ch === '&' || ch === '(' || ch === ')' || ch === '`') {
      // keep redirections like 2>&1 / &> inside the current segment
      if (ch === '&' && (command[i - 1] === '>' || command[i + 1] === '>')) { cur += ch; continue }
      out.push(cur); cur = ''
      continue
    }
    if (ch === '$' && command[i + 1] === '(') { out.push(cur); cur = ''; i++; continue }
    cur += ch
  }
  out.push(cur)
  return out.map((x) => x.trim()).filter(Boolean)
}

/** Drop heredoc bodies (<<EOF … EOF, <<-EOF, <<'EOF') so their lines are not read as
 *  shell commands; the operator line stays, so its program (python3, cat …) still counts. */
function stripHeredocs(command) {
  const lines = String(command || '').split('\n')
  const out = []
  const pending = []
  const OP = /(?<!<)<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/g
  for (const line of lines) {
    if (pending.length) {
      const { word, dash } = pending[0]
      if ((dash ? line.replace(/^\t+/, '') : line).trim() === word) pending.shift()
      continue
    }
    out.push(line)
    OP.lastIndex = 0
    let m
    while ((m = OP.exec(line))) pending.push({ word: m[3], dash: m[1] === '-' })
  }
  return out.join('\n')
}

/** The programs a command line runs, in order (cd, assignments and shell keywords left out). */
function shellPrograms(command) {
  const found = []
  const vars = new Map()
  for (const seg of shellSegments(stripHeredocs(String(command || '')))) {
    const words = seg.match(/"[^"]*"|'[^']*'|\S+/g) || []
    let i = 0
    while (i < words.length) {
      let w = words[i].replace(/^["']|["']$/g, '')
      const assign = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(w)
      if (assign) { vars.set(assign[1], assign[2].replace(/^["']|["']$/g, '')); i++; continue }
      if (/^[{!]$/.test(w) || /^\d*[<>]/.test(w)) { i++; continue }
      if (WRAPPERS.has(w)) {
        i++
        while (i < words.length && (/^-/.test(words[i]) || (w === 'timeout' && /^\d/.test(words[i])))) i++
        continue
      }
      // a leading $VAR / ${VAR} stands for an assignment made earlier (PY=…; $PY - <<EOF)
      w = w.replace(/^\$\{([A-Za-z_]\w*)\}|^\$([A-Za-z_]\w*)/, (m, a, b) => vars.get(a || b) ?? m)
      const name = w.split('/').pop()
      if (name && !NOT_PROGRAMS.has(name) && /^[\w.+-]+$/.test(name)) found.push(name)
      break
    }
  }
  return found
}

function exitCodeOf(...texts) {
  for (const text of texts) {
    const m = /exit code:?\s*(-?\d+)/i.exec(String(text || ''))
    if (m) return Number(m[1])
  }
  return undefined
}

/** One record per shell call, from the event log (so commands compacted out of context still count). */
function shellCommands(events, callSeqOf, inContext) {
  const byCall = new Map()
  const jobs = new Map()
  const order = []
  const get = (id) => {
    let c = byCall.get(id)
    if (!c) { byCall.set(id, c = { id }); order.push(c) }
    return c
  }
  for (const e of events) {
    const d = e?.data || {}
    switch (e?.type) {
      case 'tool/call': {
        if (!SHELL_TOOL.test(String(d.name || ''))) break
        const c = get(d.callId ?? `seq-${e.seq}`)
        const a = parseArgs(d.arguments)
        c.tool = d.name
        c.command = String(a.command ?? a.cmd ?? a.script ?? (Array.isArray(a.argv) ? a.argv.join(' ') : '') ?? '')
        c.description = a.description ? oneLine(a.description, 200) : undefined
        c.cwd = a.cwd ?? a.workdir ?? undefined
        c.requestedBackground = a.run_in_background === true || a.background === true || a.runInBackground === true
        c.time = e.time
        c.turn = d.turn
        c.step = d.step
        c.toolCallEventSeq = e.seq
        break
      }
      case 'job/registered':
      case 'job/settled': {
        const id = d.toolCall?.callId ?? d.toolCall?.rootCallId
        if (id === undefined) break
        const c = byCall.get(id)
        if (!c && !SHELL_JOB.test(String(d.kind || ''))) break
        const x = c || get(id)
        if (!x.command) x.command = String(d.label || '')
        x.jobId = d.jobId
        x.jobKind = d.kind
        if (typeof d.startedAt === 'number') x.startedAt = d.startedAt
        if (e.type === 'job/registered') { x.jobSeq = e.seq; x.jobStatus = 'running' }
        else {
          x.settledSeq = e.seq
          x.jobStatus = d.status ?? 'settled'
          if (typeof d.finishedAt === 'number') x.finishedAt = d.finishedAt
          x.detail = d.detail !== undefined ? oneLine(typeof d.detail === 'string' ? d.detail : json(d.detail), 200) : undefined
          x.cause = d.cause
        }
        jobs.set(d.jobId, x)
        break
      }
      case 'tool/result': {
        const m = d.message || {}
        const id = m.toolCallId ?? m.source?.callId
        const c = id !== undefined ? byCall.get(id) : undefined
        if (!c) break
        const text = messageText(m)
        c.resultSeq = e.seq
        c.resultTime = e.time
        c.isError = !!m.isError
        c.output = oneLine(text, 220)
        c.outputChars = text.length
        c.resultExit = exitCodeOf(text.slice(-400), text.slice(0, 200))
        break
      }
    }
  }
  const out = []
  for (const c of order) {
    if (c.tool === undefined && c.jobKind === undefined) continue
    const exitCode = exitCodeOf(c.detail) ?? c.resultExit
    const running = c.jobStatus === 'running' || (c.jobStatus === undefined && c.resultSeq === undefined)
    // a job still running after its result came back, or asked for, ran in the background
    const background = c.requestedBackground || (c.jobSeq !== undefined && c.resultSeq !== undefined && (c.settledSeq === undefined || c.settledSeq > c.resultSeq))
    const end = c.finishedAt ?? (background ? undefined : c.resultTime)
    const start = c.startedAt ?? c.time
    const durationMs = typeof end === 'number' && typeof start === 'number' ? Math.max(0, end - start) : undefined
    const badStatus = c.jobStatus && !/^(running|completed|succeeded|success|ok|done|settled)$/i.test(c.jobStatus)
    const status = running ? 'running'
      : (c.isError || badStatus || (exitCode !== undefined && exitCode !== 0)) ? 'failed'
      : 'ok'
    out.push({
      id: c.id,
      tool: c.tool ?? c.jobKind,
      command: c.command || '',
      description: c.description,
      cwd: c.cwd,
      programs: shellPrograms(c.command),
      time: c.time ?? c.startedAt,
      turn: c.turn,
      step: c.step,
      callSeq: callSeqOf.get(c.id),
      resultSeq: c.resultSeq,
      inContext: inContext.has(c.id),
      job: c.jobId !== undefined ? { id: c.jobId, kind: c.jobKind, status: c.jobStatus, detail: c.detail, cause: c.cause } : undefined,
      inline: c.jobId === undefined,
      background,
      durationMs,
      exitCode,
      isError: !!c.isError,
      status,
      slow: durationMs !== undefined && durationMs >= SLOW_MS,
      output: c.output,
      outputChars: c.outputChars,
    })
  }
  return out
}

function classify(event, message) {
  const type = event?.type
  if (type === 'system/message') return 'system'
  if (type === 'tool/result') return 'toolResults'
  if (type === 'assistant/message') return 'assistant'
  const role = message?.role
  const source = message?.source?.kind
  if (type === 'user/message' || role === 'user') {
    if (source === undefined || source === 'user') return 'user'
    if (source === 'skill-catalog') return 'skills'
    if (source === 'compact-checkpoint') return 'summary'
    if (source === 'agent-instructions') return 'memory'
    return 'injected'
  }
  if (role === 'assistant') return 'assistant'
  if (role === 'tool') return 'toolResults'
  if (role === 'system') return 'system'
  return 'other'
}

const ASSISTANT_PART = { reasoning: 'reasoning', text: 'assistantText', 'tool-call': 'toolCalls' }

/** Provider usage reported by one assistant settlement or attempt (same rule as dsh-token-meter). */
function usageOf(event) {
  if (event?.type !== 'assistant/message' && event?.type !== 'assistant/attempt') return undefined
  if (event.data?.usage) return event.data.usage
  const stream = event.data?.stream
  if (!Array.isArray(stream)) return undefined
  for (let i = stream.length - 1; i >= 0; i--) {
    const item = stream[i]
    if (item?.chunk?.type === 'usage' && item.chunk.usage) return item.chunk.usage
    if (item?.type === 'usage' && item.usage) return item.usage
  }
  return undefined
}

/** "75%" | 0.75 | 750000 -> ratio of `window`. */
function ratioOf(value, window, fallback) {
  if (typeof value === 'string' && /%$/.test(value.trim())) {
    const n = Number.parseFloat(value)
    return Number.isFinite(n) ? n / 100 : fallback
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 0 && value <= 1) return value
    if (value > 1 && window) return value / window
  }
  return fallback
}

export function apply(ctx) {
  const skillsRef = { current: undefined }
  const agentsRef = { current: undefined }
  /** The session's agent: the scope whose preset layers hold its skills. */
  const agentOf = (session) => safe(() => agentsRef.current?.get(session.id))
  const cache = new Map()

  const getSession = (id) => {
    if (typeof id !== 'string' || id === '') return undefined
    return safe(() => ctx.sessions.get(id))
  }
  /**
   * A session the Host has not resumed yet (fresh Host start, e.g. DSH NEXT, with this tab
   * opened before the conversation) is not in ctx.sessions. Ask the session controller to
   * resolve-or-resume it — the same path other Host APIs use — then read it again.
   */
  const resuming = new Map()
  const resumeErrors = new Map()
  const getLiveSession = async (id) => {
    const live = getSession(id)
    if (live || typeof id !== 'string' || id === '') return live
    let controller
    try { controller = ctx.get('sessionController') } catch (e) { resumeErrors.set(id, 'sessionController: ' + (e && e.message || e)); return undefined }
    if (!controller || typeof controller.resolveAgent !== 'function') { resumeErrors.set(id, 'sessionController unavailable'); return undefined }
    let p = resuming.get(id)
    if (!p) {
      p = Promise.resolve()
        .then(() => controller.resolveAgent(id))
        .catch((e) => { resumeErrors.set(id, (e && (e.code ? e.code + ': ' : '') + (e.message || e)) || 'resume failed'); return undefined })
        .finally(() => resuming.delete(id))
      resuming.set(id, p)
    }
    const r = await p
    // the controller returns the Agent itself; the inner registry returns { agent } / { error }
    const agent = r && (r.agent || (r.session ? r : undefined))
    if (r && r.error) resumeErrors.set(id, String(r.error.message || r.error))
    return (agent && agent.session) || getSession(id)
  }
  const unavailable = (sessionId) => {
    const why = resumeErrors.get(sessionId) || ''
    // two dsh hosts on one profile (e.g. the web app on :3080 and DSH NEXT) share ~/.dsh/sessions;
    // only one process may own a session's log, so the other cannot open it
    if (/active write handle|already owned/i.test(why)) {
      return fail('session-busy', '这个会话正被另一个 dsh 进程占用（例如同一 profile 的网页版 dsh 或另一个客户端），在那边关闭该会话或退出那个进程后再看。 / This session is open in another dsh process on the same profile; close it there to view it here.')
    }
    return fail('session-unavailable', `session "${sessionId}" is not loaded on the Host` + (why ? ` (resume: ${why})` : ''))
  }

  const sessionTitle = (events) => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i]?.type === 'session/title') return events[i].data?.title
    }
    return undefined
  }

  /** Active fibers whose module or runtime matches, with their live config. */
  const activeFibers = (test) => {
    const out = []
    const registry = safe(() => ctx.root.registry)
    if (!registry || typeof registry.values !== 'function') return out
    for (const runtime of registry.values()) {
      for (const fiber of safe(() => runtime.fibers, []) || []) {
        if (fiber.state !== 2) continue
        const moduleName = String(safe(() => fiber.entry?.options?.name, '') || '')
        const runtimeName = String(safe(() => runtime.name, '') || '')
        if (!test(moduleName, runtimeName)) continue
        out.push({ fiber, config: safe(() => fiber.config) ?? safe(() => fiber.entry.options.config) ?? {} })
      }
    }
    return out
  }

  /**
   * The compaction engine that owns this Host. compaction-basic wins when an
   * active auto instance exists; otherwise billion-context (which disables
   * stock compaction and folds at request time) is reported with its policy.
   */
  const compactionEngine = (provider, model, contextWindow, reserve) => {
    const basic = compactionPolicy(provider, model)
    if (basic && basic.auto) return { engine: 'compaction-basic', ...basic }
    const bili = activeFibers((m, r) => m === 'billion-context' || r === 'bili-native')
    if (bili.length) {
      const compress = bili[0].config?.compress || {}
      const nudge = ratioOf(compress.maxContextLimit, contextWindow, 0.75)
      const emergency = ratioOf(compress.emergencyThresholdPercent, contextWindow, 0.95)
      return {
        engine: 'billion-context',
        instances: bili.length,
        auto: true,
        thresholdRatio: nudge,
        emergencyRatio: emergency,
        defaults: compress.maxContextLimit === undefined,
      }
    }
    return basic ? { engine: 'compaction-basic', ...basic } : undefined
  }

  /** Live compaction-basic policy (first active instance), merged with its exact provider/model override. */
  const compactionPolicy = (provider, model) => {
    const found = activeFibers((m, r) => m === '@deepseek-ai/dsh-compaction-basic' || /compaction-basic/.test(r))
    if (!found.length) return undefined
    const instances = found.length
    const config = found[0].config
    let override
    if (Array.isArray(config.modelPolicies)) {
      override = config.modelPolicies.find((p) => p && p.provider === provider && p.model === model)
    }
    const merged = { ...config, ...(override || {}) }
    return {
      instances,
      auto: merged.auto !== false,
      thresholdRatio: typeof merged.thresholdRatio === 'number' ? merged.thresholdRatio : 0.8,
      headroomTokens: typeof merged.headroomTokens === 'number' ? merged.headroomTokens : 65536,
      retainRatio: typeof merged.retainTokens === 'number' ? undefined : (typeof merged.retainRatio === 'number' ? merged.retainRatio : 0.16),
      retainTokens: typeof merged.retainTokens === 'number' ? merged.retainTokens : undefined,
      summaryMaxTokens: typeof merged.maxTokens === 'number' ? merged.maxTokens : undefined,
      override: override ? { provider: override.provider, model: override.model } : undefined,
    }
  }

  const breakdown = (session) => {
    const key = session.id
    const revision = session.seq
    const cached = cache.get(key)
    if (cached && cached.revision === revision) return cached.value

    const events = session.snapshotEvents()
    const bySeq = new Map()
    const turnOf = new Map()
    const typeCounts = {}
    const compactions = []
    let sample
    let turn = 0
    for (const event of events) {
      bySeq.set(event.seq, event)
      typeCounts[event.type] = (typeCounts[event.type] || 0) + 1
      if (event.type === 'turn/start' && typeof event.data?.turn === 'number') turn = event.data.turn
      const own = event.data?.turn
      turnOf.set(event.seq, typeof own === 'number' ? own : turn)
      if (/compact/i.test(event.type)) compactions.push({ seq: event.seq, time: event.time, type: event.type })
      const usage = usageOf(event)
      if (usage && typeof usage.inputTokens === 'number') sample = { seq: event.seq, time: event.time, usage }
    }

    const measurement = ctx.tokenMeter.measure(session)
    const header = safe(() => session.requestHeader())
    const route = safe(() => session.requestContext())
    const provider = route?.provider ?? header?.config?.provider
    const model = route?.model ?? header?.config?.model
    const contextWindow = route?.contextWindow
    const maxTokens = header?.config?.maxTokens

    // ------------------------------------------------------------- tools
    const tools = []
    const deferred = []
    for (const tool of header?.tools || []) {
      const server = mcpServer(tool.name)
      const kind = server ? 'mcp' : 'system'
      if (tool.deferLoading === true) {
        // not sent until loaded, but sized the same way so the popover can show what loading them would cost
        const tokens = estText(tool.name) + estText(tool.description) + estText(json(tool.parameters)) + 8
        deferred.push({ name: tool.name, kind, server, tokens, description: oneLine(tool.description, 240) })
        continue
      }
      const tokens = estText(tool.name) + estText(tool.description) + estText(json(tool.parameters)) + 8
      tools.push({
        name: tool.name,
        kind,
        server,
        tokens,
        description: oneLine(tool.description, 240),
        params: Object.keys(tool.parameters?.properties || {}).length,
      })
    }

    // ------------------------------------------------------------- surface nodes
    const raw = { system: 0, systemTools: 0, mcpTools: 0, skills: 0, memory: 0, injected: 0, summary: 0, user: 0, assistantText: 0, reasoning: 0, toolCalls: 0, toolResults: 0, other: 0 }
    const counts = Object.fromEntries(Object.keys(raw).map((k) => [k, 0]))
    for (const tool of tools) {
      raw[tool.kind === 'mcp' ? 'mcpTools' : 'systemTools'] += tool.tokens
      counts[tool.kind === 'mcp' ? 'mcpTools' : 'systemTools']++
    }

    const callNames = new Map()
    const toolStats = new Map()
    const stat = (name) => {
      let s = toolStats.get(name)
      if (!s) toolStats.set(name, s = { name, calls: 0, callTokens: 0, results: 0, resultTokens: 0, maxResult: 0 })
      return s
    }

    const nodes = []
    // every tool call paired with its result by call id: the call lives in an assistant
    // node, the result in a later tool node, and both views need the other half
    const invocations = []
    const invById = new Map()
    let systemSections = []
    let skillEntries = []
    const injectedKinds = {}
    const memoryFiles = new Map()
    const surface = measurement.nodes.slice(-MAX_NODES)
    for (const node of surface) {
      const event = bySeq.get(node.seq)
      const message = event ? (safe(() => session.deriveEventMessage(event)) ?? event.data?.message ?? event.data) : undefined
      const category = classify(event, message)
      const tokens = node.tokens
      const record = {
        seq: node.seq,
        type: event?.type ?? '?',
        time: event?.time,
        turn: turnOf.get(node.seq),
        role: message?.role,
        source: message?.source?.kind,
        category,
        tokens,
        heuristic: node.heuristicTokens,
      }

      if (category === 'assistant') {
        const parts = contentParts(message)
        const split = { reasoning: 0, assistantText: 0, toolCalls: 0 }
        const calls = []
        for (const part of parts) {
          const cat = ASSISTANT_PART[part.type] ?? 'assistantText'
          const est = estText(partText(part))
          split[cat] += est
          if (part.type === 'tool-call') {
            const nameOf = partName(part) ?? '?'
            const id = partId(part)
            if (id !== undefined) callNames.set(id, nameOf)
            calls.push({ name: nameOf, est, id, args: oneLine(partArgs(part), 200) })
          }
        }
        const sum = split.reasoning + split.assistantText + split.toolCalls
        const scale = sum > 0 ? tokens / sum : 0
        const alloc = {}
        for (const [cat, est] of Object.entries(split)) {
          const v = sum > 0 ? est * scale : (cat === 'assistantText' ? tokens : 0)
          alloc[cat] = v
          raw[cat] += v
        }
        if (alloc.reasoning > 0) counts.reasoning++
        if (alloc.assistantText > 0) counts.assistantText++
        if (calls.length) counts.toolCalls += calls.length
        for (const call of calls) {
          const s = stat(call.name)
          s.calls++
          s.callTokens += sum > 0 ? call.est * scale : 0
        }
        for (const call of calls) {
          const inv = { id: call.id, name: call.name, callSeq: node.seq, time: event?.time, turn: turnOf.get(node.seq), args: call.args, callTokens: sum > 0 ? call.est * scale : 0 }
          invocations.push(inv)
          if (call.id !== undefined) invById.set(call.id, inv)
        }
        record.calls = calls.map((c) => ({ id: c.id, name: c.name }))
        record.split = alloc
        record.category = alloc.toolCalls >= Math.max(alloc.reasoning, alloc.assistantText) && alloc.toolCalls > 0
          ? 'toolCalls'
          : alloc.reasoning > alloc.assistantText ? 'reasoning' : 'assistantText'
        record.tools = calls.map((c) => c.name)
        const textPart = parts.find((p) => p.type === 'text' && p.text)
        const reasonPart = parts.find((p) => p.type === 'reasoning' && p.text)
        // the row header already lists the tool names, so preview the words
        record.preview = oneLine(textPart?.text || reasonPart?.text || calls.map((c) => c.name).join(', '))
      } else {
        raw[category] += tokens
        counts[category]++
        const text = messageText(message)
        record.chars = text.length
        record.preview = oneLine(text)
        if (category === 'toolResults') {
          const callId = message?.toolCallId ?? message?.source?.callId
          const toolName = callNames.get(callId) ?? safe(() => bySeq.get(node.seq - 1)?.data?.name) ?? '?'
          record.tool = toolName
          record.callId = callId
          let inv = callId !== undefined ? invById.get(callId) : undefined
          if (!inv) invocations.push(inv = { id: callId, name: toolName, callSeq: undefined, time: event?.time, turn: turnOf.get(node.seq), args: '', callTokens: 0 })
          inv.resultSeq = node.seq
          inv.resultTokens = tokens
          inv.resultPreview = record.preview
          inv.isError = !!message?.isError
          if (inv.callSeq !== undefined) record.callSeq = inv.callSeq
          const s = stat(toolName)
          s.results++
          s.resultTokens += tokens
          s.maxResult = Math.max(s.maxResult, tokens)
        } else if (category === 'system') {
          const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim())
          const ests = paragraphs.map(estText)
          const total = ests.reduce((a, b) => a + b, 0) || 1
          systemSections = paragraphs.map((p, i) => ({
            index: i,
            tokens: Math.round(tokens * ests[i] / total),
            chars: p.length,
            title: oneLine(p, 90),
            text: p.length > 6000 ? `${p.slice(0, 6000)}…` : p,
          }))
        } else if (category === 'skills') {
          const entries = Array.isArray(message?.source?.entries) ? message.source.entries : []
          const ests = entries.map((e) => estText(e?.name) + estText(e?.description) + 6)
          const total = ests.reduce((a, b) => a + b, 0) || 1
          skillEntries = entries.map((e, i) => ({
            name: String(e?.name ?? '?'),
            description: oneLine(e?.description, 300),
            tokens: Math.round(tokens * ests[i] / total),
          }))
        } else if (category === 'memory') {
          // one agent-instructions message can carry several files; share its tokens by section size
          const secs = instructionSections(text).filter((x) => x.kind !== 'remove')
          const ests = secs.map((x) => estText(x.content) || 1)
          const sum = ests.reduce((a, b) => a + b, 0) || 1
          if (!secs.length) secs.push({ displayPath: 'agent-instructions' }), ests.push(sum)
          secs.forEach((x, i) => {
            const f = memoryFiles.get(x.displayPath) || { path: x.displayPath, tokens: 0, loads: 0 }
            f.tokens += tokens * ests[i] / sum
            f.loads++
            f.lastSeq = node.seq
            memoryFiles.set(x.displayPath, f)
          })
        } else if (category === 'injected') {
          const k = record.source ?? 'unknown'
          const agg = injectedKinds[k] || (injectedKinds[k] = { kind: k, count: 0, tokens: 0 })
          agg.count++
          agg.tokens += tokens
        }
      }
      nodes.push(record)
    }

    // ------------------------------------------------------------- calibration
    // "used" = what the next request will actually occupy. The meter is exact
    // when it could anchor to provider usage; when it could not (a plugin such
    // as billion-context rewrote the request, so the envelopes differ) we use
    // the last provider-reported prompt plus everything added to the surface
    // since, which is what the contextPressure projection publishes.
    const rawSum = Object.values(raw).reduce((a, b) => a + b, 0)
    const rawTotal = measurement.totalTokens
    let anchored
    if (sample && !compactions.some((c) => c.seq > sample.seq)) {
      const u = sample.usage
      const prompt = u.inputTokens + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0)
      let added = 0
      for (const node of measurement.nodes) if (node.seq >= sample.seq) added += node.tokens
      anchored = prompt + added
    }
    let usedSource = 'estimate'
    let total = rawTotal
    if (measurement.baseline?.kind === 'usage') usedSource = 'meter-usage'
    else if (anchored !== undefined) {
      usedSource = 'last-request'
      total = anchored
    }
    const factor = rawSum > 0 && total > 0 ? total / rawSum : 1
    const cal = (v) => Math.round(v * factor)

    // shell commands: the call's assistant message, wherever it is (in context or not)
    const callSeqOf = new Map()
    for (const e of events) {
      if (e?.type !== 'assistant/message') continue
      for (const part of contentParts(e.data?.message)) if (part?.type === 'tool-call') { const id = partId(part); if (id !== undefined) callSeqOf.set(id, e.seq) }
    }
    const inContext = new Set([...invById.keys()].filter((id) => invById.get(id)?.resultSeq !== undefined || invById.get(id)?.callSeq !== undefined))
    const shell = safe(() => shellCommands(events, callSeqOf, inContext), []) || []

    const categories = Object.keys(raw).map((k) => ({ key: k, tokens: cal(raw[k]), raw: Math.round(raw[k]), count: counts[k] }))

    let cumulative = 0
    for (const n of nodes) {
      n.tokensCal = cal(n.tokens)
      cumulative += n.tokensCal
      n.cumulative = cumulative
    }
    const toolBase = categories.find((c) => c.key === 'systemTools').tokens + categories.find((c) => c.key === 'mcpTools').tokens
    for (const t of tools) t.tokensCal = cal(t.tokens)
    for (const s of systemSections) s.tokensCal = cal(s.tokens)
    for (const s of skillEntries) s.tokensCal = cal(s.tokens)

    const turns = new Map()
    for (const n of nodes) {
      const t = n.turn ?? 0
      let agg = turns.get(t)
      if (!agg) turns.set(t, agg = { turn: t, tokens: 0, nodes: 0, start: n.time, end: n.time })
      agg.tokens += n.tokensCal
      agg.nodes++
      if (n.time !== undefined) {
        agg.start = Math.min(agg.start ?? n.time, n.time)
        agg.end = Math.max(agg.end ?? n.time, n.time)
      }
    }

    // ------------------------------------------------------------- compaction
    const reserve = typeof maxTokens === 'number' ? maxTokens : 0
    const policy = compactionEngine(provider, model, contextWindow, reserve)
    let compaction
    if (policy && typeof contextWindow === 'number' && contextWindow > 0) {
      let threshold = policy.engine === 'compaction-basic'
        ? Math.floor(Math.min(contextWindow * policy.thresholdRatio, contextWindow - reserve - policy.headroomTokens))
        : Math.floor(contextWindow * policy.thresholdRatio)
      if (!(threshold > 0)) threshold = Math.floor(contextWindow * policy.thresholdRatio)
      compaction = {
        ...policy,
        thresholdTokens: threshold,
        bufferTokens: contextWindow - threshold,
        remainingTokens: Math.max(0, threshold - total),
        emergencyTokens: policy.emergencyRatio ? Math.floor(contextWindow * policy.emergencyRatio) : undefined,
        retainBudget: policy.engine === 'compaction-basic' ? (policy.retainTokens ?? Math.floor(contextWindow * (policy.retainRatio ?? 0))) : undefined,
      }
    } else if (policy) {
      compaction = { ...policy }
    }

    const baseline = measurement.baseline
    const value = {
      version: 1,
      generatedAt: Date.now(),
      sessionId: session.id,
      title: sessionTitle(events),
      cwd: safe(() => session.header?.cwd),
      agentPreset: safe(() => session.header?.agentPreset),
      logRevision: measurement.logRevision,
      eventCount: events.length,
      provider,
      model,
      reasoningEffort: header?.config?.reasoningEffort,
      contextWindow,
      maxTokens,
      measured: {
        totalTokens: total,
        usedSource,
        rawTotalTokens: rawTotal,
        anchoredTokens: anchored,
        lastRequest: sample ? { seq: sample.seq, time: sample.time, ...sample.usage } : undefined,
        surfaceTokens: measurement.surfaceTokens,
        surfaceDeltaTokens: measurement.surfaceDeltaTokens,
        baselineKind: baseline?.kind,
        baselineTokens: baseline?.tokens,
        usage: baseline?.kind === 'usage' ? baseline.usage : undefined,
        estimatedSum: Math.round(rawSum),
        factor,
      },
      compaction,
      categories,
      toolsTokens: toolBase,
      tools: tools.sort((a, b) => b.tokens - a.tokens),
      deferred: deferred.map((d) => ({ ...d, tokens: cal(d.tokens) })).sort((a, b) => b.tokens - a.tokens),
      memoryFiles: [...memoryFiles.values()].map((f) => ({ ...f, tokens: cal(f.tokens) })).sort((a, b) => b.tokens - a.tokens),
      systemSections,
      skills: skillEntries.sort((a, b) => b.tokens - a.tokens),
      injectedKinds: Object.values(injectedKinds).map((k) => ({ ...k, tokens: cal(k.tokens) })).sort((a, b) => b.tokens - a.tokens),
      invocations: invocations.map((x) => ({ ...x, callTokens: cal(x.callTokens), resultTokens: x.resultTokens !== undefined ? cal(x.resultTokens) : undefined })),
      shellTools: [...new Set(shell.map((c) => c.tool).filter(Boolean))],
      commands: shell.map(({ tool, ...c }) => c),
      slowMs: SLOW_MS,
      toolStats: [...toolStats.values()].map((s) => ({
        ...s,
        callTokens: cal(s.callTokens),
        resultTokens: cal(s.resultTokens),
        maxResult: cal(s.maxResult),
      })).sort((a, b) => (b.callTokens + b.resultTokens) - (a.callTokens + a.resultTokens)),
      turns: [...turns.values()].sort((a, b) => a.turn - b.turn),
      compactionEvents: compactions.slice(-200),
      typeCounts,
      nodes,
      nodesTruncated: measurement.nodes.length > surface.length ? measurement.nodes.length - surface.length : 0,
    }
    cache.set(key, { revision, value })
    if (cache.size > 16) cache.delete(cache.keys().next().value)
    return value
  }

  const nodeDetail = (session, seq) => {
    const event = safe(() => session.eventAt(seq))
    if (!event) return undefined
    const message = safe(() => session.deriveEventMessage(event)) ?? event.data?.message ?? event.data
    let budget = NODE_TEXT_CAP
    const parts = contentParts(message).map((part) => {
      const rawArgs = part?.arguments ?? part?.input ?? part?.args
      const text = part?.type === 'tool-call' ? (typeof rawArgs === 'string' ? rawArgs : partArgs(part)) : partText(part)
      const take = text.slice(0, Math.max(0, budget))
      budget -= take.length
      return {
        type: part.type,
        name: partName(part),
        callId: part?.type === 'tool-call' ? partId(part) : undefined,
        chars: text.length,
        tokensEst: estText(text),
        text: take,
        truncated: take.length < text.length,
      }
    })
    const callIds = new Set(parts.filter((p) => p.callId !== undefined).map((p) => p.callId))
    let call
    if (callIds.size || message?.toolCallId !== undefined) {
      const events = session.snapshotEvents()
      const at = events.findIndex((e) => e.seq === seq)
      if (callIds.size) {
        for (let i = at + 1; i < events.length && callIds.size; i++) {
          const e = events[i]
          const id = e.type === 'tool/result' ? e.data?.message?.toolCallId : undefined
          if (id === undefined || !callIds.has(id)) continue
          for (const p of parts) if (p.callId === id) { p.resultSeq = e.seq; p.resultError = !!e.data?.message?.isError }
          callIds.delete(id)
        }
      }
      if (message?.toolCallId !== undefined) {
        for (let i = at - 1; i >= 0 && !call; i--) {
          const e = events[i]
          if (e.type !== 'assistant/message') continue
          const p = contentParts(e.data?.message).find((x) => x?.type === 'tool-call' && partId(x) === message.toolCallId)
          if (!p) continue
          const raw = p.arguments ?? p.input ?? p.args
          const text = typeof raw === 'string' ? raw : partArgs(p)
          call = { seq: e.seq, time: e.time, name: partName(p), chars: text.length, tokensEst: estText(text), text: text.slice(0, 20000), truncated: text.length > 20000 }
        }
      }
    }
    return {
      seq,
      type: event.type,
      time: event.time,
      call,
      role: message?.role,
      source: message?.source ? JSON.parse(json({ ...message.source, entries: undefined, sections: undefined })) : undefined,
      toolCallId: message?.toolCallId,
      parts,
    }
  }

  // ---------------------------------------------------------------- sources
  /**
   * Where injected context comes from: workspace instruction files ("memory",
   * AGENTS.md / CLAUDE.md via dsh-agent-instructions), the skill registry and
   * catalog, skills actually loaded, and the runtime-context sections.
   */
  const INSTRUCTION_HEAD = /^(Instructions from|Additional instructions from|Updated instructions from|Instructions removed): (.+)$/gm
  const INSTRUCTION_CANDIDATES = ['AGENTS.md', 'CLAUDE.md', 'AGENTS.local.md', 'CLAUDE.local.md']
  const SKILL_CONTENT = /<skill_content name="([^"]+)">/g

  const exists = async (file) => {
    try {
      const st = await fs.stat(file)
      return st.isFile() ? { size: st.size, mtime: st.mtimeMs } : undefined
    } catch {
      return undefined
    }
  }

  // ------------------------------------------------------------- file structure
  // The files and folders dsh reads for this conversation, as a tree with what is on disk.
  const statOf = async (p) => {
    try {
      const st = await fs.stat(p)
      return { dir: st.isDirectory(), size: st.size, mtime: st.mtimeMs }
    } catch {
      return undefined
    }
  }
  /** Skills in one skill root: `<name>/SKILL.md` bundles and flat `<name>.md` files. */
  const skillsIn = async (dir) => {
    let entries
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return undefined }
    const out = []
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      if (e.isDirectory()) {
        if (await statOf(path.join(dir, e.name, 'SKILL.md'))) out.push({ name: e.name, path: path.join(dir, e.name), bundle: true })
      } else if (e.isFile() && /\.md$/i.test(e.name)) out.push({ name: e.name.replace(/\.md$/i, ''), path: path.join(dir, e.name), bundle: false })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }
  const profileDir = (dshHome) => {
    // the launcher's profile context (what dsh-shell-env exports as DSH_PROFILE / DSH_PROFILE_DIR)
    const pc = safe(() => ctx.get('profileContext'))
    if (pc?.dir) return { name: pc.name ?? path.basename(pc.dir), dir: pc.dir }
    if (process.env.DSH_PROFILE_DIR) return { name: process.env.DSH_PROFILE || path.basename(process.env.DSH_PROFILE_DIR), dir: process.env.DSH_PROFILE_DIR }
    const base = path.join(dshHome, 'profiles') + path.sep
    for (const a of [process.cwd(), ...process.argv]) {
      if (typeof a === 'string' && a.startsWith(base)) {
        const name = a.slice(base.length).split(path.sep)[0]
        if (name && name !== 'node_modules') return { name, dir: path.join(base, name) }
      }
    }
    return undefined
  }
  const fileStructure = async ({ cwd, root, dshHome, agentsHome, files, loadedAbs }) => {
    const tokensOf = new Map()
    for (const f of files) if (f.path && f.status === 'active') tokensOf.set(f.path, { tokens: f.tokens, seq: f.lastSeq })
    const node = async (abs, name, role, extra = {}) => {
      const st = await statOf(abs)
      const n = { name, role, path: abs, dir: !!extra.dir, exists: !!st && (!!extra.dir === !!st.dir), size: st && !st.dir ? st.size : undefined }
      if (loadedAbs.has(abs)) Object.assign(n, { loaded: true, ...tokensOf.get(abs) })
      if (extra.children) n.children = extra.children
      return n
    }
    const skillsNode = async (abs, role) => {
      const n = await node(abs, 'skills/', role, { dir: true })
      const list = n.exists ? await skillsIn(abs) : undefined
      if (list) { n.count = list.length; n.items = list.slice(0, 40) }
      return n
    }
    const memFiles = async (dir, scope) => Promise.all(INSTRUCTION_CANDIDATES.map((nm) => node(path.join(dir, nm), nm, nm.includes('.local.') ? 'memLocal' : nm === 'CLAUDE.md' ? 'memClaude' : scope)))
    const trees = []
    if (cwd) {
      const top = root ?? cwd
      const kids = [...await memFiles(top, 'memProject')]
      kids.push(await node(path.join(top, '.git'), '.git/', root ? 'git' : 'gitMissing', { dir: true }))
      kids.push(await node(path.join(top, '.dsh'), '.dsh/', 'projDsh', { dir: true, children: [await skillsNode(path.join(top, '.dsh', 'skills'), 'skillsProjectDsh')] }))
      kids.push(await node(path.join(top, '.agents'), '.agents/', 'projAgents', { dir: true, children: [await skillsNode(path.join(top, '.agents', 'skills'), 'skillsProjectAgents')] }))
      // levels between the project root and the working directory each add their own files
      const rel = path.relative(top, cwd)
      if (rel && !rel.startsWith('..')) {
        let parent = { children: kids }
        let dir = top
        for (const part of rel.split(path.sep)) {
          dir = path.join(dir, part)
          const level = (await memFiles(dir, 'memNested')).filter((f) => f.exists || f.name === 'AGENTS.md')
          const sub = await node(dir, `${part}/`, dir === cwd ? 'cwdDir' : 'subDir', { dir: true, children: level })
          parent.children.push(sub)
          parent = sub
        }
      }
      trees.push(await node(top, `${path.basename(top)}/`, root ? 'projectRoot' : 'workdirRoot', { dir: true, children: kids }))
    }
    const prof = profileDir(dshHome)
    const dshKids = [
      await node(path.join(dshHome, 'AGENTS.md'), 'AGENTS.md', 'memGlobal'),
      await skillsNode(path.join(dshHome, 'skills'), 'skillsUser'),
      await node(path.join(dshHome, 'cordis.patch.yml'), 'cordis.patch.yml', 'patchGlobal'),
    ]
    if (prof) {
      dshKids.push(await node(path.join(dshHome, 'profiles'), 'profiles/', 'profiles', { dir: true, children: [
        await node(prof.dir, `${prof.name}/`, 'profile', { dir: true, children: [await node(path.join(prof.dir, 'cordis.patch.yml'), 'cordis.patch.yml', 'patchProfile')] }),
      ] }))
    }
    dshKids.push(await node(path.join(dshHome, '.env'), '.env', 'env'))
    dshKids.push(await node(path.join(dshHome, 'sessions'), 'sessions/', 'sessions', { dir: true }))
    trees.push(await node(dshHome, `${path.basename(dshHome)}/`, 'dshHome', { dir: true, children: dshKids }))
    trees.push(await node(agentsHome, `${path.basename(agentsHome)}/`, 'agentsHome', { dir: true, children: [
      await node(path.join(agentsHome, 'AGENTS.md'), 'AGENTS.md', 'memShared'),
      await skillsNode(path.join(agentsHome, 'skills'), 'skillsShared'),
    ] }))
    return { home: os.homedir(), profile: prof?.name, trees }
  }

  const projectRootOf = async (cwd) => {
    let dir = cwd
    for (;;) {
      try {
        await fs.stat(path.join(dir, '.git'))
        return dir
      } catch {}
      const up = path.dirname(dir)
      if (up === dir) return undefined
      dir = up
    }
  }

  /** Split one agent-instructions message into its file sections. */
  const instructionSections = (text) => {
    const body = String(text || '').replace(/<\/?system-reminder>/g, '')
    const heads = [...body.matchAll(INSTRUCTION_HEAD)]
    return heads.map((m, i) => {
      const end = i + 1 < heads.length ? heads[i + 1].index : body.length
      let content = body.slice(m.index + m[0].length, end).replace(/^\n+/, '').replace(/\s+$/, '')
      content = content.replace(/^Workspace instruction budget [^\n]*\n*/m, '')
      const kind = m[1] === 'Instructions removed' ? 'remove' : m[1] === 'Updated instructions from' ? 'replace' : m[1] === 'Additional instructions from' ? 'set' : 'load'
      if (kind === 'set') content = content.replace(/^These (?:user-global )?instructions apply[^\n]*\n*/, '')
      if (kind === 'replace') content = content.replace(/^This file changed after it was loaded[^\n]*\n*/, '')
      if (kind === 'remove') content = ''
      return { kind, displayPath: m[2].trim(), content }
    })
  }

  const sources = async (session) => {
    const events = session.snapshotEvents()
    const header = safe(() => session.header, {}) || {}
    const cwd = header.cwd
    const home = os.homedir()
    const dshHome = process.env.DSH_HOME || path.join(home, '.dsh')
    const agentsHome = process.env.DSH_AGENTS_HOME || path.join(home, '.agents')

    const files = new Map()
    const memoryEvents = []
    let catalog
    const catalogHistory = []
    const loaded = []
    let runtime
    let timeContext
    const callArgs = new Map()

    for (const e of events) {
      const d = e.data || {}
      if (e.type === 'tool/call' && d.callId) callArgs.set(d.callId, { seq: e.seq })
      const message = e.type === 'user/message' || e.type === 'tool/result' || e.type === 'system/message' || e.type === 'developer/message'
        ? (safe(() => session.deriveEventMessage(e)) ?? d.message ?? d)
        : undefined
      if (!message) continue
      const source = message.source || d.source || {}
      const text = contentParts(message).map(partText).join('\n')

      if (source.kind === 'agent-instructions') {
        const secs = instructionSections(text)
        const baseline = Array.isArray(source.changes) && source.changes.length === 0
        if (baseline) for (const f of files.values()) if (f.status === 'active') f.status = 'replaced'
        for (const s of secs) {
          const prev = files.get(s.displayPath)
          const entry = prev || { displayPath: s.displayPath, firstSeq: e.seq, updates: 0 }
          entry.status = s.kind === 'remove' ? 'removed' : 'active'
          if (s.kind !== 'remove') {
            entry.content = s.content
            entry.chars = s.content.length
            entry.tokens = estText(s.content)
          }
          if (prev && s.kind !== 'load') entry.updates++
          entry.lastSeq = e.seq
          entry.lastTime = e.time
          files.set(s.displayPath, entry)
        }
        memoryEvents.push({ seq: e.seq, time: e.time, baseline, files: secs.map((s) => ({ kind: s.kind, displayPath: s.displayPath })), budgetNotice: /Workspace instruction budget [^\n]*/.exec(text)?.[0] })
      } else if (source.kind === 'skill-catalog') {
        const entries = Array.isArray(source.entries) ? source.entries : []
        catalog = { seq: e.seq, time: e.time, entries: entries.map((x) => ({ name: String(x?.name ?? '?'), description: String(x?.description ?? '') })) }
        catalogHistory.push({ seq: e.seq, time: e.time, count: entries.length })
      } else if (source.kind === 'runtime-context') {
        const sections = Array.isArray(source.sections) ? source.sections : []
        runtime = { seq: e.seq, time: e.time, sections: sections.map((x) => ({ name: String(x?.name ?? ''), text: String(x?.text ?? '') })) }
      } else if (source.kind === 'time-context') {
        timeContext = { seq: e.seq, time: e.time, text }
      }

      if (text.includes('<skill_content')) {
        for (const m of text.matchAll(SKILL_CONTENT)) {
          const call = message.toolCallId ? callArgs.get(message.toolCallId) : undefined
          const base = /Base directory for this skill: ([^\n]+)/.exec(text.slice(m.index))?.[1]
          loaded.push({
            name: m[1],
            seq: e.seq,
            time: e.time,
            via: e.type === 'tool/result' ? 'tool' : 'user',
            callSeq: call?.seq,
            isError: !!message.isError,
            base,
            chars: text.length,
            tokensEst: estText(text),
          })
        }
      }
    }

    // instruction files on disk, so "not loaded" is visible too
    const root = cwd ? (await projectRootOf(cwd)) : undefined
    const chain = []
    if (cwd) {
      const top = root ?? cwd
      const rel = path.relative(top, cwd)
      const parts = rel && !rel.startsWith('..') ? rel.split(path.sep) : []
      let dir = top
      chain.push(dir)
      for (const p of parts) {
        dir = path.join(dir, p)
        chain.push(dir)
      }
    }
    const candidates = []
    const loadedAbs = new Set()
    for (const f of files.values()) {
      const p = f.displayPath
      let abs
      if (p.startsWith('~/')) abs = path.join(home, p.slice(2))
      else if (p.startsWith('$DSH_HOME/')) abs = path.join(dshHome, p.slice(10))
      else if (p.startsWith('$DSH_AGENTS_HOME/')) abs = path.join(agentsHome, p.slice(17))
      else if (path.isAbsolute(p)) abs = p
      else if (root || cwd) abs = path.join(root ?? cwd, p.replace(/^\.\//, ''))
      f.path = abs
      if (abs && f.status === 'active') loadedAbs.add(abs)
    }
    const probe = async (file, scope) => {
      const st = await exists(file)
      candidates.push({ path: file, scope, exists: !!st, size: st?.size, mtime: st?.mtime, loaded: loadedAbs.has(file) })
    }
    await probe(path.join(dshHome, 'AGENTS.md'), 'user-global')
    await probe(path.join(agentsHome, 'AGENTS.md'), 'agents-global')
    for (const dir of chain) for (const name of INSTRUCTION_CANDIDATES) await probe(path.join(dir, name), dir === cwd ? 'cwd' : 'project')

    const structure = await fileStructure({ cwd, root, dshHome, agentsHome, files: [...files.values()], loadedAbs }).catch(() => undefined)

    // full skill registry (paths, providers, untruncated descriptions)
    let registry
    let registryError
    if (skillsRef.current) {
      try {
        const list = await Promise.race([
          skillsRef.current.list({ cwd, scope: agentOf(session) }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ])
        registry = list.map((s) => ({
          name: s.name,
          description: s.description,
          whenToUse: s.whenToUse,
          path: s.path,
          provider: s.provider,
          source: s.source === undefined ? undefined : String(s.source),
          modelInvocable: s.invocation?.modelInvocable !== false,
          userInvocable: s.invocation?.userInvocable !== false,
          resourceBase: s.resourceBase?.path ?? s.resourceBase?.url ?? s.resourceBase?.description,
        }))
      } catch (error) {
        registryError = errorText(error)
      }
    }

    // What this agent actually reads, by the rules of the two plugins that read it:
    // dsh-agent-instructions (memory files) and dsh-skill-filesystem (skill roots).
    const layout = await (async () => {
      const fileRow = async (abs, name) => {
        const st = await exists(abs)
        const f = [...files.values()].find((x) => x.path === abs)
        return { name, path: abs, exists: !!st, size: st?.size, loaded: loadedAbs.has(abs), tokens: f?.status === 'active' ? f.tokens : undefined, seq: f?.lastSeq }
      }
      const global = [
        { ...(await fileRow(path.join(dshHome, 'AGENTS.md'), 'AGENTS.md')), home: 'dsh', dir: dshHome },
        { ...(await fileRow(path.join(agentsHome, 'AGENTS.md'), 'AGENTS.md')), home: 'agents', dir: agentsHome },
      ]
      const levels = []
      for (const dir of chain) {
        const rows = await Promise.all(INSTRUCTION_CANDIDATES.map((nm) => fileRow(path.join(dir, nm), nm)))
        levels.push({ dir, rel: path.relative(root ?? cwd, dir) || '.', isRoot: dir === (root ?? cwd), isCwd: dir === cwd, files: rows })
      }
      // deeper levels join once the agent reads or writes under them
      const inChain = new Set(levels.flatMap((l) => l.files.map((f) => f.path)))
      const globalSet = new Set(global.map((g) => g.path))
      const deeper = []
      for (const f of files.values()) {
        if (!f.path || inChain.has(f.path) || globalSet.has(f.path)) continue
        deeper.push({ name: path.basename(f.path), path: f.path, rel: cwd ? path.relative(cwd, path.dirname(f.path)) : path.dirname(f.path), exists: !!(await exists(f.path)), loaded: f.status === 'active', status: f.status, tokens: f.tokens, seq: f.lastSeq })
      }
      // skill roots in the provider's precedence order, with what each one contributed
      const bySource = {}
      for (const s of registry || []) (bySource[s.source ?? 'other'] ||= []).push(s)
      const top = root ?? cwd
      const skillDir = async (source, abs) => {
        const st = await statOf(abs)
        const disk = st?.dir ? await skillsIn(abs) : undefined
        return { source, path: abs, exists: !!st?.dir, onDisk: disk?.length ?? 0, registered: (bySource[source] || []).length }
      }
      const skillRoots = []
      if (top) skillRoots.push(await skillDir('project-dsh', path.join(top, '.dsh', 'skills')), await skillDir('project-agents', path.join(top, '.agents', 'skills')))
      const customDirs = [...new Set((bySource.custom || []).map((s) => path.dirname(String(s.path || '').replace(/\/SKILL\.md$/i, ''))).filter(Boolean))]
      for (const d of customDirs) skillRoots.push({ ...(await skillDir('custom', d)), registered: (bySource.custom || []).filter((s) => String(s.path || '').startsWith(d)).length })
      skillRoots.push(await skillDir('user-dsh', path.join(dshHome, 'skills')), await skillDir('user-agents', path.join(agentsHome, 'skills')))
      if ((bySource.bundled || []).length) skillRoots.push({ source: 'bundled', path: path.dirname(String(bySource.bundled[0].path || '').replace(/\/SKILL\.md$/i, '')), exists: true, onDisk: bySource.bundled.length, registered: bySource.bundled.length })
      const known = new Set(['project-dsh', 'project-agents', 'custom', 'user-dsh', 'user-agents', 'bundled'])
      const others = Object.entries(bySource).filter(([k]) => !known.has(k)).map(([k, v]) => ({ source: k, count: v.length }))
      return { home, cwd, root: root ?? null, rootMarker: root ? '.git' : null, global, levels, deeper, skillRoots, otherSkillSources: others }
    })().catch(() => undefined)

    return {
      sessionId: session.id,
      cwd,
      projectRoot: root,
      dshHome,
      agentsHome,
      memory: {
        files: [...files.values()],
        events: memoryEvents,
        candidates,
      },
      skills: {
        catalog,
        catalogHistory,
        registry,
        registryError,
        registryAvailable: !!skillsRef.current,
        loaded,
      },
      runtime,
      timeContext,
      structure,
      layout,
    }
  }

  const skillBody = async (session, name) => {
    if (!skillsRef.current) return undefined
    const cwd = safe(() => session.header?.cwd)
    const def = await skillsRef.current.get(String(name), { cwd, scope: agentOf(session) })
    if (!def) return undefined
    const content = String(def.content ?? '')
    return {
      name: def.name,
      description: def.description,
      path: def.path,
      provider: def.provider,
      chars: content.length,
      tokensEst: estText(content),
      content: content.length > NODE_TEXT_CAP ? `${content.slice(0, NODE_TEXT_CAP)}…` : content,
      truncated: content.length > NODE_TEXT_CAP,
    }
  }

  // ---------------------------------------------------------------- flow
  /**
   * Map the session log onto lifecycle stages (a dsh analogue of Claude
   * Code's hook lifecycle) so the client can draw and replay the structure.
   */
  const flow = (session) => {
    const events = session.snapshotEvents()
    const header = safe(() => session.header, {}) || {}
    const out = []
    const callNames = new Map()
    const counts = {}
    let truncatedFrom = 0
    let turn = 0
    let step = 0
    const push = (event, stage, title, extra) => {
      if (!extra?.uncounted) counts[stage] = (counts[stage] || 0) + 1
      out.push({ seq: event?.seq ?? -1, time: event?.time ?? header.createdAt, stage, type: event?.type ?? 'session', turn, step, title: oneLine(title, 140), ...extra })
    }
    const textOf = (content) => oneLine(contentParts({ content }).map(partText).join(' '), 140)

    push(undefined, 'sessionStart', [header.agentPreset, header.cwd].filter(Boolean).join(' · ') || 'session', {})

    const goalHistory = []
    let goal
    // the inbox carries every prompt: typed while idle it is just how the prompt arrives,
    // so only input added while a turn runs is "queued"; the prompt's own user/message
    // that follows is the same input landing in context, not a second prompt
    let turnRunning = false
    let delivered = 0
    let goalRounds = 0
    const turns = new Map()
    const turnOf = () => {
      let t = turns.get(turn)
      if (!t) turns.set(turn, t = { turn, start: undefined, end: undefined, steps: 0, toolCalls: 0, errors: 0, trigger: undefined, prompt: undefined, reason: undefined, tools: {} })
      return t
    }

    for (const e of events) {
      const d = e.data || {}
      switch (e.type) {
        case 'permission/preset': push(e, 'sessionStart', `permission: ${d.preset}`); break
        case 'sandbox/mode': push(e, 'sessionStart', `sandbox: ${d.mode}`); break
        case 'approval/policy': push(e, 'sessionStart', `approval: ${d.policy}`); break
        case 'session/end-seed': push(e, 'sessionStart', 'seed complete'); break
        case 'agent-preset/selected': push(e, 'modelSwitch', `preset → ${d.agentPreset}`); break
        case 'model/selection': push(e, 'modelSwitch', `${d.provider ?? ''}/${d.model ?? ''}${d.reasoningEffort ? ` · ${d.reasoningEffort}` : ''}`); break
        case 'turn/start': {
          turn = d.turn ?? turn + 1
          step = 0
          turnRunning = true
          const t = turnOf()
          t.start = e.time
          push(e, 'turnStart', `turn ${turn}`)
          break
        }
        case 'agent/inbox/spliced': {
          const inserted = Array.isArray(d.inserted) ? d.inserted : []
          if (!inserted.length) {
            // a claim (taken into the step) is plumbing; a cancel is worth showing
            if (d.outcome === 'canceled') push(e, 'inbox', `canceled ${d.removedCount ?? ''}`.trim(), { source: 'inbox', status: 'canceled', uncounted: true })
            break
          }
          const first = inserted[0]
          const text = textOf(first.content)
          const kind = first?.source?.kind ?? 'user'
          if (!turnRunning && (kind === 'user' || kind === 'schedule')) {
            delivered += inserted.length
            push(e, 'userPrompt', text, { source: kind })
          } else {
            push(e, 'inbox', text, { source: kind, target: d.target })
          }
          break
        }
        case 'user/message': {
          const kind = d.source?.kind ?? 'user'
          const text = textOf(d.content)
          if (kind === 'user' || kind === 'schedule') {
            const t = turnOf()
            if (!t.trigger) { t.trigger = kind; t.prompt = text }
            if (delivered > 0) delivered--
            else push(e, 'userPrompt', text, { source: kind })
          } else if (kind === 'goal') {
            const t = turnOf()
            goalRounds = Math.max(goalRounds, d.source.round ?? 0)
            if (!t.trigger) { t.trigger = 'goal'; t.prompt = text }
            push(e, 'goalRound', `round ${d.source.round ?? '?'}: ${text}`, { source: kind })
          } else if (kind === 'compact-checkpoint') {
            push(e, 'compaction', `summary: ${text}`, { source: kind })
          } else {
            push(e, 'context', `${kind}: ${text}`, { source: kind })
          }
          break
        }
        case 'system/message':
        case 'developer/message':
          push(e, 'context', `${e.type.split('/')[0]} prompt: ${textOf(d.message?.content)}`, { source: e.type })
          break
        case 'step/start':
          step = d.step ?? step + 1
          turnOf().steps++
          push(e, 'stepStart', `turn ${turn} · step ${step}`)
          break
        case 'assistant/message': {
          const parts = contentParts(d.message)
          let reasoning = 0
          let text = 0
          const calls = []
          for (const p of parts) {
            if (p.type === 'reasoning') reasoning += (p.text || '').length
            else if (p.type === 'text') text += (p.text || '').length
            else if (p.type === 'tool-call') {
              const id = partId(p)
              const nm = partName(p) ?? '?'
              if (id !== undefined) callNames.set(id, nm)
              calls.push(nm)
            }
          }
          const u = d.usage
          const firstText = parts.find((p) => p.type === 'text' && p.text)?.text
          push(e, 'assistant', firstText ? oneLine(firstText, 140) : calls.length ? calls.join(', ') : 'reasoning', {
            reasoning, text, calls,
            usage: u ? { input: u.inputTokens, cacheRead: u.cacheReadTokens, cacheWrite: u.cacheWriteTokens, output: u.outputTokens } : undefined,
          })
          break
        }
        case 'assistant/attempt': push(e, 'assistant', 'attempt (retried / aborted stream)', { status: 'retry' }); break
        case 'tool/call': {
          const nm = d.name ?? '?'
          if (d.callId) callNames.set(d.callId, nm)
          const t = turnOf()
          t.toolCalls++
          t.tools[nm] = (t.tools[nm] || 0) + 1
          const args = typeof d.arguments === 'string' ? d.arguments : json(d.arguments)
          push(e, /^subagent/.test(nm) ? 'subagent' : 'toolCall', `${nm} ${oneLine(args, 110)}`, { tool: nm })
          break
        }
        case 'approval/asked':
        case 'approval/request':
          push(e, 'approval', `asked: ${d.toolName ?? d.name ?? d.request?.toolName ?? ''}`, { status: 'waiting' })
          break
        case 'approval/decided':
          push(e, 'approval', `decided: ${d.decision ?? d.outcome ?? d.kind ?? ''}`, { status: d.decision ?? d.outcome })
          break
        case 'job/registered': push(e, 'toolExec', `${d.kind ?? 'job'}: ${d.label ?? ''}`, { job: d.jobId }); break
        case 'job/settled': {
          const ms = typeof d.finishedAt === 'number' && typeof d.startedAt === 'number' ? d.finishedAt - d.startedAt : undefined
          push(e, 'toolExec', `${d.status ?? 'settled'}${ms !== undefined ? ` in ${ms}ms` : ''}: ${d.label ?? ''}`, { job: d.jobId, status: d.status, ms, uncounted: true })
          break
        }
        case 'tool/result': {
          const m = d.message || {}
          const nm = callNames.get(m.toolCallId) ?? '?'
          if (m.isError) turnOf().errors++
          push(e, /^subagent/.test(nm) ? 'subagent' : 'toolResult', `${nm} → ${textOf(m.content)}`, { tool: nm, status: m.isError ? 'error' : 'ok' })
          break
        }
        case 'todo/write': {
          const todos = Array.isArray(d.todos) ? d.todos : []
          const by = {}
          for (const x of todos) by[x.status] = (by[x.status] || 0) + 1
          push(e, 'todo', Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · ') || 'todos', { todos: todos.slice(0, 30).map((x) => ({ content: oneLine(x.content, 100), status: x.status })) })
          break
        }
        case 'step/end': push(e, 'stepEnd', `turn ${turn} · step ${step}`); break
        case 'turn/end': {
          const r = d.reason
          const reason = [r?.kind, r?.reason?.kind].filter(Boolean).join(' / ') || 'end'
          const t = turnOf()
          t.end = e.time
          t.reason = reason
          turnRunning = false
          push(e, 'turnEnd', `turn ${turn}: ${reason}`, { status: r?.kind })
          break
        }
        case 'goal/change': {
          goal = d.operation === 'clear' ? undefined : { ...d.goal, roundsStarted: d.roundsStarted, createdAt: d.createdAt, updatedAt: d.updatedAt }
          if (d.roundsStarted !== undefined) goalRounds = d.roundsStarted
          goalHistory.push({ seq: e.seq, time: e.time, operation: d.operation, phase: d.goal?.phase, objective: oneLine(d.goal?.objective, 200) })
          push(e, 'goal', `${d.operation}: ${oneLine(d.goal?.objective ?? d.cleared?.id ?? '', 120)}`, { status: d.goal?.phase ?? d.operation })
          break
        }
        case 'plan/mode': push(e, 'plan', `plan mode: ${d.mode ?? json(d)}`); break
        case 'schedule/change': push(e, 'schedule', oneLine(json(d), 120)); break
        case 'session/title': push(e, 'title', d.title ?? ''); break
        case 'deliverables/presented': push(e, 'deliverables', oneLine(json(d), 120)); break
        case 'workspace/changes': push(e, 'workspace', `turn ${d.turn ?? turn}`); break
        default:
          if (e.type.startsWith('compaction/')) push(e, 'compaction', e.type.slice(11))
          else if (e.type.startsWith('subagent/') && e.type !== 'subagent/catalog') push(e, 'subagent', e.type)
          else if (e.type.startsWith('goal/')) push(e, 'goal', e.type)
      }
    }

    // Per-step trajectories and the live state, derived from the staged stream.
    const steps = []
    const openJobs = new Map()
    const waiting = []
    let cur
    let last
    let pre = []
    let turnOpen = false
    const addStage = (s, stage) => { if (s.stages[s.stages.length - 1] !== stage) s.stages.push(stage) }
    for (const ev of out) {
      if (ev.stage === 'sessionStart' || ev.stage === 'title') continue
      if (ev.stage === 'turnStart') { turnOpen = true; pre = pre.filter((x) => x === 'userPrompt' || x === 'goalRound' || x === 'inbox'); last = undefined }
      if (ev.stage === 'toolExec' && ev.job !== undefined) {
        if (ev.status === undefined) openJobs.set(ev.job, { job: ev.job, label: ev.title, startedAt: ev.time, seq: ev.seq })
        else openJobs.delete(ev.job)
      }
      if (ev.stage === 'approval') {
        if (ev.status === 'waiting') waiting.push({ seq: ev.seq, time: ev.time, title: ev.title })
        else waiting.shift()
      }
      if (ev.stage === 'stepStart') {
        cur = { turn: ev.turn, step: ev.step, startSeq: ev.seq, startTime: ev.time, endSeq: undefined, endTime: undefined, stages: [], tools: [], errors: 0, usage: undefined, promptTokens: undefined, status: 'running' }
        for (const s of pre) addStage(cur, s)
        pre = []
        steps.push(cur)
      }
      const target = cur ?? (last && last.turn === ev.turn && (ev.stage === 'turnEnd' || ev.stage === 'workspace' || ev.stage === 'compaction' || ev.stage === 'deliverables') ? last : undefined)
      if (target) {
        addStage(target, ev.stage)
        if (ev.stage === 'assistant' && target.requestSeq === undefined) target.requestSeq = ev.seq
        if (ev.stage === 'assistant' && ev.usage) {
          target.usage = ev.usage
          target.promptTokens = (ev.usage.input ?? 0) + (ev.usage.cacheRead ?? 0) + (ev.usage.cacheWrite ?? 0)
        }
        if ((ev.stage === 'toolCall' || ev.stage === 'subagent') && ev.tool && !ev.status) target.tools.push(ev.tool)
        if (ev.status === 'error') target.errors++
        if (ev.stage === 'turnEnd') target.turnEnd = ev.status ?? 'end'
      } else if (ev.stage !== 'turnEnd') {
        if (pre[pre.length - 1] !== ev.stage) pre.push(ev.stage)
      }
      if (ev.stage === 'stepEnd' && cur) { cur.endSeq = ev.seq; cur.endTime = ev.time; cur.status = cur.errors ? 'error' : 'done'; last = cur; cur = undefined }
      if (ev.stage === 'turnEnd') {
        turnOpen = false
        if (cur) { cur.status = 'interrupted'; cur.endSeq = ev.seq; cur.endTime = ev.time; last = cur; cur = undefined }
        openJobs.clear()
        waiting.length = 0
      }
    }
    let lastEv
    for (let i = out.length - 1; i >= 0 && !lastEv; i--) if (out[i].stage !== 'sessionStart' && out[i].stage !== 'title') lastEv = out[i]
    let liveStage
    let phase
    if (waiting.length) { liveStage = 'approval'; phase = 'approval' }
    else if (openJobs.size) { liveStage = 'toolExec'; phase = 'tool' }
    else if (turnOpen) {
      phase = 'running'
      const s = lastEv?.stage
      liveStage = s === 'stepStart' ? 'assistant' : s === 'stepEnd' ? 'stepStart' : s === 'toolCall' ? 'toolExec' : s === 'userPrompt' || s === 'goalRound' || s === 'inbox' ? 'turnStart' : s
    } else { liveStage = 'userPrompt'; phase = 'idle' }
    const live = {
      phase,
      stage: liveStage,
      lastStage: lastEv?.stage,
      lastSeq: lastEv?.seq,
      lastTime: lastEv?.time,
      lastTitle: lastEv?.title,
      lastType: lastEv?.type,
      turn,
      step: cur?.step,
      currentStep: cur ? steps.length - 1 : undefined,
      jobs: [...openJobs.values()],
      approvals: waiting.slice(),
    }
    const stepsTruncated = Math.max(0, steps.length - 2000)
    if (stepsTruncated) {
      steps.splice(0, stepsTruncated)
      if (live.currentStep !== undefined) live.currentStep -= stepsTruncated
    }

    let list = out
    if (list.length > 8000) {
      truncatedFrom = list.length - 8000
      list = [list[0], ...list.slice(-7999)]
    }
    return {
      version: 1,
      sessionId: session.id,
      title: sessionTitle(events),
      createdAt: header.createdAt,
      cwd: header.cwd,
      agentPreset: header.agentPreset,
      logRevision: session.seq,
      counts,
      goal: goal ? { ...goal, objective: String(goal.objective ?? ''), roundsStarted: goalRounds } : undefined,
      goalHistory,
      turns: [...turns.values()].filter((t) => t.turn > 0).sort((a, b) => a.turn - b.turn),
      events: list,
      truncatedFrom,
      steps,
      stepsTruncated,
      live,
    }
  }

  const listSessions = () => {
    const out = []
    for (const s of safe(() => ctx.sessions.list(), []) || []) {
      const events = safe(() => s.snapshotEvents(), []) || []
      out.push({
        id: s.id,
        title: sessionTitle(events),
        cwd: safe(() => s.header?.cwd),
        seq: s.seq,
        lastTime: events.length ? events[events.length - 1].time : undefined,
      })
    }
    return out.sort((a, b) => (b.lastTime ?? 0) - (a.lastTime ?? 0))
  }

  // ---------------------------------------------------------------- routes
  const ok = (value) => Response.json({ ok: true, value }, { headers: { 'cache-control': 'no-store' } })
  const fail = (code, message) => Response.json({ ok: false, error: { code: `context-lens/${code}`, message } }, { headers: { 'cache-control': 'no-store' } })
  const body = async (req) => {
    try {
      const text = await req.text()
      return text ? JSON.parse(text) : {}
    } catch {
      return {}
    }
  }

  // ---- analysis: ask the session's own model about this context, in a call of its own.
  // Nothing is written to the session log, and nothing runs until the page asks.
  const llmRef = { current: undefined }
  const jobs = new Map()
  const ANALYZE_SYS = {
    zh: '你是 dsh（DeepSeek Harness）上下文分析专家。用户给你一份某个 agent 会话的上下文报告，目的是找出 agent 的缺陷、浪费上下文的地方，并给出可操作的改进建议（例如精简工具/技能/记忆、改提示词、避免重复读取、截断大输出、调整压缩策略）。要求：只依据报告里的事实，引用消息用 #序号，数字用报告里的 token；先给结论，再给证据，再给具体改法；证据不足就说明还需要看哪条消息或哪部分内容。回答使用简体中文，简洁，不要复述报告。',
    en: 'You are an expert on context in dsh (DeepSeek Harness). The user gives you a context report for one agent session, to find the agent\'s defects and wasted context and to get actionable fixes (trim tools/skills/memory, change prompts, avoid repeated reads, truncate large outputs, tune compaction). Rely only on facts in the report, cite messages as #seq, use the report\'s token numbers; give the conclusion first, then evidence, then concrete changes; if evidence is thin, say which message or section you would need. Be concise and do not restate the report.',
  }
  const clip = (text, n) => { const v = String(text ?? ''); return v.length > n ? v.slice(0, n) + ' …[+' + (v.length - n) + ' chars]' : v }
  const partsText = (d) => (d?.parts || []).map((p) => p.text || '').join('\n')
  const reportFor = (session, include) => {
    const b = breakdown(session)
    const f = safe(() => flow(session), undefined)
    const L = []
    const comp = b.compaction
    L.push(`session: ${b.title || b.sessionId} · model ${b.provider || '?'}/${b.model || '?'} · window ${b.contextWindow} · in use ${b.measured?.totalTokens} (${b.measured?.usedSource})`)
    if (comp) L.push(`compaction: auto=${comp.auto} threshold=${comp.thresholdTokens ?? '?'} remaining=${comp.remainingTokens ?? '?'} events=${(b.compactionEvents || []).length}`)
    L.push('\n## composition (tokens)')
    for (const c of b.categories || []) if (c.tokens > 0) L.push(`- ${c.key}: ${Math.round(c.tokens)}${c.count !== undefined ? ` (${c.count})` : ''}`)
    const called = new Set((b.toolStats || []).map((x) => x.name))
    const tools = b.tools || []
    L.push(`\n## tool definitions: ${tools.length}, ${Math.round(b.toolsTokens || 0)} tokens, ${tools.filter((x) => !called.has(x.name)).length} never called`)
    for (const x of tools.slice(0, 15)) L.push(`- ${x.name}${x.kind === 'mcp' ? ` [mcp:${x.server}]` : ''}: ${Math.round(x.tokens)}${called.has(x.name) ? '' : ' (never called)'}`)
    L.push('\n## tool usage (calls · call tokens · result tokens · max result)')
    const errBy = {}
    for (const x of b.invocations || []) if (x.isError) errBy[x.name] = (errBy[x.name] || 0) + 1
    for (const x of (b.toolStats || []).slice(0, 12)) L.push(`- ${x.name}: ${x.calls} · ${Math.round(x.callTokens)} · ${Math.round(x.resultTokens)} · ${Math.round(x.maxResult)}${errBy[x.name] ? ` · ${errBy[x.name]} errors` : ''}`)
    const seen = new Map()
    for (const x of b.invocations || []) { const k = x.name + ' ' + (x.args || ''); seen.set(k, (seen.get(k) || 0) + 1) }
    const reps = [...seen.entries()].filter(([, n]) => n >= 2).sort((a, c) => c[1] - a[1]).slice(0, 8)
    if (reps.length) { L.push('\n## repeated identical calls'); for (const [k, n] of reps) L.push(`- ×${n} ${clip(k, 140)}`) }
    if (f?.steps?.length) {
      L.push('\n## steps (turn.step · tools · prompt tokens · status)')
      for (const st of f.steps.slice(-30)) L.push(`- ${st.turn}.${st.step} · ${(st.tools || []).join(',') || 'text'} · ${st.promptTokens ?? '?'} · ${st.status}${st.errors ? ` · ${st.errors} errors` : ''}`)
    }
    L.push('\n## biggest messages (#seq category tool tokens preview)')
    for (const n of [...(b.nodes || [])].sort((a, c) => c.tokensCal - a.tokensCal).slice(0, 25)) L.push(`- #${n.seq} ${n.category}${n.tool ? ' ' + n.tool : ''} ${Math.round(n.tokensCal)} ${clip(n.preview, 120)}`)
    const mem = (b.memoryFiles || []).slice(0, 10).map((m) => `${m.displayPath || m.path || m.name}: ${Math.round(m.tokens)}`)
    if (mem.length) L.push('\n## memory files\n' + mem.map((x) => '- ' + x).join('\n'))
    const sk = (b.skills || []).slice(0, 15).map((m) => `${m.name}: ${Math.round(m.tokens)}`)
    if (sk.length) L.push('\n## skills in context\n' + sk.map((x) => '- ' + x).join('\n'))
    if (include?.system) {
      L.push('\n## system prompt (full)')
      for (const n of (b.nodes || []).filter((x) => x.category === 'system').slice(0, 3)) L.push(clip(partsText(safe(() => nodeDetail(session, n.seq))), 9000))
    }
    if (include?.tools) {
      L.push('\n## tool descriptions')
      for (const x of (safe(() => session.requestHeader())?.tools || []).slice(0, 60)) L.push(`- ${x.name}: ${clip(x.description, 280)}`)
    }
    for (const seq of (Array.isArray(include?.seqs) ? include.seqs : []).slice(0, 6)) {
      if (typeof seq !== 'number') continue
      L.push(`\n## message #${seq} (full)`)
      L.push(clip(partsText(safe(() => nodeDetail(session, seq))), 6000))
    }
    return L.join('\n')
  }
  const buildAnalysis = (session, { question, history, include, lang }) => {
    const report = reportFor(session, include)
    const system = ANALYZE_SYS[lang === 'en' ? 'en' : 'zh']
    const turns = (Array.isArray(history) ? history : []).slice(-8).map((m) => `[${m.role === 'assistant' ? 'assistant' : 'user'}] ${clip(m.text, 4000)}`).join('\n\n')
    const input = `<context-report>\n${report}\n</context-report>\n\n${turns ? turns + '\n\n' : ''}[user] ${clip(question, 4000)}`
    const b = breakdown(session)
    const route = safe(() => session.requestHeader())?.config
    return { system, input, provider: route?.provider ?? b.provider, model: route?.model ?? b.model, tokens: estText(system) + estText(input) }
  }
  const startAnalysis = (session, args) => {
    const llm = llmRef.current
    if (!llm) throw new Error('llm service unavailable')
    const built = buildAnalysis(session, args)
    if (!built.provider || !built.model) throw new Error('this session has no model route yet; send one message first')
    const now = Date.now()
    for (const [id, j] of jobs) if (j.done && now - j.updated > 600000) jobs.delete(id)
    if (jobs.size > 12) throw new Error('too many analyses; try again shortly')
    const id = `a${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`
    const job = { id, text: '', reasoning: '', done: false, error: null, usage: null, inputTokens: built.tokens, model: built.model, updated: now, abort: new AbortController() }
    jobs.set(id, job)
    ;(async () => {
      try {
        const call = await llm.prepareCall({ provider: built.provider, model: built.model, maxTokens: 4096 }, job.abort.signal)
        const messages = [{ role: 'user', content: [{ type: 'text', text: built.input }] }]
        for await (const chunk of call.stream({ ...call.config, messages, system: built.system, signal: job.abort.signal })) {
          job.updated = Date.now()
          if (chunk.type === 'text-delta') job.text += chunk.text
          else if (chunk.type === 'reasoning-delta') job.reasoning += chunk.text
          else if (chunk.type === 'usage') job.usage = chunk.usage
          else if (chunk.type === 'finish' && (chunk.reason?.kind === 'error' || chunk.reason?.kind === 'aborted')) job.error = chunk.reason?.failure?.message || chunk.reason.kind
        }
      } catch (error) {
        job.error = errorText(error)
      } finally {
        job.done = true
        job.updated = Date.now()
      }
    })()
    return job
  }

  const handlers = {
    'analyze-preview': async (req) => {
      const { sessionId, include, question, history } = await body(req)
      const session = await getLiveSession(sessionId)
      if (!session) return unavailable(sessionId)
      const built = buildAnalysis(session, { question: question || '', history, include })
      return ok({ ready: !!llmRef.current, provider: built.provider, model: built.model, tokens: built.tokens })
    },
    'analyze-start': async (req) => {
      const { sessionId, question, history, include, lang } = await body(req)
      const session = await getLiveSession(sessionId)
      if (!session) return unavailable(sessionId)
      if (typeof question !== 'string' || !question.trim()) return fail('empty-question', 'empty question')
      const job = startAnalysis(session, { question, history, include, lang })
      return ok({ jobId: job.id, inputTokens: job.inputTokens, model: job.model })
    },
    'analyze-poll': async (req) => {
      const { jobId } = await body(req)
      const job = jobs.get(jobId)
      if (!job) return fail('job-not-found', 'analysis not found (it may have expired)')
      return ok({ text: job.text, reasoning: job.reasoning, done: job.done, error: job.error, usage: job.usage, inputTokens: job.inputTokens })
    },
    'analyze-stop': async (req) => {
      const { jobId } = await body(req)
      const job = jobs.get(jobId)
      if (job && !job.done) job.abort.abort()
      return ok({ stopped: !!job })
    },
    breakdown: async (req) => {
      const { sessionId } = await body(req)
      const session = await getLiveSession(sessionId)
      if (!session) return unavailable(sessionId)
      return ok(breakdown(session))
    },
    node: async (req) => {
      const { sessionId, seq } = await body(req)
      const session = await getLiveSession(sessionId)
      if (!session) return unavailable(sessionId)
      const detail = typeof seq === 'number' ? nodeDetail(session, seq) : undefined
      return detail ? ok(detail) : fail('node-not-found', `no event at seq ${seq}`)
    },
    flow: async (req) => {
      const { sessionId } = await body(req)
      const session = await getLiveSession(sessionId)
      if (!session) return unavailable(sessionId)
      return ok(flow(session))
    },
    sources: async (req) => {
      const { sessionId } = await body(req)
      const session = await getLiveSession(sessionId)
      if (!session) return unavailable(sessionId)
      return ok(await sources(session))
    },
    skill: async (req) => {
      const { sessionId, name: skillName } = await body(req)
      const session = await getLiveSession(sessionId)
      if (!session) return unavailable(sessionId)
      if (!skillsRef.current) return fail('skills-unavailable', 'the skills registry is not available')
      const v = await skillBody(session, skillName)
      return v ? ok(v) : fail('skill-not-found', `no skill "${skillName}"`)
    },
    tool: async (req) => {
      const { sessionId, name: toolName } = await body(req)
      const session = await getLiveSession(sessionId)
      if (!session) return unavailable(sessionId)
      const tool = (safe(() => session.requestHeader())?.tools || []).find((x) => x?.name === toolName)
      if (!tool) return fail('tool-not-found', `no tool "${toolName}" in the request header`)
      const schema = tool.parameters && typeof tool.parameters === 'object' ? tool.parameters : {}
      const required = new Set(Array.isArray(schema.required) ? schema.required : [])
      const typeOf = (p) => (p?.type ? [].concat(p.type).join(' | ') : p?.enum ? 'enum' : p?.anyOf ? 'anyOf' : p?.oneOf ? 'oneOf' : '')
      return ok({
        name: tool.name,
        description: String(tool.description ?? '').slice(0, NODE_TEXT_CAP),
        params: Object.entries(schema.properties || {}).map(([k, p]) => ({
          name: k,
          type: typeOf(p),
          required: required.has(k),
          description: String(p?.description ?? '').slice(0, 2000),
          enum: Array.isArray(p?.enum) ? p.enum.slice(0, 30).map(String) : undefined,
        })),
        schema: json(schema).slice(0, NODE_TEXT_CAP),
        deferLoading: tool.deferLoading === true,
      })
    },
    sessions: async () => ok(listSessions()),
  }

  // The skills registry and agents service are optional: read them while they are there.
  ctx.inject(['llm'], (inner) => {
    const svc = inner.get('llm')
    llmRef.current = svc
    inner.effect(() => () => { if (llmRef.current === svc) llmRef.current = undefined }, 'context-lens: llm ref')
  })
  ctx.inject(['agents'], (inner) => {
    const svc = inner.get('agents')
    agentsRef.current = svc
    inner.effect(() => () => { if (agentsRef.current === svc) agentsRef.current = undefined }, 'context-lens: agents ref')
  })
  ctx.inject(['skills'], (inner) => {
    const svc = inner.get('skills')
    skillsRef.current = svc
    inner.effect(() => () => { if (skillsRef.current === svc) skillsRef.current = undefined }, 'context-lens: skills ref')
  })

  ctx.inject(['connection'], (inner) => {
    const connection = inner.get('connection')
    const register = connection?.fetch?.register
    if (typeof register !== 'function') {
      inner.logger?.warn?.('context-lens: connection.fetch.register unavailable; routes not served')
      return
    }
    for (const [route, handler] of Object.entries(handlers)) {
      inner.effect(() => register.call(connection.fetch, {
        path: `${BASE}/${route}`,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (req) => {
          try {
            return await handler(req)
          } catch (error) {
            return fail(`${route}-failed`, errorText(error))
          }
        },
      }), `context-lens: ${route} route`)
    }
  })
}
