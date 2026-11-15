/**
 * 持久化层。
 *
 * 落盘位置：$DSH_HOME/security-lab（默认 ~/.dsh/security-lab），与插件包、
 * 用户 profile 的 cordis.patch.yml 完全分离，升级/卸载插件不影响历史。
 *
 * API Key 不落这里：只以 credentials 服务的 record（<owner>/<id>）保存，
 * 文件里最多出现 hasKey: true/false。
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync, rmSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CREDENTIAL_OWNER = 'dsh-security-lab'
const MAX_HISTORY = 200

export function dshHome() {
  return process.env.DSH_HOME && process.env.DSH_HOME.trim().length > 0
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
}

function newId(prefix) {
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}${random}`
}

function readJson(file, fallback) {
  try {
    if (!existsSync(file)) return fallback
    const text = readFileSync(file, 'utf8')
    if (text.trim().length === 0) return fallback
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function writeJsonAtomic(file, value) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temp, file)
}

const DEFAULT_SETTINGS = {
  mode: 'harness',
  targetId: null,
  timeoutMs: 60000,
  maxRounds: 2,
  maxTestsPerRun: 60,
  allowLan: false,
}

export function createStore(ctx, rawConfig = {}) {
  const config = { ...DEFAULT_SETTINGS, ...(rawConfig ?? {}) }
  const dir = String(config.dataDir && config.dataDir.trim().length > 0
    ? config.dataDir
    : join(dshHome(), 'security-lab'))
  const historyDir = join(dir, 'history')
  const settingsFile = join(dir, 'settings.json')
  const targetsFile = join(dir, 'targets.json')

  let queue = Promise.resolve()
  function serialize(task) {
    const next = queue.then(task, task)
    queue = next.catch(() => {})
    return next
  }

  function ensure() {
    mkdirSync(historyDir, { recursive: true })
  }

  function credentials() {
    try {
      return ctx.get('credentials') ?? null
    } catch {
      return null
    }
  }

  function credentialKey(targetId) {
    return `${CREDENTIAL_OWNER}/${targetId}`
  }

  async function readKey(targetId) {
    const service = credentials()
    if (!service?.readRecord) return null
    try {
      const record = await service.readRecord(credentialKey(targetId))
      return record && record.kind === 'api-key' && typeof record.key === 'string' ? record.key : null
    } catch {
      return null
    }
  }

  async function setKey(targetId, apiKey) {
    const service = credentials()
    if (!service?.modifyRecord) {
      throw new Error('当前 profile 没有 credentials 服务，无法安全保存 API Key')
    }
    const value = String(apiKey ?? '').trim()
    if (value.length === 0) {
      await service.deleteRecord?.(credentialKey(targetId))
      return false
    }
    await service.modifyRecord(credentialKey(targetId), async () => ({ kind: 'api-key', key: value }))
    return true
  }

  async function clearKey(targetId) {
    const service = credentials()
    if (!service?.deleteRecord) return
    try {
      await service.deleteRecord(credentialKey(targetId))
    } catch {
      // 已经不存在时忽略
    }
  }

  function settings() {
    const stored = readJson(settingsFile, {})
    return {
      ...config,
      ...stored,
      dataDir: dir,
      timeoutMs: clampNumber(stored.timeoutMs ?? config.timeoutMs, 3000, 600000, 60000),
      maxRounds: clampNumber(stored.maxRounds ?? config.maxRounds, 1, 8, 2),
      maxTestsPerRun: clampNumber(stored.maxTestsPerRun ?? config.maxTestsPerRun, 1, 200, 60),
      allowLan: Boolean(stored.allowLan ?? config.allowLan),
    }
  }

  async function saveSettings(patch) {
    return serialize(async () => {
      ensure()
      const next = { ...settings(), ...(patch ?? {}) }
      delete next.dataDir
      writeJsonAtomic(settingsFile, next)
      return settings()
    })
  }

  function targets() {
    const stored = readJson(targetsFile, [])
    return Array.isArray(stored) ? stored : []
  }

  async function publicTargets() {
    const list = targets()
    const out = []
    for (const target of list) {
      out.push({
        id: target.id,
        name: target.name,
        baseURL: target.baseURL,
        model: target.model,
        createdAt: target.createdAt ?? null,
        updatedAt: target.updatedAt ?? null,
        hasKey: (await readKey(target.id)) !== null,
      })
    }
    return out
  }

  async function saveTarget(input) {
    return serialize(async () => {
      ensure()
      const list = targets()
      const now = new Date().toISOString()
      const name = String(input.name ?? '').trim() || '未命名端点'
      const baseURL = String(input.baseURL ?? '').trim()
      const model = String(input.model ?? '').trim()
      if (!baseURL) throw new Error('请填写 API 地址')
      if (!model) throw new Error('请填写模型名称')

      let id = String(input.id ?? '').trim()
      let existing = list.find((item) => item.id === id)
      if (!existing) {
        id = id || newId('t')
        existing = { id, createdAt: now }
        list.push(existing)
      }
      existing.name = name
      existing.baseURL = baseURL
      existing.model = model
      existing.updatedAt = now

      writeJsonAtomic(targetsFile, list)
      if (typeof input.apiKey === 'string') {
        await setKey(id, input.apiKey)
      }
      return id
    })
  }

  async function deleteTarget(id) {
    return serialize(async () => {
      const list = targets().filter((item) => item.id !== id)
      writeJsonAtomic(targetsFile, list)
      await clearKey(id)
    })
  }

  function runFiles() {
    ensure()
    try {
      return readdirSync(historyDir).filter((name) => name.endsWith('.json'))
    } catch {
      return []
    }
  }

  function runSummaries() {
    const files = runFiles()
    const out = []
    for (const file of files) {
      try {
        const stat = readFileSync(join(historyDir, file), 'utf8')
        const parsed = JSON.parse(stat)
        out.push({
          id: parsed.id,
          startedAt: parsed.startedAt,
          finishedAt: parsed.finishedAt ?? null,
          status: parsed.status,
          mode: parsed.mode,
          targetName: parsed.targetName,
          provider: parsed.provider,
          model: parsed.model,
          scenario: parsed.scenario ?? 'full',
          score: parsed.score?.overall ?? null,
          counts: parsed.score?.counts ?? { total: 0, pass: 0, fail: 0, unknown: 0 },
          planned: parsed.progress?.total ?? parsed.score?.counts?.total ?? 0,
          highRisk: parsed.score?.highRisk ?? 0,
          mediumRisk: parsed.score?.mediumRisk ?? 0,
        })
      } catch {
        // 坏文件跳过，不影响其它历史
      }
    }
    return out.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt))).slice(0, MAX_HISTORY)
  }

  async function saveRun(run) {
    return serialize(async () => {
      ensure()
      writeJsonAtomic(join(historyDir, `${run.id}.json`), run)
      // 只保留最近 MAX_HISTORY 条
      const summaries = runSummaries()
      for (const summary of summaries.slice(MAX_HISTORY)) {
        try {
          unlinkSync(join(historyDir, `${summary.id}.json`))
        } catch {
          // 忽略
        }
      }
    })
  }

  function getRun(id) {
    if (!/^run_[A-Za-z0-9]+$/.test(String(id ?? ''))) return null
    return readJson(join(historyDir, `${id}.json`), null)
  }

  async function deleteRun(id) {
    return serialize(async () => {
      if (!/^run_[A-Za-z0-9]+$/.test(String(id ?? ''))) return false
      try {
        unlinkSync(join(historyDir, `${id}.json`))
        return true
      } catch {
        return false
      }
    })
  }

  async function clearRuns() {
    return serialize(async () => {
      for (const file of runFiles()) {
        try {
          unlinkSync(join(historyDir, file))
        } catch {
          // 忽略
        }
      }
    })
  }

  function stats() {
    const summaries = runSummaries()
    const last = summaries[0] ?? null
    return {
      totalRuns: summaries.length,
      totalCases: summaries.reduce((sum, item) => sum + (item.counts?.total ?? 0), 0),
      lastRunAt: last?.finishedAt ?? last?.startedAt ?? null,
      lastScore: last?.score ?? null,
      lastStatus: last?.status ?? null,
      lastPlanned: last?.planned ?? 0,
      lastDone: last?.counts?.total ?? 0,
      highRisk: last?.highRisk ?? 0,
      lastRunId: last?.id ?? null,
    }
  }

  function removeEverything() {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // 忽略
    }
  }

  return {
    dir,
    ensure,
    settings,
    saveSettings,
    targets,
    publicTargets,
    saveTarget,
    deleteTarget,
    readKey,
    setKey,
    clearKey,
    runSummaries,
    saveRun,
    getRun,
    deleteRun,
    clearRuns,
    stats,
    removeEverything,
    newId,
  }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}
