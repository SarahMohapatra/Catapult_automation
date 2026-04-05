import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import * as fs from "fs";
import * as readline from "readline";
import { classifyIssue } from "../backend/agent/classifier";
import { runL1Agent } from "../backend/agent/l1-agent";
import { runL2Agent } from "../backend/agent/l2-agent";
import { runEscalationHandler } from "../backend/agent/escalation";
import { bugs, injectBug, isCurrentlyBuggy, Bug } from "../demo/bug-injector";

const WORKER_LOGIC_FILE = path.join(process.cwd(), "demo/worker-logic.ts");
const WORKER_LOG = path.join(process.cwd(), "demo/worker.log");

function readWorkerSource() {
  return fs.readFileSync(WORKER_LOGIC_FILE, "utf-8");
}

function clearWorkerLog() {
  fs.writeFileSync(WORKER_LOG, "");
}

function writeWorkerLog(level: string, task: string, message: string) {
  const entry = `[${new Date().toISOString()}] [${level}] [${task}] ${message}\n`;
  fs.appendFileSync(WORKER_LOG, entry);
}

function showSourceDiff(bug: Bug) {
  console.log("\n  demo/worker-logic.ts — what changed:");
  console.log("─".repeat(52));
  console.log(`  BUGGY  ✗  ${bug.buggyLine.trim()}`);
  console.log(`  FIXED  ✓  ${bug.fixedLine.trim()}`);
  console.log("─".repeat(52));
}

function showCurrentSource(bug: Bug) {
  const source = readWorkerSource();
  const lines = source.split("\n");
  const buggyIndex = lines.findIndex((l) => l === bug.buggyLine);
  const fixedIndex = lines.findIndex((l) => l === bug.fixedLine);
  const targetIndex = buggyIndex !== -1 ? buggyIndex : fixedIndex;

  if (targetIndex === -1) return;

  console.log("\n  demo/worker-logic.ts (around the bug):");
  console.log("─".repeat(52));

  const start = Math.max(0, targetIndex - 3);
  const end = Math.min(lines.length - 1, targetIndex + 3);

  for (let i = start; i <= end; i++) {
    const lineNum = String(i + 1).padStart(3, " ");
    const marker = i === targetIndex ? (buggyIndex !== -1 ? " ✗" : " ✓") : "   ";
    console.log(`  ${lineNum} |${marker} ${lines[i]}`);
  }
  console.log("─".repeat(52));
}

function printStep(step: any) {
  if (step.type === "thinking") {
    console.log(`\n  [THINK] ${step.content}`);
  } else if (step.type === "tool_call") {
    console.log(`\n  [TOOL]  CALLING: ${step.toolName}`);
  } else if (step.type === "tool_result") {
    if (step.toolName === "read_source_code") {
      console.log(`  [RESULT] Got source code (${readWorkerSource().split("\n").length} lines)`);
    } else {
      try {
        const parsed = JSON.parse(step.content);
        if (parsed.success === false) {
          console.log(`  [RESULT] ✗ ${parsed.error}`);
        } else {
          const short = JSON.stringify(parsed).slice(0, 150);
          console.log(`  [RESULT] ${short}`);
        }
      } catch {
        console.log(`  [RESULT] ${step.content.slice(0, 150)}`);
      }
    }
  } else if (step.type === "complete") {
    console.log(`\n  ✓ ${step.content}`);
  }
}

