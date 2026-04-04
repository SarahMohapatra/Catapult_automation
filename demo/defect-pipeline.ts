/**
 * Modular defect workflow: detection and labeling are separate.
 * - Detection = behavioral validation only (no catalog required).
 * - Catalog match = optional friendly label / metadata for reporting.
 */

import type { Bug } from "./bug-injector";
import { runValidationSuite, TestResult } from "./test-runner";

export interface DefectDetection {
  /** True when all behavioral tests pass on the given source. */
  healthy: boolean;
  validation: TestResult;
}

/**
 * L1-style intake: run validation suite on worker-logic source (string).
 * Does not consult the bug catalog.
 */
export async function detectDefect(
  workerLogicSource: string
): Promise<DefectDetection> {
  const validation = await runValidationSuite(workerLogicSource);
  return {
    healthy: validation.passed,
    validation,
  };
}

/**
 * Optional catalog lookup for labels and demo metadata only.
 * Not used to decide whether a defect exists.
 */
export function matchKnownBugLabel(
  workerLogicSource: string,
  catalog: Bug[]
): Bug | null {
  const hit = catalog.find((b) => workerLogicSource.includes(b.buggyLine));
  return hit ?? null;
}

export function buildUnknownDefectDescription(validation: TestResult): string {
  const failures = validation.results
    .filter((r) => !r.passed)
    .map((r) => `- ${r.name}${r.error ? `: ${r.error}` : ""}`)
    .join("\n");

  const hints =
    validation.heuristicHints?.length && validation.heuristicHints.length > 0
      ? `\nHeuristic hints (non-fatal):\n${validation.heuristicHints.map((h) => `- ${h}`).join("\n")}`
      : "";

  return `
    Automated behavioral tests failed on demo/worker-logic.ts.
    Summary: ${validation.summary}

    Failing checks:
    ${failures || "(no individual case details)"}
    ${hints}

    Read the source, propose_sandbox_fix on the sandbox copy, run_sandbox_tests,
    and only if all tests pass apply_sandbox_to_real.
  `.trim();
}

export function buildCatalogDefectDescription(bug: Bug): string {
  return `
    A defect pattern was detected in demo/worker-logic.ts (catalog label: ${bug.name}).
    Error: ${bug.expectedError}
    Description: ${bug.description}

    Read the source code, identify the exact buggy line,
    propose a fix in the sandbox, run tests, and if they
    pass apply the fix to the real file.
  `.trim();
}
