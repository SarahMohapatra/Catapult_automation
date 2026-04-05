import * as fs from "fs";
import * as path from "path";
import { runValidationSuite, TestResult } from "./test-runner";

const WORKER_LOGIC_FILE = path.join(__dirname, "worker-logic.ts");
const SANDBOX_FILE = path.join(__dirname, "worker-logic.sandbox.ts");

export interface SandboxResult {
  attemptNumber: number;
  proposedFix: {
    buggyLine: string;
    fixedLine: string;
  };
  testResult: TestResult;
  appliedToRealFile: boolean;
}

export function createSandbox(): string {
  const source = fs.readFileSync(WORKER_LOGIC_FILE, "utf-8");
  fs.writeFileSync(SANDBOX_FILE, source);
  return source;
}

export function applyFixToSandbox(
  buggyLine: string,
  fixedLine: string
): { success: boolean; error?: string } {
  const source = fs.readFileSync(SANDBOX_FILE, "utf-8");

  if (!source.includes(buggyLine)) {
    return {
      success: false,
      error: `Could not find line in sandbox: "${buggyLine}"`,
    };
  }

  const fixed = source.replace(buggyLine, fixedLine);
  fs.writeFileSync(SANDBOX_FILE, fixed);
  return { success: true };
}

export async function testSandbox(): Promise<TestResult> {
  const sandboxSource = fs.readFileSync(SANDBOX_FILE, "utf-8");
  return runValidationSuite(sandboxSource);
}

export function promoteSandboxToReal(): void {
  const sandboxSource = fs.readFileSync(SANDBOX_FILE, "utf-8");
  fs.writeFileSync(WORKER_LOGIC_FILE, sandboxSource);
}

export function cleanupSandbox(): void {
  if (fs.existsSync(SANDBOX_FILE)) {
    fs.unlinkSync(SANDBOX_FILE);
  }
}

export function readSandboxSource(): string {
  const source = fs.readFileSync(SANDBOX_FILE, "utf-8");
  return source
    .split("\n")
    .map((line, i) => `${String(i + 1).padStart(3, " ")} | ${line}`)
    .join("\n");
}
