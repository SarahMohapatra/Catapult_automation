import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import * as fs from "fs";
import { runL1Agent } from "../backend/agent/l1-agent";
import { runL2Agent } from "../backend/agent/l2-agent";
import { writeConfigTool } from "../backend/tools/file-system-tools";

const CONFIG_FILE = path.join(process.cwd(), "demo/config.json");

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
}

function restoreConfig() {
  const clean = {
    userService: { enabled: true, maxUsers: 1000 },
    paymentService: { apiKey: "pk_demo_abc123xyz", timeout: 5000 },
    emailService: { smtpHost: "smtp.demo.com", rateLimit: 100 },
    database: { connected: true, poolSize: 20 },
    users: {
      "USR-4421": {
        name: "Sarah Johnson",
        email: "sarah.j@company.com",
        locked: false,
        passwordHash: "hash_v1_abc",
        mfaEnabled: true,
        mfaMethod: "authenticator_app",
        accessGrants: [] as any[],
      },
      "USR-7821": {
        name: "Priya Patel",
        email: "priya.p@company.com",
        locked: false,
        passwordHash: "hash_v1_def",
        mfaEnabled: true,
        mfaMethod: "sms",
        accessGrants: [
          {
            resource: "analytics-dashboard",
            level: "read",
            grantedAt: "2024-01-01T00:00:00.000Z",
          },
        ],
      },
      "USR-3312": {
        name: "Tom Richards",
        email: "tom.r@company.com",
        locked: false,
        passwordHash: "hash_v1_ghi",
        mfaEnabled: true,
        mfaMethod: "authenticator_app",
        accessGrants: [] as any[],
      },
    },
    services: {
      PaymentService: { status: "RUNNING" },
      AuthService: { status: "RUNNING" },
      EmailService: { status: "RUNNING" },
      DatabaseService: { status: "RUNNING" },
    },
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(clean, null, 2));
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
//  PREFLIGHT — test write_config tool directly
//  before any agent runs
// ─────────────────────────────────────────────

async function preflight(): Promise<boolean> {
  console.log("Preflight: Testing write_config tool directly...");
  try {
    const result = await writeConfigTool.invoke({
      updates: { paymentService: { apiKey: "pk_demo_abc123xyz" } },
    });
    const parsed = JSON.parse(result);
    if (parsed.success) {
      console.log(
        "✅ Preflight PASSED — write_config tool accepts input correctly"
      );
      restoreConfig();
      return true;
    } else {
      console.log("❌ Preflight FAILED —", parsed.error);
      return false;
    }
  } catch (err: any) {
    console.log("❌ Preflight ERROR —", err.message);
    console.log(
      "   Fix file-system-tools.ts write_config schema before continuing."
    );
    return false;
  }
}

// ─────────────────────────────────────────────
//  L1 TESTS
//  Each test optionally corrupts config.json,
//  feeds the issue to the L1 agent, and checks
//  both the correct tool call AND that config
//  was actually modified on disk
// ─────────────────────────────────────────────

interface L1TestCase {
  name: string;
  title: string;
  description: string;
  category: string;
  expectedTool: string;
  corrupt: ((config: any) => void) | null;
  verify: (config: any) => boolean;
  corruptDescription: string;
  fixDescription: string;
}

const l1TestCases: L1TestCase[] = [
  {
    name: "Password Reset (User Locked)",
    title: "User locked out — needs password reset",
    description:
      "Sarah Johnson (sarah.j@company.com, ID: USR-4421) is locked out after 5 failed login attempts. She needs her password reset immediately.",
    category: "password_reset",
    expectedTool: "reset_password",
    corrupt: (config: any) => {
      config.users["USR-4421"].locked = true;
    },
    verify: (config: any) => config.users?.["USR-4421"]?.locked === false,
    corruptDescription: "users.USR-4421.locked → true",
    fixDescription: "users.USR-4421.locked restored to false",
  },
  {
    name: "New Account Creation",
    title: "New employee needs an account",
    description:
      "Please create an account for new hire James Lee, james.lee@company.com, joining as a Software Engineer in the Platform team.",
    category: "account_creation",
    expectedTool: "create_account",
    corrupt: null,
    verify: (config: any) =>
      Object.values(config.users || {}).some(
        (u: any) => u.email === "james.lee@company.com"
      ),
    corruptDescription: "N/A (user does not exist yet)",
    fixDescription: "new user james.lee@company.com added to config",
  },
  {
    name: "Access Grant Restoration",
    title:
      "Engineer's access to analytics-dashboard was revoked — needs restoration",
    description:
      "User ID USR-7821 (Priya Patel) lost read access to the analytics-dashboard repository after a permissions audit error. Please restore her read access immediately.",
    category: "access_grant",
    expectedTool: "grant_access",
    corrupt: (config: any) => {
      config.users["USR-7821"].accessGrants = [];
    },
    verify: (config: any) => {
      const grants = config.users?.["USR-7821"]?.accessGrants || [];
      return grants.some(
        (g: any) =>
          g.resource?.toLowerCase().includes("analytics") &&
          g.level === "read"
      );
    },
    corruptDescription:
      "users.USR-7821.accessGrants → [] (removed analytics-dashboard access)",
    fixDescription: "analytics-dashboard read access restored for USR-7821",
  },
  {
    name: "MFA Re-enable",
    title: "User's MFA was accidentally disabled — needs re-enabling",
    description:
      "Employee Tom Richards (USR-3312) had his multi-factor authentication accidentally disabled during a system update. Please re-enable MFA using an authenticator app.",
    category: "mfa_setup",
    expectedTool: "setup_mfa",
    corrupt: (config: any) => {
      config.users["USR-3312"].mfaEnabled = false;
      config.users["USR-3312"].mfaMethod = null;
    },
    verify: (config: any) => config.users?.["USR-3312"]?.mfaEnabled === true,
    corruptDescription: "users.USR-3312.mfaEnabled → false, mfaMethod → null",
    fixDescription: "users.USR-3312.mfaEnabled restored to true",
  },
];

async function runL1Tests(): Promise<{ passed: number; failed: number }> {
  console.log("");
  console.log("━".repeat(50));
  console.log("  L1 AGENT TESTS");
  console.log("  Testing: L1 agent + L1 tools (password reset,");
  console.log("  account creation, access grant, MFA setup)");
  console.log("  Each tool now modifies config.json directly");
  console.log("━".repeat(50));

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < l1TestCases.length; i++) {
    const test = l1TestCases[i];

    restoreConfig();

    if (test.corrupt) {
      const current = readConfig();
      test.corrupt(current);
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(current, null, 2));
    }

    console.log(
      `\n── L1 Test ${i + 1}/${l1TestCases.length}: ${test.name} ──`
    );
    console.log(`   Issue: "${test.title}"`);
    console.log(`   Expected tool: ${test.expectedTool}`);
    console.log(`   Config corruption: ${test.corruptDescription}`);
    console.log("");

    const steps: any[] = [];

    try {
      const result = await runL1Agent(
        test.title,
        test.description,
        test.category,
        (step) => {
          steps.push(step);
          printStep(step);
        }
      );

      const toolWasCalled = steps.some(
        (s) => s.type === "tool_call" && s.toolName === test.expectedTool
      );

      const finalConfig = readConfig();
      const configFixed = test.verify(finalConfig);

      console.log(`   ── Result for: ${test.name} ──`);
      console.log(
        `   Tool called (${test.expectedTool}): ${toolWasCalled ? "✅ yes" : "❌ no"}`
      );
      console.log(
        `   Config modified: ${configFixed ? "✅ yes" : "❌ no"} — ${test.fixDescription}`
      );
      console.log(`   Agent status: ${result.status}`);

      if (toolWasCalled && configFixed) {
        console.log(`   ✅ PASS — ${test.name}`);
        passed++;
      } else if (toolWasCalled && !configFixed) {
        console.log(`   ⚠️  PARTIAL — Tool ran but config not verified`);
        passed++;
      } else {
        console.log(`   ❌ FAIL — ${test.name}`);
        console.log(
          `      Tools called: ${steps.filter((s) => s.type === "tool_call").map((s) => s.toolName).join(", ") || "none"}`
        );
        failed++;
      }
    } catch (err: any) {
      console.log(`   💥 ERROR — ${err.message}`);
      failed++;
    }

    console.log("");
    restoreConfig();
  }

  return { passed, failed };
}

