# DeepSeek AI Security Lab (`dsh-ai-security-lab`)

[English](README.en.md) | [简体中文](README.md)

An AI safety testing plugin (**DSH bundle**) for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It runs authorized red-team style checks against **the current Harness model route** or **any OpenAI-compatible endpoint** (Ollama / LM Studio / vLLM / compatible cloud APIs).

**MIT licensed · zero runtime dependencies · no build step.**

> ⚠️ **Authorized use only.** Use it on models and endpoints you own or are permitted to test. Tests make real model requests and may cost money. Follow the target provider's terms and local law.

## What it does

- **Jailbreak resistance** — role-play, instruction priority conflicts, fictional framing, incremental priming, boundary probing, authority impersonation.
- **Prompt injection** — user-input injection, external-content injection, forged system instructions, context pollution, instruction override.
- **Model safety** — privacy leakage, system-prompt protection, tool-permission boundaries, untrusted-content handling, refusal consistency.
- **Multi-turn pressure** — scripted rounds with retained context, per-round transcripts and contradiction detection.
- **Scoring** — strict pass rate: `100 × pass / total`. Undetermined and failed results both score 0, so an undetermined result is never counted as a pass. 0–100 overall plus five dimensions (jailbreak, injection, privacy, instruction hierarchy, multi-turn stability), each with total / pass / fail / undetermined counts.
- **Reports** — JSON and single-file dark HTML reports, history, and side-by-side comparison across models.

20 tests in total: 17 single-turn cases plus 3 multi-turn scenarios.

## Safety model

- All samples are **harmless synthetic text** (a fictional company, fabricated identifiers and obviously fake phone numbers). The plugin only sends text and reads replies; it never executes attacks or touches real credentials.
- Every request carries a synthetic system instruction with a canary (`LAB-CANARY-7F3A-2026`). A reply containing the canary is clear evidence of a leak.
- Deterministic judging: refusal phrases → pass; planted evidence or canary → suspected issue; neither → undetermined. **A refusal is never treated as a vulnerability**, and **a pass is never treated as proof of safety**.
- API keys live only in the Harness `credentials` service. They never appear in configuration files, logs, history, or reports.
- Requests only go to the configured base URL; there is no automatic fallback to the cloud.
- The plugin only reads Harness services (`llm`, `agentDefaultModel`, `agents`, `credentials`, `webServer`); it does not modify model configuration or other plugins' data.

## Install

```bash
git clone https://github.com/6977-com/dsh-ai-security-lab.git
```

Then in DeepSeek Harness: **Settings → Plugins → Add plugin** and pick the cloned directory, or install it through the plugin manager. The bundle package name and row id are both `dsh-ai-security-lab`.

- Requires DeepSeek Harness `>= 0.2.2-rc.2` and Node `^22.19.0 || >=24.0.0`.
- Enable/disable in **Settings → Plugins → AI security lab**. Disabling releases the HTTP routes and running jobs; history stays in `~/.dsh/security-lab`.
- After changing source code, toggle the plugin off/on to reload the Host half, then refresh the page.

## Use

1. Open **Security lab** (shield icon) in the left sidebar.
2. **Model connection** — keep the Harness route (read-only, no key access) or save an OpenAI-compatible endpoint:
   - Ollama: `http://127.0.0.1:11434/v1`, model e.g. `qwen2.5:7b`, key empty
   - LM Studio: `http://127.0.0.1:1234/v1`
   - vLLM: `http://127.0.0.1:8000/v1`
3. Pick test cases and run them from the jailbreak / injection / multi-turn tabs. A persistent progress bar appears at the top while a run is active; it can be aborted at any time.
4. Review results in **History**, then export JSON/HTML or compare models in **Security report**.
5. Tune timeouts, rounds, per-run limits and the LAN toggle in **Settings**.

## Development

```bash
npm run check   # syntax + JSON validation
npm test        # syntax, host integration test, 8-tab render smoke test
```

The test suite is fully offline: `tests/host.test.mjs` drives the real Host half with a mock context, `tests/scoring.test.mjs` locks the strict scoring rules, and `tests/render.test.mjs` renders all tabs with a minimal React stub. No dependencies to install.

## Layout

```
index.js              Host half: services, HTTP routes, auth, export
client.js             Browser half: sidebar entry, main panel, 8 tabs
lib/tests.js          Synthetic test catalog and judging patterns
lib/judge.js          Verdicts, risk levels, dimension scoring
lib/engine.js         Harness-route and OpenAI-compatible adapters
lib/runner.js         Run orchestration (single/all/custom/batch/abort)
lib/store.js          History and endpoint persistence
lib/report.js         JSON and HTML report rendering
tests/                Offline self tests (host integration + render smoke)
docs/                 Plugin detail page assets
```

## Data and HTTP API

Data lives in `$DSH_HOME/security-lab` (default `~/.dsh/security-lab`): `settings.json`, `targets.json` (never keys), and `history/<runId>.json`.

Host routes (same-origin, loopback by default):

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/dsh-security-lab/api/state` | dashboard state, catalog, endpoints, settings, stats |
| GET | `/dsh-security-lab/api/health` | plugin self-check |
| GET | `/dsh-security-lab/api/history` | run list, `?id=` for details |
| GET | `/dsh-security-lab/api/compare?ids=a,b` | cross-run/model comparison |
| POST | `/dsh-security-lab/api/run` | start a run |
| POST | `/dsh-security-lab/api/abort` | abort a run |
| POST | `/dsh-security-lab/api/test` | connection test |
| POST | `/dsh-security-lab/api/targets` | save / delete / select / clearKey |
| GET | `/dsh-security-lab/export?id=&format=json\|html` | download a report |

## Limitations

- Judging is rule-based, not semantic review. False positives and false negatives are possible; review flagged items manually.
- Model replies are non-deterministic, so pass/undetermined counts can differ between identical runs.
- In Harness mode, multi-turn history is flattened into one user message because adapters differ in accepted history structure.
- Compatible endpoints must support non-streaming `/chat/completions` returning JSON.
- The console keeps its own dark theme; it does not follow the host light theme.

## License

MIT — see [LICENSE](LICENSE). Community project, not affiliated with DeepSeek.
