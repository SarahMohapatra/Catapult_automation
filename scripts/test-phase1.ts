import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { classifyIssue } from "../backend/agent/classifier";

const testCases = [
  {
    title: "I forgot my password",
    description: "I cannot log in, I forgot my password and need a reset.",
    expectedTier: "L1",
  },
  {
    title: "Payment service throwing 500 errors",
    description: "Our payment API is returning 500 errors for all transactions. Error rate is 45% over last 10 minutes.",
    expectedTier: "L2",
  },
  {
    title: "Multiple database nodes down across all regions",
    description: "We are seeing complete data loss across 3 regions. Replication has stopped. Revenue impact is critical.",
    expectedTier: "L3",
  },
  {
    title: "New employee needs an account",
    description: "Please create an account for John Smith, john@company.com, joining the engineering team.",
    expectedTier: "L1",
  },
  {
    title: "App latency spike after deployment",
    description: "Response times went from 200ms to 4000ms after the release at 3pm. Users are complaining.",
    expectedTier: "L2",
  },
];

async function runPhase1() {
  console.log("=".repeat(50));
  console.log("  PHASE 1 — Classifier Test");
  console.log("=".repeat(50));
  console.log("");

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    process.stdout.write(`Testing: "${test.title}"... `);
    
    try {
      const result = await classifyIssue(test.title, test.description);
      
      if (result.tier === test.expectedTier) {
        console.log(`✅ PASS — Got ${result.tier} (confidence: ${result.confidence.toFixed(2)})`);
        console.log(`   Reasoning: ${result.reasoning}`);
        passed++;
      } else {
        console.log(`❌ FAIL — Expected ${test.expectedTier}, got ${result.tier}`);
        console.log(`   Reasoning: ${result.reasoning}`);
        failed++;
      }
    } catch (err: any) {
      console.log(`💥 ERROR — ${err.message}`);
      failed++;
    }
    
    console.log("");
  }

  console.log("=".repeat(50));
  console.log(`  RESULTS: ${passed}/${testCases.length} passed`);
  console.log("=".repeat(50));

  if (failed === 0) {
    console.log("\n✅ PHASE 1 COMPLETE. Classifier is working correctly.");
    console.log("   Move on to Phase 2.\n");
  } else {
    console.log("\n❌ Phase 1 has failures. Fix classifier-prompt.ts before continuing.\n");
  }
}

runPhase1();