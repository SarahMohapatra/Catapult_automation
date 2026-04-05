import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import * as fs from "fs";
import { classifyIssue } from "../backend/agent/classifier";
import { runL1Agent } from "../backend/agent/l1-agent";
import { runL2Agent } from "../backend/agent/l2-agent";
import { runEscalationHandler } from "../backend/agent/escalation";
import { bugs, injectBug, Bug } from "../demo/bug-injector";
import { cleanupSandbox } from "../demo/sandbox";
import { runValidationSuite } from "../demo/test-runner";
import {
  detectDefect,
  matchKnownBugLabel,
  buildUnknownDefectDescription,
  buildCatalogDefectDescription,
} from "../demo/defect-pipeline";

const WORKER_LOGIC_FILE = path.join(process.cwd(), "demo/worker-logic.ts");
const WORKER_LOG = path.join(process.cwd(), "demo/worker.log");

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function writeWorkerLog(level: string, task: string, message: string) {
  const entry = `[${new Date().toISOString()}] [${level}] [${task}] ${message}\n`;
  fs.appendFileSync(WORKER_LOG, entry);
}

function separator() {
  console.log("─".repeat(56));
}

function printStep(step: any) {
  if (step.type === "thinking") {
    console.log(`\n  [THINK] ${step.content}`);
  } else if (step.type === "tool_call") {
    const icons: Record<string, string> = {
      read_source_code: "READ SOURCE",
      propose_sandbox_fix: "SANDBOX FIX",
      run_sandbox_tests: "RUN TESTS",
      apply_sandbox_to_real: "APPLY TO REAL FILE",
      read_worker_logs: "READ LOGS",
    };
    const label = icons[step.toolName ?? ""] ?? step.toolName;
    console.log(`\n  [TOOL] ${label}`);
  } else if (step.type === "tool_result") {
    try {
      const parsed = JSON.parse(step.content);

      if (step.toolName === "run_sandbox_tests") {
        console.log(`  [TEST] ${parsed.summary}`);
        if (parsed.results) {
          for (const line of parsed.results) {
            console.log(`     ${line}`);
          }
        }
        console.log(`  -> Next: ${parsed.nextStep}`);
      } else if (step.toolName === "propose_sandbox_fix") {
        if (parsed.success) {
          console.log(`  [OK] Fix staged in sandbox. Real file unchanged.`);
        } else {
          console.log(`  [FAIL] Could not stage fix: ${parsed.error}`);
        }
      } else if (step.toolName === "apply_sandbox_to_real") {
        if (parsed.success) {
          console.log(`  [OK] Fix applied to real file! ${parsed.testSummary}`);
        } else {
          console.log(`  [FAIL] Apply blocked: ${parsed.error}`);
        }
      } else if (step.toolName === "read_source_code") {
        console.log(`  [READ] Source read (${parsed.totalLines} lines)`);
      } else {
        const short = JSON.stringify(parsed).slice(0, 120);
        console.log(`  -> ${short}`);
      }
    } catch {
      console.log(`  -> ${step.content.slice(0, 120)}`);
    }
  } else if (step.type === "complete") {
    console.log(`\n  [DONE] ${step.content}`);
  }
}

async function verifyWorkerState(bug: Bug | null): Promise<{
  testsPass: boolean;
  testSummary: string;
  bugCleared: boolean;
  fixPresent: boolean;
}> {
  const currentSource = fs.readFileSync(WORKER_LOGIC_FILE, "utf-8");
  const testResult = await runValidationSuite(currentSource);
  const bugCleared = !bug || !currentSource.includes(bug.buggyLine);
  const fixPresent = !bug || currentSource.includes(bug.fixedLine);
  return {
    testsPass: testResult.passed,
    testSummary: testResult.summary,
    bugCleared,
    fixPresent,
  };
}

