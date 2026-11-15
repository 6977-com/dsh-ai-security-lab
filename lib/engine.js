/**
 * 请求层：把「一次对话」发给被测模型，并把结果规整成 { text, usage, durationMs }。
 *
 * 两种模式：
 * 1. harness —— 走 DeepSeek Harness 当前的模型路由（ctx.llm + agentDefaultModel /
 *    在线 Agent 的 model.current()）。不读取、不落盘、不暴露任何 API Key。
 * 2. openai  —— 走用户显式配置的 OpenAI 兼容端点（Ollama / LM Studio / vLLM /
 *    兼容云服务）。Key 只在该次请求的 Authorization 头里出现，不写日志、不进报告。
 *
 * 安全约束：
 * - 只向用户配置的 baseURL 发请求，绝不自动回退到云端或第二个端点；
 * - 所有请求都有超时与中止；
 * - 错误信息只保留可公开描述（状态码、错误体片段），从不包含 Authorization。
 */
import { LAB_SYSTEM_PROMPT } from './tests.js'

export class RequestError extends Error {
  constructor(message, { code = 'request-failed', status } = {}) {
    super(message)
    this.name = 'RequestError'
    this.code = code
    this.status = status
  }
}

const LOCAL_HOST_RE = /^(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|::1|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|[a-z0-9-]+\.local)$/i

/** 判断 baseURL 是否指向本机/内网（用于「本地模型」标识与提示）。 */
export function isLocalEndpoint(baseURL) {
  try {
    const url = new URL(String(baseURL))
    return LOCAL_HOST_RE.test(url.hostname)
  } catch {
    return false
  }
}

/** 把 baseURL 规整成 chat/completions 的完整地址。 */
export function chatCompletionsUrl(baseURL) {
  const raw = String(baseURL ?? '').trim()
  if (!raw) throw new RequestError('未配置 API 地址（Base URL）', { code: 'invalid-base-url' })
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new RequestError('API 地址格式不合法，需要以 http:// 或 https:// 开头', { code: 'invalid-base-url' })
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new RequestError('API 地址只支持 http 与 https', { code: 'invalid-base-url' })
  }
  let pathname = url.pathname.replace(/\/+$/, '')
  if (/\/chat\/completions$/.test(pathname)) {
    // 用户直接给了完整接口地址
  } else if (pathname === '') {
    pathname = '/v1/chat/completions'
  } else {
    pathname = `${pathname}/chat/completions`
  }
  url.pathname = pathname
  url.search = ''
  return url.toString()
}

function withTimeout(timeoutMs, externalSignal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new RequestError(`请求超时（${timeoutMs}ms）`, { code: 'timeout' })), timeoutMs)
  if (typeof timer.unref === 'function') timer.unref()
  const onExternalAbort = () => controller.abort(new RequestError('已被用户中止', { code: 'aborted' }))
  if (externalSignal) {
    if (externalSignal.aborted) onExternalAbort()
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true })
  }
  return {
    signal: controller.signal,
    abort: (reason) => controller.abort(reason),
    clear: () => {
      clearTimeout(timer)
      externalSignal?.removeEventListener?.('abort', onExternalAbort)
    },
  }
}

/** 读取 Harness 当前模型：优先在线 Agent，其次默认模型选择。 */
export function resolveHarnessSelection(ctx) {
  const agentsService = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
  const agents = (() => {
    try {
      return agentsService?.list?.() ?? []
    } catch {
      return []
    }
  })()

  for (const agent of [...agents].reverse()) {
    try {
      const selection = agent?.model?.current?.()
      if (selection?.provider && selection?.model) {
        return {
          selection,
          source: 'agent',
          agentCount: agents.length,
          sessionId: agent?.session?.id ?? null,
        }
      }
    } catch {
      // 单个 Agent 读取失败不影响回退
    }
  }

  try {
    const fallback = ctx.get('agentDefaultModel')?.currentSelection?.()
    if (fallback?.provider && fallback?.model) {
      return { selection: fallback, source: 'default', agentCount: agents.length, sessionId: null }
    }
  } catch {
    // 忽略
  }

  return { selection: null, source: 'none', agentCount: agents.length, sessionId: null }
}

/** 列出 Harness 已注册的 provider（失败时返回空数组，不抛错）。 */
export async function listProviders(ctx) {
  try {
    const llm = ctx.get('llm')
    if (!llm?.listProviders) return []
    const list = await llm.listProviders()
    return Array.isArray(list) ? list.map((item) => ({ id: item.id, name: item.name ?? item.id })) : []
  } catch {
    return []
  }
}

