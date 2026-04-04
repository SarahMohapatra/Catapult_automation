/**
 * Apply one deterministic random mutation to demo/worker-logic.ts.
 * Usage:
 *   npx tsx scripts/mutate-worker.ts           # seed from time
 *   npx tsx scripts/mutate-worker.ts 42        # numeric seed
 *   npx tsx scripts/mutate-worker.ts demo-seed # string seed (hashed)
 */
import * as fs from "fs";
import * as path from "path";
import { applyRandomMutation } from "../demo/mutation-injector";

const WORKER_LOGIC = path.join(process.cwd(), "demo/worker-logic.ts");
const arg = process.argv[2];
const seed =
  arg === undefined
    ? undefined
    : /^\d+$/.test(arg)
      ? parseInt(arg, 10)
      : arg;

const original = fs.readFileSync(WORKER_LOGIC, "utf-8");
const result = applyRandomMutation(original, seed as number | string | undefined);

if (!result.applied) {
  console.error(result.description);
  process.exit(1);
}

fs.writeFileSync(WORKER_LOGIC, result.source, "utf-8");
console.log(`Mutation applied: ${result.operatorId}`);
console.log(`  ${result.description}`);
console.log(`  seed arg: ${arg ?? "(time-based)"}`);
