# Hackathon demo — architecture (integrated)

## End-to-end flow

1. **Config monitoring** — `server.ts` periodically reads `demo/config.json`, runs `detectIssues()` to find misconfigurations (locked users, missing API keys, crashed services, etc.) and routes them through the ticket pipeline as L1/L2/L3 issues.

2. **Code defect detection** — `server.ts` also monitors `demo/worker-logic.ts` using `detectDefect()` from `demo/defect-pipeline.ts`, which runs `runValidationSuite(source)` (behavioral tests). A ticket is opened only when tests fail. The bug catalog is optional metadata, **not** the detection mechanism.

3. **Classification** — LLM classifier with two domains:
   - `it_support` (default) — for config/service issues
   - `code_defect` — for bugs in `worker-logic.ts`, maps to L1/L2/L3

4. **L1/L2 Agents** — Have access to both IT tools (password reset, config write, etc.) and sandbox repair tools (`propose_sandbox_fix`, `run_sandbox_tests`, `apply_sandbox_to_real`). For code bugs, agents work in a sandbox copy and only promote fixes after tests pass.

5. **L3** — Escalation/advisory only; no automated edits to `worker-logic.ts` or critical config.

6. **Ticket pipeline** — Full ticket lifecycle with persistence (`demo/tickets.json`), tier tabs, detail view, stats, and deduplication via `hasActiveTicketForIssue()`.

7. **Dashboard** — Shows config editor, code editor, ticket list with L1/L2/L3 tabs, fault injection for both config and code, and real-time agent activity log via SSE.

## Key files

| Concern | Location |
|---------|----------|
| Main server + monitoring loop | `server.ts` |
| Pure business logic (repair target) | `demo/worker-logic.ts` |
| Runtime loop, logging | `demo/worker.ts` |
| Behavioral tests + dynamic eval import | `demo/test-runner.ts` |
| Secondary substring hints (non-fatal) | `demo/validation-heuristics.ts` |
| Detection vs labeling API | `demo/defect-pipeline.ts` |
| Sandbox file copy | `demo/sandbox.ts` → `worker-logic.sandbox.ts` |
| Catalog bugs | `demo/bug-injector.ts` |
| Line mutations (seeded) | `demo/mutation-injector.ts` |
| Config issue detection | `server.ts` → `detectIssues()` |
| Ticket store (persistent) | `backend/store/tickets.ts` |
| Agent read/test/apply tools | `backend/tools/file-system-tools.ts` |
| IT tools (L1) | `backend/tools/l1-tools.ts` |
| Service tools (L2) | `backend/tools/l2-tools.ts` |
| Classifier (dual domain) | `backend/agent/classifier.ts` |
| Dashboard UI | `public/index.html` |

## Commands

- `npm run demo-app` — Start the main server with config + code monitoring dashboard
- `npm run run-worker` — Start the worker process (separate from the server)
- `npm run auto-simulation` — Timed catalog injection + watcher on `worker-logic.ts`
- `npm run inject-bug -- <id>` — Inject a specific catalog bug
- `npm run mutate-worker -- [seed]` — Random applicable mutation
- `npm run live-bug-demo` — Interactive CLI for bug injection + agent repair
