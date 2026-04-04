import fs from "fs";
import path from "path";

const CONFIG_FILE = path.join(__dirname, "config.json");

const CHECK_INTERVAL_MS = 5_000;
const CHAOS_EVERY_N_CYCLES = 2;

const HEALTHY_CONFIG = {
  userService: { enabled: true, maxUsers: 1000 },
  paymentService: { apiKey: "pk_demo_abc123xyz", timeout: 5000 },
  emailService: { smtpHost: "smtp.demo.com", rateLimit: 100 },
  database: { connected: true, poolSize: 20 },
};

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function readConfig(): Record<string, any> {
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
}

function writeConfig(config: Record<string, any>) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// ---------------------------------------------------------------------------
// Test cases — each returns a pass/fail result for one service
// ---------------------------------------------------------------------------

function testUserService(config: Record<string, any>) {
  if (config.userService?.enabled === false)
    return { service: "UserService", ok: false, error: "UserService is disabled (enabled = false)", category: "config-disabled" };
  if ((config.userService?.maxUsers ?? 0) <= 0)
    return { service: "UserService", ok: false, error: `maxUsers is ${config.userService?.maxUsers}`, category: "config-limit" };
  return { service: "UserService", ok: true };
}

function testPaymentService(config: Record<string, any>) {
  if (!config.paymentService?.apiKey)
    return { service: "PaymentService", ok: false, error: "API key is empty or missing", category: "missing-credential" };
  if (config.paymentService.timeout < 100)
    return { service: "PaymentService", ok: false, error: `Timeout critically low: ${config.paymentService.timeout}ms`, category: "config-limit" };
  return { service: "PaymentService", ok: true };
}

function testEmailService(config: Record<string, any>) {
  if (!config.emailService?.smtpHost)
    return { service: "EmailService", ok: false, error: "SMTP host is not configured", category: "missing-credential" };
  if ((config.emailService?.rateLimit ?? 0) <= 0)
    return { service: "EmailService", ok: false, error: `rateLimit is ${config.emailService?.rateLimit}`, category: "config-limit" };
  return { service: "EmailService", ok: true };
}

function testDatabase(config: Record<string, any>) {
  if (config.database?.connected === false)
    return { service: "Database", ok: false, error: "database.connected is false", category: "connection-down" };
  if ((config.database?.poolSize ?? 0) <= 0)
    return { service: "Database", ok: false, error: `Connection pool exhausted: poolSize = ${config.database?.poolSize}`, category: "config-limit" };
  return { service: "Database", ok: true };
}

const tests = [testUserService, testPaymentService, testEmailService, testDatabase];

// ---------------------------------------------------------------------------
// Chaos rotation — cycles through every error type, introducing then removing
//
// Pattern per error:
//   CHAOS_EVERY_N_CYCLES of healthy  →  inject error
//   CHAOS_EVERY_N_CYCLES with error  →  restore to healthy  →  next error
//
// This guarantees every error type is tested for both detection and recovery.
// ---------------------------------------------------------------------------

const chaosScenarios = [
  { inject: (c: Record<string, any>) => { c.paymentService.apiKey = "";          return c; }, description: "Wiped PaymentService API key" },
  { inject: (c: Record<string, any>) => { c.userService.enabled = false;         return c; }, description: "Disabled UserService" },
  { inject: (c: Record<string, any>) => { c.emailService.rateLimit = 0;          return c; }, description: "Set EmailService rateLimit to 0" },
  { inject: (c: Record<string, any>) => { c.database.poolSize = 0;               return c; }, description: "Drained database pool to 0" },
  { inject: (c: Record<string, any>) => { c.paymentService.timeout = 10;         return c; }, description: "Set PaymentService timeout to 10ms" },
  { inject: (c: Record<string, any>) => { c.database.connected = false;          return c; }, description: "Set database.connected to false" },
];

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

let cycle = 0;
let scenarioIndex = 0;
let errorActive = false;

async function run() {
  writeConfig(HEALTHY_CONFIG);
  console.log(JSON.stringify({ ts: new Date().toISOString(), event: "startup", message: "Config reset to healthy defaults" }));

  while (true) {
    cycle++;

    if (cycle % CHAOS_EVERY_N_CYCLES === 0) {
      if (errorActive) {
        // Restore healthy config so the watcher sees recovery
        writeConfig(HEALTHY_CONFIG);
        console.log(JSON.stringify({ cycle, ts: new Date().toISOString(), chaos: true, action: "restore", message: "Restored config to healthy defaults" }));
        errorActive = false;
        scenarioIndex = (scenarioIndex + 1) % chaosScenarios.length;
      } else {
        // Inject the next error in the rotation
        const scenario = chaosScenarios[scenarioIndex];
        const config = JSON.parse(JSON.stringify(HEALTHY_CONFIG));
        scenario.inject(config);
        writeConfig(config);
        console.log(JSON.stringify({ cycle, ts: new Date().toISOString(), chaos: true, action: "inject", scenario: scenarioIndex + 1, total: chaosScenarios.length, message: scenario.description }));
        errorActive = true;
      }
    }

    const config = readConfig();
    const passed: string[] = [];
    const failed: string[] = [];

    for (const test of tests) {
      const result = test(config);
      console.log(JSON.stringify({ cycle, ts: new Date().toISOString(), ...result }));
      if (result.ok) passed.push(result.service);
      else failed.push(result.service);
    }

    console.log(JSON.stringify({
      cycle,
      ts: new Date().toISOString(),
      summary: true,
      passed: passed.length,
      failed: failed.length,
      total: tests.length,
    }));

    await new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS));
  }
}

run();
