/**
 * AI 安全测试实验室 —— Host 半边。
 *
 * 职责：
 * 1. 通过 Harness 的 llm / agentDefaultModel 服务读取并使用「当前模型路由」，
 *    不修改用户模型配置，也不读取 API Key；
 * 2. 通过 webServer 注册本插件专用 HTTP 接口，供 Web 界面调用；
 * 3. 维护端点的历史记录（~/.dsh/security-lab），导出 JSON / HTML 报告；
 * 4. 端点 API Key 只保存在 credentials 服务的 record 中。
 *
 * 卸载/停用：所有路由与运行中的任务都在 ctx.effect 里注册，随插件卸载释放。
 */
import {
  TESTS,
  CATEGORIES,
  DIMENSIONS,
  LAB_CANARY,
  publicCatalog,
} from './lib/tests.js'
import { createStore } from './lib/store.js'
import { createRunner } from './lib/runner.js'
import {
  resolveHarnessSelection,
  listProviders,
  isLocalEndpoint,
  createHarnessAdapter,
  createOpenAIAdapter,
  testConnection,
} from './lib/engine.js'
import { toJsonReport, toHtmlReport, redact } from './lib/report.js'

const VERSION = '1.0.0'
const API_PREFIX = '/dsh-security-lab/api'
const EXPORT_PREFIX = '/dsh-security-lab/export'
const MAX_BODY_BYTES = 1024 * 1024

/** 必需的 Host 服务：没有 webServer 就没有界面通道。 */
export const inject = ['webServer']