async function runRepairAttempts(
  tier: "L1" | "L2",
  issueTitle: string,
  baseDescription: string,
  category: string,
  bug: Bug | null
): Promise<{ ok: boolean; attemptNotes: string[] }> {
  const attemptNotes: string[] = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    cleanupSandbox();
    const retryHint =
      attempt === 1
        ? ""
        : `

RETRY ${attempt}/2 — Previous attempt did not leave demo/worker-logic.ts passing all checks.
What you tried before (do something different):
${attemptNotes.map((n, i) => `${i + 1}. ${n}`).join("\n")}
`;

    const description = baseDescription + retryHint;
    const onStep = (step: any) => {
      printStep(step);
    };

    try {
      if (tier === "L1") {
        await runL1Agent(issueTitle, description, category, onStep);
      } else {
        await runL2Agent(issueTitle, description, category, onStep);
      }
    } catch (err: any) {
      attemptNotes.push(`Attempt ${attempt}: agent error — ${err.message}`);
      continue;
    }

    const v = await verifyWorkerState(bug);
    if (v.testsPass && v.bugCleared && v.fixPresent) {
      return { ok: true, attemptNotes };
    }

    attemptNotes.push(
      `Attempt ${attempt}: after run, testsPass=${v.testsPass} (${v.testSummary}), bugCleared=${v.bugCleared}, fixPresent=${v.fixPresent}`
    );
  }

  cleanupSandbox();
  return { ok: false, attemptNotes };
}

async function processDefect(
  bug: Bug | null,
  validationSnapshot: import("../demo/test-runner").TestResult,
  sourceCode: string
) {
  const issueTitle = bug
    ? `Bug in worker-logic.ts: ${bug.name}`
    : `demo/worker-logic.ts failing behavioral validation`;

  const baseDescription = bug
    ? buildCatalogDefectDescription(bug)
    : buildUnknownDefectDescription(validationSnapshot, sourceCode);

  console.log("\n" + "=".repeat(56));
  console.log(`  DEFECT: ${bug ? bug.name : "Unknown (validation failed)"}`);
  if (bug) console.log(`  Catalog tier hint:  ${bug.tier}`);
  console.log("=".repeat(56));

  if (bug) {
    console.log("\n  Known pattern in demo/worker-logic.ts:");
    separator();
    console.log(`  BUGGY:  ${bug.buggyLine.trim()}`);
    console.log(`  FIXED:  ${bug.fixedLine.trim()}`);
    separator();
    writeWorkerLog("ERROR", "Worker", bug.expectedError);
    writeWorkerLog("ERROR", "Worker", `Bug introduced: ${bug.description}`);
  } else {
    writeWorkerLog(
      "ERROR",
      "Worker",
      "Regression: behavioral validation failed after edit"
    );
  }

  console.log("\nCLASSIFY (code defect rubric)...");
  let classification;
  try {
    classification = await classifyIssue(issueTitle, baseDescription, {
      domain: "code_defect",
    });
    console.log(`  Tier: ${classification.tier}`);
    console.log(`  Confidence: ${(classification.confidence * 100).toFixed(0)}%`);
    console.log(`  Reasoning: ${classification.reasoning}`);
  } catch (err: any) {
    console.log(`  Classification failed: ${err.message}`);
    return;
  }

  console.log(`\nROUTE (L3 = advisory only; L1/L2 = sandbox repair)...`);
  separator();

  if (classification.tier === "L3") {
    console.log("  L3 — no automated file changes.\n");
    try {
      const report = await runEscalationHandler(
        issueTitle,
        baseDescription,
        classification.category
      );
      console.log("  ESCALATION / ADVISORY");
      separator();
      console.log(`  Summary:       ${report.summary}`);
      console.log(`  Why L3:        ${report.whyBeyondScope}`);
      console.log(`  Urgency:       ${report.urgencyLevel}`);
      console.log(`  Impact:        ${report.estimatedImpact}`);
      console.log("\n  Suggested Actions:");
      report.suggestedActions.forEach((action, i) => {
        console.log(`  ${i + 1}. ${action}`);
      });
      separator();
    } catch (err: any) {
      console.log(`  Escalation handler failed: ${err.message}`);
    }
    return;
  }

  const tier = classification.tier;
  const { ok, attemptNotes } = await runRepairAttempts(
    tier,
    issueTitle,
    baseDescription,
    classification.category,
    bug
  );

  console.log("\n" + "=".repeat(56));
  console.log("  OUTCOME");
  console.log("=".repeat(56));

  const finalV = await verifyWorkerState(bug);

  if (ok) {
    console.log(`  Status: RESOLVED after automated repair (${tier})`);
    console.log(`  Tests:  ${finalV.testSummary}`);
    console.log("\n  worker-logic.ts passes behavioral validation.");
  } else {
    console.log(
      "  Status: REPAIR EXHAUSTED — L3-style advisory (no further auto-edits)"
    );
    console.log("\n  Attempt log:");
    attemptNotes.forEach((n, i) => console.log(`    ${i + 1}. ${n}`));

    const escalationBody = `
${baseDescription}

Automated repair failed after 2 attempts. Steps / outcomes:
${attemptNotes.map((n, i) => `${i + 1}. ${n}`).join("\n")}

Do not assume the file was fixed; provide human-facing remediation guidance only.
    `.trim();

    try {
      const report = await runEscalationHandler(
        issueTitle,
        escalationBody,
        "repair_exhausted"
      );
      console.log("\n  L3 ADVISORY (no file changes)");
      separator();
      console.log(`  Summary: ${report.summary}`);
      report.suggestedActions.forEach((action, i) => {
        console.log(`  ${i + 1}. ${action}`);
      });
      separator();
    } catch (err: any) {
      console.log(`  Escalation handler failed: ${err.message}`);
    }
  }

  console.log("=".repeat(56) + "\n");
  cleanupSandbox();
}

