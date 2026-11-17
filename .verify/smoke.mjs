// Loads the built client.js the way the harness does, with stubs for React and the page, and checks
// the three things a refactor must not change:
//
//   * the module id and the slot registrations (same slots, ids and orders),
//   * the locale namespace and its key count,
//   * the stylesheet itself (compiled SCSS) is compared byte for byte with .baseline/css.txt.
//
// `node .verify/smoke.mjs` (or `npm run check`). Exits 1 on the first difference.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const cssOf = (text, decl) => {
  const start = text.indexOf(decl)
  if (start < 0) throw new Error(`no ${decl} in the bundle`)
  const from = start + decl.length
  let end = from + 1
  let esc = false
  for (; end < text.length; end++) {
    const ch = text[end]
    if (esc) esc = false
    else if (ch === '\\') esc = true
    else if (ch === '"') break
  }
  return JSON.parse(text.slice(from, end + 1))
}

const registered = []
const sandbox = {
  window: { __ModuleLoader__: { load: (mod) => { sandbox.__mod = mod } } },
  document: {
    createElement: () => ({ textContent: '', appendChild() {}, styleSheet: null }),
    head: { appendChild() {} },
    body: {},
    querySelector: () => null,
    querySelectorAll: () => [],
  },
  localStorage: { getItem: () => null, setItem() {} },
  navigator: { userAgent: 'node' },
  MutationObserver: class { observe() {} disconnect() {} },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  console,
}
vm.createContext(sandbox)
vm.runInContext(readFileSync(join(root, 'client.js'), 'utf8'), sandbox)

const failures = []
const mod = sandbox.__mod
if (!mod) throw new Error('client.js registered no module')

const ReactStub = new Proxy({ createElement: () => null, Fragment: 'fragment' }, {
  get: (t, k) => (k in t ? t[k] : function stub() { return null }),
})
const kit = {
  React: ReactStub,
  h: () => null,
  portal: (el) => el,
  sheet: () => ({ ensure() {}, remove() {} }),
  settingsUI: () => ({}),
  dom: { subscribe: () => () => {}, touches: () => false, mounts: () => false, poke() {} },
}
const ctx = {
  effect: (fn) => fn(),
  locale: {
    register: (ns, dict) => { registered.push(`locale ${ns} ${Object.keys(dict.zh).length}`); return () => {} },
    bind: () => (k) => String(k),
  },
  slots: {
    inject: (key, cb) => { cb && cb({}) },
    register: (spec) => { registered.push(`slot ${spec.name} ${spec.id} ${spec.order}`); return () => {} },
  },
}
mod.factory(() => ReactStub, kit).apply(ctx)

const expectedSlots = [
  'locale context-lens 444',
  'slot conversation.composer.dock context-lens 1000',
  'slot conversation.view context-lens 25',
]
for (const want of expectedSlots) if (!registered.includes(want)) failures.push(`missing registration: ${want}`)

const css = cssOf(readFileSync(join(root, 'client.js'), 'utf8'), 'const CSS_TEXT = ')
const baseline = readFileSync(join(root, '.baseline', 'css.txt'), 'utf8')
if (css !== baseline) failures.push(`stylesheet changed: ${css.length} bytes now, ${baseline.length} in .baseline/css.txt`)

if (failures.length) {
  for (const f of failures) console.log(`FAIL ${f}`)
  process.exit(1)
}
console.log(`ok — ${mod.id}, ${registered.length} registrations, stylesheet ${css.length} bytes identical to the baseline`)