export function apply(ctx, config = {}) {
  const store = createStore(ctx, config)
  const runner = createRunner({ ctx, store, config: { ...config, version: VERSION } })

  try {
    store.ensure()
  } catch (error) {
    ctx.logger?.warn?.(`[security-lab] 数据目录不可写：${error?.message ?? error}`)
  }

  /** 卸载时中止运行中的任务。 */
  const disposeRunner = runner.abortAll

  const disposeRoutes = []
  ctx.effect(() => {
    const offApi = ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler: (req, res) => void handleApi(req, res) })
    const offExport = ctx.webServer.register({ kind: 'prefix', path: EXPORT_PREFIX, handler: (req, res) => void handleExport(req, res) })
    disposeRoutes.push(offApi, offExport)
    return () => {
      for (const off of disposeRoutes.splice(0)) {
        try {
          off?.()
        } catch {
          // 已释放
        }
      }
    }
  })

  // ---------------------------------------------------------------- 访问控制

  function settings() {
    return store.settings()
  }

  function isLoopback(address) {
    const value = String(address ?? '').replace(/^::ffff:/, '')
    return value === '::1' || value === '127.0.0.1' || value.startsWith('127.')
  }

  /**
   * 只允许本机回环访问；allowLan 打开后仍需同源请求。
   * 这样插件接口不会成为局域网里可被随便调用的模型代理。
   */
  function guard(req, res) {
    const remote = req.socket?.remoteAddress
    const current = settings()
    if (!isLoopback(remote) && !current.allowLan) {
      reply(res, 403, { ok: false, error: '拒绝访问：该接口默认只接受本机回环请求' })
      return false
    }
    const host = String(req.headers.host ?? '')
    const origin = String(req.headers.origin ?? '')
    if (origin) {
      let originHost = ''
      try {
        originHost = new URL(origin).host
      } catch {
        originHost = ''
      }
      if (!originHost || originHost !== host) {
        reply(res, 403, { ok: false, error: '拒绝访问：跨源请求不被接受' })
        return false
      }
    }
    const fetchSite = String(req.headers['sec-fetch-site'] ?? '')
    if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
      reply(res, 403, { ok: false, error: '拒绝访问：只接受同源请求' })
      return false
    }
    return true
  }

  // ---------------------------------------------------------------- HTTP 基础

  function reply(res, status, payload, headers = {}) {
    const body = Buffer.from(JSON.stringify(payload), 'utf8')
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': body.length,
      ...headers,
    })
    res.end(body)
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0
      const chunks = []
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
          reject(new Error('请求体过大（上限 1MB）'))
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if (text.trim().length === 0) {
          resolve({})
          return
        }
        try {
          resolve(JSON.parse(text))
        } catch {
          reject(new Error('请求体不是合法 JSON'))
        }
      })
      req.on('error', reject)
    })
  }

  // ---------------------------------------------------------------- 状态

  async function buildState() {
    const current = settings()
    const harness = resolveHarnessSelection(ctx)
    const providers = await listProviders(ctx)
    let targets = []
    try {
      targets = await store.publicTargets()
    } catch {
      targets = []
    }
    const activeTarget = current.mode === 'openai'
      ? targets.find((target) => target.id === current.targetId) ?? null
      : null
    const stats = store.stats()
    const lastTest = current.lastTest && typeof current.lastTest === 'object' ? current.lastTest : null
    const lastTestApplies = Boolean(lastTest)
      && lastTest.mode === current.mode
      && (current.mode !== 'openai' || lastTest.targetId === current.targetId)

    return {
      ok: true,
      version: VERSION,
      now: new Date().toISOString(),
      harness: {
        available: Boolean(harness.selection),
        selection: harness.selection,
        source: harness.source,
        agentCount: harness.agentCount,
        providers,
      },
      connection: {
        mode: current.mode,
        targetId: current.targetId,
        targetName: activeTarget?.name ?? (current.mode === 'harness' ? 'Harness 当前模型' : null),
        model: activeTarget?.model ?? harness.selection?.model ?? null,
        provider: activeTarget ? (isLocalEndpoint(activeTarget.baseURL) ? 'local' : 'openai-compatible') : harness.selection?.provider ?? null,
        local: activeTarget ? isLocalEndpoint(activeTarget.baseURL) : false,
        status: lastTestApplies ? (lastTest.ok ? 'ok' : 'failed') : 'untested',
        lastTest: lastTestApplies ? redact(lastTest) : null,
      },
      targets,
      settings: redact({
        timeoutMs: current.timeoutMs,
        maxRounds: current.maxRounds,
        maxTestsPerRun: current.maxTestsPerRun,
        allowLan: current.allowLan,
        mode: current.mode,
        targetId: current.targetId,
        dataDir: store.dir,
      }),
      stats,
      recentRuns: store.runSummaries().slice(0, 6),
      catalog: publicCatalog(),
      categories: CATEGORIES,
      dimensions: DIMENSIONS,
      canary: LAB_CANARY,
      testCount: TESTS.length,
    }
  }

  async function buildHealth() {
    const current = settings()
    const checks = []

    checks.push({ id: 'host', name: 'Host 插件已激活', ok: true, detail: `版本 ${VERSION}` })
    checks.push({ id: 'webserver', name: 'webServer 路由已注册', ok: true, detail: `${API_PREFIX} · ${EXPORT_PREFIX}` })

    const llm = ctx.get('llm')
    checks.push({
      id: 'llm',
      name: 'llm 服务（Harness 模型路由）',
      ok: Boolean(llm?.stream),
      detail: llm?.stream ? '可用' : '不可用：无法使用 Harness 当前模型',
    })

    const harness = resolveHarnessSelection(ctx)
    checks.push({
      id: 'model-selection',
      name: 'Harness 当前模型',
      ok: Boolean(harness.selection),
      detail: harness.selection
        ? `${harness.selection.provider} / ${harness.selection.model}（来源：${harness.source === 'agent' ? '在线 Agent' : '默认模型'}）`
        : '未读取到，请在 Harness 中选择模型',
      warning: !harness.selection,
    })

    const credentials = ctx.get('credentials')
    let credentialsWritable = Boolean(credentials?.modifyRecord)
    checks.push({
      id: 'credentials',
      name: 'credentials 服务（API Key 安全存储）',
      ok: credentialsWritable,
      detail: credentialsWritable ? '可用' : '不可用：自定义端点无法保存 API Key',
      warning: !credentialsWritable,
    })

    try {
      store.ensure()
      checks.push({ id: 'data-dir', name: '数据目录可写', ok: true, detail: store.dir })
    } catch (error) {
      checks.push({ id: 'data-dir', name: '数据目录可写', ok: false, detail: `${store.dir}：${error?.message ?? error}` })
    }

    checks.push({
      id: 'catalog',
      name: '测试目录完整性',
      ok: TESTS.length >= 20,
      detail: `${TESTS.length} 项测试 · ${CATEGORIES.length} 个分类 · 合成 canary ${LAB_CANARY}`,
    })

    const ok = checks.every((check) => check.ok || check.warning)
    return { ok, checks, settings: redact(current), version: VERSION }
  }

  // ---------------------------------------------------------------- API 分发

  async function handleApi(req, res) {
    try {
      if (!guard(req, res)) return
      const url = new URL(req.url ?? '/', 'http://localhost')
      const route = url.pathname.slice(API_PREFIX.length).replace(/^\/+/, '') || 'state'
      const method = String(req.method ?? 'GET').toUpperCase()

      if (method === 'GET') {
        if (route === 'state') {
          reply(res, 200, await buildState())
          return
        }
        if (route === 'health') {
          reply(res, 200, await buildHealth())
          return
        }
        if (route === 'catalog') {
          reply(res, 200, { ok: true, catalog: publicCatalog(), categories: CATEGORIES, dimensions: DIMENSIONS })
          return
        }
        if (route === 'history') {
          const id = url.searchParams.get('id')
          if (id) {
            const run = runner.get(id)
            if (!run) {
              reply(res, 404, { ok: false, error: '未找到该测试记录' })
              return
            }
            reply(res, 200, { ok: true, run: redact(run) })
            return
          }
          reply(res, 200, { ok: true, runs: store.runSummaries() })
          return
        }
        if (route === 'compare') {
          const ids = String(url.searchParams.get('ids') ?? '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 6)
          const ids2 = [...new Set(ids)]
          const runs = ids2
            .map((id) => store.getRun(id))
            .filter(Boolean)
            .map((run) => ({
              id: run.id,
              startedAt: run.startedAt,
              finishedAt: run.finishedAt,
              status: run.status,
              mode: run.mode,
              provider: run.provider,
              model: run.model,
              targetName: run.targetName,
              score: run.score?.overall ?? null,
              counts: run.score?.counts ?? { total: 0, pass: 0, fail: 0, unknown: 0 },
              highRisk: run.score?.highRisk ?? 0,
              mediumRisk: run.score?.mediumRisk ?? 0,
              dimensions: Object.fromEntries(
                Object.entries(run.score?.dimensions ?? {}).map(([key, value]) => [key, value?.score ?? null]),
              ),
            }))
          reply(res, 200, { ok: true, runs: redact(runs) })
          return
        }
        if (route === 'run') {
          const id = url.searchParams.get('id')
          const run = id ? runner.get(id) : null
          if (!run) {
            reply(res, 404, { ok: false, error: '未找到该运行记录' })
            return
          }
          reply(res, 200, { ok: true, run: redact(run) })
          return
        }
        reply(res, 404, { ok: false, error: `未知接口：GET ${route}` })
        return
      }

      if (method !== 'POST') {
        reply(res, 405, { ok: false, error: '只支持 GET 与 POST' }, { Allow: 'GET, POST' })
        return
      }

      const body = await readBody(req)

      if (route === 'targets') {
        const action = String(body.action ?? 'save')
        if (action === 'save') {
          const id = await store.saveTarget({
            id: body.id,
            name: body.name,
            baseURL: body.baseURL,
            model: body.model,
            apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
          })
          reply(res, 200, { ok: true, id, targets: await store.publicTargets() })
          return
        }
        if (action === 'delete') {
          await store.deleteTarget(String(body.id ?? ''))
          if (settings().targetId === body.id) await store.saveSettings({ targetId: null })
          reply(res, 200, { ok: true, targets: await store.publicTargets() })
          return
        }
        if (action === 'select') {
          const targetId = String(body.id ?? '')
          if (!store.targets().some((target) => target.id === targetId)) {
            reply(res, 400, { ok: false, error: '目标不存在' })
            return
          }
          await store.saveSettings({ mode: 'openai', targetId })
          reply(res, 200, { ok: true, state: await buildState() })
          return
        }
        if (action === 'clearKey') {
          await store.clearKey(String(body.id ?? ''))
          reply(res, 200, { ok: true, targets: await store.publicTargets() })
          return
        }
        reply(res, 400, { ok: false, error: `未知 action：${action}` })
        return
      }

      if (route === 'settings') {
        const patch = body.patch && typeof body.patch === 'object' ? body.patch : {}
        const allowed = {}
        for (const key of ['mode', 'targetId', 'timeoutMs', 'maxRounds', 'maxTestsPerRun', 'allowLan']) {
          if (key in patch) allowed[key] = patch[key]
        }
        if (allowed.mode !== undefined && !['harness', 'openai'].includes(String(allowed.mode))) {
          reply(res, 400, { ok: false, error: 'mode 只能是 harness 或 openai' })
          return
        }
        await store.saveSettings(allowed)
        reply(res, 200, { ok: true, state: await buildState() })
        return
      }

      if (route === 'test') {
        const current = settings()
        const mode = body.mode === 'openai' ? 'openai' : 'harness'
        const timeoutMs = clampNumber(body.timeoutMs ?? current.timeoutMs, 3000, 120000, 60000)
        const started = Date.now()
        try {
          let adapter
          let label
          if (mode === 'openai') {
            const target = store.targets().find((item) => item.id === String(body.targetId ?? current.targetId ?? ''))
            if (!target) {
              reply(res, 400, { ok: false, error: '请先保存并选择一个自定义端点' })
              return
            }
            adapter = createOpenAIAdapter({
              baseURL: target.baseURL,
              model: target.model,
              apiKey: await store.readKey(target.id),
              timeoutMs,
            })
            label = target.name
          } else {
            adapter = createHarnessAdapter(ctx, { timeoutMs })
            label = 'Harness 当前模型'
          }
          const result = await testConnection(adapter)
          const lastTest = {
            mode,
            targetId: mode === 'openai' ? String(body.targetId ?? current.targetId ?? '') : null,
            ok: true,
            latencyMs: result.latencyMs,
            model: result.model ?? null,
            provider: result.provider ?? null,
            at: new Date().toISOString(),
          }
          await store.saveSettings({ lastTest })
          reply(res, 200, {
            ok: true,
            mode,
            label,
            latencyMs: result.latencyMs,
            model: result.model,
            provider: result.provider,
            replyPreview: result.replyPreview,
            elapsedMs: Date.now() - started,
            lastTest,
          })
        } catch (error) {
          const lastTest = {
            mode,
            targetId: mode === 'openai' ? String(body.targetId ?? current.targetId ?? '') : null,
            ok: false,
            latencyMs: Date.now() - started,
            error: error?.message ?? String(error),
            at: new Date().toISOString(),
          }
          try {
            await store.saveSettings({ lastTest })
          } catch {
            // 保存失败不影响本次结果
          }
          reply(res, 200, {
            ok: false,
            mode,
            error: error?.message ?? String(error),
            code: error?.code ?? 'error',
            elapsedMs: Date.now() - started,
            lastTest,
          })
        }
        return
      }

      if (route === 'run') {
        try {
          const runId = await runner.start({
            mode: body.mode,
            targetId: body.targetId,
            testIds: Array.isArray(body.testIds) ? body.testIds.map(String) : undefined,
            categories: Array.isArray(body.categories) ? body.categories.map(String) : undefined,
            scenario: body.scenario,
            maxRounds: body.maxRounds,
            timeoutMs: body.timeoutMs,
            maxTestsPerRun: body.maxTestsPerRun,
            customOnly: Boolean(body.customOnly),
            customPrompts: Array.isArray(body.customPrompts) ? body.customPrompts : undefined,
          })
          reply(res, 200, { ok: true, runId })
        } catch (error) {
          reply(res, 400, { ok: false, error: error?.message ?? String(error) })
        }
        return
      }

      if (route === 'abort') {
        const id = String(body.id ?? '')
        const ok = runner.abort(id)
        reply(res, 200, { ok, error: ok ? undefined : '该运行已结束或不存在' })
        return
      }

      if (route === 'history') {
        const action = String(body.action ?? '')
        const id = String(body.id ?? '')
        if (action === 'delete') {
          const ok = await store.deleteRun(id)
          reply(res, 200, { ok, runs: store.runSummaries() })
          return
        }
        if (action === 'clear') {
          await store.clearRuns()
          reply(res, 200, { ok: true, runs: store.runSummaries() })
          return
        }
        reply(res, 400, { ok: false, error: `未知 action：${action}` })
        return
      }

      reply(res, 404, { ok: false, error: `未知接口：POST ${route}` })
    } catch (error) {
      try {
        reply(res, 500, { ok: false, error: error?.message ?? String(error) })
      } catch {
        // 响应已发出
      }
    }
  }

  // ---------------------------------------------------------------- 报告导出

  async function handleExport(req, res) {
    try {
      if (!guard(req, res)) return
      const url = new URL(req.url ?? '/', 'http://localhost')
      const id = url.searchParams.get('id') ?? ''
      const format = (url.searchParams.get('format') ?? 'json').toLowerCase()
      const run = runner.get(id)
      if (!run) {
        reply(res, 404, { ok: false, error: '未找到该测试记录' })
        return
      }
      if (run.status === 'running') {
        reply(res, 409, { ok: false, error: '该次运行尚未结束，结束后才能导出报告' })
        return
      }
      const options = { pluginVersion: VERSION, dshVersion: config.dshVersion ?? null }
      const stamp = String(run.startedAt ?? new Date().toISOString()).replace(/[:.]/g, '-')
      if (format === 'html') {
        const html = toHtmlReport(run, options)
        const buffer = Buffer.from(html, 'utf8')
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="security-report-${stamp}.html"`,
          'Content-Length': buffer.length,
          'Cache-Control': 'no-store',
        })
        res.end(buffer)
        return
      }
      if (format === 'json') {
        const json = toJsonReport(run, options)
        const buffer = Buffer.from(json, 'utf8')
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="security-report-${stamp}.json"`,
          'Content-Length': buffer.length,
          'Cache-Control': 'no-store',
        })
        res.end(buffer)
        return
      }
      reply(res, 400, { ok: false, error: 'format 只支持 json 或 html' })
    } catch (error) {
      try {
        reply(res, 500, { ok: false, error: error?.message ?? String(error) })
      } catch {
        // 忽略
      }
    }
  }

  // ---------------------------------------------------------------- 卸载

  ctx.effect(() => () => {
    disposeRunner()
  })

  ctx.logger?.info?.(`[security-lab] 已启用：${API_PREFIX}（${TESTS.length} 项测试）`)
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}