let isProcessing = false;
let lastContent = fs.readFileSync(WORKER_LOGIC_FILE, "utf-8");

function startFileWatcher() {
  console.log("\nWatching demo/worker-logic.ts for changes...");
  console.log(
    "  Detection is test-driven: a ticket opens only when behavioral validation fails.\n"
  );

  fs.watch(WORKER_LOGIC_FILE, async (eventType) => {
    if (eventType !== "change") return;
    if (isProcessing) return;

    await sleep(300);

    const newContent = fs.readFileSync(WORKER_LOGIC_FILE, "utf-8");
    if (newContent === lastContent) return;

    lastContent = newContent;

    const { healthy, validation } = await detectDefect(newContent);

    if (healthy) {
      console.log(
        "[Watcher] Behavioral validation green — no ticket."
      );
      return;
    }

    const matchedBug = matchKnownBugLabel(newContent, bugs);

    if (!matchedBug) {
      console.log(
        "\n[Watcher] Validation failed — no catalog label (unknown defect)."
      );
    } else {
      console.log(
        `\n[Watcher] Validation failed — catalog label: "${matchedBug.name}"`
      );
    }

    isProcessing = true;
    try {
      await processDefect(matchedBug ?? null, validation, newContent);
    } finally {
      lastContent = fs.readFileSync(WORKER_LOGIC_FILE, "utf-8");
      isProcessing = false;
    }
  });
}

async function runAutoInjector(intervalSeconds: number, bugList: Bug[]) {
  console.log(`\nAuto-injector will introduce a catalog bug every ${intervalSeconds}s`);
  console.log("  Watcher reacts via behavioral validation.\n");

  for (const bug of bugList) {
    while (isProcessing) {
      await sleep(1000);
    }

    console.log(`\n[AutoInjector] Injecting: "${bug.name}"`);
    injectBug(bug);

    await sleep(intervalSeconds * 1000);

    while (isProcessing) {
      await sleep(1000);
    }
  }

  console.log("\n[AutoInjector] All bugs processed. Simulation complete.");
  process.exit(0);
}

async function main() {
  console.log("=".repeat(56));
  console.log("  NEURALOPS — AUTO SIMULATION");
  console.log("  Intake: validation  |  Label: optional catalog");
  console.log("=".repeat(56));
  console.log(`
  Modes:
  1. Auto — inject catalog bugs on a timer
  2. Manual — watch edits; ticket only if validation fails
  `);

  const mode = process.argv[2] ?? "1";

  fs.writeFileSync(WORKER_LOG, "");

  if (mode === "2") {
    startFileWatcher();
    process.stdin.resume();
  } else {
    startFileWatcher();
    await sleep(1000);
    await runAutoInjector(90, bugs);
  }
}

main();
