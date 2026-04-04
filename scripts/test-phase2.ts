import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import * as fs from "fs";

const CONFIG_FILE = path.join(process.cwd(), "demo/config.json");
const LOG_FILE = path.join(process.cwd(), "demo/app.log");

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
}

function writeConfig(updates: any) {
  const current = readConfig();
  const updated = deepMerge(current, updates);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
  return updated;
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] instanceof Object && !Array.isArray(source[key]) && key in target) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

async function runPhase2() {
  console.log("=".repeat(50));
  console.log("  PHASE 2 — Filesystem Tools Test");
  console.log("=".repeat(50));
  console.log("");

  let passed = 0;
  let failed = 0;

  // Test 1: Read config
  console.log("Test 1: Can read config.json...");
  try {
    const config = readConfig();
    if (config.paymentService && config.userService) {
      console.log("✅ PASS — Config read successfully");
      console.log(`   paymentService.apiKey: "${config.paymentService.apiKey}"`);
      passed++;
    } else {
      console.log("❌ FAIL — Config missing expected fields");
      failed++;
    }
  } catch (err: any) {
    console.log(`💥 ERROR — ${err.message}`);
    failed++;
  }
  console.log("");

  // Test 2: Break the config
  console.log("Test 2: Can corrupt config (simulating chaos monkey)...");
  try {
    writeConfig({ paymentService: { apiKey: "" } });
    const config = readConfig();
    if (config.paymentService.apiKey === "") {
      console.log("✅ PASS — Config corrupted successfully");
      console.log(`   paymentService.apiKey is now: "${config.paymentService.apiKey}"`);
      passed++;
    } else {
      console.log("❌ FAIL — Corruption did not apply");
      failed++;
    }
  } catch (err: any) {
    console.log(`💥 ERROR — ${err.message}`);
    failed++;
  }
  console.log("");

  // Test 3: Fix the config
  console.log("Test 3: Can restore config (simulating agent fix)...");
  try {
    writeConfig({ paymentService: { apiKey: "pk_demo_abc123xyz" } });
    const config = readConfig();
    if (config.paymentService.apiKey === "pk_demo_abc123xyz") {
      console.log("✅ PASS — Config restored successfully");
      console.log(`   paymentService.apiKey is now: "${config.paymentService.apiKey}"`);
      passed++;
    } else {
      console.log("❌ FAIL — Restore did not apply");
      failed++;
    }
  } catch (err: any) {
    console.log(`💥 ERROR — ${err.message}`);
    failed++;
  }
  console.log("");

  // Test 4: Other fields preserved after partial write
  console.log("Test 4: Other config fields are preserved after partial write...");
  try {
    const config = readConfig();
    if (
      config.userService.enabled === true &&
      config.emailService.rateLimit === 100 &&
      config.database.poolSize === 20
    ) {
      console.log("✅ PASS — All other fields intact after partial write");
      passed++;
    } else {
      console.log("❌ FAIL — Some fields were lost during partial write");
      console.log("   Current config:", JSON.stringify(config, null, 2));
      failed++;
    }
  } catch (err: any) {
    console.log(`💥 ERROR — ${err.message}`);
    failed++;
  }
  console.log("");

  // Test 5: Read logs
  console.log("Test 5: Can read app.log...");
  try {
    if (!fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, "[TEST] Log file created for testing\n");
    }
    const logs = fs.readFileSync(LOG_FILE, "utf-8");
    console.log("✅ PASS — Log file readable");
    console.log(`   Lines in log: ${logs.split("\n").filter(Boolean).length}`);
    passed++;
  } catch (err: any) {
    console.log(`💥 ERROR — ${err.message}`);
    failed++;
  }

  console.log("");
  console.log("=".repeat(50));
  console.log(`  RESULTS: ${passed}/5 passed`);
  console.log("=".repeat(50));

  if (failed === 0) {
    console.log("\n✅ PHASE 2 COMPLETE. Filesystem tools working correctly.");
    console.log("   Config is now restored to clean state.");
    console.log("   Move on to Phase 3.\n");
  } else {
    console.log("\n❌ Phase 2 has failures. Fix file-system-tools.ts paths before continuing.\n");
  }
}

runPhase2();