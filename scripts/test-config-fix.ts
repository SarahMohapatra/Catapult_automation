import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import * as fs from "fs";
import { runL1Agent } from "../backend/agent/l1-agent";
import { runL2Agent } from "../backend/agent/l2-agent";

const CONFIG_FILE = path.join(process.cwd(), "demo/config.json");

const EXPECTED_CONFIG = {
  userService: { enabled: true, maxUsers: 1000 },
  paymentService: { apiKey: "pk_demo_abc123xyz", timeout: 5000 },
  emailService: { smtpHost: "smtp.demo.com", rateLimit: 100 },
  database: { connected: true, poolSize: 20 },
  services: {
    PaymentService: { status: "RUNNING" },
    AuthService: { status: "RUNNING" },
    EmailService: { status: "RUNNING" },
    DatabaseService: { status: "RUNNING" },
  },
};

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
}

function printStep(step: any) {
  if (step.type === "thinking") {
    console.log(`   🧠 [THINKING] ${step.content}`);
  } else if (step.type === "tool_call") {
    console.log(`   🔧 [TOOL CALL] ${step.toolName}`);
    console.log(`      ${step.content}`);
  } else if (step.type === "tool_result") {
    console.log(`   📥 [TOOL RESULT] ${step.toolName}`);
    try {
      const parsed = JSON.parse(step.content);
      console.log(`      ${JSON.stringify(parsed).slice(0, 300)}`);
    } catch {
      console.log(`      ${step.content.slice(0, 300)}`);
    }
  } else if (step.type === "complete") {
    console.log(`   ✅ [COMPLETE] ${step.content}`);
  }
  console.log("");
}

// ─────────────────────────────────────────────
//  DETECT PROBLEMS IN THE CURRENT CONFIG
// ─────────────────────────────────────────────

interface DetectedIssue {
  title: string;
  description: string;
  category: string;
  agent: "L1" | "L2";
  verify: (config: any) => boolean;
  fixDescription: string;
}

function detectIssues(config: any): DetectedIssue[] {
  const issues: DetectedIssue[] = [];

  // ── L1-level issues (user-facing) ──

  for (const [id, user] of Object.entries(config.users || {})) {
    const u = user as any;

    if (u.locked === true) {
      issues.push({
        title: `User ${u.name} (${id}) is locked out`,
        description: `User ${u.name} (${u.email}, ID: ${id}) is locked out. Their account shows locked=true. Please reset their password and unlock the account.`,
        category: "password_reset",
        agent: "L1",
        verify: (c) => c.users?.[id]?.locked === false,
        fixDescription: `users.${id}.locked restored to false`,
      });
    }

    if (u.mfaEnabled === false) {
      issues.push({
        title: `User ${u.name} (${id}) has MFA disabled`,
        description: `Employee ${u.name} (${id}) had their multi-factor authentication accidentally disabled. Please re-enable MFA using an authenticator app.`,
        category: "mfa_setup",
        agent: "L1",
        verify: (c) => c.users?.[id]?.mfaEnabled === true,
        fixDescription: `users.${id}.mfaEnabled restored to true`,
      });
    }
  }

  // ── L2-level issues (config / infrastructure) ──

  if (
    !config.paymentService?.apiKey ||
    config.paymentService.apiKey === ""
  ) {
    issues.push({
      title: "PaymentService API key missing from config",
      description: `The PaymentService API key has been wiped from config.json. All payment processing is failing with authentication errors.\nConfig file: demo/config.json\nField: paymentService.apiKey\nExpected: non-empty string like "pk_demo_abc123xyz"\nRead the config, restore the API key, verify the fix.`,
      category: "config_corruption",
      agent: "L2",
      verify: (c) => c.paymentService?.apiKey && c.paymentService.apiKey !== "",
      fixDescription: "paymentService.apiKey restored",
    });
  }

  if (config.userService?.enabled === false) {
    issues.push({
      title: "UserService disabled in config",
      description: `The userService.enabled flag has been set to false in config.json. All user creation requests are failing.\nConfig file: demo/config.json\nField: userService.enabled\nExpected: true\nRead the config, set enabled back to true, verify.`,
      category: "config_corruption",
      agent: "L2",
      verify: (c) => c.userService?.enabled === true,
      fixDescription: "userService.enabled restored to true",
    });
  }

  if (config.database?.poolSize != null && config.database.poolSize <= 0) {
    issues.push({
      title: "Database connection pool set to zero",
      description: `The database.poolSize has been set to 0 in config.json. All database operations are failing.\nConfig file: demo/config.json\nField: database.poolSize\nExpected: positive number like 20\nRead the config, restore poolSize to 20, verify.`,
      category: "config_corruption",
      agent: "L2",
      verify: (c) => c.database?.poolSize > 0,
      fixDescription: "database.poolSize restored to a positive value",
    });
  }

  if (
    config.emailService?.rateLimit != null &&
    config.emailService.rateLimit <= 0
  ) {
    issues.push({
      title: "EmailService rateLimit is zero — all emails blocked",
      description: `The emailService.rateLimit has been set to 0 in config.json. No emails can be sent.\nConfig file: demo/config.json\nField: emailService.rateLimit\nExpected: positive number like 100\nRead the config, restore rateLimit to 100, verify.`,
      category: "config_corruption",
      agent: "L2",
      verify: (c) => c.emailService?.rateLimit > 0,
      fixDescription: "emailService.rateLimit restored to a positive value",
    });
  }

  if (config.database?.connected === false) {
    issues.push({
      title: "Database connection is down",
      description: `The database.connected flag is false in config.json. All database operations are failing.\nConfig file: demo/config.json\nField: database.connected\nExpected: true\nRead the config, restore connected to true, verify.`,
      category: "config_corruption",
      agent: "L2",
      verify: (c) => c.database?.connected === true,
      fixDescription: "database.connected restored to true",
    });
  }

  for (const [svcName, svc] of Object.entries(config.services || {})) {
    const status = (svc as any).status;
    if (status && status !== "RUNNING") {
      issues.push({
        title: `${svcName} is ${status}`,
        description: `The ${svcName} has a status of "${status}" in config.json.\nConfig file: demo/config.json\nField: services.${svcName}.status\nExpected: "RUNNING"\nDiagnose the issue using fetch_logs and run_diagnostic. Restart the service using restart_service to restore it to RUNNING state. Verify the fix.`,
        category: status === "CRASHED" ? "service_crash" : "service_degradation",
        agent: "L2",
        verify: (c) => c.services?.[svcName]?.status === "RUNNING",
        fixDescription: `services.${svcName}.status restored to RUNNING`,
      });
    }
  }

  return issues;
}