async function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runScenario(bug: Bug) {
  console.log("\n" + "=".repeat(52));
  console.log(`  BUG SCENARIO: ${bug.name}`);
  console.log(`  Tier: ${bug.tier}`);
  console.log("=".repeat(52));

  console.log("\n  STEP 1 — Current worker source (before bug):");
  showCurrentSource(bug);
  await sleep(1000);

  console.log("\n  STEP 2 — Injecting bug into worker-logic.ts...");
  const injected = injectBug(bug);
  if (!injected) {
    console.log("  ✗ Could not inject bug — target line not found in source.");
    return;
  }

  showCurrentSource(bug);
  await sleep(800);

  console.log("\n  STEP 3 — Worker detects the error and logs it...");
  clearWorkerLog();
  writeWorkerLog("ERROR", bug.name.replace(/ /g, ""), bug.expectedError);
  writeWorkerLog("ERROR", "Worker", `Task failed due to bug: ${bug.description}`);
  console.log(`  [ERROR] ${bug.expectedError}`);
  await sleep(800);

  console.log("\n  STEP 4 — NeuralOps classifying the issue...");

  const issueTitle = `Bug detected in worker-logic.ts: ${bug.name}`;
  const issueDescription = `
    A bug has been detected in demo/worker-logic.ts (business logic module).
    
    Error observed: ${bug.expectedError}
    Bug description: ${bug.description}
    
    Read the source at demo/worker-logic.ts,
    fix via sandbox tools (propose_sandbox_fix, run_sandbox_tests, apply_sandbox_to_real).
  `.trim();

  let classification;
  try {
    classification = await classifyIssue(issueTitle, issueDescription, {
      domain: "code_defect",
    });
    console.log(`  Classified as: ${classification.tier} (confidence: ${(classification.confidence * 100).toFixed(0)}%)`);
    console.log(`  Category: ${classification.category}`);
    console.log(`  Reasoning: ${classification.reasoning}`);
  } catch (err: any) {
    console.log(`  ✗ Classification failed: ${err.message}`);
    return;
  }

  await sleep(500);

  console.log(`\n  STEP 5 — Routing (${classification.tier})...`);

  const steps: any[] = [];
  let agentResult: any;

  if (classification.tier === "L3") {
    console.log("  L3 — advisory only; worker-logic.ts will not be modified by automation.");
    try {
      const report = await runEscalationHandler(
        issueTitle,
        issueDescription,
        classification.category
      );
      console.log(`\n  Summary: ${report.summary}`);
      report.suggestedActions.slice(0, 5).forEach((a, i) => {
        console.log(`  ${i + 1}. ${a}`);
      });
      agentResult = { status: "ESCALATED", finalOutput: report.summary };
    } catch (err: any) {
      console.log(`\n  Escalation handler error: ${err.message}`);
      return;
    }
  } else {
    console.log(
      `  Agent: ${classification.tier === "L1" ? "L1 (routine fix)" : "L2 (diagnostic fix)"}`
    );
    console.log("\n  Watching agent work in real time:");
    console.log("─".repeat(52));

    try {
      if (classification.tier === "L1") {
        agentResult = await runL1Agent(
          issueTitle,
          issueDescription,
          classification.category,
          (step) => {
            steps.push(step);
            printStep(step);
          }
        );
      } else {
        agentResult = await runL2Agent(
          issueTitle,
          issueDescription,
          classification.category,
          (step) => {
            steps.push(step);
            printStep(step);
          }
        );
      }
    } catch (err: any) {
      console.log(`\n  Agent error: ${err.message}`);
      return;
    }
  }

  console.log("\n" + "─".repeat(52));
  console.log("\n  STEP 6 — Verifying fix on disk...");

  const stillBuggy = isCurrentlyBuggy(bug);
  const isFixed = !stillBuggy;

  showCurrentSource(bug);
  showSourceDiff(bug);

  console.log("\n" + "=".repeat(52));
  console.log("  RESULT");
  console.log("=".repeat(52));
  console.log(`  Bug tier:      ${bug.tier}`);
  console.log(`  Classified as: ${classification.tier}`);
  console.log(`  Agent status:  ${agentResult?.status ?? "unknown"}`);
  console.log(`  File fixed:    ${isFixed ? "✓ YES" : "✗ NO"}`);

  if (isFixed) {
    console.log(`\n  ✓ SUCCESS — Agent fixed demo/worker-logic.ts`);
  } else {
    console.log(`\n  ✗ FAILED — Bug is still present in worker-logic.ts`);
  }

  console.log("=".repeat(52) + "\n");
}

async function showMenu() {
  console.log("\n" + "=".repeat(52));
  console.log("  NEURALOPS — LIVE CODE BUG DEMO");
  console.log("  Agent reads, understands and fixes real code");
  console.log("=".repeat(52));
  console.log("");
  console.log("  L1 Bugs (simple one-line fix)");
  console.log("  ─".repeat(15));

  const l1Bugs = bugs.filter((b) => b.tier === "L1");
  const l2Bugs = bugs.filter((b) => b.tier === "L2");

  l1Bugs.forEach((b, i) => {
    console.log(`  ${i + 1}.  ${b.name}`);
  });

  console.log("");
  console.log("  L2 Bugs (logic error — requires understanding)");
  console.log("  ─".repeat(24));

  l2Bugs.forEach((b, i) => {
    console.log(`  ${l1Bugs.length + i + 1}.  ${b.name}`);
  });

  console.log("");
  console.log("  A.  Run ALL scenarios automatically");
  console.log("  Q.  Quit");
  console.log("");

  const answer = await promptUser("  Pick a scenario (1-6, A, Q): ");

  if (answer.toLowerCase() === "q") {
    console.log("\nGoodbye.\n");
    process.exit(0);
  }

  if (answer.toLowerCase() === "a") {
    for (const bug of bugs) {
      await runScenario(bug);
      await sleep(2000);
    }
    await showMenu();
    return;
  }

  const index = parseInt(answer) - 1;
  if (index >= 0 && index < bugs.length) {
    await runScenario(bugs[index]);
  } else {
    console.log("  Invalid choice.");
  }

  await showMenu();
}

showMenu();
