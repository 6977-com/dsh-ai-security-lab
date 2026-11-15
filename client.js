/**
 * AI 安全测试实验室 —— 浏览器半边。
 *
 * 以 dsh.client bundle 的模块格式加载：id 与 package name 一致，
 * React 由宿主模块表提供，不引入任何 Harness Client 包。
 *
 * 数据全部经 Host 的 /dsh-security-lab/api 取得；页面本身不接触 API Key，
 * 也不发起任何第三方网络请求。
 */
window.__ModuleLoader__.load({
  id: 'dsh-ai-security-lab',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useMemo, useCallback } = React

    // ---------------------------------------------------------------- 基础设施

    const APP_BASE = (() => {
      try {
        const path = new URL(document.baseURI).pathname
        if (path.endsWith('/')) {
          const base = path.replace(/\/+$/, '')
          return base
        }
      } catch {
        // 本地 file:// 等场景忽略
      }
      return ''
    })()

    const abs = (path) => (APP_BASE && path.startsWith('/') ? `${APP_BASE}${path}` : path)
    const API = (suffix) => abs(`/dsh-security-lab/api/${suffix}`)
    const EXPORT_URL = (id, format) => abs(`/dsh-security-lab/export?id=${encodeURIComponent(id)}&format=${format}`)

    async function request(url, options) {
      let response
      try {
        response = await fetch(url, {
          cache: 'no-store',
          ...options,
          headers: { Accept: 'application/json', ...(options && options.headers ? options.headers : {}) },
        })
      } catch (error) {
        throw new Error(`无法连接 Host 接口：${error && error.message ? error.message : String(error)}`)
      }
      let data = null
      try {
        data = await response.json()
      } catch {
        throw new Error(`Host 返回了非 JSON 响应（HTTP ${response.status}）`)
      }
      if (!response.ok || data.ok === false) {
        throw new Error((data && data.error) || `请求失败（HTTP ${response.status}）`)
      }
      return data
    }

    const getJson = (suffix) => request(API(suffix))
    const postJson = (suffix, body) => request(API(suffix), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    })

    function fmtTime(iso) {
      if (!iso) return '—'
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return '—'
      const pad = (value) => String(value).padStart(2, '0')
      return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    function fmtDateTime(iso) {
      if (!iso) return '—'
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return '—'
      const pad = (value) => String(value).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    }

    function fmtMs(ms) {
      const value = Number(ms) || 0
      return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`
    }

    function tone(value) {
      if (value === null || value === undefined) return 'idle'
      return value >= 85 ? 'good' : value >= 60 ? 'warn' : 'bad'
    }

    // ---------------------------------------------------------------- 样式

    const CSS = `
.sal-root { --sal-accent:#38c2ef; --sal-accent-2:#2ee6b0; --sal-line:rgba(96,156,204,.2);
  --sal-panel:linear-gradient(180deg, rgba(19,30,43,.94), rgba(11,17,25,.94));
  height:100%; min-height:0; display:flex; flex-direction:column; overflow:hidden; color-scheme:dark;
  background: radial-gradient(1300px 540px at 16% -18%, #12314a 0%, #0a1018 48%, #070a0f 100%);
  color:#dbe7f3; font:13.5px/1.55 "Segoe UI","Microsoft YaHei",system-ui,-apple-system,sans-serif; }
.sal-root * { box-sizing:border-box; }
.sal-head { flex:none; padding:16px 22px 0; background:linear-gradient(180deg, rgba(13,22,33,.96), rgba(9,14,21,.55));
  border-bottom:1px solid var(--sal-line); backdrop-filter:blur(6px); }
.sal-titlebar { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.sal-logo { width:34px; height:34px; border-radius:10px; display:grid; place-items:center; flex:none;
  background:linear-gradient(160deg, rgba(56,194,239,.22), rgba(46,230,176,.14)); border:1px solid rgba(90,190,235,.4);
  box-shadow:0 0 20px rgba(56,194,239,.18); }
.sal-title { font-size:16.5px; font-weight:650; letter-spacing:.03em; color:#eaf6ff; }
.sal-sub { font-size:11.8px; color:#7e94aa; letter-spacing:.02em; }
.sal-titlebar .sal-grow { flex:1 }
.sal-pill { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:99px; font-size:11.5px;
  border:1px solid rgba(120,170,210,.28); color:#a9c2d8; background:rgba(20,32,46,.6); white-space:nowrap; }
.sal-pill.good { color:#63e6bd; border-color:rgba(60,220,170,.4); background:rgba(20,60,50,.35); }
.sal-pill.warn { color:#f2c161; border-color:rgba(240,190,80,.38); background:rgba(60,45,15,.32); }
.sal-pill.bad { color:#ff8a8a; border-color:rgba(255,110,110,.4); background:rgba(60,18,18,.35); }
.sal-dot { width:6px; height:6px; border-radius:99px; background:currentColor; box-shadow:0 0 8px currentColor; }
.sal-tabs { display:flex; gap:2px; margin-top:15px; overflow-x:auto; scrollbar-width:none; }
.sal-tabs::-webkit-scrollbar { display:none; }
.sal-tab { border:0; background:transparent; color:#8aa2b9; font:inherit; font-size:12.8px; padding:9px 13px;
  border-radius:9px 9px 0 0; cursor:pointer; display:inline-flex; align-items:center; gap:7px; white-space:nowrap;
  transition:color .15s, background .15s; }
.sal-tab:hover { color:#d7e9f8; background:rgba(90,160,210,.09); }
.sal-tab.on { color:#f0f9ff; background:rgba(64,152,210,.16); box-shadow:inset 0 -2px 0 var(--sal-accent); }
.sal-body { flex:1; min-height:0; overflow:auto; padding:20px 22px 44px; }
.sal-body::-webkit-scrollbar { width:10px; height:10px; }
.sal-body::-webkit-scrollbar-thumb { background:rgba(100,150,190,.26); border-radius:99px; }
.sal-grid { display:grid; gap:14px; }
.sal-grid.stats { grid-template-columns:repeat(auto-fit, minmax(168px, 1fr)); }
.sal-grid.two { grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); }
.sal-card { background:var(--sal-panel); border:1px solid var(--sal-line); border-radius:13px; padding:15px 16px;
  box-shadow:0 14px 34px rgba(0,0,0,.32); position:relative; overflow:hidden; }
.sal-card::after { content:""; position:absolute; inset:0 0 auto 0; height:1px;
  background:linear-gradient(90deg, transparent, rgba(90,200,240,.4), transparent); }
.sal-card h3 { margin:0 0 12px; font-size:13.5px; font-weight:600; color:#bcd7ea; letter-spacing:.03em; }
.sal-k { font-size:11.2px; color:#7e94aa; letter-spacing:.06em; text-transform:uppercase; }
.sal-v { font-size:21px; font-weight:650; color:#eaf6ff; margin-top:5px; font-variant-numeric:tabular-nums; }
.sal-v.small { font-size:14px; font-weight:550; }
.sal-v.good { color:#5fe3b8 } .sal-v.warn { color:#f2c161 } .sal-v.bad { color:#ff8585 } .sal-v.idle { color:#93a9bf }
.sal-hint { font-size:11.6px; color:#7e94aa; }
.sal-row { display:flex; gap:9px; align-items:center; flex-wrap:wrap; }
.sal-row.end { justify-content:flex-end }
.sal-col { display:flex; flex-direction:column; gap:10px }
.sal-sep { height:1px; background:var(--sal-line); margin:14px 0 }
.sal-btn { border:1px solid rgba(120,170,210,.3); background:rgba(24,38,54,.9); color:#cfe4f5; font:inherit; font-size:12.6px;
  padding:7px 13px; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:6px;
  transition:background .15s, border-color .15s, transform .06s; }
.sal-btn:hover:not(:disabled) { background:rgba(38,60,84,.95); border-color:rgba(120,190,235,.5); }
.sal-btn:active:not(:disabled) { transform:translateY(1px) }
.sal-btn:disabled { opacity:.45; cursor:not-allowed }
.sal-btn.primary { background:linear-gradient(180deg, rgba(56,194,239,.94), rgba(32,140,196,.94)); border-color:rgba(90,200,240,.7); color:#03121c; font-weight:600 }
.sal-btn.primary:hover:not(:disabled) { background:linear-gradient(180deg, #4fd2ff, #2a9dd4) }
.sal-btn.ghost { background:transparent }
.sal-btn.danger { color:#ff9d9d; border-color:rgba(255,120,120,.35) }
.sal-btn.sm { padding:4px 9px; font-size:11.8px; border-radius:7px }
.sal-chip { border:1px solid rgba(120,170,210,.26); background:rgba(20,32,46,.6); color:#9fb8cd; font:inherit; font-size:11.8px;
  padding:5px 11px; border-radius:99px; cursor:pointer; display:inline-flex; gap:6px; align-items:center }
.sal-chip.on { color:#eaf9ff; border-color:rgba(70,200,240,.55); background:rgba(40,120,170,.3) }
.sal-input, .sal-select, .sal-textarea { width:100%; background:rgba(7,12,18,.86); border:1px solid rgba(100,150,190,.26);
  border-radius:8px; color:#dceaf6; font:inherit; font-size:12.8px; padding:8px 10px; outline:none; transition:border-color .15s, box-shadow .15s }
.sal-input:focus, .sal-select:focus, .sal-textarea:focus { border-color:rgba(70,200,240,.6); box-shadow:0 0 0 3px rgba(56,194,239,.12) }
.sal-textarea { resize:vertical; min-height:72px; line-height:1.6 }
.sal-select option { background:#0b1119; color:#dceaf6 }
.sal-field { display:flex; flex-direction:column; gap:5px }
.sal-field > label { font-size:11.8px; color:#93aac0; letter-spacing:.02em }
.sal-field > .sal-hint { margin-top:1px }
.sal-switch { display:inline-flex; align-items:center; gap:8px; cursor:pointer; user-select:none; font-size:12.4px; color:#b9cee0 }
.sal-switch input { position:absolute; opacity:0; width:0; height:0 }
.sal-switch .track { width:34px; height:19px; border-radius:99px; background:rgba(90,130,165,.34); position:relative; transition:background .15s; flex:none }
.sal-switch .knob { position:absolute; top:2px; left:2px; width:15px; height:15px; border-radius:99px; background:#dbeaf7; transition:transform .15s }
.sal-switch input:checked + .track { background:linear-gradient(90deg,#2f9fd8,#2ee6b0) }
.sal-switch input:checked + .track .knob { transform:translateX(15px) }
.sal-bar { height:6px; border-radius:99px; background:rgba(90,140,180,.18); overflow:hidden }
.sal-bar > i { display:block; height:100%; border-radius:99px; background:linear-gradient(90deg,#2f9fd8,#2ee6b0); transition:width .4s ease }
.sal-bar > i.warn { background:linear-gradient(90deg,#f0b23e,#ff9d4c) }
.sal-bar > i.bad { background:linear-gradient(90deg,#ff6b6b,#d94660) }
.sal-dim { display:flex; flex-direction:column; gap:5px; margin-bottom:13px }
.sal-dim .top { display:flex; justify-content:space-between; align-items:baseline; gap:8px }
.sal-dim .name { font-size:12.6px; color:#c3d8ea }
.sal-dim .score { font-size:12.4px; color:#7fe0c4; font-variant-numeric:tabular-nums }
.sal-badge { display:inline-flex; align-items:center; gap:4px; font-size:11px; padding:2px 8px; border-radius:99px;
  border:1px solid currentColor; white-space:nowrap }
.sal-badge.pass { color:#5fe3b8 } .sal-badge.fail { color:#ff8585 } .sal-badge.unknown { color:#f2c161 }
.sal-badge.high { color:#ff8a8a } .sal-badge.medium { color:#f2c161 } .sal-badge.low { color:#79c8ee } .sal-badge.none { color:#879db2 }
.sal-badge.custom { color:#b2a6ff }
.sal-list { display:flex; flex-direction:column; gap:8px }
.sal-item { border:1px solid rgba(100,150,190,.16); border-radius:10px; background:rgba(9,14,21,.7); overflow:hidden }
.sal-item > summary { list-style:none; cursor:pointer; padding:10px 12px; display:flex; gap:9px; align-items:center; flex-wrap:wrap }
.sal-item > summary::-webkit-details-marker { display:none }
.sal-item .nm { font-weight:560; color:#e0eefb; font-size:12.8px }
.sal-item .id { font:11.5px/1.4 ui-monospace, Consolas, monospace; color:#7490a8 }
.sal-item .meta { margin-left:auto; color:#7890a6; font-size:11.6px }
.sal-item .inside { padding:0 12px 12px; display:flex; flex-direction:column; gap:9px }
.sal-block { display:flex; flex-direction:column; gap:4px }
.sal-block > b { font-size:11.6px; color:#9fc7e8; font-weight:600 }
.sal-pre { white-space:pre-wrap; word-break:break-word; margin:0; padding:9px 11px; border-radius:8px; max-height:260px; overflow:auto;
  background:rgba(5,9,14,.92); border:1px solid rgba(90,140,180,.16); color:#c7dcee;
  font:12px/1.62 ui-monospace, Consolas, "Cascadia Mono", monospace }
.sal-empty { color:#7890a6; font-size:12.4px; padding:14px 0; text-align:center }
.sal-table { width:100%; border-collapse:collapse; font-size:12.4px }
.sal-table th { text-align:left; color:#8ba3ba; font-weight:500; font-size:11.4px; letter-spacing:.04em; padding:7px 9px;
  border-bottom:1px solid rgba(100,150,190,.2); white-space:nowrap }
.sal-table td { padding:8px 9px; border-bottom:1px solid rgba(100,150,190,.1); color:#c3d8ea; vertical-align:middle }
.sal-table tr:hover td { background:rgba(60,110,150,.08) }
.sal-table .num { font-variant-numeric:tabular-nums }
.sal-scroll { overflow:auto; max-height:430px; border-radius:9px }
.sal-progress { display:flex; flex-direction:column; gap:7px }
.sal-progress .top { display:flex; justify-content:space-between; font-size:12px; color:#9db5ca }
.sal-note { font-size:11.8px; color:#7e94aa; background:rgba(30,48,66,.34); border:1px solid rgba(100,150,190,.14);
  border-left:2px solid rgba(56,194,239,.55); border-radius:6px; padding:8px 10px }
.sal-warnbox { font-size:12px; color:#f5d08a; background:rgba(70,52,16,.34); border:1px solid rgba(230,180,70,.28);
  border-radius:8px; padding:8px 10px }
.sal-error { font-size:12.2px; color:#ffb1b1; background:rgba(80,22,22,.4); border:1px solid rgba(255,110,110,.32);
  border-radius:8px; padding:8px 10px; word-break:break-word }
.sal-toast { position:fixed; right:22px; bottom:22px; z-index:60; display:flex; flex-direction:column; gap:8px; pointer-events:none }
.sal-toast > div { pointer-events:auto; background:rgba(16,26,38,.97); border:1px solid rgba(90,180,230,.4); color:#dcecf8;
  border-radius:9px; padding:9px 13px; font-size:12.4px; box-shadow:0 12px 30px rgba(0,0,0,.45); max-width:380px }
.sal-toast > div.bad { border-color:rgba(255,110,110,.5); color:#ffc4c4 }
.sal-spin { width:13px; height:13px; border-radius:99px; border:2px solid rgba(120,180,220,.28); border-top-color:#4fd2ff;
  animation:sal-spin .8s linear infinite; display:inline-block; flex:none }
@keyframes sal-spin { to { transform:rotate(360deg) } }
.sal-kv { display:grid; grid-template-columns:auto 1fr; gap:5px 14px; font-size:12.3px }
.sal-kv .k { color:#8ba3ba } .sal-kv .v2 { color:#d3e6f6; word-break:break-all }
.sal-tabsline { display:flex; gap:6px; flex-wrap:wrap }
.sal-actions { display:flex; gap:7px; flex-wrap:wrap }
.sal-mono { font:11.8px/1.5 ui-monospace, Consolas, monospace; color:#9fb8cd }
.sal-root { position:relative }
.sal-tabs { flex-wrap:wrap; overflow:visible }
.sal-tabs::-webkit-scrollbar { display:none }
.sal-runbar { flex:none; display:flex; align-items:center; gap:10px; padding:7px 22px; font-size:12px;
  background:rgba(28,78,108,.3); border-bottom:1px solid var(--sal-line); color:#bcd9ec }
.sal-runbar .sal-bar { flex:1; max-width:260px }
.sal-testlist { display:flex; flex-direction:column; gap:7px; max-height:380px; overflow:auto; padding-right:2px }
.sal-test { display:grid; grid-template-columns:18px 1fr; gap:9px; padding:9px 11px; cursor:pointer;
  border:1px solid rgba(100,150,190,.16); border-radius:9px; background:rgba(9,14,21,.55); align-items:flex-start }
.sal-test:hover { border-color:rgba(70,180,225,.4); background:rgba(16,28,40,.7) }
.sal-test input { margin-top:3px; accent-color:#38c2ef }
.sal-test .nm { font-size:12.7px; color:#e0eefb; font-weight:560 }
.sal-group-title { font-size:11.6px; letter-spacing:.05em; color:#7f9ab2; text-transform:uppercase; margin:12px 0 6px }
.sal-focusable:focus-visible, .sal-input:focus-visible, .sal-select:focus-visible, .sal-textarea:focus-visible,
.sal-btn:focus-visible, .sal-chip:focus-visible, .sal-tab:focus-visible { outline:2px solid rgba(79,210,255,.65); outline-offset:2px }
.sal-switch input:focus-visible + .track { box-shadow:0 0 0 3px rgba(56,194,239,.32) }
.sal-bar > i.zero { min-width:2px }
.sal-toast { position:absolute; right:18px; bottom:18px }
.sal-table { min-width:640px }
.sal-select { min-width:0 }
@media (max-width:640px) { .sal-body { padding:14px 13px 34px } .sal-head { padding:12px 13px 0 } .sal-v { font-size:18px }
  .sal-runbar { padding:6px 13px } .sal-toast { right:10px; left:10px; bottom:10px } .sal-tabs { gap:0 }
  .sal-tab { padding:8px 10px; font-size:12.2px } }
`

    // ---------------------------------------------------------------- 图标

    const ICON_PATHS = {
      dashboard: 'M3 3h7v7H3V3zm0 11h7v7H3v-7zm11-11h7v7h-7V3zm0 11h7v7h-7v-7z',
      plug: 'M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8zm6 12v2',
      jailbreak: 'M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4zm-4 9l3 3 5-5',
      injection: 'M4 6h16M4 12h10M4 18h7M17 14l3 3-3 3M20 5l-3 3 3 3',
      chat: 'M4 4h16v11H9l-5 4V4zm4 5h8M8 12h5',
      history: 'M12 8v5l3 2M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3 4v4h4',
      report: 'M6 2h9l4 4v16H6V2zm9 0v5h4M9 12h7M9 16h7M9 8h3',
      settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3H9l-.3 2.9a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L4.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1L9 21h6l.3-2.9a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6z',
      shield: 'M12 2l8 3.5v6c0 5.2-3.4 8.4-8 10.5-4.6-2.1-8-5.3-8-10.5v-6L12 2z',
      play: 'M7 4l13 8-13 8V4z',
      stop: 'M6 6h12v12H6z',
      refresh: 'M20 11a8 8 0 1 0-2.3 6M20 5v6h-6',
      check: 'M4 12l5 5L20 6',
      alert: 'M12 3l9 17H3L12 3zm0 5v6m0 3v.5',
      download: 'M12 3v11m0 0l-4-4m4 4l4-4M4 20h16',
      trash: 'M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13',
      plus: 'M12 5v14M5 12h14',
      test: 'M9 3h6M10 3v5l-5 9a3 3 0 0 0 2.6 4h8.8A3 3 0 0 0 19 17l-5-9V3',
    }

    function Icon({ name, size = 16, color }) {
      const path = ICON_PATHS[name] || ICON_PATHS.shield
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: color || 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        style: { flex: 'none', display: 'block' },
      }, h('path', { d: path }))
    }

    // ---------------------------------------------------------------- 原子组件

    function Card({ title, extra, children, style }) {
      return h('section', { className: 'sal-card', style },
        title || extra
          ? h('div', { className: 'sal-row', style: { justifyContent: 'space-between', marginBottom: 11 } },
            h('h3', { style: { margin: 0 } }, title),
            extra || null)
          : null,
        children)
    }

    function Pill({ tone: pillTone, children, dot = true }) {
      const cls = pillTone ? `sal-pill ${pillTone}` : 'sal-pill'
      return h('span', { className: cls }, dot ? h('i', { className: 'sal-dot' }) : null, children)
    }

    function Btn({ children, onClick, disabled, variant, size, title, ariaLabel, type = 'button' }) {
      const cls = ['sal-btn', variant || '', size === 'sm' ? 'sm' : ''].filter(Boolean).join(' ')
      return h('button', { type, className: cls, onClick, disabled, title: title || ariaLabel, 'aria-label': ariaLabel }, children)
    }

    function Badge({ tone: badgeTone, children }) {
      return h('span', { className: `sal-badge ${badgeTone || 'none'}` }, children)
    }

    function Bar({ value, width = '100%' }) {
      const number = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value))
      const cls = value === null || value === undefined ? 'bad' : number >= 85 ? '' : number >= 60 ? 'warn' : 'bad'
      const shown = number === 0 ? 2 : number
      return h('div', { className: 'sal-bar', style: { width } }, h('i', { className: cls, style: { width: `${shown}%` } }))
    }

    function Field({ label, hint, children }) {
      const id = useMemo(() => `sal-f-${Math.random().toString(36).slice(2, 9)}`, [])
      const control = children && typeof children === 'object' && children.type && children.props
        ? { ...children, props: { ...children.props, id: children.props.id || id } }
        : children
      return h('div', { className: 'sal-field' },
        label ? h('label', { htmlFor: children && children.props && children.props.id ? children.props.id : id }, label) : null,
        control,
        hint ? h('span', { className: 'sal-hint' }, hint) : null)
    }

    function Switch({ checked, onChange, label }) {
      return h('label', { className: 'sal-switch' },
        h('input', { type: 'checkbox', checked: Boolean(checked), onChange: (event) => onChange(event.target.checked) }),
        h('span', { className: 'track' }, h('span', { className: 'knob' })),
        label ? h('span', null, label) : null)
    }

    function Note({ children, warn }) {
      return h('div', { className: warn ? 'sal-warnbox' : 'sal-note' }, children)
    }

    function Empty({ children }) {
      return h('div', { className: 'sal-empty' }, children || '暂无数据')
    }

    function ScoreRing({ value }) {
      const number = value === null || value === undefined ? null : Math.round(value)
      const cls = `sal-v ${tone(number)}`
      return h('div', null,
        h('div', { className: 'sal-k' }, '综合安全评分'),
        h('div', { className: cls }, number === null ? '—' : `${number}`),
        h('div', { className: 'sal-hint' }, number === null ? '尚无测试记录' : '严格通过率（无法判定计 0 分）'))
    }

    function verdictBadge(verdict) {
      const label = { pass: '通过', fail: '疑似问题', unknown: '无法判定' }[verdict] || String(verdict || '—')
      return h(Badge, { tone: verdict }, label)
    }

    function riskBadge(risk) {
      const label = { none: '无风险', low: '低风险', medium: '中风险', high: '高风险' }[risk] || String(risk || '—')
      return h(Badge, { tone: risk || 'none' }, label)
    }

    function ResultItem({ item, open }) {
      return h('details', { className: 'sal-item', open: Boolean(open) },
        h('summary', null,
          h('span', { className: 'nm' }, item.name),
          h('span', { className: 'id' }, item.id),
          verdictBadge(item.verdict),
          riskBadge(item.risk),
          item.refused ? h(Badge, { tone: 'low' }, '已拒绝') : null,
          item.custom ? h(Badge, { tone: 'custom' }, '自定义') : null,
          h('span', { className: 'meta' }, `${fmtMs(item.durationMs)}`)),
        h('div', { className: 'inside' },
          h('div', { className: 'sal-hint' },
            `来源：${item.provider || '—'} / ${item.model || '—'} · 适配器 ${item.adapter || '—'} · 耗时 ${fmtMs(item.durationMs)}`),
          h('div', { className: 'sal-block' }, h('b', null, '测试输入'), h('pre', { className: 'sal-pre' }, item.input || '—')),
          h('div', { className: 'sal-block' }, h('b', null, '实际输出'),
            h('pre', { className: 'sal-pre' }, item.output || (item.error ? `[请求失败] ${item.error}` : '（空）'))),
          item.rounds && item.rounds.length
            ? h('div', { className: 'sal-block' }, h('b', null, '逐轮记录'),
              h('div', { className: 'sal-col' }, item.rounds.map((round) => h('div', { key: round.index, className: 'sal-block' },
                h('span', { className: 'sal-hint' }, `第 ${round.index} 轮 · ${round.refused ? '明确拒绝' : round.unsafe ? '出现风险证据' : '未明确拒绝'} · ${fmtMs(round.durationMs)}`),
                h('pre', { className: 'sal-pre' }, `>>> ${round.prompt}\n<<< ${round.output || `[失败] ${round.error || ''}`}`)))))
            : null,
          h('div', { className: 'sal-block' }, h('b', null, '判定依据'),
            h('div', { style: { color: '#b9cee0', fontSize: '12.3px' } }, item.rationale || '—'),
            item.evidence && item.evidence.length
              ? h('ul', { style: { margin: '6px 0 0 18px', padding: 0, color: '#a9c2d8', fontSize: '12.2px' } },
                item.evidence.map((line, index) => h('li', { key: index }, line)))
              : null)))
    }

    // ---------------------------------------------------------------- 数据钩子

    function useToast() {
      const [items, setItems] = useState([])
      const timer = useRef(null)
      const push = useCallback((text, bad) => {
        const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        setItems((list) => [...list, { id, text, bad }])
        setTimeout(() => setItems((list) => list.filter((item) => item.id !== id)), 4200)
      }, [])
      useEffect(() => () => clearTimeout(timer.current), [])
      return { items, push }
    }

    function ToastStack({ items }) {
      if (!items.length) return null
      return h('div', { className: 'sal-toast', role: 'status', 'aria-live': 'polite' },
        items.map((item) => h('div', { key: item.id, className: item.bad ? 'bad' : '' }, item.text)))
    }

    function useRunDetail(runId) {
      const [run, setRun] = useState(null)
      useEffect(() => {
        let cancelled = false
        setRun(null)
        if (!runId) return () => { cancelled = true }
        getJson(`history?id=${encodeURIComponent(runId)}`)
          .then((data) => { if (!cancelled) setRun(data.run) })
          .catch(() => { if (!cancelled) setRun(null) })
        return () => { cancelled = true }
      }, [runId])
      return run
    }

    // ---------------------------------------------------------------- 仪表盘

    function Dashboard({ app, onTab, reload, toast, runControl }) {
      const { state } = app
      const stats = state.stats || {}
      const lastRun = useRunDetail(stats.lastRunId)
      const [busy, setBusy] = useState(false)
      const activeRun = runControl ? runControl.run : null

      const harness = state.harness || {}
      const connection = state.connection || {}
      const score = lastRun && lastRun.score ? lastRun.score : null
      const dims = score ? score.dimensions : null
      const connected = connection.status === 'ok'
        || (connection.status !== 'failed' && (harness.available || Boolean(connection.targetName)))
      const lastStatusLabel = { done: '已完成', aborted: '已中止', failed: '失败', running: '运行中' }[stats.lastStatus] || ''
      const coverage = stats.lastPlanned && stats.lastDone !== stats.lastPlanned
        ? `${stats.lastDone}/${stats.lastPlanned} 项`
        : stats.lastDone ? `${stats.lastDone} 项` : '—'

      async function runAll() {
        const planned = state.testCount
        if (!window.confirm(`将向当前被测模型发送约 ${planned} 个真实请求（含多轮轮次），可能产生费用。确定运行全部测试？`)) return
        setBusy(true)
        try {
          await runControl.startRun({
            mode: state.settings.mode,
            targetId: state.settings.targetId,
            scenario: 'all',
            maxRounds: state.settings.maxRounds,
            timeoutMs: state.settings.timeoutMs,
          })
          toast.push(`已启动全量测试，共 ${planned} 项`)
          onTab('jailbreak')
        } catch {
          // startRun 已提示错误
        } finally {
          setBusy(false)
        }
      }

      const recentRuns = state.recentRuns || []
      const recentRows = recentRuns.slice(0, 5).map((run) => h('div', {
        key: run.id,
        className: 'sal-row',
        style: { justifyContent: 'space-between', padding: '7px 2px', borderBottom: '1px solid rgba(100,150,190,.12)' },
      },
      h('div', null,
        h('div', { style: { fontSize: '12.6px', color: '#d3e6f6' } }, `${run.provider || '—'} / ${run.model || '—'}`),
        h('div', { className: 'sal-hint' }, `${fmtTime(run.startedAt)} · ${run.counts.total} 项 · 高风险 ${run.highRisk}`)),
      h('div', { className: 'sal-row' },
        run.status === 'running' ? h(Pill, { tone: 'warn' }, '运行中') : null,
        h('span', { className: `sal-v small ${tone(run.score)}`, style: { marginTop: 0 } }, run.score === null ? '—' : String(run.score)))))

      const dimRows = dims
        ? Object.values(dims).map((dimension) => h('div', { key: dimension.id, className: 'sal-dim' },
          h('div', { className: 'top' },
            h('span', { className: 'name' }, dimension.name),
            h('span', { className: 'score' }, dimension.score === null ? '未测试' : `${dimension.score} 分`)),
          h(Bar, { value: dimension.score }),
          h('div', { className: 'sal-hint' }, `共 ${dimension.total} · 通过 ${dimension.pass} · 疑似 ${dimension.fail} · 无法判定 ${dimension.unknown}`)))
        : h(Empty, null, '还没有测试记录，先运行一次测试吧')

      return h('div', { className: 'sal-grid', style: { gap: 16 } },
        h(Card, null,
          h('div', { className: 'sal-row', style: { justifyContent: 'space-between' } },
            h('div', { className: 'sal-row' },
              h(Icon, { name: 'shield', size: 22, color: '#38c2ef' }),
              h('div', null,
                h('div', { className: 'sal-title' }, 'AI 模型安全测试实验室'),
                h('div', { className: 'sal-sub' }, '越狱抵抗 · 提示词注入 · 隐私保护 · 指令层级 · 多轮稳定性 / 全部使用无害合成样本'))),
            h(Pill, { tone: connection.status === 'ok' ? 'good' : connection.status === 'failed' ? 'bad' : 'warn' },
              connection.status === 'ok'
                ? `连接正常 · ${connection.model || harness.selection?.model || ''}`
                : connection.status === 'failed'
                  ? '连接失败 · 请在「模型连接」重试'
                  : connected ? `待测试 · ${connection.model || harness.selection?.model || ''}` : '尚未选择被测模型')),
          h('div', { className: 'sal-row', style: { marginTop: 13 } },
            h(Btn, {
              variant: 'primary',
              onClick: runAll,
              disabled: busy || Boolean(activeRun && activeRun.status === 'running'),
            },
            busy || (activeRun && activeRun.status === 'running') ? h('span', { className: 'sal-spin' }) : h(Icon, { name: 'play', size: 13 }),
            activeRun && activeRun.status === 'running' ? ' 测试运行中…' : ' 运行全部测试'),
            h(Btn, { onClick: () => onTab('connections') }, h(Icon, { name: 'plug', size: 13 }), ' 模型连接'),
            h(Btn, { onClick: () => onTab('reports') }, h(Icon, { name: 'report', size: 13 }), ' 安全报告'),
            h(Btn, { onClick: reload }, h(Icon, { name: 'refresh', size: 13 }), ' 刷新'))),

        h('div', { className: 'sal-grid stats' },
          h(Card, { style: { padding: '13px 15px' } },
            h('div', { className: 'sal-k' }, '当前模型'),
            h('div', { className: 'sal-v small' }, connection.model || harness.selection?.model || '未连接'),
            h('div', { className: 'sal-hint' }, connection.provider || harness.selection?.provider || '—')),
          h(Card, { style: { padding: '13px 15px' } },
            h('div', { className: 'sal-k' }, '连接状态'),
            h('div', { className: `sal-v small ${connection.status === 'ok' ? 'good' : connection.status === 'failed' ? 'bad' : 'warn'}` },
              connection.status === 'ok' ? '连接正常' : connection.status === 'failed' ? '连接失败' : connected ? '未测试' : '未配置'),
            h('div', { className: 'sal-hint' },
              connection.lastTest && connection.status !== 'untested'
                ? `${fmtTime(connection.lastTest.at)} 测试 · ${connection.lastTest.latencyMs ?? '—'}ms`
                : '可在「模型连接」测试一次')),
          h(Card, { style: { padding: '13px 15px' } },
            h('div', { className: 'sal-k' }, '测试运行次数'),
            h('div', { className: 'sal-v' }, String(stats.totalRuns ?? 0)),
            h('div', { className: 'sal-hint' }, `累计执行 ${stats.totalCases ?? 0} 个用例`)),
          h(Card, { style: { padding: '13px 15px' } },
            h('div', { className: 'sal-k' }, '安全评分'),
            h('div', { className: `sal-v ${tone(stats.lastScore)}` }, stats.lastScore === null || stats.lastScore === undefined ? '—' : String(stats.lastScore)),
            h('div', { className: 'sal-hint' }, stats.lastScore === null || stats.lastScore === undefined
              ? '严格通过率：通过数 / 总数'
              : `${lastStatusLabel} · 覆盖 ${coverage} · 无法判定计 0`)),
          h(Card, { style: { padding: '13px 15px' } },
            h('div', { className: 'sal-k' }, '高风险问题'),
            h('div', { className: `sal-v ${stats.highRisk > 0 ? 'bad' : 'good'}` }, String(stats.highRisk ?? 0)),
            h('div', { className: 'sal-hint' }, '最近一次运行的高风险项')),
          h(Card, { style: { padding: '13px 15px' } },
            h('div', { className: 'sal-k' }, '最近测试时间'),
            h('div', { className: 'sal-v small' }, fmtDateTime(stats.lastRunAt)),
            h('div', { className: 'sal-hint' }, stats.lastRunId ? stats.lastRunId : '还没有测试记录'))),

        h('div', { className: 'sal-grid two' },
          h(Card, { title: '分维度安全评分', extra: h('span', { className: 'sal-hint' }, lastRun ? `最近一次 · ${fmtTime(lastRun.startedAt)}` : '暂无') },
            dimRows),
          h(Card, { title: '最近运行', extra: h(Btn, { size: 'sm', variant: 'ghost', onClick: () => onTab('history') }, '全部历史') },
            recentRuns.length === 0 ? h(Empty) : h('div', { className: 'sal-list' }, recentRows))),

        h(Card, { title: '测试范围与判定口径' },
          h('div', { className: 'sal-grid', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' } },
            (state.categories || []).map((category) => h('div', { key: category.id, style: { padding: '9px 11px', border: '1px solid rgba(100,150,190,.16)', borderRadius: 9 } },
              h('div', { style: { fontSize: '12.6px', color: '#d3e6f6' } }, category.name),
              h('div', { className: 'sal-hint', style: { marginTop: 3 } }, category.desc))))),
        h(Note, null, '全部样本为无害合成文本：虚构公司、虚构人名与明显伪造的号码/标识；插件不执行任何真实恶意操作，也不尝试窃取任何真实凭据或个人信息。'),
      )
    }

    // ---------------------------------------------------------------- 模型连接

    function Connections({ app, reload, toast }) {
      const { state } = app
      const harness = state.harness || {}
      const settings = state.settings || {}
      const connection = state.connection || {}
      const targets = state.targets || []
      const [form, setForm] = useState({ id: '', name: '', baseURL: '', model: '', apiKey: '' })
      const [testingMode, setTestingMode] = useState('')
      const [testResult, setTestResult] = useState(null)
      const [saving, setSaving] = useState(false)

      const connected = connection.status === 'ok'
        || (connection.status !== 'failed' && (harness.available || Boolean(connection.targetName)))
      const statusText = connection.status === 'ok' ? '连接正常'
        : connection.status === 'failed' ? '连接失败'
          : connected ? '未测试' : '未配置'
      const statusTone = connection.status === 'ok' ? 'good' : connection.status === 'failed' ? 'bad' : 'warn'

      function patch(key, value) {
        setForm((current) => ({ ...current, [key]: value }))
      }

      function editTarget(target) {
        setForm({ id: target.id, name: target.name, baseURL: target.baseURL, model: target.model, apiKey: '' })
        setTestResult(null)
      }

      async function saveTarget() {
        if (!form.baseURL.trim() || !form.model.trim()) {
          toast.push('请填写 API 地址与模型名称', true)
          return
        }
        setSaving(true)
        try {
          const body = { action: 'save', id: form.id || undefined, name: form.name, baseURL: form.baseURL, model: form.model }
          if (form.apiKey.trim().length > 0) body.apiKey = form.apiKey
          const data = await postJson('targets', body)
          setForm({ id: data.id, name: form.name, baseURL: form.baseURL, model: form.model, apiKey: '' })
          toast.push('端点已保存（API Key 只写入 credentials 服务）')
          await reload()
        } catch (error) {
          toast.push(error.message, true)
        } finally {
          setSaving(false)
        }
      }

      async function selectTarget(targetId) {
        try {
          await postJson('targets', { action: 'select', id: targetId })
          toast.push('已切换被测端点')
          await reload()
        } catch (error) {
          toast.push(error.message, true)
        }
      }

      async function removeTarget(target) {
        if (!window.confirm(`确定删除端点「${target.name}」？对应 API Key 也会一并清除。`)) return
        try {
          await postJson('targets', { action: 'delete', id: target.id })
          toast.push('端点已删除')
          if (form.id === target.id) setForm({ id: '', name: '', baseURL: '', model: '', apiKey: '' })
          await reload()
        } catch (error) {
          toast.push(error.message, true)
        }
      }

      async function clearKey(target) {
        if (!window.confirm(`确定清除端点「${target.name}」的 API Key？该操作不可恢复。`)) return
        try {
          await postJson('targets', { action: 'clearKey', id: target.id })
          toast.push('已清除该端点的 API Key')
          await reload()
        } catch (error) {
          toast.push(error.message, true)
        }
      }

      async function useHarness() {
        try {
          await postJson('settings', { patch: { mode: 'harness', targetId: null } })
          toast.push('已切换到 Harness 当前模型路由')
          await reload()
        } catch (error) {
          toast.push(error.message, true)
        }
      }

      async function useEndpointMode() {
        if (targets.length === 0) {
          toast.push('请先在下方保存一个自定义端点', true)
          return
        }
        const targetId = form.id || settings.targetId || targets[0].id
        await selectTarget(targetId)
      }

      async function testConnection(mode) {
        if (testingMode) return
        if (mode === 'openai' && !(form.id || settings.targetId)) {
          toast.push('请先保存端点，再测试连接', true)
          return
        }
        setTestingMode(mode)
        setTestResult(null)
        try {
          const body = mode === 'openai'
            ? { mode, targetId: form.id || settings.targetId }
            : { mode: 'harness' }
          const data = await postJson('test', body)
          setTestResult(data)
          if (data.ok) toast.push(`连接成功 · ${data.latencyMs}ms`)
          else toast.push(`连接失败：${data.error}`, true)
          await reload()
        } catch (error) {
          setTestResult({ ok: false, mode, error: error.message })
          toast.push(error.message, true)
        } finally {
          setTestingMode('')
        }
      }

      const localHint = /^https?:\/\/(?:localhost|127\.|0\.0\.0\.0|\[?::1|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(form.baseURL.trim())
      const canTestOpenAI = Boolean(form.id || settings.targetId) && !testingMode

      const statusCard = h(Card, { title: '连接状态' },
        h('div', { className: 'sal-row', style: { justifyContent: 'space-between' } },
          h('div', { className: 'sal-row' },
            h(Pill, { tone: statusTone }, statusText),
            h('span', { className: 'sal-hint' },
              `${settings.mode === 'openai' ? '兼容端点' : 'Harness 路由'} · ${connection.model || '—'}`)),
          h(Btn, { size: 'sm', onClick: reload }, h(Icon, { name: 'refresh', size: 12 }), ' 刷新')),
        connection.lastTest
          ? h('div', { className: 'sal-kv', style: { marginTop: 10 } },
            h('span', { className: 'k' }, '最近测试'), h('span', { className: 'v2' }, fmtDateTime(connection.lastTest.at)),
            h('span', { className: 'k' }, '结果'), h('span', { className: 'v2' }, connection.lastTest.ok ? `成功 · ${connection.lastTest.latencyMs ?? '—'}ms · ${connection.lastTest.model || '—'}` : `失败：${connection.lastTest.error || '未知错误'}`))
          : h('div', { className: 'sal-hint', style: { marginTop: 8 } }, '还没有连接测试记录；点下面的「测试连接」验证一次。'))

      const modeCard = h(Card, { title: '连接方式' },
        h('div', { className: 'sal-tabsline' },
          h('button', { type: 'button', className: `sal-chip ${settings.mode !== 'openai' ? 'on' : ''}`, onClick: useHarness },
            h(Icon, { name: 'shield', size: 13 }), ' Harness 当前模型路由'),
          h('button', { type: 'button', className: `sal-chip ${settings.mode === 'openai' ? 'on' : ''}`, onClick: useEndpointMode },
            h(Icon, { name: 'plug', size: 13 }), ' 自定义 OpenAI 兼容端点')),
        h('div', { className: 'sal-hint', style: { marginTop: 9 } },
          '只读使用 Harness 已配置的模型路由，不修改、不覆盖你的模型配置；两种模式的测试请求都只指向当前选中的那一个模型。'))

      const harnessCard = h(Card, { title: 'Harness 当前模型' },
        h('div', { className: 'sal-kv' },
          h('span', { className: 'k' }, '模型'), h('span', { className: 'v2' }, harness.selection ? `${harness.selection.provider} / ${harness.selection.model}` : '未读取到'),
          h('span', { className: 'k' }, '来源'), h('span', { className: 'v2' }, harness.source === 'agent' ? `在线 Agent（${harness.agentCount} 个）` : harness.source === 'default' ? 'Harness 默认模型' : '—'),
          h('span', { className: 'k' }, 'Agent 数'), h('span', { className: 'v2' }, String(harness.agentCount ?? 0)),
          h('span', { className: 'k' }, '可用 Provider'), h('span', { className: 'v2' }, (harness.providers || []).map((item) => item.id).join('、') || '—')),
        h('div', { className: 'sal-row', style: { marginTop: 12 } },
          h(Btn, { onClick: () => testConnection('harness'), disabled: Boolean(testingMode) },
            testingMode === 'harness' ? h('span', { className: 'sal-spin' }) : h(Icon, { name: 'test', size: 13 }), ' 测试连接'),
          settings.mode !== 'openai' ? h(Badge, { tone: 'pass' }, '当前使用') : h(Btn, { size: 'sm', onClick: useHarness }, '使用此路由')),
        h(Note, null, '该模式不读取任何 API Key：请求经 Harness 的 llm 服务发出，路由与凭据由 Harness 自己管理。'))

      const endpointCard = h(Card, {
        title: '自定义端点',
        extra: h(Btn, { size: 'sm', variant: 'ghost', onClick: () => setForm({ id: '', name: '', baseURL: '', model: '', apiKey: '' }) }, h(Icon, { name: 'plus', size: 12 }), ' 新建'),
      },
      h('div', { className: 'sal-col' },
        h(Field, { label: '名称' }, h('input', { className: 'sal-input', value: form.name, placeholder: '例如：本地 Ollama', onChange: (event) => patch('name', event.target.value) })),
        h(Field, { label: 'Base URL', hint: '兼容地址，例如 http://127.0.0.1:11434/v1；填到 /chat/completions 也可以' },
          h('input', { className: 'sal-input', value: form.baseURL, placeholder: 'http://127.0.0.1:11434/v1', onChange: (event) => patch('baseURL', event.target.value) })),
        h(Field, { label: '模型名称' }, h('input', { className: 'sal-input', value: form.model, placeholder: '例如：qwen2.5:7b 或 gpt-4o-mini', onChange: (event) => patch('model', event.target.value) })),
        h(Field, { label: 'API Key', hint: '本地模型通常留空；Key 保存在 credentials 服务，不会写入配置文件、日志或报告' },
          h('input', { className: 'sal-input', type: 'password', value: form.apiKey, placeholder: form.id ? '已保存则留空表示不修改' : '本地模型可留空', onChange: (event) => patch('apiKey', event.target.value), autoComplete: 'new-password' })),
        localHint ? h('div', { className: 'sal-hint' }, '检测到本机/内网地址：请求只会发往该地址，不会转到云端。') : null,
        h('div', { className: 'sal-actions' },
          h(Btn, { variant: 'primary', onClick: saveTarget, disabled: saving }, saving ? h('span', { className: 'sal-spin' }) : null, ' 保存端点'),
          h(Btn, { onClick: () => testConnection('openai'), disabled: !canTestOpenAI },
            testingMode === 'openai' ? h('span', { className: 'sal-spin' }) : h(Icon, { name: 'test', size: 13 }), ' 测试连接')),
        !form.id && !settings.targetId
          ? h('div', { className: 'sal-hint' }, '测试连接前请先保存端点（或选中一个已保存端点）。')
          : null,
        testResult
          ? h('div', { className: testResult.ok ? 'sal-note' : 'sal-error' },
            `${testResult.mode === 'openai' ? '兼容端点' : 'Harness 路由'} · ${testResult.ok
              ? `连接正常 · ${testResult.latencyMs}ms · 模型 ${testResult.model || '—'} · 回复「${testResult.replyPreview || ''}」`
              : `连接失败：${testResult.error || '未知错误'}`}`)
          : null))

      const targetRows = targets.map((target) => {
        const actions = h('div', { className: 'sal-actions' },
          h(Btn, { size: 'sm', onClick: () => selectTarget(target.id) }, '使用'),
          h(Btn, { size: 'sm', variant: 'ghost', onClick: () => editTarget(target) }, '编辑'),
          target.hasKey ? h(Btn, { size: 'sm', variant: 'ghost', onClick: () => clearKey(target) }, '清除 Key') : null,
          h(Btn, { size: 'sm', variant: 'danger', ariaLabel: `删除端点 ${target.name}`, onClick: () => removeTarget(target) }, h(Icon, { name: 'trash', size: 12 })))
        return h('div', { key: target.id, className: 'sal-item', style: { padding: '10px 12px' } },
          h('div', { className: 'sal-row', style: { justifyContent: 'space-between' } },
            h('div', null,
              h('div', { className: 'sal-row' },
                h('span', { className: 'nm' }, target.name),
                settings.targetId === target.id ? h(Badge, { tone: 'pass' }, '已选中') : null,
                target.hasKey ? h(Badge, { tone: 'low' }, '已存 Key') : h(Badge, { tone: 'none' }, '无 Key')),
              h('div', { className: 'sal-hint', style: { marginTop: 3 } }, `${target.baseURL} · ${target.model}`)),
            actions))
      })

      const targetsCard = h(Card, { title: `已保存端点（${targets.length}）` },
        targets.length === 0 ? h(Empty, null, '还没有自定义端点') : h('div', { className: 'sal-list' }, targetRows),
        h(Note, { warn: settings.mode === 'openai' && !settings.targetId }, '当前已选择兼容端点模式但尚未选中任何端点，运行测试会报错。'))

      return h('div', { className: 'sal-grid', style: { gap: 16 } },
        statusCard,
        modeCard,
        h('div', { className: 'sal-grid two' }, harnessCard, endpointCard),
        targetsCard,
        h(Card, { title: '安全说明' },
          h('ul', { style: { margin: 0, paddingLeft: 18, color: '#b9cee0', fontSize: '12.4px', lineHeight: 1.8 } },
            h('li', null, 'API Key 只存于 credentials 服务的 record（dsh-security-lab/<端点 id>），页面、报告、日志与历史文件都不会出现明文。'),
            h('li', null, '请求只发往你填写的 Base URL，不会自动重试到其它地址或云端。'),
            h('li', null, 'Harness 模式复用当前模型路由，不修改任何模型配置。'))))
    }


    // ---------------------------------------------------------------- 测试执行器

    function RunnerView({ app, runControl, categories, title, desc, toast, allowRounds, allowCustom }) {
      const { state } = app
      const { run, runError, startRun, abortRun } = runControl
      const catalog = useMemo(
        () => (state.catalog || []).filter((item) => categories.includes(item.category)),
        [state.catalog, categories.join(',')],
      )
      const catalogKey = catalog.map((item) => item.id).join('|')
      const [selected, setSelected] = useState(() => new Set(catalog.map((item) => item.id)))
      const selectionReady = useRef(false)
      const [timeoutMs, setTimeoutMs] = useState(state.settings.timeoutMs)
      const [maxRounds, setMaxRounds] = useState(state.settings.maxRounds)
      const [starting, setStarting] = useState(false)
      const [customOpen, setCustomOpen] = useState(false)
      const [customName, setCustomName] = useState('自定义测试')
      const [customPrompt, setCustomPrompt] = useState('')

      useEffect(() => {
        setSelected((current) => {
          const valid = new Set(catalog.map((item) => item.id))
          const next = new Set([...current].filter((id) => valid.has(id)))
          if (!selectionReady.current) {
            selectionReady.current = true
            for (const id of valid) next.add(id)
          }
          return next
        })
      }, [catalogKey])

      const running = Boolean(run && run.status === 'running')
      const progress = run && run.progress ? run.progress : null
      const results = run && run.results ? run.results : []
      const categoryNames = new Map((state.categories || []).map((item) => [item.id, item.name]))
      const groups = categories.length > 1 ? categories : [categories[0]]

      function toggle(id) {
        setSelected((current) => {
          const next = new Set(current)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      }

      async function start(options) {
        setStarting(true)
        try {
          const body = {
            mode: state.settings.mode,
            targetId: state.settings.targetId,
            timeoutMs: Number(timeoutMs) || state.settings.timeoutMs,
            scenario: options.scenario || 'selected',
          }
          if (options.customOnly) {
            body.customPrompts = [{ name: customName || '自定义测试', prompt: customPrompt }]
            body.customOnly = true
            body.categories = categories
          } else if (options.all) {
            body.categories = categories
          } else {
            body.testIds = [...selected]
          }
          if (allowRounds) body.maxRounds = Number(maxRounds) || state.settings.maxRounds
          await startRun(body)
          toast.push('测试已开始')
        } catch {
          // startRun 已弹出错误
        } finally {
          setStarting(false)
        }
      }

      const groupBlocks = groups.map((category) => {
        const items = catalog.filter((item) => item.category === category)
        if (items.length === 0) return null
        return h('div', { key: category },
          categories.length > 1
            ? h('div', { className: 'sal-group-title' }, `${categoryNames.get(category) || category}（${items.length} 项）`)
            : null,
          h('div', { className: 'sal-col', style: { gap: 7 } }, items.map((item) => h('label', { key: item.id, className: 'sal-test' },
            h('input', { type: 'checkbox', checked: selected.has(item.id), onChange: () => toggle(item.id) }),
            h('div', null,
              h('div', { className: 'sal-row' },
                h('span', { className: 'nm' }, item.name),
                h('span', { className: 'id' }, item.id),
                h(Badge, { tone: item.severity }, `${item.severity === 'high' ? '高' : item.severity === 'medium' ? '中' : '低'}风险`),
                item.rounds && item.rounds.length > 1 ? h(Badge, { tone: 'none' }, `${item.rounds.length} 轮`) : null),
              h('div', { className: 'sal-hint', style: { marginTop: 2 } }, item.goal))))))
      })

      const testListCard = h(Card, {
        title: '测试用例',
        extra: h('span', { className: 'sal-hint' }, `已选 ${selected.size} / ${catalog.length}`),
      },
      h('div', { className: 'sal-row', style: { marginBottom: 10 } },
        h(Btn, { size: 'sm', onClick: () => setSelected(new Set(catalog.map((item) => item.id))) }, '全选'),
        h(Btn, { size: 'sm', variant: 'ghost', onClick: () => setSelected(new Set()) }, '全不选'),
        h(Btn, {
          size: 'sm',
          variant: 'primary',
          onClick: () => start({}),
          disabled: starting || running || selected.size === 0,
        }, h(Icon, { name: 'play', size: 12 }), ' 运行选中')),
      h('div', { className: 'sal-col', style: { gap: 4 } }, groupBlocks))

      const configCard = h(Card, { title: '运行参数' },
        h('div', { className: 'sal-row' },
          h(Field, { label: '请求超时（毫秒）' },
            h('input', {
              className: 'sal-input',
              style: { width: 130 },
              type: 'number',
              min: 3000,
              max: 600000,
              step: 1000,
              value: timeoutMs,
              onChange: (event) => setTimeoutMs(event.target.value),
            })),
          allowRounds
            ? h(Field, { label: '最大轮数（1-8）' },
              h('input', {
                className: 'sal-input',
                style: { width: 100 },
                type: 'number',
                min: 1,
                max: 8,
                value: maxRounds,
                onChange: (event) => setMaxRounds(event.target.value),
              }))
            : null),
        h('div', { className: 'sal-hint', style: { marginTop: 8 } },
          `被测连接：${state.settings.mode === 'openai' ? (state.connection.targetName || '未选择端点') : 'Harness 当前模型'}（可在「模型连接」切换）`),
        h('div', { className: 'sal-actions', style: { marginTop: 10 } },
          h(Btn, {
            variant: 'primary',
            onClick: () => {
              const planned = selected.size
              if (!window.confirm(`将向当前被测模型发送 ${planned} 个真实请求（多轮场景按轮数计），可能产生费用。继续运行本类全部？`)) return
              start({ all: true })
            },
            disabled: starting || running,
          }, h(Icon, { name: 'play', size: 13 }), ' 运行本类全部'),
          running ? h(Btn, { variant: 'danger', onClick: abortRun }, h(Icon, { name: 'stop', size: 13 }), ' 中止') : null))

      const customCard = allowCustom
        ? h(Card, {
          title: '自定义测试',
          extra: h(Btn, { size: 'sm', variant: 'ghost', onClick: () => setCustomOpen(!customOpen) }, customOpen ? '收起' : '展开'),
        },
        customOpen
          ? h('div', { className: 'sal-col' },
            h(Field, { label: '测试名称' }, h('input', { className: 'sal-input', value: customName, onChange: (event) => setCustomName(event.target.value) })),
            h(Field, { label: '测试输入', hint: '自定义测试只记录实际输出，不纳入自动评分，需人工复核' },
              h('textarea', {
                className: 'sal-textarea',
                value: customPrompt,
                placeholder: '输入一条无害的合成测试提示词…',
                onChange: (event) => setCustomPrompt(event.target.value),
              })),
            h('div', { className: 'sal-actions' },
              h(Btn, {
                variant: 'primary',
                size: 'sm',
                disabled: running || starting || customPrompt.trim().length === 0,
                onClick: () => start({ customOnly: true }),
              }, '运行自定义测试')))
          : h('div', { className: 'sal-hint' }, '需要验证自己的提示词时展开这里；只发一条请求，结果单独留档。'))
        : null

      const statusCard = run
        ? h(Card, { title: '运行状态', extra: h('span', { className: 'sal-hint' }, run.id) },
          h('div', { className: 'sal-progress' },
            h('div', { className: 'top' },
              h('span', null, running
                ? `运行中 · ${progress ? progress.done : 0}/${progress ? progress.total : 0}`
                : run.status === 'aborted' ? '已中止' : run.status === 'failed' ? '运行失败' : '已完成'),
              h('span', null, run.model ? `${run.provider || ''} / ${run.model}` : '')),
            h(Bar, { value: progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0 }),
            progress && progress.current && running
              ? h('div', { className: 'sal-hint' }, `正在执行：${progress.current.name}（${progress.current.id}）`)
              : null,
            runError ? h('div', { className: 'sal-error' }, runError) : null,
            run.error ? h('div', { className: 'sal-error' }, run.error) : null,
            !running && run.score
              ? h('div', { className: 'sal-row', style: { marginTop: 4 } },
                h('span', { className: `sal-v small ${tone(run.score.overall)}`, style: { marginTop: 0 } }, run.score.overall === null ? '—' : `${run.score.overall} 分`),
                h('span', { className: 'sal-hint' }, `通过 ${run.score.counts.pass} · 疑似 ${run.score.counts.fail} · 无法判定 ${run.score.counts.unknown} · 高风险 ${run.score.highRisk}`))
              : null,
            !running && run.score && run.score.conclusion
              ? h('div', { className: 'sal-hint' }, run.score.conclusion)
              : null))
        : null

      const resultsCard = results.length > 0
        ? h(Card, { title: `测试结果（${results.length}）` },
          h('div', { className: 'sal-list' }, results.map((item, index) => h(ResultItem, {
            key: `${item.id}_${index}`,
            item,
            open: item.verdict === 'fail' && index < 3,
          }))))
        : h(Card, { title: '测试结果' }, h(Empty, null, '还没有结果：在上方勾选用例后点「运行选中」'))

      return h('div', { className: 'sal-grid', style: { gap: 16 } },
        h(Card, null,
          h('div', { className: 'sal-row', style: { justifyContent: 'space-between' } },
            h('div', null,
              h('div', { style: { fontSize: '14px', fontWeight: 600, color: '#e6f3ff' } }, title),
              h('div', { className: 'sal-hint', style: { marginTop: 3 } }, desc)),
            running ? h(Pill, { tone: 'warn' }, '运行中') : null)),
        testListCard,
        configCard,
        customCard,
        statusCard,
        resultsCard)
    }

    // ---------------------------------------------------------------- 测试历史

    function History({ app, toast }) {
      const { state, reload } = app
      const [runs, setRuns] = useState(state.recentRuns || [])
      const [selectedId, setSelectedId] = useState(null)
      const [detail, setDetail] = useState(null)
      const [loading, setLoading] = useState(false)
      const [loadError, setLoadError] = useState('')

      const refresh = useCallback(async () => {
        setLoading(true)
        setLoadError('')
        try {
          const data = await getJson('history')
          setRuns(data.runs || [])
        } catch (error) {
          setLoadError(error.message)
        } finally {
          setLoading(false)
        }
      }, [])

      useEffect(() => { refresh() }, [])

      useEffect(() => {
        if (!selectedId) { setDetail(null); return }
        let cancelled = false
        setDetail(null)
        getJson(`history?id=${encodeURIComponent(selectedId)}`)
          .then((data) => { if (!cancelled) setDetail(data.run) })
          .catch((error) => { if (!cancelled) { setDetail(null); toast.push(error.message, true) } })
        return () => { cancelled = true }
      }, [selectedId])

      async function remove(id) {
        if (!window.confirm('确定删除这条历史记录？')) return
        try {
          const data = await postJson('history', { action: 'delete', id })
          setRuns(data.runs || [])
          if (selectedId === id) setSelectedId(null)
          await reload()
          toast.push('已删除')
        } catch (error) {
          toast.push(error.message, true)
        }
      }

      async function clearAll() {
        if (!window.confirm('确定清空全部历史记录？该操作不可恢复。')) return
        try {
          const data = await postJson('history', { action: 'clear' })
          setRuns(data.runs || [])
          setSelectedId(null)
          await reload()
          toast.push('历史已清空')
        } catch (error) {
          toast.push(error.message, true)
        }
      }

      function download(id, format) {
        const anchor = document.createElement('a')
        anchor.href = EXPORT_URL(id, format)
        anchor.rel = 'noopener'
        anchor.style.display = 'none'
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
      }

      const historyExtra = h('div', { className: 'sal-row' },
        h(Btn, { size: 'sm', onClick: refresh, disabled: loading }, loading ? h('span', { className: 'sal-spin' }) : h(Icon, { name: 'refresh', size: 12 }), ' 刷新'),
        h(Btn, { size: 'sm', variant: 'danger', onClick: clearAll, disabled: runs.length === 0 }, h(Icon, { name: 'trash', size: 12 }), ' 清空'))

      const statusLabel = (status) => ({ done: '完成', aborted: '已中止', failed: '失败', running: '运行中' }[status] || status || '—')
      const statusTone = (status) => (status === 'done' ? 'pass' : status === 'aborted' ? 'unknown' : status === 'failed' ? 'fail' : 'low')

      const actionCell = (run) => h('td', null,
        h('div', { className: 'sal-actions' },
          h(Btn, { size: 'sm', onClick: () => setSelectedId(run.id) }, '查看'),
          h(Btn, { size: 'sm', variant: 'ghost', onClick: () => download(run.id, 'json'), disabled: run.status === 'running' }, 'JSON'),
          h(Btn, { size: 'sm', variant: 'ghost', onClick: () => download(run.id, 'html'), disabled: run.status === 'running' }, 'HTML'),
          h(Btn, { size: 'sm', variant: 'danger', ariaLabel: '删除该历史记录', onClick: () => remove(run.id) }, h(Icon, { name: 'trash', size: 12 }))))

      const rows = runs.map((run) => h('tr', { key: run.id },
        h('td', { className: 'num' }, fmtDateTime(run.startedAt)),
        h('td', null, `${run.provider || '—'} / ${run.model || '—'}`),
        h('td', null, run.mode === 'openai' ? '兼容端点' : 'Harness'),
        h('td', null, h(Badge, { tone: statusTone(run.status) }, statusLabel(run.status))),
        h('td', { className: 'num' }, run.planned && run.planned !== run.counts?.total ? `${run.counts?.total ?? 0}/${run.planned}` : String(run.counts?.total ?? 0)),
        h('td', { className: `num ${tone(run.score)}` }, run.score === null ? '—' : String(run.score)),
        h('td', { className: 'num' }, `${run.counts?.pass ?? 0} / ${run.counts?.fail ?? 0} / ${run.counts?.unknown ?? 0}`),
        h('td', { className: `num ${run.highRisk > 0 ? 'sal-v bad' : ''}` }, String(run.highRisk ?? 0)),
        actionCell(run)))

      const historyTable = h('div', { className: 'sal-scroll' },
        h('table', { className: 'sal-table' },
          h('thead', null, h('tr', null, ['时间', '模型', '方式', '状态', '测试项', '评分', '通过/疑似/无法判定', '高风险', '操作'].map((label) => h('th', { key: label }, label)))),
          h('tbody', null, rows)))

      const detailCard = detail ? h(Card, {
        title: `记录详情 · ${detail.id}`,
        extra: h('div', { className: 'sal-row' },
          h(Btn, { size: 'sm', onClick: () => download(detail.id, 'json') }, h(Icon, { name: 'download', size: 12 }), ' 导出 JSON'),
          h(Btn, { size: 'sm', onClick: () => download(detail.id, 'html') }, h(Icon, { name: 'download', size: 12 }), ' 导出 HTML')),
      },
      h('div', { className: 'sal-kv', style: { marginBottom: 12 } },
        h('span', { className: 'k' }, '模型'), h('span', { className: 'v2' }, `${detail.provider || '—'} / ${detail.model || '—'}`),
        h('span', { className: 'k' }, '目标'), h('span', { className: 'v2' }, detail.targetName || '—'),
        h('span', { className: 'k' }, '开始/结束'), h('span', { className: 'v2' }, `${fmtDateTime(detail.startedAt)} → ${fmtDateTime(detail.finishedAt)}`),
        h('span', { className: 'k' }, '状态'), h('span', { className: 'v2' }, statusLabel(detail.status)),
        h('span', { className: 'k' }, '评分'), h('span', { className: 'v2' }, detail.score?.overall === null || detail.score?.overall === undefined ? '—' : String(detail.score.overall))),
      (detail.results || []).length > 0
        ? h('div', { className: 'sal-list' }, detail.results.map((item, index) => h(ResultItem, { key: `${item.id}_${index}`, item })))
        : h(Empty)) : null

      return h('div', { className: 'sal-grid', style: { gap: 16 } },
        h(Card, { title: `测试历史（${runs.length}）`, extra: historyExtra },
          loadError
            ? h('div', { className: 'sal-col' },
              h('div', { className: 'sal-error' }, `历史读取失败：${loadError}`),
              h('div', { className: 'sal-actions', style: { marginTop: 9 } }, h(Btn, { size: 'sm', onClick: refresh }, '重试')))
            : loading && runs.length === 0
              ? h('div', { className: 'sal-row', style: { padding: '14px 0' } }, h('span', { className: 'sal-spin' }), h('span', { className: 'sal-hint' }, '正在读取历史…'))
              : runs.length === 0 ? h(Empty, null, '还没有历史记录') : historyTable),
        detailCard)
    }

    // ---------------------------------------------------------------- 安全报告

    function Reports({ app, toast }) {
      const { state } = app
      const [runs, setRuns] = useState([])
      const [selectedId, setSelectedId] = useState(state.stats.lastRunId || '')
      const [detail, setDetail] = useState(null)
      const [compareIds, setCompareIds] = useState(() => new Set())
      const [comparison, setComparison] = useState(null)
      const [comparing, setComparing] = useState(false)

      useEffect(() => {
        getJson('history').then((data) => setRuns(data.runs || [])).catch((error) => toast.push(error.message, true))
      }, [])

      useEffect(() => {
        if (!selectedId) { setDetail(null); return }
        let cancelled = false
        setDetail(null)
        getJson(`history?id=${encodeURIComponent(selectedId)}`)
          .then((data) => { if (!cancelled) setDetail(data.run) })
          .catch((error) => { if (!cancelled) { setDetail(null); toast.push(error.message, true) } })
        return () => { cancelled = true }
      }, [selectedId])

      async function download(format) {
        if (!selectedId) return
        if (detail && detail.status === 'running') {
          toast.push('该次运行尚未结束，无法导出报告', true)
          return
        }
        try {
          const response = await fetch(EXPORT_URL(selectedId, format), { cache: 'no-store' })
          if (!response.ok) {
            let message = `导出失败（HTTP ${response.status}）`
            try {
              const data = await response.json()
              if (data && data.error) message = data.error
            } catch {
              // 非 JSON 错误体
            }
            toast.push(message, true)
            return
          }
          const blob = await response.blob()
          const objectUrl = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = objectUrl
          anchor.download = `security-report-${selectedId}.${format}`
          anchor.style.display = 'none'
          document.body.appendChild(anchor)
          anchor.click()
          anchor.remove()
          setTimeout(() => URL.revokeObjectURL(objectUrl), 5000)
          toast.push(`已导出 ${format.toUpperCase()} 报告`)
        } catch (error) {
          toast.push(`导出失败：${error.message}`, true)
        }
      }

      function toggleCompare(id) {
        setCompareIds((current) => {
          const next = new Set(current)
          if (next.has(id)) next.delete(id)
          else if (next.size < 6) next.add(id)
          return next
        })
      }

      async function compare() {
        if (compareIds.size < 2) {
          toast.push('请至少选择两条历史记录', true)
          return
        }
        setComparing(true)
        try {
          const data = await getJson(`compare?ids=${[...compareIds].map((id) => encodeURIComponent(id)).join(',')}`)
          setComparison(data.runs || [])
        } catch (error) {
          toast.push(error.message, true)
        } finally {
          setComparing(false)
        }
      }

      const score = detail?.score
      const risks = (detail?.results || []).filter((item) => item.verdict === 'fail')
      const compareCandidates = runs.filter((run) => run.status !== 'running')
      const dimKeys = ['jailbreak', 'injection', 'privacy', 'instruction', 'stability']
      const runStatusText = (status) => ({ done: '完成', aborted: '已中止', failed: '失败', running: '运行中' }[status] || status || '—')

      const comparePicker = compareCandidates.length === 0
        ? h(Empty, null, '至少需要两条已结束的记录才能对比')
        : h('div', { className: 'sal-col' },
          h('div', { className: 'sal-list' }, compareCandidates.slice(0, 12).map((run) => h('label', {
            key: run.id,
            className: 'sal-row',
            style: { justifyContent: 'space-between', padding: '7px 10px', border: '1px solid rgba(100,150,190,.14)', borderRadius: 8, cursor: 'pointer' },
          },
          h('span', { className: 'sal-row' },
            h('input', { type: 'checkbox', checked: compareIds.has(run.id), onChange: () => toggleCompare(run.id) }),
            h('span', { style: { fontSize: '12.5px' } }, `${run.provider || '—'} / ${run.model || '—'}`)),
          h('span', { className: 'sal-hint' }, `${fmtDateTime(run.startedAt)} · ${run.score === null ? '无分' : `${run.score} 分`} · 高风险 ${run.highRisk}`)))),
          h('div', { className: 'sal-actions', style: { marginTop: 9 } },
            h(Btn, { size: 'sm', variant: 'primary', onClick: compare, disabled: comparing || compareIds.size < 2 },
              comparing ? h('span', { className: 'sal-spin' }) : h(Icon, { name: 'report', size: 12 }), ` 对比选中（${compareIds.size}）`)))

      const compareTable = comparison && comparison.length > 0
        ? h('div', { className: 'sal-scroll', style: { marginTop: 11 } },
          h('table', { className: 'sal-table' },
            h('thead', null, h('tr', null,
              ['模型', '时间', '综合', '越狱', '注入', '隐私', '指令', '多轮', '通过/疑似/无法判定', '高风险'].map((label) => h('th', { key: label }, label)))),
            h('tbody', null, comparison.map((run) => h('tr', { key: run.id },
              h('td', null, `${run.provider || '—'} / ${run.model || '—'}`),
              h('td', { className: 'num' }, fmtDateTime(run.startedAt)),
              h('td', { className: `num ${tone(run.score)}` }, run.score === null ? '—' : String(run.score)),
              dimKeys.map((key) => h('td', { key, className: 'num' }, run.dimensions && run.dimensions[key] !== null && run.dimensions[key] !== undefined ? String(run.dimensions[key]) : '—')),
              h('td', { className: 'num' }, `${run.counts?.pass ?? 0} / ${run.counts?.fail ?? 0} / ${run.counts?.unknown ?? 0}`),
              h('td', { className: 'num' }, String(run.highRisk ?? 0)))))))
        : h('div', { className: 'sal-hint', style: { marginTop: 9 } },
          '勾选两条以上记录后点「对比选中」，可横向比较不同模型 / 不同时间的各维度得分与风险数。')

      const dimBars = dimKeys.map((key) => {
        const dimension = score && score.dimensions ? score.dimensions[key] : null
        return h('div', { key, className: 'sal-dim' },
          h('div', { className: 'top' },
            h('span', { className: 'name' }, dimension ? dimension.name : key),
            h('span', { className: 'score' }, !dimension || dimension.score === null ? '未测试' : `${dimension.score} 分`)),
          h(Bar, { value: dimension ? dimension.score : null }))
      })

      const summaryCard = detail === null ? null : h(Card, { title: '报告摘要' },
        h('div', { className: 'sal-row', style: { justifyContent: 'space-between' } },
          h(ScoreRing, { value: score?.overall ?? null }),
          h('div', { className: 'sal-col' },
            h(Badge, { tone: score?.highRisk > 0 ? 'fail' : 'pass' }, `高风险 ${score?.highRisk ?? 0}`),
            h(Badge, { tone: score?.mediumRisk > 0 ? 'medium' : 'none' }, `中风险 ${score?.mediumRisk ?? 0}`),
            h(Badge, { tone: 'none' }, `无法判定 ${score?.counts?.unknown ?? 0}`))),
        h('div', { className: 'sal-sep' }),
        h('div', { className: 'sal-kv' },
          h('span', { className: 'k' }, '被测模型'), h('span', { className: 'v2' }, `${detail.provider || '—'} / ${detail.model || '—'}`),
          h('span', { className: 'k' }, '连接方式'), h('span', { className: 'v2' }, detail.mode === 'openai' ? 'OpenAI 兼容端点' : 'Harness 当前模型路由'),
          h('span', { className: 'k' }, '测试时间'), h('span', { className: 'v2' }, `${fmtDateTime(detail.startedAt)} → ${fmtDateTime(detail.finishedAt)}`),
          h('span', { className: 'k' }, '测试项'), h('span', { className: 'v2' }, `${detail.results?.length ?? 0} 项`)),
        h('div', { className: 'sal-sep' }),
        h('div', null, dimBars),
        score?.conclusion ? h('div', { className: 'sal-note', style: { marginTop: 11 } }, score.conclusion) : null,
        h(Note, { warn: true }, '「通过」只代表本次合成样本未发现疑似问题；「无法判定」按 0 分计、不算通过，也不代表模型绝对安全。'))
      const riskCard = h(Card, { title: `风险问题（${risks.length}）` },
        risks.length === 0
          ? h(Empty, null, '本次没有判定为疑似问题的用例')
          : h('div', { className: 'sal-list' }, risks.map((item, index) => h(ResultItem, { key: `${item.id}_${index}`, item, open: index === 0 }))))

      return h('div', { className: 'sal-grid', style: { gap: 16 } },
        h(Card, { title: '安全报告' },
          h('div', { className: 'sal-row' },
            h(Field, { label: '选择测试记录' },
              h('select', { className: 'sal-select', style: { minWidth: 330 }, value: selectedId, onChange: (event) => setSelectedId(event.target.value) },
                h('option', { value: '' }, '— 请选择 —'),
                runs.map((run) => h('option', { key: run.id, value: run.id },
                  `${fmtDateTime(run.startedAt)} · ${run.provider || ''}/${run.model || ''} · ${run.score === null ? '无分' : `${run.score} 分`} · ${runStatusText(run.status)}`)))),
            h(Btn, { variant: 'primary', onClick: () => download('json'), disabled: !selectedId || !detail }, h(Icon, { name: 'download', size: 13 }), ' 导出 JSON'),
            h(Btn, { onClick: () => download('html'), disabled: !selectedId || !detail }, h(Icon, { name: 'download', size: 13 }), ' 导出 HTML')),
          h('div', { className: 'sal-hint', style: { marginTop: 9 } },
            '报告包含测试时间、模型信息、分维度评分、全部用例输入/输出与判定依据；导出前递归脱敏，不含 API Key 或 Authorization 头。')),
        h(Card, {
          title: '多模型结果对比',
          extra: h(Btn, { size: 'sm', variant: 'ghost', onClick: () => { setComparison(null); setCompareIds(new Set()) } }, '清空选择'),
        }, comparePicker, compareTable),
        detail ? h('div', { className: 'sal-grid two' }, summaryCard, riskCard)
          : selectedId
            ? h(Card, null, h('div', { className: 'sal-row', style: { padding: '12px 0' } }, h('span', { className: 'sal-spin' }), h('span', { className: 'sal-hint' }, '正在读取报告详情…')))
            : h(Card, null, h(Empty, null, '请选择一条已结束的测试记录')))
    }

    // ---------------------------------------------------------------- 插件设置

    function Settings({ app, reload, toast }) {
      const { state } = app
      const [form, setForm] = useState({
        timeoutMs: state.settings.timeoutMs,
        maxRounds: state.settings.maxRounds,
        maxTestsPerRun: state.settings.maxTestsPerRun,
        allowLan: state.settings.allowLan,
      })
      const [saving, setSaving] = useState(false)
      const [health, setHealth] = useState(null)
      const [checking, setChecking] = useState(false)

      function patch(key, value) {
        if (key === 'allowLan' && value) {
          if (!window.confirm('开启后，同一局域网内的其它设备可以访问本插件的 HTTP 接口（仍需同源请求，且不会暴露 API Key）。确定开启？')) return
        }
        setForm((current) => ({ ...current, [key]: value }))
      }

      async function save() {
        setSaving(true)
        try {
          await postJson('settings', { patch: { ...form, timeoutMs: Number(form.timeoutMs), maxRounds: Number(form.maxRounds), maxTestsPerRun: Number(form.maxTestsPerRun) } })
          await reload()
          toast.push('设置已保存')
        } catch (error) {
          toast.push(error.message, true)
        } finally {
          setSaving(false)
        }
      }

      async function selfCheck() {
        setChecking(true)
        setHealth(null)
        try {
          const data = await getJson('health')
          setHealth(data)
          toast.push(data.ok ? '自检通过' : '自检发现需要关注的项目', !data.ok)
        } catch (error) {
          toast.push(error.message, true)
        } finally {
          setChecking(false)
        }
      }

      async function clearHistory() {
        if (!window.confirm('确定清空全部测试历史？该操作不可恢复。')) return
        try {
          await postJson('history', { action: 'clear' })
          await reload()
          toast.push('历史已清空')
        } catch (error) {
          toast.push(error.message, true)
        }
      }

      return h('div', { className: 'sal-grid', style: { gap: 16 } },
        h('div', { className: 'sal-grid two' },
          h(Card, { title: '测试默认参数' },
            h('div', { className: 'sal-col' },
              h(Field, { label: '请求超时（毫秒）', hint: '3000 - 600000' },
                h('input', { className: 'sal-input', type: 'number', min: 3000, max: 600000, step: 1000, value: form.timeoutMs, onChange: (event) => patch('timeoutMs', event.target.value) })),
              h(Field, { label: '多轮测试最大轮数', hint: '1 - 8' },
                h('input', { className: 'sal-input', type: 'number', min: 1, max: 8, value: form.maxRounds, onChange: (event) => patch('maxRounds', event.target.value) })),
              h(Field, { label: '单次运行最多测试项', hint: '1 - 200' },
                h('input', { className: 'sal-input', type: 'number', min: 1, max: 200, value: form.maxTestsPerRun, onChange: (event) => patch('maxTestsPerRun', event.target.value) })),
              h(Switch, { checked: form.allowLan, onChange: (value) => patch('allowLan', value), label: '允许非回环地址访问本插件接口' }),
              h(Btn, { variant: 'primary', onClick: save, disabled: saving }, saving ? h('span', { className: 'sal-spin' }) : null, ' 保存设置'))),

          h(Card, { title: '运行与存储' },
            h('div', { className: 'sal-kv' },
              h('span', { className: 'k' }, '插件版本'), h('span', { className: 'v2' }, state.version || '—'),
              h('span', { className: 'k' }, '数据目录'), h('span', { className: 'v2' }, state.settings.dataDir || '—'),
              h('span', { className: 'k' }, '测试总数'), h('span', { className: 'v2' }, `${state.testCount} 项 · ${(state.categories || []).length} 个分类`),
              h('span', { className: 'k' }, '合成 canary'), h('span', { className: 'v2 sal-mono' }, state.canary || '—'),
              h('span', { className: 'k' }, '历史记录'), h('span', { className: 'v2' }, `${state.stats.totalRuns} 条`)),
            h('div', { className: 'sal-actions', style: { marginTop: 12 } },
              h(Btn, { onClick: selfCheck, disabled: checking }, checking ? h('span', { className: 'sal-spin' }) : h(Icon, { name: 'test', size: 13 }), ' 运行自检'),
              h(Btn, { variant: 'danger', onClick: clearHistory }, h(Icon, { name: 'trash', size: 13 }), ' 清空历史')),
            h(Note, null, '停用插件：设置 → 插件 → 本插件关闭。停用后路由与运行中的测试会一并释放，历史文件保留。'))),

        health
          ? h(Card, { title: `自检结果 · ${health.ok ? '通过' : '需关注'}` },
            h('div', { className: 'sal-list' },
              (health.checks || []).map((check) => h('div', { key: check.id, className: 'sal-row', style: { justifyContent: 'space-between', padding: '8px 10px', border: '1px solid rgba(100,150,190,.14)', borderRadius: 8 } },
                h('div', { className: 'sal-row' }, check.ok ? h(Icon, { name: 'check', size: 14, color: '#5fe3b8' }) : h(Icon, { name: 'alert', size: 14, color: '#f2c161' }),
                  h('span', { style: { fontSize: '12.6px' } }, check.name)),
                h('span', { className: 'sal-hint', style: { textAlign: 'right', maxWidth: '58%' } }, check.detail || '')))))
          : null,

        h(Card, { title: '使用须知' },
          h('ul', { style: { margin: 0, paddingLeft: 18, color: '#b9cee0', fontSize: '12.4px', lineHeight: 1.9 } },
            h('li', null, '仅用于你拥有授权的模型与端点；测试会产生真实的模型请求与费用。'),
            h('li', null, '样本全部为合成文本，不含真实凭据、真实个人信息，也不执行任何系统命令。'),
            h('li', null, '判定为规则匹配结果，可能存在误报/漏报，风险项请人工复核。'),
            h('li', null, '插件不修改 Harness 的模型配置，也不读取其它插件的数据。'))),
      )
    }

    // ---------------------------------------------------------------- 页面装配

    const TABS = [
      { id: 'dashboard', label: '仪表盘', icon: 'dashboard' },
      { id: 'connections', label: '模型连接', icon: 'plug' },
      { id: 'jailbreak', label: '越狱测试', icon: 'jailbreak' },
      { id: 'injection', label: '提示词注入测试', icon: 'injection' },
      { id: 'multiturn', label: '多轮测试', icon: 'chat' },
      { id: 'history', label: '测试历史', icon: 'history' },
      { id: 'reports', label: '安全报告', icon: 'report' },
      { id: 'settings', label: '插件设置', icon: 'settings' },
    ]

    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }
      static getDerivedStateFromError(error) {
        return { error }
      }
      render() {
        if (this.state.error) {
          return h('div', { className: 'sal-error', style: { margin: 20 } },
            `页面渲染出错：${this.state.error.message || String(this.state.error)}`)
        }
        return this.props.children
      }
    }

    function App() {
      const [state, setState] = useState(null)
      const [error, setError] = useState('')
      const [loading, setLoading] = useState(true)
      const [tab, setTab] = useState('dashboard')
      const [runId, setRunId] = useState(null)
      const [run, setRun] = useState(null)
      const [runError, setRunError] = useState('')
      const toast = useToast()

      const reload = useCallback(async () => {
        try {
          const data = await getJson('state')
          setState(data)
          setError('')
        } catch (err) {
          setError(err.message)
        } finally {
          setLoading(false)
        }
      }, [])

      useEffect(() => {
        reload()
        const timer = setInterval(reload, 15000)
        return () => clearInterval(timer)
      }, [reload])

      const startRun = useCallback(async (body) => {
        try {
          const data = await postJson('run', body)
          setRunId(data.runId)
          setRun({ id: data.runId, status: 'running', progress: { total: 0, done: 0, current: null }, results: [] })
          setRunError('')
          return data.runId
        } catch (err) {
          toast.push(err.message, true)
          throw err
        }
      }, [toast])

      const abortRun = useCallback(async () => {
        if (!runId) return
        try {
          await postJson('abort', { id: runId })
          toast.push('已发送中止请求')
        } catch (err) {
          toast.push(err.message, true)
        }
      }, [runId, toast])

      useEffect(() => {
        if (!runId) return undefined
        let stopped = false
        let timer = null
        const tick = async () => {
          try {
            const data = await getJson(`run?id=${encodeURIComponent(runId)}`)
            if (stopped) return
            setRun(data.run)
            setRunError('')
            if (data.run && data.run.status === 'running') {
              timer = setTimeout(tick, 1200)
            } else {
              reload()
            }
          } catch (err) {
            if (stopped) return
            setRunError(`运行状态获取失败：${err.message}（自动重试中）`)
            timer = setTimeout(tick, 3000)
          }
        }
        tick()
        return () => {
          stopped = true
          if (timer) clearTimeout(timer)
        }
      }, [runId, reload])

      if (loading && !state) {
        return h('div', { className: 'sal-root' },
          h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
          h('div', { className: 'sal-body', style: { display: 'grid', placeItems: 'center' } },
            h('div', { className: 'sal-row' }, h('span', { className: 'sal-spin' }), h('span', null, '正在读取安全实验室状态…'))))
      }

      if (!state) {
        return h('div', { className: 'sal-root' },
          h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
          h('div', { className: 'sal-body' },
            h(Card, { title: '无法连接插件 Host 半边' },
              h('div', { className: 'sal-error' }, error || '未知错误'),
              h('div', { className: 'sal-actions', style: { marginTop: 11 } }, h(Btn, { onClick: reload }, '重试')))))
      }

      const app = { state, reload, toast }
      const runControl = { runId, run, runError, startRun, abortRun }
      const harness = state.harness || {}
      const connection = state.connection || {}
      const connected = connection.status === 'ok'
        || (connection.status !== 'failed' && (harness.available || Boolean(connection.targetName)))
      const running = Boolean(run && run.status === 'running')
      const statusTone = connection.status === 'ok' ? 'good' : connection.status === 'failed' ? 'bad' : connected ? 'warn' : 'warn'
      const statusText = connection.status === 'ok'
        ? `已连接 · ${connection.model || harness.selection?.model || '—'}`
        : connection.status === 'failed'
          ? '连接失败 · 请去模型连接重试'
          : connected
            ? `待测试 · ${connection.model || harness.selection?.model || '—'}`
            : '未连接模型'

      function renderPage() {
        if (tab === 'dashboard') return h(Dashboard, { app, onTab: setTab, reload, toast, runControl })
        if (tab === 'connections') return h(Connections, { app, reload, toast })
        if (tab === 'jailbreak') return h(RunnerView, { app, runControl, categories: ['jailbreak', 'model'], title: '越狱抵抗 · 模型安全测试', desc: '角色扮演诱导、指令优先级冲突、虚构场景、铺垫诱导、安全边界探测，以及隐私 / 系统提示词 / 工具边界等模型安全项，共 13 项。', toast, allowRounds: false, allowCustom: true })
        if (tab === 'injection') return h(RunnerView, { app, runControl, categories: ['injection'], title: '提示词注入测试', desc: '用户输入注入、外部文本注入、伪造系统指令、上下文污染与指令覆盖尝试，共 5 项。', toast, allowRounds: false, allowCustom: true })
        if (tab === 'multiturn') return h(RunnerView, { app, runControl, categories: ['multiturn'], title: '多轮对抗测试', desc: '按脚本自动生成测试轮次并保留上下文，逐轮记录响应，自动检测前后矛盾，共 3 个场景。', toast, allowRounds: true, allowCustom: false })
        if (tab === 'history') return h(History, { app, toast })
        if (tab === 'reports') return h(Reports, { app, toast })
        if (tab === 'settings') return h(Settings, { app, reload, toast })
        return null
      }

      return h('div', { className: 'sal-root' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('header', { className: 'sal-head' },
          h('div', { className: 'sal-titlebar' },
            h('span', { className: 'sal-logo' }, h(Icon, { name: 'shield', size: 19, color: '#5fd8ff' })),
            h('div', null,
              h('div', { className: 'sal-title' }, 'DeepSeek AI Security Lab'),
              h('div', { className: 'sal-sub' }, 'AI 模型安全测试与安全评估 · 授权环境使用')),
            h('span', { className: 'sal-grow' }),
            h(Pill, { tone: statusTone }, statusText),
            h(Pill, { tone: state.settings.allowLan ? 'warn' : 'none', dot: false },
              state.settings.mode === 'openai' ? '兼容端点模式' : 'Harness 路由'),
            h(Btn, { size: 'sm', onClick: reload }, h(Icon, { name: 'refresh', size: 12 }), ' 刷新')),
          h('nav', { className: 'sal-tabs', role: 'tablist', 'aria-label': '安全实验室页签' },
            TABS.map((item) => h('button', {
              key: item.id,
              type: 'button',
              role: 'tab',
              'aria-selected': tab === item.id,
              className: `sal-tab ${tab === item.id ? 'on' : ''}`,
              onClick: () => setTab(item.id),
            }, h(Icon, { name: item.icon, size: 14 }), item.label)))),
        running
          ? h('div', { className: 'sal-runbar', role: 'status', 'aria-live': 'polite' },
            h('span', { className: 'sal-spin' }),
            h('span', null, `运行中 ${run.progress.done}/${run.progress.total}`),
            run.progress.current ? h('span', { className: 'sal-hint' }, run.progress.current.name) : null,
            h(Bar, { value: run.progress.total > 0 ? Math.round((run.progress.done / run.progress.total) * 100) : 0 }),
            h(Btn, { size: 'sm', variant: 'danger', onClick: abortRun }, h(Icon, { name: 'stop', size: 12 }), ' 中止'),
            runError ? h('span', { className: 'sal-hint' }, runError) : null)
          : null,
        h('main', { className: 'sal-body' },
          error ? h('div', { className: 'sal-error', style: { marginBottom: 12 } }, error) : null,
          h(Boundary, { key: tab }, renderPage())),
        h(ToastStack, { items: toast.items }))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'dsh-ai-security-lab',
          order: 30,
          label: '安全实验室',
        }, function PanelGlyph({ size = 18, active }) {
          return h('span', {
            'aria-label': '安全实验室',
            role: 'img',
            style: {
              display: 'grid',
              placeItems: 'center',
              width: size,
              height: size,
              color: active ? 'var(--dsw-alias-brand-primary, #38c2ef)' : 'var(--dsw-alias-label-secondary, #93a9bf)',
            },
          }, h(Icon, { name: 'shield', size }))
        }))
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'dsh-ai-security-lab',
        }, App))
      },
    }
  },
})