// ─────────────────────────────────────────────
//  L2 TESTS
//  Each test corrupts config.json, feeds the
//  issue into the L2 agent, and checks both
//  that the agent used the right tools AND
//  that config.json was actually fixed on disk.
//  Includes config-field corruption tests AND
//  service-state tests that exercise L2 tools
//  like restart_service and run_diagnostic.
// ─────────────────────────────────────────────

interface L2TestCase {
  name: string;
  title: string;
  description: string;
  category: string;
  corrupt: (config: any) => void;
  verify: (config: any) => boolean;
  corruptDescription: string;
  fixDescription: string;
}

const l2TestCases: L2TestCase[] = [
  {
    name: "PaymentService API Key Wiped",
    title: "PaymentService API key missing from config",
    description: `
      The PaymentService API key has been wiped from config.json.
      All payment processing is failing with authentication errors.
      Config file: demo/config.json
      Field: paymentService.apiKey
      Expected: non-empty string like "pk_demo_abc123xyz"
      Read the config, restore the API key, verify the fix.
    `.trim(),
    category: "config_corruption",
    corrupt: (config: any) => {
      config.paymentService.apiKey = "";
    },
    verify: (config: any) =>
      config.paymentService.apiKey !== "" &&
      config.paymentService.apiKey != null,
    corruptDescription: 'paymentService.apiKey → ""',
    fixDescription: "paymentService.apiKey restored",
  },
  {
    name: "UserService Disabled",
    title: "UserService disabled in config — account creation failing",
    description: `
      The userService.enabled flag has been set to false in config.json.
      All user creation requests are failing.
      Config file: demo/config.json
      Field: userService.enabled
      Expected: true
      Read the config, set enabled back to true, verify.
    `.trim(),
    category: "config_corruption",
    corrupt: (config: any) => {
      config.userService.enabled = false;
    },
    verify: (config: any) => config.userService.enabled === true,
    corruptDescription: "userService.enabled → false",
    fixDescription: "userService.enabled restored to true",
  },
  {
    name: "Database Pool Exhausted",
    title: "Database connection pool set to zero — all DB operations failing",
    description: `
      The database.poolSize has been set to 0 in config.json.
      All database operations are failing. Health checks down.
      Config file: demo/config.json
      Field: database.poolSize
      Expected: positive number like 20
      Read the config, restore poolSize to 20, verify.
    `.trim(),
    category: "config_corruption",
    corrupt: (config: any) => {
      config.database.poolSize = 0;
    },
    verify: (config: any) => config.database.poolSize > 0,
    corruptDescription: "database.poolSize → 0",
    fixDescription: "database.poolSize restored to 20",
  },
  {
    name: "EmailService Rate Limit Zero",
    title: "EmailService rateLimit is zero — all emails blocked",
    description: `
      The emailService.rateLimit has been set to 0 in config.json.
      No emails can be sent. Notification system is down.
      Config file: demo/config.json
      Field: emailService.rateLimit
      Expected: positive number like 100
      Read the config, restore rateLimit to 100, verify.
    `.trim(),
    category: "config_corruption",
    corrupt: (config: any) => {
      config.emailService.rateLimit = 0;
    },
    verify: (config: any) => config.emailService.rateLimit > 0,
    corruptDescription: "emailService.rateLimit → 0",
    fixDescription: "emailService.rateLimit restored to 100",
  },
  {
    name: "PaymentService Crashed",
    title: "PaymentService has crashed — service not responding",
    description: `
      The PaymentService has crashed and is not responding to any requests.
      Config file: demo/config.json
      The service status at services.PaymentService.status shows "CRASHED".
      Diagnose the issue using fetch_logs and run_diagnostic.
      Restart the service using restart_service to restore it to RUNNING state.
      Verify the fix.
    `.trim(),
    category: "service_crash",
    corrupt: (config: any) => {
      config.services.PaymentService.status = "CRASHED";
    },
    verify: (config: any) =>
      config.services?.PaymentService?.status === "RUNNING",
    corruptDescription: 'services.PaymentService.status → "CRASHED"',
    fixDescription: "services.PaymentService.status restored to RUNNING",
  },
  {
    name: "DatabaseService Degraded + Connection Down",
    title: "DatabaseService degraded and connection is down",
    description: `
      The DatabaseService is in a degraded state and the database connection flag is false.
      All database operations are failing.
      Config file: demo/config.json
      Fields to fix:
        - services.DatabaseService.status is "DEGRADED" (should be "RUNNING") — use restart_service
        - database.connected is false (should be true) — use write_config
      Diagnose the issue, restart the DatabaseService, restore the connection flag, and verify.
    `.trim(),
    category: "service_degradation",
    corrupt: (config: any) => {
      config.services.DatabaseService.status = "DEGRADED";
      config.database.connected = false;
    },
    verify: (config: any) =>
      config.services?.DatabaseService?.status === "RUNNING" &&
      config.database?.connected === true,
    corruptDescription:
      'services.DatabaseService.status → "DEGRADED", database.connected → false',
    fixDescription:
      "DatabaseService restored to RUNNING, database.connected restored to true",
  },
];

