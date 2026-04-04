import * as fs from "fs";
import * as path from "path";

const WORKER_LOGIC_FILE = path.join(__dirname, "worker-logic.ts");

export interface Bug {
  id: string;
  tier: "L1" | "L2";
  name: string;
  description: string;
  // The exact line to find in worker-logic.ts
  targetLine: string;
  // What to replace it with (the buggy version)
  buggyLine: string;
  // What the fix should look like (original)
  fixedLine: string;
  // Error message the worker will log when this bug is active
  expectedError: string;
}

export const bugs: Bug[] = [
  // ── L1 BUGS ─────────────────────────────────────────────────
  // Simple one-line fixes. Wrong operator, commented line, typo.

  {
    id: "l1-divide-zero",
    tier: "L1",
    name: "Division by Zero — maxValue hardcoded to 0",
    description: "Someone hardcoded maxValue to 0, causing division by zero in the data pipeline.",
    targetLine: "  const maxValue = 100;",
    buggyLine:  "  const maxValue = 0;",
    fixedLine:  "  const maxValue = 100;",
    expectedError: "Cannot normalize sensor data: maxValue is 0. Division by zero.",
  },
  {
    id: "l1-negative-discount",
    tier: "L1",
    name: "Negative Discount — discount sign flipped",
    description: "The discount percent was changed to -10, making the total larger than the subtotal.",
    targetLine: "  const discount = 10;",
    buggyLine:  "  const discount = -10;",
    fixedLine:  "  const discount = 10;",
    expectedError: "Order total is invalid",
  },
  {
    id: "l1-commented-return",
    tier: "L1",
    name: "Missing Return — reduce line commented out",
    description: "The subtotal calculation line was commented out, returning NaN.",
    targetLine: "  const subtotal = orders.reduce((sum, price) => sum + price, 0);",
    buggyLine:  "  // const subtotal = orders.reduce((sum, price) => sum + price, 0);",
    fixedLine:  "  const subtotal = orders.reduce((sum, price) => sum + price, 0);",
    expectedError: "Order total is invalid",
  },

  // ── L2 BUGS ─────────────────────────────────────────────────
  // Require understanding logic, not just spotting a typo.

  {
    id: "l2-inverted-condition",
    tier: "L2",
    name: "Inverted Condition — score rejects valid points",
    description: "The activityPoints validation condition was inverted. It now throws for all positive values instead of negative ones.",
    targetLine: "  if (activityPoints < 0) {",
    buggyLine:  "  if (activityPoints > 0) {",
    fixedLine:  "  if (activityPoints < 0) {",
    expectedError: "Invalid activity points",
  },
  {
    id: "l2-wrong-operator",
    tier: "L2",
    name: "Wrong Operator — multiplication replaced with division",
    description: "The score calculation uses division instead of multiplication, producing incorrect scores.",
    targetLine: "  return activityPoints * multiplier;",
    buggyLine:  "  return activityPoints / multiplier;",
    fixedLine:  "  return activityPoints * multiplier;",
    expectedError: "Invalid activity points",
  },
  {
    id: "l2-wrong-filter",
    tier: "L2",
    name: "Inverted Filter — low stock logic reversed",
    description: "The inventory filter condition was flipped. It now flags items WITH enough stock instead of low stock items.",
    targetLine: "  const lowStock = items.filter((item) => item.stock < item.minimum);",
    buggyLine:  "  const lowStock = items.filter((item) => item.stock > item.minimum);",
    fixedLine:  "  const lowStock = items.filter((item) => item.stock < item.minimum);",
    expectedError: "Low stock detected",
  },
];

export function injectBug(bug: Bug): boolean {
  const source = fs.readFileSync(WORKER_LOGIC_FILE, "utf-8");

  if (!source.includes(bug.targetLine)) {
    console.log(`[BugInjector] Could not find target line for bug "${bug.name}"`);
    console.log(`[BugInjector] Looking for: "${bug.targetLine}"`);
    return false;
  }

  const corrupted = source.replace(bug.targetLine, bug.buggyLine);
  fs.writeFileSync(WORKER_LOGIC_FILE, corrupted);
  console.log(`\n[BugInjector] 🐛 Injected bug: ${bug.name}`);
  console.log(`[BugInjector] Changed line:`);
  console.log(`  BEFORE: ${bug.targetLine.trim()}`);
  console.log(`  AFTER:  ${bug.buggyLine.trim()}`);
  return true;
}

export function fixBug(bug: Bug): boolean {
  const source = fs.readFileSync(WORKER_LOGIC_FILE, "utf-8");

  if (!source.includes(bug.buggyLine)) {
    return false;
  }

  const fixed = source.replace(bug.buggyLine, bug.fixedLine);
  fs.writeFileSync(WORKER_LOGIC_FILE, fixed);
  return true;
}

export function isCurrentlyBuggy(bug: Bug): boolean {
  const source = fs.readFileSync(WORKER_LOGIC_FILE, "utf-8");
  return source.includes(bug.buggyLine);
}