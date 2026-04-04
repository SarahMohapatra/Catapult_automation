/**
 * Inject a catalog bug into demo/worker-logic.ts (for manual demos).
 * Usage: npx tsx scripts/inject-bug.ts <bug-id>
 * Example: npx tsx scripts/inject-bug.ts l1-divide-zero
 */
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { bugs, injectBug } from "../demo/bug-injector";

const id = process.argv[2];

if (!id) {
  console.log("Usage: npx tsx scripts/inject-bug.ts <bug-id>\n");
  console.log("Known bug ids:");
  for (const b of bugs) {
    console.log(`  ${b.id.padEnd(22)} ${b.tier}  ${b.name}`);
  }
  process.exit(1);
}

const bug = bugs.find((b) => b.id === id);
if (!bug) {
  console.error(`Unknown id "${id}".`);
  process.exit(1);
}

const ok = injectBug(bug);
process.exit(ok ? 0 : 1);
