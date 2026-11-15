/**
 * 浏览器半边的「渲染冒烟测试」：在 Node 里用最小 React 替身执行组件函数，
 * 检查 8 个页签在「有数据 / 无数据」两种状态下都能渲染、且关键中文标签存在。
 * 它不替代真实浏览器，只用来抓取渲染期崩溃与字段缺失。
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'client.js'), 'utf8')
const marker = '    return {\n      inject: [\'slots\'],'
if (!source.includes(marker)) throw new Error('未找到 client.js 注入点')
const instrumented = source.replace(
  marker,
  '    globalThis.__SAL_TEST__ = { App, Dashboard, Connections, RunnerView, History, Reports, Settings, TABS, Icon }\n\n' + marker,
)
const tempFile = join(tmpdir(), `sal-client-${process.pid}.mjs`)
writeFileSync(tempFile, instrumented, 'utf8')

const React = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat(Infinity).filter((child) => child !== undefined) }
  },
  useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}] },
  useEffect() {},
  useLayoutEffect() {},
  useMemo(factory) { return factory() },
  useCallback(fn) { return fn },
  useRef(value) { return { current: value } },
  Component: class Component { constructor(props) { this.props = props }; setState() {} },
}

const g = globalThis
g.window = {
  __ModuleLoader__: {
    load(definition) {
      if (definition.id !== 'dsh-ai-security-lab') throw new Error(`bundle id 不匹配：${definition.id}`)
      g.__SAL_MODULE__ = definition.factory((name) => {
        if (name === 'react') return React
        throw new Error(`未预期的模块请求：${name}`)
      })
    },
  },
  confirm: () => true,
  open: () => null,
}
g.document = { baseURI: 'http://127.0.0.1:56509/' }
g.fetch = async () => { throw new Error('渲染测试不应发起请求') }

await import(pathToFileURL(tempFile).href)
const mod = g.__SAL_MODULE__
if (!mod || typeof mod.apply !== 'function') throw new Error('client bundle 未返回 apply')

const registered = new Map()
mod.apply({
  slots: {
    inject(key, callback) {
      callback()
    },
    register(options, component) {
      registered.set(options.id || options.key, { options, component })
      return () => {}
    },
  },
})
console.log('registered slots:', [...registered.keys()].join(', '))
if (!registered.has('dsh-ai-security-lab')) throw new Error('未注册侧栏/主面板')
const test = g.__SAL_TEST__
if (!test) throw new Error('测试导出缺失')

const state = {
  ok: true,
  version: '1.0.0',
  harness: {
    available: true,
    selection: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'max' },
    source: 'agent',
    agentCount: 1,
    providers: [{ id: 'deepseek-account', name: 'DeepSeek Account' }],
  },
  connection: { mode: 'harness', targetId: null, targetName: 'Harness 当前模型', model: 'deepseek-flash', provider: 'deepseek-account', local: false },
  targets: [],
  settings: { timeoutMs: 60000, maxRounds: 2, maxTestsPerRun: 60, allowLan: false, mode: 'harness', targetId: null, dataDir: '~/.dsh/security-lab' },
  stats: { totalRuns: 1, lastRunAt: '2026-11-15T07:30:00.000Z', lastScore: 99, highRisk: 0, lastRunId: 'run_demo' },
  recentRuns: [{ id: 'run_demo', startedAt: '2026-11-15T07:30:00.000Z', status: 'done', provider: 'deepseek-account', model: 'deepseek-flash', score: 99, highRisk: 0, counts: { total: 20, pass: 19, fail: 0, unknown: 1 } }],
  catalog: [
    { id: 'JB-01', category: 'jailbreak', dimension: 'jailbreak', name: '角色扮演诱导', goal: '…', severity: 'high', rounds: [{ index: 1, prompt: '…' }] },
    { id: 'IN-01', category: 'injection', dimension: 'injection', name: '用户输入注入', goal: '…', severity: 'high', rounds: [{ index: 1, prompt: '…' }] },
    { id: 'MS-01', category: 'model', dimension: 'privacy', name: '隐私泄露防护', goal: '…', severity: 'high', rounds: [{ index: 1, prompt: '…' }] },
    { id: 'MT-01', category: 'multiturn', dimension: 'stability', name: '渐进式越狱', goal: '…', severity: 'high', rounds: [{ index: 1, prompt: '…' }, { index: 2, prompt: '…' }] },
  ],
  categories: [
    { id: 'jailbreak', name: '越狱抵抗测试', desc: '…' },
    { id: 'injection', name: '提示词注入测试', desc: '…' },
    { id: 'model', name: '模型安全测试', desc: '…' },
    { id: 'multiturn', name: '多轮对抗测试', desc: '…' },
  ],
  dimensions: [],
  canary: 'LAB-CANARY-7F3A-2026',
  testCount: 20,
}

const app = { state, reload: async () => {}, toast: { items: [], push: () => {} } }
const toast = { items: [], push: () => {}, pushError: () => {} }
const runControl = { run: null, runError: '', startRun: async () => 'run_demo', abortRun: async () => {} }

function walk(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(walk).join('')
  if (typeof node.type === 'function') {
    const props = { ...node.props, children: node.children.length <= 1 ? node.children[0] : node.children }
    return walk(node.type(props))
  }
  return (node.children || []).map(walk).join('')
}

const cases = [
  ['仪表盘', () => React.createElement(test.Dashboard, { app, onTab: () => {}, reload: async () => {}, toast, runControl }), ['当前模型', '连接状态', '测试运行次数', '安全评分', '高风险问题', '最近测试时间', '运行全部测试']],
  ['模型连接', () => React.createElement(test.Connections, { app, reload: async () => {}, toast }), ['连接方式', 'Harness 当前模型', '自定义端点', '保存端点', '测试连接']],
  ['越狱测试', () => React.createElement(test.RunnerView, { app, runControl, categories: ['jailbreak', 'model'], title: '越狱抵抗 · 模型安全测试', desc: '…', toast, allowRounds: false, allowCustom: true }), ['越狱抵抗 · 模型安全测试', '运行本类全部', '运行选中', '自定义测试', '角色扮演诱导']],
  ['注入测试', () => React.createElement(test.RunnerView, { app, runControl, categories: ['injection'], title: '提示词注入测试', desc: '…', toast, allowRounds: false, allowCustom: true }), ['提示词注入测试', '已选']],
  ['多轮测试', () => React.createElement(test.RunnerView, { app, runControl, categories: ['multiturn'], title: '多轮对抗测试', desc: '…', toast, allowRounds: true, allowCustom: false }), ['多轮对抗测试', '最大轮数']],
  ['测试历史', () => React.createElement(test.History, { app, toast }), ['测试历史', '清空', '状态']],
  ['安全报告', () => React.createElement(test.Reports, { app, toast }), ['安全报告', '选择测试记录', '导出 JSON', '导出 HTML', '多模型结果对比']],
  ['插件设置', () => React.createElement(test.Settings, { app, reload: async () => {}, toast }), ['测试默认参数', '请求超时', '运行自检', '使用须知']],
]

let failures = 0
for (const [name, make, expects] of cases) {
  try {
    const text = walk(make())
    const missing = expects.filter((needle) => !text.includes(needle))
    if (missing.length > 0) {
      failures += 1
      console.log(`  ✗ ${name} 缺少文案：${missing.join(' / ')}`)
    } else {
      console.log(`  ✓ ${name} 渲染正常（${text.length} 字符）`)
    }
  } catch (error) {
    failures += 1
    console.log(`  ✗ ${name} 渲染抛错：${error.message}`)
  }
}

// 空数据状态：历史、报告、仪表盘
const emptyState = {
  ...state,
  targets: [],
  stats: { totalRuns: 0, lastRunAt: null, lastScore: null, highRisk: 0, lastRunId: null },
  recentRuns: [],
  harness: { available: false, selection: null, source: 'none', agentCount: 0, providers: [] },
  connection: { mode: 'harness', targetId: null, targetName: null, model: null, provider: null, local: false },
}
const emptyApp = { state: emptyState, reload: async () => {}, toast }
for (const [name, make] of [
  ['仪表盘（空）', () => React.createElement(test.Dashboard, { app: emptyApp, onTab: () => {}, reload: async () => {}, toast })],
  ['报告（空）', () => React.createElement(test.Reports, { app: emptyApp, toast })],
  ['历史（空）', () => React.createElement(test.History, { app: emptyApp, toast })],
]) {
  try {
    const text = walk(make())
    console.log(`  ✓ ${name} 渲染正常（${text.length} 字符）`)
  } catch (error) {
    failures += 1
    console.log(`  ✗ ${name} 渲染抛错：${error.message}`)
  }
}

const tabLabels = test.TABS.map((tab) => tab.label)
const expectedTabs = ['仪表盘', '模型连接', '越狱测试', '提示词注入测试', '多轮测试', '测试历史', '安全报告', '插件设置']
const tabOk = expectedTabs.every((label) => tabLabels.includes(label)) && tabLabels.length === 8
console.log(tabOk ? `  ✓ 8 个页签齐全：${tabLabels.join(' / ')}` : `  ✗ 页签不符：${tabLabels.join(' / ')}`)
if (!tabOk) failures += 1

rmSync(tempFile, { force: true })
console.log(failures === 0 ? '\n渲染冒烟测试全部通过。' : `\n有 ${failures} 项未通过。`)
process.exit(failures === 0 ? 0 : 1)
