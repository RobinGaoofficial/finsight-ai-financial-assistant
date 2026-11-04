# Financial Assistant Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task. User has approved execution; proceed inline.

**Goal:** Deliver a Windows-local Chinese financial analysis web app with real historical snapshots, optional online data, DeepSeek tools and educational backtesting.
**Architecture:** Python standard-library HTTP server serves same-origin static HTML/CSS/JS and validated JSON endpoints. Pure financial calculations are separated from network adapters and AI orchestration. No new production dependencies.
**Tech Stack:** Python 3.10+, browser ES modules and SVG, Node built-in test runner.
**Spec:** ../../../../金融分析助手-设计方案.md (workspace parent).

## Global Constraints
- Local-only, 127.0.0.1; no publication, credentials in backend process environment only.
- Show provenance, period, units, missing values, actual data coverage and sample/online distinction.
- Signal at close, execution next open, same costs for buy-and-hold, no invented liquidation.
- npm test after JavaScript modifications. No dependency installations without confirmation.

## Review Focus
- Financial nulls, mismatched reporting periods and financial-company comparison caveats.
- Historical coverage insufficient for warmup or requested dates.
- Local service cross-origin/Host attacks and secrets in errors/static paths.
- Model unknown tools, malformed arguments and runaway calls.
- Stale frontend results when switching mode or symbol during pending work.

## Task 1: Calculations and data
Files: finance.py, providers.py, tests/test_finance.py, tests/test_providers.py, scripts/capture_samples.py, data/samples.json.
Interfaces: history(symbol, mode, start, end) -> provenance + bars; financials(symbol, mode, period) -> provenance + metrics; backtest(bars, start, end, short, long, capital, fee_bps, slippage_bps) -> curves/trades/metrics.
- [ ] Write and run failing tests for return arithmetic, next-open trades, warmup, fees, null financials, validation and restricted symbols/dates.
- [ ] Implement calculations and validated network adapters using Python stdlib; retrieve actual historical snapshots for 600519, 000858 and 600036.
- [ ] Run Python unittest suite and separately verify real providers. Preserve sources and collection timestamps.

## Task 2: AI and local API
Files: assistant.py, server.py, tests/test_assistant.py, tests/test_server.py.
Interfaces: POST /api/history, /api/compare, /api/backtest, /api/chat; GET /api/status. No request carries API key. Chat returns answer, evidence, tool log and live/demo label.
- [ ] Write failing tests for unknown tools, bad arguments, missing key, max calls, external API errors, Host/origin checks and static path restrictions.
- [ ] Implement bounded tool calling with only history/compare/backtest tools; data goes into tool responses, never unrestricted code. Limit request size and chat concurrency.
- [ ] Verify local endpoints and failure paths using actual temporary HTTP server; mock only upstream API transport.

## Task 3: Interactive webpage
Files: static/index.html, static/style.css, static/app.js, static/ui.js, tests/ui.test.js, package.json.
Interfaces: UI consumes API results without HTML injection; chart helpers handle flat/empty series and missing numeric data.
- [ ] Write and run failing tests for formatting missing values, SVG escaping and flat series geometry.
- [ ] Build responsive sidebar/workspace/assistant panel, tabs, controls, evidence drawer and report export. Lock or invalidate pending state appropriately.
- [ ] Run npm test and browser interaction checks on sample history, comparison, backtest, chat missing-key response, mode switching, export and narrow window.

## Task 4: Delivery and review
Files: start.ps1, 启动助手.cmd, README.md, docs/课堂演示.md, docs/问答评估.csv, docs/progress.md.
- [ ] Add launcher detecting Python >=3.10, optional masked DeepSeek key prompt, model override; no key persistence.
- [ ] Write reproducible demo and 15-question evaluation rubric; document data and simplified backtest assumptions.
- [ ] Run full tests, independent review and fix important findings; retain local preview and report live AI verification boundary if no key available.

## Environment rulings
- Workspace has no existing application or Git repository: create isolated fin-assistant subfolder; no unrelated files modified and no synthetic commits.
- Python 3.14 at D:/DevTools/Python/Python314/python.exe; npm.cmd at D:/AppTools/npm.cmd works although npm.ps1 is broken. Use npm.cmd test (actual npm test command).
- AkShare would add dependencies; equivalent direct Tencent/Eastmoney read adapters avoid installing packages. Provider stability is verified live but not guaranteed long term.
- User approved execution of the design; do not add another plan approval round. Implement in this session, then one independent review.
