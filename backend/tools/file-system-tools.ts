import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs";
import path from "path";

const DEMO_APP_DIR = path.join(process.cwd(), "demo-app");
const CONFIG_FILE = path.join(DEMO_APP_DIR, "config.json");
const LOG_FILE = path.join(DEMO_APP_DIR, "app.log");

export const readConfigTool = tool(
  async () => {
    const content = fs.readFileSync(CONFIG_FILE, "utf-8");
    return JSON.stringify({
      success: true,
      filePath: "demo-app/config.json",
      content: JSON.parse(content),
    });
  },
  {
    name: "read_config",
    description:
      "Reads the current demo app config.json file. Always call this first to understand the current state before making changes.",
    schema: z.object({}),
  }
);

export const writeConfigTool = tool(
  async ({ updates }) => {
    const current = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    
    // Deep merge the updates into current config
    const updated = deepMerge(current, updates);
    
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));

    return JSON.stringify({
      success: true,
      message: "config.json updated successfully",
      updatedFields: Object.keys(updates),
      newConfig: updated,
    });
  },
  {
    name: "write_config",
    description:
      "Updates specific fields in the demo app config.json. Pass only the fields you want to change — other fields are preserved.",
    schema: z.object({
      updates: z
        .record(z.any())
        .describe(
          `The config fields to update as a nested object. 
          Example to fix payment API key: { "paymentService": { "apiKey": "pk_demo_abc123xyz" } }
          Example to re-enable user service: { "userService": { "enabled": true } }
          Example to restore DB pool: { "database": { "poolSize": 20 } }`
        ),
    }),
  }
);

export const readLogsTool = tool(
  async ({ lines }) => {
    const content = fs.readFileSync(LOG_FILE, "utf-8");
    const allLines = content.split("\n").filter(Boolean);
    const recent = allLines.slice(-lines);
    return JSON.stringify({
      success: true,
      totalLines: allLines.length,
      showing: recent.length,
      logs: recent.join("\n"),
    });
  },
  {
    name: "read_logs",
    description:
      "Reads the most recent log lines from the demo app. Use this to understand what errors are occurring and confirm fixes worked.",
    schema: z.object({
      lines: z
        .number()
        .describe("Number of recent log lines to read. Use 20-50 for diagnosis."),
    }),
  }
);

export const verifyFixTool = tool(
  async ({ service }) => {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    const logs = fs.readFileSync(LOG_FILE, "utf-8");
    const recentLines = logs.split("\n").filter(Boolean).slice(-10);
    const recentErrors = recentLines.filter(
      (l) => l.includes("[ERROR]") && l.toLowerCase().includes(service.toLowerCase())
    );

    return JSON.stringify({
      success: true,
      service,
      currentConfig: config,
      recentErrorCount: recentErrors.length,
      recentErrors,
      verdict:
        recentErrors.length === 0
          ? "No recent errors for this service. Fix appears successful."
          : `Still seeing ${recentErrors.length} recent errors. Fix may not have taken effect yet.`,
    });
  },
  {
    name: "verify_fix",
    description:
      "After applying a fix, call this to verify the service is no longer throwing errors. Checks recent logs for continued errors.",
    schema: z.object({
      service: z
        .string()
        .describe(
          "Name of the service to verify e.g. PaymentService, UserService, EmailService"
        ),
    }),
  }
);

// Helper — deep merge two objects
function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] instanceof Object &&
      !Array.isArray(source[key]) &&
      key in target
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export const filesystemTools = [
  readConfigTool,
  writeConfigTool,
  readLogsTool,
  verifyFixTool,
];