// ─────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────

async function run() {
  console.log("=".repeat(50));
  console.log("  CONFIG FIX TEST — L1 + L2 Pipeline");
  console.log("=".repeat(50));
  console.log("");
  console.log("Scanning demo/config.json for problems...");
  console.log("");

  const config = readConfig();
  const issues = detectIssues(config);

  if (issues.length === 0) {
    console.log("✅ No issues detected in config.json — everything looks healthy.");
    console.log("");
    console.log("To test, manually edit demo/config.json to introduce an error, e.g.:");
    console.log('  - Set paymentService.apiKey to ""');
    console.log("  - Set userService.enabled to false");
    console.log("  - Set database.poolSize to 0");
    console.log("  - Set a user's locked to true");
    console.log("  - Set a user's mfaEnabled to false");
    console.log('  - Set a service status to "CRASHED"');
    console.log("");
    console.log("Then re-run this script.");
    process.exit(0);
  }

  console.log(`Found ${issues.length} issue(s):\n`);
  issues.forEach((issue, i) => {
    console.log(`  ${i + 1}. [${issue.agent}] ${issue.title}`);
  });
  console.log("");

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];

    console.log("─".repeat(50));
    console.log(`Issue ${i + 1}/${issues.length}: ${issue.title}`);
    console.log(`   Agent:    ${issue.agent}`);
    console.log(`   Category: ${issue.category}`);
    console.log("");

    const steps: any[] = [];
    const onStep = (step: any) => {
      steps.push(step);
      printStep(step);
    };

    try {
      if (issue.agent === "L1") {
        await runL1Agent(issue.title, issue.description, issue.category, onStep);
      } else {
        await runL2Agent(issue.title, issue.description, issue.category, onStep);
      }

      const finalConfig = readConfig();
      const fixed = issue.verify(finalConfig);

      console.log(`   ── Result ──`);
      console.log(
        `   Fixed: ${fixed ? "✅ yes" : "❌ no"} — ${issue.fixDescription}`
      );

      if (fixed) {
        console.log(`   ✅ PASS`);
        passed++;
      } else {
        console.log(`   ❌ FAIL — config.json was NOT fixed on disk`);
        failed++;
      }
    } catch (err: any) {
      console.log(`   💥 ERROR — ${err.message}`);
      failed++;
    }

    console.log("");
  }

  // ── Summary ──
  console.log("=".repeat(50));
  console.log("  RESULTS");
  console.log("=".repeat(50));
  console.log(`  Issues found:  ${issues.length}`);
  console.log(`  Fixed:         ${passed}`);
  console.log(`  Not fixed:     ${failed}`);
  console.log("");

  if (failed === 0) {
    console.log("✅ ALL ISSUES RESOLVED");
  } else {
    console.log(`❌ ${failed} issue(s) not resolved — check logs above.`);
  }

  process.exit(0);
}

run();
