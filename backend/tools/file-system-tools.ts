import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs";

const CONFIG_FILE = path.join(process.cwd(), "demo/config.json");
const LOG_FILE = path.join(process.cwd(), "demo/app.log");

// ── helpers ──────────────────────────────────────────────

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      key in target &&
      typeof target[key] === "object"
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// Normalization layer — accepts ANY shape the agent sends
// and converts it into a clean updates object before writing.
// This is what makes the tool resilient to agent formatting mistakes.
function normalizeUpdates(raw: any): Record<string, any> {
  // Shape 1: agent sends { updates: { ... } }
  if (raw && typeof raw === "object" && raw.updates) {
    return raw.updates;
  }

  // Shape 2: agent sends a JSON string instead of an object
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return normalizeUpdates(parsed); // recurse once
    } catch {
      return {};
    }
  }

  // Shape 3: agent sends the config fields directly (most common)
  // e.g. { paymentService: { apiKey: "..." } }
  if (raw && typeof raw === "object") {
    const knownKeys = ["userService", "paymentService", "emailService", "database"];
    const hasKnownKey = Object.keys(raw).some((k) => knownKeys.includes(k));
    if (hasKnownKey) return raw;
  }

  // Fallback: return empty — tool will succeed but write nothing
  console.warn("[write_config] Could not normalize input:", JSON.stringify(raw));
  return {};
}

// ── tools ────────────────────────────────────────────────

export const readConfigTool = tool(
  async (_input) => {
    try {
      const content = fs.readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(content);
      return JSON.stringify({
        success: true,
        filePath: "demo/config.json",
        config: parsed,
      });
    } catch (err: any) {
      return JSON.stringify({ success: false, error: err.message });
    }
  },
  {
    name: "read_config",
    description:
      "Reads the current demo app config.json. Always call this first before making any changes so you know the current state.",
    // Empty schema — no arguments needed, avoids any parsing issues
    schema: z.object({}),
  }
);

export const writeConfigTool = tool(
  async (input) => {
    try {
      // Normalize whatever shape the agent sent
      const updates = normalizeUpdates(input);

      if (Object.keys(updates).length === 0) {
        return JSON.stringify({
          success: false,
          error: "No valid updates found in input. Make sure you pass config fields like { paymentService: { apiKey: '...' } }",
        });
      }

      const current = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      const updated = deepMerge(current, updates);
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));

      return JSON.stringify({
        success: true,
        message: "config.json updated successfully",
        updatedFields: Object.keys(updates),
        newConfig: updated,
      });
    } catch (err: any) {
      return JSON.stringify({ success: false, error: err.message });
    }
  },
  {
    name: "write_config",
    description: `Updates fields in demo/config.json. Pass only the fields you want to change.

EXAMPLES — call this tool with exactly one of these shapes:

To fix a missing API key:
{ "updates": { "paymentService": { "apiKey": "pk_demo_abc123xyz" } } }

To re-enable a service:
{ "updates": { "userService": { "enabled": true } } }

To restore a rate limit:
{ "updates": { "emailService": { "rateLimit": 100 } } }

To restore database pool:
{ "updates": { "database": { "poolSize": 20 } } }

To restore database connection:
{ "updates": { "database": { "connected": true } } }

To fix a timeout:
{ "updates": { "paymentService": { "timeout": 5000 } } }

Always wrap your changes inside the "updates" key.`,
    // Single top-level "updates" field — simplest possible schema
    // Record<string, any> means the agent can pass any nested object
    schema: z.object({
      updates: z
        .record(z.any())
        .describe(
          'The config changes to apply. Example: { "paymentService": { "apiKey": "pk_demo_abc123xyz" } }'
        ),
    }),
  }
);

export const readLogsTool = tool(
  async (input) => {
    try {
      if (!fs.existsSync(LOG_FILE)) {
        return JSON.stringify({ success: true, logs: "", totalLines: 0 });
      }
      const content = fs.readFileSync(LOG_FILE, "utf-8");
      const allLines = content.split("\n").filter(Boolean);
      const count = Math.min(input.lines ?? 30, allLines.length);
      const recent = allLines.slice(-count);
      return JSON.stringify({
        success: true,
        totalLines: allLines.length,
        showing: recent.length,
        logs: recent.join("\n"),
      });
    } catch (err: any) {
      return JSON.stringify({ success: false, error: err.message });
    }
  },
  {
    name: "read_logs",
    description:
      "Reads the most recent log lines from the demo app log file. Use this to understand what errors are occurring.",
    schema: z.object({
      lines: z
        .number()
        .optional()
        .describe("Number of recent log lines to read. Defaults to 30."),
    }),
  }
);

export const verifyFixTool = tool(
  async (input) => {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      const logContent = fs.existsSync(LOG_FILE)
        ? fs.readFileSync(LOG_FILE, "utf-8")
        : "";
      const recentLines = logContent.split("\n").filter(Boolean).slice(-15);
      const recentErrors = recentLines.filter(
        (l) =>
          l.includes("[ERROR]") &&
          l.toLowerCase().includes(input.service.toLowerCase())
      );

      return JSON.stringify({
        success: true,
        service: input.service,
        currentConfig: config,
        recentErrorCount: recentErrors.length,
        recentErrors,
        verdict:
          recentErrors.length === 0
            ? "No recent errors detected for this service. Fix appears successful."
            : `Still seeing ${recentErrors.length} recent error(s). The fix may not have fully resolved the issue.`,
      });
    } catch (err: any) {
      return JSON.stringify({ success: false, error: err.message });
    }
  },
  {
    name: "verify_fix",
    description:
      "After applying a fix, call this to verify the service is no longer throwing errors. Checks recent logs for continued errors.",
    schema: z.object({
      service: z
        .string()
        .describe(
          "Name of the service to verify e.g. PaymentService, UserService, EmailService, HealthCheck"
        ),
    }),
  }
);

export const filesystemTools = [
  readConfigTool,
  writeConfigTool,
  readLogsTool,
  verifyFixTool,
];