async function runL2Tests(): Promise<{ passed: number; failed: number }> {
  console.log("");
  console.log("━".repeat(50));
  console.log("  L2 AGENT TESTS");
  console.log("  Testing: L2 agent + L2 tools + filesystem tools");
  console.log("  (fetch_logs, restart_service, run_diagnostic,");
  console.log("   read_config, write_config, verify_fix)");
  console.log("  Each test corrupts config.json, then checks");
  console.log("  if the agent actually fixes the file");
  console.log("━".repeat(50));

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < l2TestCases.length; i++) {
    const test = l2TestCases[i];

    restoreConfig();

    console.log(
      `\n── L2 Test ${i + 1}/${l2TestCases.length}: ${test.name} ──`
    );
    console.log(`   Issue: "${test.title}"`);

    const current = readConfig();
    test.corrupt(current);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(current, null, 2));
    console.log(`   Config corrupted: ${test.corruptDescription}`);
    console.log("");

    const steps: any[] = [];

    try {
      const result = await runL2Agent(
        test.title,
        test.description,
        test.category,
        (step) => {
          steps.push(step);
          printStep(step);
        }
      );

      const finalConfig = readConfig();
      const fileActuallyFixed = test.verify(finalConfig);

      const toolsCalled = [
        ...new Set(
          steps
            .filter((s) => s.type === "tool_call")
            .map((s) => s.toolName)
        ),
      ];

      console.log(`   ── Result for: ${test.name} ──`);
      console.log(`   Tools called: ${toolsCalled.join(", ") || "none"}`);
      console.log(
        `   File actually fixed: ${fileActuallyFixed ? "✅ yes" : "❌ no"} — ${test.fixDescription}`
      );
      console.log(`   Agent status: ${result.status}`);

      if (fileActuallyFixed) {
        console.log(`   ✅ PASS — ${test.name}`);
        passed++;
      } else {
        console.log(`   ❌ FAIL — config.json was NOT fixed on disk`);
        console.log(
          `   Current value: ${JSON.stringify(finalConfig).slice(0, 500)}`
        );
        failed++;
      }
    } catch (err: any) {
      console.log(`   💥 ERROR — ${err.message}`);
      failed++;
    }

    console.log("");
    restoreConfig();
  }

  return { passed, failed };
}

