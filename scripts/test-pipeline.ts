import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import { processTicket } from "../backend/agent/pipeline";
import { startWatcher } from "../backend/monitors/watcher";

const CONFIG_FILE = path.join(process.cwd(), "demo/config.json");
const LOG_FILE = path.join(process.cwd(), "demo/app.log");

// Clear the log file before starting so output is clean
fs.writeFileSync(LOG_FILE, "");

console.log("=".repeat(60));
console.log("  NEURALOPS — AUTONOMOUS DEMO TEST");
console.log("=".repeat(60));
console.log("");
console.log("This test will:");
console.log("1. Start the watcher (monitors demo/app.log)");
console.log("2. Simulate the demo app breaking (corrupt config.json)");
console.log("3. Write an error to app.log");
console.log("4. Watch the agent auto-detect and fix it");
console.log("5. Show you the config.json before and after");
console.log("");

// Show the config before
console.log("--- CONFIG BEFORE BREAK ---");
console.log(fs.readFileSync(CONFIG_FILE, "utf-8"));
console.log("");

// Start the watcher
console.log("[WATCHER] Starting watcher...");
startWatcher((title) => {
  console.log(`\n[WATCHER] ✓ Auto-detected issue: "${title}"`);
  console.log("[WATCHER] Submitting to agent pipeline...\n");
});

// Give watcher 1 second to initialize
setTimeout(() => {

  // Step 1: Break the config (simulates chaos monkey)
  console.log("[CHAOS] Breaking the config — wiping PaymentService API key...");
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  config.paymentService.apiKey = "";
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log("[CHAOS] config.json corrupted.");
  console.log("");

  // Step 2: Write the error log entry (simulates demo app detecting it)
  const errorLine = `[${new Date().toISOString()}] [ERROR] [PaymentService] PaymentService API key is missing from config. Cannot process payments.\n`;
  fs.appendFileSync(LOG_FILE, errorLine);
  console.log("[DEMO APP] Error written to app.log:");
  console.log(" ", errorLine.trim());
  console.log("");
  console.log("[WATCHER] Polling log file... (checking every 3 seconds)");
  console.log("[AGENT]   Waiting for agent to detect and fix...");
  console.log("");

  // Step 3: After 30 seconds, show the result
  setTimeout(() => {
    console.log("");
    console.log("=".repeat(60));
    console.log("  RESULT");
    console.log("=".repeat(60));

    const finalConfig = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(finalConfig);

    console.log("\n--- CONFIG AFTER AGENT FIX ---");
    console.log(finalConfig);

    if (parsed.paymentService.apiKey && parsed.paymentService.apiKey !== "") {
      console.log("✅ SUCCESS: Agent restored the PaymentService API key.");
      console.log(`   Restored value: "${parsed.paymentService.apiKey}"`);
    } else {
      console.log("❌ FAILED: API key is still empty. Check agent logs above.");
    }

    console.log("\n--- RECENT LOG ENTRIES ---");
    const logs = fs.readFileSync(LOG_FILE, "utf-8");
    console.log(logs);

    process.exit(0);
  }, 30000);

}, 1000);