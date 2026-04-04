import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import * as fs from "fs";
import { runL2Agent } from "../backend/agent/l2-agent";

const CONFIG_FILE = path.join(process.cwd(), "demo/config.json");

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
}

async function runPhase3() {
  console.log("=".repeat(50));
  console.log("  PHASE 3 — Agent + Tools Test");
  console.log("=".repeat(50));
  console.log("");

  // First corrupt the config
  console.log("Step 1: Corrupting config (simulating chaos monkey)...");
  const config = readConfig();
  config.paymentService.apiKey = "";
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log(`   paymentService.apiKey is now: "${readConfig().paymentService.apiKey}"`);
  console.log("");

  console.log("Step 2: Running L2 agent directly (no watcher, manually fed)...");
  console.log("   Watch the agent think through this step by step:");
  console.log("");

  const steps: any[] = [];

  try {
    const result = await runL2Agent(
      "PaymentService API key missing from config",
      `
      The PaymentService API key has been wiped from config.json.
      This is causing all payment processing to fail.
      Config file location: demo/config.json
      Field to fix: paymentService.apiKey
      Expected: a non-empty string like "pk_demo_abc123xyz"
      Read the config file, restore the API key, and verify.
      `,
      "config_corruption",
      (step) => {
        steps.push(step);
        // Print each step as it happens
        if (step.type === "thinking") {
          console.log(`   🧠 [THINKING] ${step.content}`);
        } else if (step.type === "tool_call") {
          console.log(`   🔧 [TOOL CALL] ${step.toolName}`);
          console.log(`      Input: ${step.content}`);
        } else if (step.type === "tool_result") {
          console.log(`   📥 [TOOL RESULT] ${step.toolName}`);
          // Parse and pretty print if JSON
          try {
            const parsed = JSON.parse(step.content);
            console.log(`      ${JSON.stringify(parsed, null, 6).slice(0, 300)}`);
          } catch {
            console.log(`      ${step.content.slice(0, 200)}`);
          }
        } else if (step.type === "complete") {
          console.log(`   ✅ [COMPLETE] ${step.content}`);
        }
        console.log("");
      }
    );

    console.log("=".repeat(50));
    console.log("  AGENT FINISHED");
    console.log("=".repeat(50));
    console.log(`  Status: ${result.status}`);
    console.log(`  Steps taken: ${steps.length}`);
    console.log("");

    // Check if config was actually fixed
    const finalConfig = readConfig();
    console.log("Step 3: Verifying config was actually fixed...");
    
    if (finalConfig.paymentService.apiKey && finalConfig.paymentService.apiKey !== "") {
      console.log(`✅ PASS — API key restored to: "${finalConfig.paymentService.apiKey}"`);
      console.log(`✅ PASS — Other fields preserved: userService.enabled = ${finalConfig.userService.enabled}`);
      console.log("\n✅ PHASE 3 COMPLETE. Agent correctly diagnosed and fixed the issue.");
      console.log("   Move on to Phase 4.\n");
    } else {
      console.log("❌ FAIL — API key is still empty after agent ran.");
      console.log("   Agent status was:", result.status);
      console.log("   Final output:", result.finalOutput);
      console.log("\n   Debug: Check that file-system-tools.ts write_config schema fix was applied.\n");
    }

  } catch (err: any) {
    console.log(`💥 AGENT ERROR — ${err.message}`);
    console.log("\n   This is likely the ToolInputParsingException.");
    console.log("   Make sure you applied the write_config schema fix in file-system-tools.ts\n");
  }
}

runPhase3();