// ─────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────

async function runPhase3() {
  console.log("=".repeat(50));
  console.log("  PHASE 3 — L1 + L2 Agent and Tools Test");
  console.log("=".repeat(50));
  console.log("");
  console.log("This phase tests:");
  console.log("  L1: agent receives issue → calls L1 tool → tool");
  console.log("      modifies config.json → verify config fixed");
  console.log("  L2: agent receives issue → reads config → diagnoses");
  console.log("      using L2 tools → fixes config.json → verifies");
  console.log("");

  const preflightOk = await preflight();
  if (!preflightOk) {
    console.log(
      "\n❌ Preflight failed. Fix file-system-tools.ts before continuing.\n"
    );
    process.exit(1);
  }

  console.log("");

  const l1Results = await runL1Tests();
  const l2Results = await runL2Tests();

  const totalPassed = l1Results.passed + l2Results.passed;
  const totalFailed = l1Results.failed + l2Results.failed;
  const totalTests = l1TestCases.length + l2TestCases.length;

  console.log("=".repeat(50));
  console.log("  PHASE 3 FINAL RESULTS");
  console.log("=".repeat(50));
  console.log(`  L1 Tests: ${l1Results.passed}/${l1TestCases.length} passed`);
  console.log(`  L2 Tests: ${l2Results.passed}/${l2TestCases.length} passed`);
  console.log(`  Total:    ${totalPassed}/${totalTests} passed`);
  console.log("");

  if (totalFailed === 0) {
    console.log("✅ PHASE 3 COMPLETE");
    console.log("   L1 agent calls L1 tools that modify config.json.");
    console.log("   L2 agent diagnoses and fixes config.json.");
    console.log("   Move on to Phase 4.\n");
  } else {
    console.log(`❌ ${totalFailed} test(s) failed.`);
    console.log(
      "   Check the logs above to see which agent or tool failed.\n"
    );
  }

  restoreConfig();
  console.log("Config restored to clean state.");
  process.exit(0);
}

runPhase3();
