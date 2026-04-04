import fs from "fs";
import path from "path";

// This file acts as the broken app's live state.
// The agent can read and modify these files directly.
const CONFIG_FILE = path.join(__dirname, "config.json");
const LOG_FILE = path.join(__dirname, "app.log");

function writeLog(level: string, service: string, message: string) {
  const entry = `[${new Date().toISOString()}] [${level}] [${service}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, entry);
  console.log(entry.trim());
}

function readConfig() {
  const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
  return JSON.parse(raw);
}

// ---- SIMULATED TASKS ----

function taskCreateUser(config: any) {
  if (!config.userService.enabled) {
    throw new Error("UserService is disabled in config. Cannot create user.");
  }
  if (config.userService.maxUsers <= 0) {
    throw new Error("maxUsers limit reached. Account creation blocked.");
  }
  writeLog("INFO", "UserService", `User created successfully. ID: USR-${Math.floor(Math.random() * 9999)}`);
}

function taskProcessPayment(config: any) {
  if (!config.paymentService.apiKey) {
    throw new Error("PaymentService API key is missing from config.");
  }
  if (config.paymentService.timeout < 100) {
    throw new Error(`PaymentService timeout too low: ${config.paymentService.timeout}ms. Minimum is 100ms.`);
  }
  writeLog("INFO", "PaymentService", `Payment processed. TXN-${Math.floor(Math.random() * 99999)}`);
}

function taskSendEmail(config: any) {
  if (!config.emailService.smtpHost) {
    throw new Error("EmailService SMTP host is not configured.");
  }
  if (config.emailService.rateLimit <= 0) {
    throw new Error("EmailService rate limit exceeded. rateLimit is 0.");
  }
  writeLog("INFO", "EmailService", `Email sent to user@example.com`);
}

function taskHealthCheck(config: any) {
  if (config.database.connected === false) {
    throw new Error("Database connection is down. Health check failed.");
  }
  if (config.database.poolSize <= 0) {
    throw new Error("Database connection pool exhausted. poolSize is 0.");
  }
  writeLog("INFO", "HealthCheck", `All systems nominal. DB pool: ${config.database.poolSize}`);
}

// ---- CHAOS INJECTOR ----
// Every few cycles, this randomly breaks something in the config.
// The agent's job is to detect and fix these breaks.

const chaosEvents = [
  () => {
    const config = readConfig();
    config.paymentService.apiKey = "";
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    writeLog("WARN", "ChaosMonkey", "Wiped PaymentService API key from config");
  },
  () => {
    const config = readConfig();
    config.userService.enabled = false;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    writeLog("WARN", "ChaosMonkey", "Disabled UserService in config");
  },
  () => {
    const config = readConfig();
    config.emailService.rateLimit = 0;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    writeLog("WARN", "ChaosMonkey", "Set EmailService rateLimit to 0");
  },
  () => {
    const config = readConfig();
    config.database.poolSize = 0;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    writeLog("WARN", "ChaosMonkey", "Drained database connection pool to 0");
  },
  () => {
    const config = readConfig();
    config.paymentService.timeout = 10;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    writeLog("WARN", "ChaosMonkey", "Set PaymentService timeout to 10ms");
  },
  () => {
    const config = readConfig();
    config.database.connected = false;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    writeLog("WARN", "ChaosMonkey", "Severed database connection in config");
  },
];

// ---- MAIN LOOP ----

const tasks = [taskCreateUser, taskProcessPayment, taskSendEmail, taskHealthCheck];
let cycleCount = 0;

async function runLoop() {
  writeLog("INFO", "System", "Demo app started. Running task loop...");

  while (true) {
    cycleCount++;
    const config = readConfig();

    writeLog("INFO", "System", `--- Cycle ${cycleCount} starting ---`);

    for (const task of tasks) {
      try {
        task(config);
      } catch (error: any) {
        writeLog("ERROR", task.name, error.message);
      }
    }

    // Inject chaos every 4 cycles (roughly every 20 seconds)
    if (cycleCount % 4 === 0) {
      const chaos = chaosEvents[Math.floor(Math.random() * chaosEvents.length)];
      chaos();
    }

    // Wait 5 seconds between cycles
    await new Promise((r) => setTimeout(r, 5000));
  }
}

runLoop();