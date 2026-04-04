# Hackathon demo — architecture (post-refactor)

## End-to-end flow

1. **Intake / detection** — `detectDefect()` in [`demo/defect-pipeline.ts`](../demo/defect-pipeline.ts) runs `runValidationSuite(source)` on `demo/worker-logic.ts` content. A ticket is opened only when behavioral tests fail. The bug catalog is **not** used to decide if something is broken.

2. **Labeling (optional)** — `matchKnownBugLabel()` matches catalog `buggyLine` substrings for friendly names and logging only.

3. **Classification** — LLM with `domain: "code_defect"` (simulation / live bug demo) maps the issue to L1 / L2 / L3.

4. **L3** — Escalation / advisory only; no automated edits to `worker-logic.ts`.

5. **L1 / L2** — Agents use sandbox tools: copy → `propose_sandbox_fix` → `run_sandbox_tests` → `apply_sandbox_to_real`. Promotion is blocked unless sandbox tests pass.

6. **Retry** — Auto-simulation runs up to two full repair attempts, then an L3-style advisory with attempt notes (`repair_exhausted`).

## Key files

| Concern | Location |
|--------|-----------|
| Pure business logic (repair target) | [`demo/worker-logic.ts`](../demo/worker-logic.ts) |
| Runtime loop, logging | [`demo/worker.ts`](../demo/worker.ts) |
| Behavioral tests + dynamic eval import | [`demo/test-runner.ts`](../demo/test-runner.ts) |
| Secondary substring hints (non-fatal) | [`demo/validation-heuristics.ts`](../demo/validation-heuristics.ts) |
| Detection vs labeling API | [`demo/defect-pipeline.ts`](../demo/defect-pipeline.ts) |
| Sandbox file copy | [`demo/sandbox.ts`](../demo/sandbox.ts) → `worker-logic.sandbox.ts` |
| Catalog bugs | [`demo/bug-injector.ts`](../demo/bug-injector.ts) |
| Line mutations (seeded) | [`demo/mutation-injector.ts`](../demo/mutation-injector.ts) |
| Watcher + simulation | [`scripts/auto-simulation.ts`](../scripts/auto-simulation.ts) |
| Agent read/test/apply tools | [`backend/tools/file-system-tools.ts`](../backend/tools/file-system-tools.ts) |

## What changed (why it is more realistic)

- **Detection is test-driven** — Failures come from executing exported functions via a dynamic import of the current source (or sandbox copy), not from “do we recognize this buggy substring?”
- **Catalog is a label** — Known bugs help narration and demos; they do not define “broken.”
- **Separation of concerns** — `defect-pipeline.ts` isolates intake (`detectDefect`) from labeling (`matchKnownBugLabel`).
- **Two-layer validation** — Primary: behavioral tests. Secondary: `heuristicHints` from [`validation-heuristics.ts`](../demo/validation-heuristics.ts) (attached to results; do not flip pass/fail alone).
- **Mutation-based chaos** — `npm run mutate-worker` applies one deterministic operator (seed optional) for variety beyond the static catalog.

## Remaining limitations

- Behavioral tests still encode **expected numeric outputs** for this demo domain; they are not a general theorem prover.
- Dynamic import uses `tsx` / Node ESM behavior; eval output is written under `demo/.eval/` (gitignored).
- Main IT ticket pipeline ([`backend/agent/pipeline.ts`](../backend/agent/pipeline.ts)) still uses the IT-support classifier by default; code-defect classification is used in simulation scripts.
- Mutations are **string/line** based, not full AST — safe for hackathon scope.

## Commands

- `npm run auto-simulation` — timed catalog injection + watcher on `worker-logic.ts`
- `npm run inject-bug -- <id>` — catalog bug
- `npm run mutate-worker -- [seed]` — random applicable mutation

## Future work (post-hackathon)

- AST-aware mutations; broader invariant properties.
- Single `processTicket` path with explicit `domain` routing.
- CI job running `runValidationSuiteOnDisk()` on every PR.