/** 把多轮历史压平成一次请求的说明文本（harness 模式使用）。 */
function flattenHistory(history) {
  if (!history || history.length === 0) return ''
  const lines = ['以下是我们此前的对话记录，请结合上下文继续回答最后一轮：', '']
  for (const turn of history) {
    lines.push(`第 ${turn.index} 轮 · 用户：${turn.prompt}`)
    lines.push(`第 ${turn.index} 轮 · 助手：${turn.answer}`)
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * Harness 路由适配器。不接触 API Key。
 */
export function createHarnessAdapter(ctx, { timeoutMs, system = LAB_SYSTEM_PROMPT }) {
  return {
    mode: 'harness',
    label: 'Harness 当前模型路由',
    async chat({ prompt, history = [], signal }) {
      const llm = ctx.get('llm')
      if (!llm?.stream) {
        throw new RequestError('当前 Harness 未提供 llm 服务，无法使用模型路由', { code: 'llm-unavailable' })
      }
      const resolved = resolveHarnessSelection(ctx)
      if (!resolved.selection) {
        throw new RequestError('未能读取 Harness 当前模型（没有在线 Agent，也没有默认模型选择）', { code: 'no-selection' })
      }
      const { provider, model, reasoningEffort } = resolved.selection

      const flattened = flattenHistory(history)
      const text = flattened ? `${flattened}现在请回答第 ${history.length + 1} 轮：\n${prompt}` : prompt

      const timer = withTimeout(timeoutMs, signal)
      const startedAt = Date.now()
      let collected = ''
      let usage = null
      try {
        const stream = llm.stream({
          provider,
          model,
          ...(reasoningEffort ? { reasoningEffort } : {}),
          system,
          messages: [{ role: 'user', content: [{ type: 'text', text }] }],
          temperature: 0.2,
          maxTokens: 900,
          signal: timer.signal,
        })
        for await (const chunk of stream) {
          if (chunk?.type === 'text-delta') {
            collected += chunk.text ?? ''
          } else if (chunk?.type === 'usage') {
            usage = chunk.usage ?? null
          } else if (chunk?.type === 'finish') {
            const reason = chunk.reason ?? {}
            if (reason.kind === 'error') {
              const message = reason.failure?.message ?? '模型调用失败'
              throw new RequestError(message, { code: reason.failure?.code ?? 'llm-error', status: reason.failure?.status })
            }
            if (reason.kind === 'aborted' && collected.length === 0) {
              throw new RequestError('模型调用被中止', { code: 'aborted' })
            }
          }
        }
      } catch (error) {
        if (error instanceof RequestError) throw error
        if (timer.signal.aborted) {
          const reason = timer.signal.reason
          if (reason instanceof RequestError) throw reason
          throw new RequestError('模型调用被中止', { code: 'aborted' })
        }
        throw new RequestError(
          `Harness 模型调用失败：${error?.message ?? String(error)}`,
          { code: 'llm-error' },
        )
      } finally {
        timer.clear()
      }

      return {
        text: collected,
        usage,
        durationMs: Date.now() - startedAt,
        provider,
        model,
        source: resolved.source,
      }
    },
  }
}

/**
 * OpenAI 兼容适配器。Key 只用于本次请求头。
 */
export function createOpenAIAdapter({ baseURL, model, apiKey, timeoutMs, system = LAB_SYSTEM_PROMPT }) {
  const url = chatCompletionsUrl(baseURL)
  const local = isLocalEndpoint(baseURL)
  return {
    mode: 'openai',
    label: local ? '本地 OpenAI 兼容端点' : 'OpenAI 兼容端点',
    baseURL: url,
    model,
    async chat({ prompt, history = [], signal }) {
      if (!model) throw new RequestError('未配置模型名称（model）', { code: 'invalid-model' })
      const messages = [{ role: 'system', content: system }]
      for (const turn of history) {
        messages.push({ role: 'user', content: turn.prompt })
        messages.push({ role: 'assistant', content: turn.answer })
      }
      messages.push({ role: 'user', content: prompt })

      const headers = { 'Content-Type': 'application/json' }
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`

      const timer = withTimeout(timeoutMs, signal)
      const startedAt = Date.now()
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 900, stream: false }),
          signal: timer.signal,
        })
        const raw = await response.text()
        if (!response.ok) {
          const snippet = raw.replace(/\s+/g, ' ').slice(0, 300)
          throw new RequestError(`端点返回 HTTP ${response.status}：${snippet || response.statusText}`, {
            code: 'http-error',
            status: response.status,
          })
        }
        let parsed
        try {
          parsed = JSON.parse(raw)
        } catch {
          throw new RequestError('端点返回的不是 JSON，请确认该地址是 OpenAI 兼容接口', { code: 'invalid-response' })
        }
        const content = parsed?.choices?.[0]?.message?.content
        const text = typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content.map((part) => (typeof part === 'string' ? part : part?.text ?? '')).join('')
            : ''
        return {
          text: String(text ?? ''),
          usage: parsed?.usage ?? null,
          durationMs: Date.now() - startedAt,
          provider: parsed?.model ?? model,
          model,
          source: 'openai',
        }
      } catch (error) {
        if (error instanceof RequestError) throw error
        if (timer.signal.aborted) {
          const reason = timer.signal.reason
          if (reason instanceof RequestError) throw reason
          throw new RequestError('请求被中止', { code: 'aborted' })
        }
        const cause = error?.cause?.code ?? error?.cause?.message ?? ''
        throw new RequestError(
          `无法连接端点：${error?.message ?? String(error)}${cause ? `（${cause}）` : ''}`,
          { code: 'network-error' },
        )
      } finally {
        timer.clear()
      }
    },
  }
}

/** 连接测试：发一条最小请求，验证地址、鉴权与模型名。 */
export async function testConnection(adapter) {
  const started = Date.now()
  const response = await adapter.chat({
    prompt: '这是一次连接测试。请只回复两个字：正常。',
    history: [],
  })
  return {
    ok: true,
    latencyMs: Date.now() - started,
    model: response.model,
    provider: response.provider,
    replyPreview: String(response.text ?? '').replace(/\s+/g, ' ').slice(0, 120),
  }
}
