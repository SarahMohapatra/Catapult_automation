import fs from "fs";
import path from "path";
import { processTicket } from "../agent/pipeline";

const LOG_FILE = path.join(process.cwd(), "demo/app.log");
const DEMO_APP_DIR = path.join(process.cwd(), "demo");

// Track what we have already processed so we don't submit duplicate tickets
const processedErrors = new Set<string>();
let lastReadPosition = 0;

// Error patterns to watch for and what kind of issue they map to
const ERROR_PATTERNS = [
  {
    pattern: /PaymentService API key is missing/i,
    title: "PaymentService API key missing from config",
    description: (line: string) => `
      The PaymentService API key has been wiped from config.json.
      This is causing all payment processing to fail.
      
      Error detected: ${line.trim()}
      Config file location: demo-app/config.json
      Field to fix: paymentService.apiKey
      Expected: a non-empty string like "pk_demo_abc123xyz"
      
      Read the config file, restore the API key to a valid value, and verify payments resume.
    `.trim(),
  },
  {
    pattern: /UserService is disabled/i,
    title: "UserService disabled in config",
    description: (line: string) => `
      The UserService has been disabled in config.json.
      All user creation requests are failing.
      
      Error detected: ${line.trim()}
      Config file location: demo-app/config.json
      Field to fix: userService.enabled
      Expected: true
      
      Read the config file, set userService.enabled back to true.
    `.trim(),
  },
  {
    pattern: /EmailService rate limit exceeded/i,
    title: "EmailService rateLimit set to zero in config",
    description: (line: string) => `
      The EmailService rateLimit has been set to 0 in config.json.
      No emails can be sent until this is restored.
      
      Error detected: ${line.trim()}
      Config file location: demo-app/config.json
      Field to fix: emailService.rateLimit
      Expected: a positive number like 100
      
      Read the config, restore rateLimit to 100.
    `.trim(),
  },
  {
    pattern: /Database connection pool exhausted/i,
    title: "Database connection pool set to zero",
    description: (line: string) => `
      The database connection pool size has been drained to 0 in config.json.
      All database operations are failing.
      
      Error detected: ${line.trim()}
      Config file location: demo-app/config.json
      Field to fix: database.poolSize
      Expected: a positive number like 20
      
      Read the config, restore poolSize to 20.
    `.trim(),
  },
  {
    pattern: /PaymentService timeout too low/i,
    title: "PaymentService timeout critically low in config",
    description: (line: string) => `
      The PaymentService timeout has been set to an unusably low value in config.json.
      All payment requests are timing out instantly.
      
      Error detected: ${line.trim()}
      Config file location: demo-app/config.json
      Field to fix: paymentService.timeout
      Expected: at least 3000 (milliseconds)
      
      Read the config, restore timeout to 5000.
    `.trim(),
  },
  {
    pattern: /Database connection is down/i,
    title: "Database connection marked as down in config",
    description: (line: string) => `
      The database connected flag has been set to false in config.json.
      All health checks and DB operations are failing.
      
      Error detected: ${line.trim()}
      Config file location: demo-app/config.json
      Field to fix: database.connected
      Expected: true
      
      Read the config, set database.connected back to true.
    `.trim(),
  },
];

export function startWatcher(onTicketSubmitted?: (title: string) => void) {
  console.log(`[Watcher] Starting. Watching: ${LOG_FILE}`);

  // Initialize log file if it doesn't exist
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, "");
  }

  lastReadPosition = fs.statSync(LOG_FILE).size;

  // Poll the log file every 3 seconds
  setInterval(() => {
    try {
      const stat = fs.statSync(LOG_FILE);

      // File was truncated or rotated — reset
      if (stat.size < lastReadPosition) {
        lastReadPosition = 0;
      }

      // No new content
      if (stat.size === lastReadPosition) return;

      // Read only the new bytes since last check
      const fd = fs.openSync(LOG_FILE, "r");
      const buffer = Buffer.alloc(stat.size - lastReadPosition);
      fs.readSync(fd, buffer, 0, buffer.length, lastReadPosition);
      fs.closeSync(fd);
      lastReadPosition = stat.size;

      const newLines = buffer.toString("utf-8").split("\n").filter(Boolean);

      for (const line of newLines) {
        // Only look at ERROR lines
        if (!line.includes("[ERROR]")) continue;

        for (const errorDef of ERROR_PATTERNS) {
          if (!errorDef.pattern.test(line)) continue;

          // Dedup — don't submit same error twice within 60 seconds
          const dedupKey = errorDef.title;
          if (processedErrors.has(dedupKey)) continue;

          processedErrors.add(dedupKey);
          setTimeout(() => processedErrors.delete(dedupKey), 60000);

          const title = errorDef.title;
          const description = errorDef.description(line);

          console.log(`[Watcher] Detected issue: ${title}`);
          console.log(`[Watcher] Auto-submitting ticket...`);

          if (onTicketSubmitted) onTicketSubmitted(title);

          // Submit to your agent pipeline automatically
          processTicket(title, description).catch((err) => {
            console.error(`[Watcher] Pipeline error:`, err);
          });

          break;
        }
      }
    } catch (err) {
      console.error("[Watcher] Read error:", err);
    }
  }, 3000);
}