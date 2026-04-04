import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import type { InventoryItem } from "./worker-logic";
import { collectHeuristicHints } from "./validation-heuristics";

export interface TestResult {
  passed: boolean;
  results: {
    name: string;
    passed: boolean;
    error?: string;
  }[];
  summary: string;
  /** Non-fatal advisory strings for agents; do not affect `passed`. */
  heuristicHints?: string[];
}

/** Shape of demo/worker-logic.ts exports (dynamic import). */
export type WorkerLogicModule = {
  calculateOrderTotal: (
    orders: number[],
    discountPercent: number
  ) => number;
  calculateUserScore: (activityPoints: number, multiplier: number) => number;
  filterLowStockItems: (items: InventoryItem[]) => InventoryItem[];
  normalizeSensorData: (readings: number[], maxValue: number) => number[];
  normalizeDemoReadings: (readings: number[]) => number[];
};

const EVAL_DIR = path.join(__dirname, ".eval");
const EVAL_FILE = path.join(EVAL_DIR, "worker-logic.eval.ts");

/**
 * Run behavioral assertions against live exports (real functions).
 */
export function runBehavioralValidationFromModule(
  logic: WorkerLogicModule
): TestResult {
  const results: TestResult["results"] = [];

  const push = (name: string, fn: () => void) => {
    try {
      fn();
      results.push({ name, passed: true });
    } catch (err: any) {
      results.push({ name, passed: false, error: err.message });
    }
  };

  push("calculateOrderTotal returns correct value with 10% discount", () => {
    const orders = [120, 250, 89, 340, 75];
    const total = logic.calculateOrderTotal(orders, 10);
    if (total <= 0) throw new Error(`Total should be positive, got ${total}`);
    if (Math.abs(total - 786.6) > 0.01) {
      throw new Error(`Expected 786.6, got ${total}`);
    }
  });

  push("calculateOrderTotal discount must not exceed subtotal", () => {
    const orders = [100, 200];
    const total = logic.calculateOrderTotal(orders, 10);
    if (total <= 0) {
      throw new Error(
        `Discount should not exceed subtotal, got total: ${total}`
      );
    }
  });

  push("normalizeSensorData maxValue must not be zero", () => {
    let threw = false;
    try {
      logic.normalizeSensorData([45, 78, 23], 0);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected throw when maxValue is 0");
  });

  push("normalizeSensorData produces values between 0 and 100", () => {
    const readings = [45, 78, 23, 91, 56];
    const normalized = logic.normalizeSensorData(readings, 100);
    for (const val of normalized) {
      if (val < 0 || val > 100) {
        throw new Error(`Normalized value out of range: ${val}`);
      }
    }
  });

  push("normalizeDemoReadings matches maxValue 100 behavior", () => {
    const readings = [45, 78, 23];
    const a = logic.normalizeDemoReadings(readings);
    const b = logic.normalizeSensorData(readings, 100);
    if (a.length !== b.length || Math.abs(a[0] - b[0]) > 0.0001) {
      throw new Error("normalizeDemoReadings diverged from normalizeSensorData(..., 100)");
    }
  });

  push("calculateUserScore returns correct multiplication", () => {
    const score = logic.calculateUserScore(340, 1.5);
    if (Math.abs(score - 510) > 0.01) {
      throw new Error(`Expected 510, got ${score}`);
    }
  });

  push("calculateUserScore rejects negative activity points", () => {
    let threw = false;
    try {
      logic.calculateUserScore(-10, 1);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Should have thrown for negative points");
  });

  push("calculateUserScore accepts positive activity points", () => {
    const score = logic.calculateUserScore(210, 1.2);
    if (typeof score !== "number" || score <= 0) {
      throw new Error(`Expected positive score, got ${score}`);
    }
  });

  push("inventory filter flags items below minimum", () => {
    const items: InventoryItem[] = [
      { name: "Widget A", stock: 150, minimum: 50 },
      { name: "Widget B", stock: 80, minimum: 100 },
      { name: "Widget C", stock: 200, minimum: 75 },
    ];
    const lowStock = logic.filterLowStockItems(items);
    if (lowStock.length !== 1) {
      throw new Error(`Expected 1 low stock item, got ${lowStock.length}`);
    }
    if (lowStock[0].name !== "Widget B") {
      throw new Error(
        `Expected Widget B to be low stock, got ${lowStock[0].name}`
      );
    }
  });

  const passCount = results.filter((r) => r.passed).length;
  return {
    passed: results.every((r) => r.passed),
    results,
    summary: `${passCount}/${results.length} tests passed`,
  };
}

/**
 * Write source to a temp module and dynamically import it (tsx).
 * Primary validation path for sandbox copies of worker-logic.ts.
 */
export async function runValidationSuite(
  sourceCode: string
): Promise<TestResult> {
  const heuristicHints = collectHeuristicHints(sourceCode);

  fs.mkdirSync(EVAL_DIR, { recursive: true });
  fs.writeFileSync(EVAL_FILE, sourceCode, "utf-8");

  let logic: WorkerLogicModule;
  try {
    const url = `${pathToFileURL(EVAL_FILE).href}?t=${Date.now()}`;
    logic = (await import(url)) as WorkerLogicModule;
  } catch (err: any) {
    return {
      passed: false,
      results: [
        {
          name: "load worker-logic module",
          passed: false,
          error: `Failed to import eval module: ${err.message}`,
        },
      ],
      summary: "0/1 tests passed",
      heuristicHints,
    };
  }

  const behavioral = runBehavioralValidationFromModule(logic);
  return { ...behavioral, heuristicHints };
}

/**
 * Validate the on-disk demo/worker-logic.ts (reads file then runs same path as sandbox).
 */
export async function runValidationSuiteOnDisk(): Promise<TestResult> {
  const logicPath = path.join(__dirname, "worker-logic.ts");
  const source = fs.readFileSync(logicPath, "utf-8");
  return runValidationSuite(source);
}
