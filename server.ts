import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import * as http from "http";
import * as fs from "fs";
import { runL1Agent } from "./backend/agent/l1-agent";
import { runL2Agent } from "./backend/agent/l2-agent";

const PORT = 4000;
const CONFIG_PATH = path.join(process.cwd(), "demo/config.json");
const HTML_PATH = path.join(process.cwd(), "public/index.html");
const CHECK_INTERVAL_MS = 5000;

// ─── SSE Client Management ─────────────────────────────

const sseClients = new Set<http.ServerResponse>();

function broadcast(event: string, data: any) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    res.write(frame);
  }
}

// ─── Config I/O ─────────────────────────────────────────

function readConfig(): any {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

function writeConfig(data: any) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

// ─── Issue Detection ────────────────────────────────────

interface DetectedIssue {
  title: string;
  description: string;
  category: string;
  agent: "L1" | "L2";
  verify: (config: any) => boolean;
}

function detectIssues(config: any): DetectedIssue[] {
  const issues: DetectedIssue[] = [];

  for (const [id, user] of Object.entries(config.users || {})) {
    const u = user as any;
    if (u.locked === true) {
      issues.push({
        title: `User ${u.name} (${id}) is locked out`,
        description: `User ${u.name} (${u.email}, ID: ${id}) is locked out. Their account shows locked=true. Please reset their password and unlock the account.`,
        category: "password_reset",
        agent: "L1",
        verify: (c) => c.users?.[id]?.locked === false,
      });
    }
    if (u.mfaEnabled === false) {
      issues.push({
        title: `User ${u.name} (${id}) has MFA disabled`,
        description: `Employee ${u.name} (${id}) had their multi-factor authentication accidentally disabled. Please re-enable MFA using an authenticator app.`,
        category: "mfa_setup",
        agent: "L1",
        verify: (c) => c.users?.[id]?.mfaEnabled === true,
      });
    }
  }

  if (!config.paymentService?.apiKey || config.paymentService.apiKey === "") {
    issues.push({
      title: "PaymentService API key missing",
      description: `The PaymentService API key has been wiped from config.json. All payment processing is failing with authentication errors.\nConfig file: demo/config.json\nField: paymentService.apiKey\nExpected: non-empty string like "pk_demo_abc123xyz"\nRead the config, restore the API key, verify the fix.`,
      category: "config_corruption",
      agent: "L2",
      verify: (c) => !!c.paymentService?.apiKey && c.paymentService.apiKey !== "",
    });
  }

  if (config.userService?.enabled === false) {
    issues.push({
      title: "UserService disabled",
      description: `The userService.enabled flag has been set to false in config.json. All user creation requests are failing.\nConfig file: demo/config.json\nField: userService.enabled\nExpected: true\nRead the config, set enabled back to true, verify.`,
      category: "config_corruption",
      agent: "L2",
      verify: (c) => c.userService?.enabled === true,
    });
  }

  if (config.database?.poolSize != null && config.database.poolSize <= 0) {
    issues.push({
      title: "Database pool size is zero",
      description: `The database.poolSize has been set to 0 in config.json. All database operations are failing.\nConfig file: demo/config.json\nField: database.poolSize\nExpected: positive number like 20\nRead the config, restore poolSize to 20, verify.`,
      category: "config_corruption",
      agent: "L2",
      verify: (c) => c.database?.poolSize > 0,
    });
  }

  if (config.emailService?.rateLimit != null && config.emailService.rateLimit <= 0) {
    issues.push({
      title: "Email rate limit is zero",
      description: `The emailService.rateLimit has been set to 0 in config.json. No emails can be sent.\nConfig file: demo/config.json\nField: emailService.rateLimit\nExpected: positive number like 100\nRead the config, restore rateLimit to 100, verify.`,
      category: "config_corruption",
      agent: "L2",
      verify: (c) => c.emailService?.rateLimit > 0,
    });
  }

  if (config.database?.connected === false) {
    issues.push({
      title: "Database disconnected",
      description: `The database.connected flag is false in config.json. All database operations are failing.\nConfig file: demo/config.json\nField: database.connected\nExpected: true\nRead the config, restore connected to true, verify.`,
      category: "config_corruption",
      agent: "L2",
      verify: (c) => c.database?.connected === true,
    });
  }

  for (const [name, svc] of Object.entries(config.services || {})) {
    const s = (svc as any).status;
    if (s && s !== "RUNNING") {
      issues.push({
        title: `${name} is ${s}`,
        description: `The ${name} has status "${s}" in config.json.\nConfig file: demo/config.json\nField: services.${name}.status\nExpected: "RUNNING"\nDiagnose the issue using fetch_logs and run_diagnostic. Restart the service using restart_service to restore it to RUNNING state. Verify the fix.`,
        category: s === "CRASHED" ? "service_crash" : "service_degradation",
        agent: "L2",
        verify: (c) => c.services?.[name]?.status === "RUNNING",
      });
    }
  }

  return issues;
}

// ─── Pipeline Runner ────────────────────────────────────

let fixing = false;

async function checkAndFix() {
  if (fixing) return;

  let config: any;
  try {
    config = readConfig();
  } catch {
    broadcast("log", { type: "error", message: "Failed to read config.json" });
    return;
  }

  const issues = detectIssues(config);

  if (issues.length === 0) {
    broadcast("check", { healthy: true, issueCount: 0 });
    return;
  }

  fixing = true;
  broadcast("check", { healthy: false, issueCount: issues.length });
  broadcast("log", {
    type: "status",
    message: `Detected ${issues.length} issue(s) — starting agent pipeline`,
  });

  for (const issue of issues) {
    broadcast("log", {
      type: "issue",
      message: `[${issue.agent}] ${issue.title}`,
    });

    try {
      const onStep = (step: any) => {
        broadcast("step", { issue: issue.title, ...step });
      };

      if (issue.agent === "L1") {
        await runL1Agent(issue.title, issue.description, issue.category, onStep);
      } else {
        await runL2Agent(issue.title, issue.description, issue.category, onStep);
      }

      const fixed = issue.verify(readConfig());
      broadcast("log", {
        type: fixed ? "success" : "warning",
        message: fixed
          ? `Fixed: ${issue.title}`
          : `Could not fix: ${issue.title}`,
      });
    } catch (err: any) {
      broadcast("log", {
        type: "error",
        message: `Error fixing "${issue.title}": ${err.message}`,
      });
    }
  }

  broadcast("config_updated", { config: readConfig() });
  broadcast("log", { type: "success", message: "Pipeline complete" });
  fixing = false;
}

setTimeout(checkAndFix, 2000);
setInterval(checkAndFix, CHECK_INTERVAL_MS);

// ─── HTTP Helpers ───────────────────────────────────────

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: string) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, status: number, data: any) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// ─── HTTP Server ────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = req.url || "/";

  if (req.method === "GET" && url === "/") {
    try {
      const html = fs.readFileSync(HTML_PATH, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(html);
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain" });
      return res.end("Could not load public/index.html");
    }
  }

  if (req.method === "GET" && url === "/api/config") {
    try {
      return json(res, 200, readConfig());
    } catch (err: any) {
      return json(res, 500, { error: err.message });
    }
  }

  if (req.method === "PUT" && url === "/api/config") {
    try {
      const body = await parseBody(req);
      const config = JSON.parse(body);
      writeConfig(config);
      broadcast("config_updated", { config });
      return json(res, 200, { ok: true });
    } catch (err: any) {
      return json(res, 400, { error: err.message });
    }
  }

  if (req.method === "POST" && url === "/api/check") {
    if (fixing) return json(res, 409, { error: "Fix already in progress" });
    checkAndFix();
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && url === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`event: connected\ndata: {}\n\n`);
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log("");
  console.log("  Catapult Config Monitor");
  console.log("  ───────────────────────");
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Checking config every ${CHECK_INTERVAL_MS / 1000}s`);
  console.log("");
});
