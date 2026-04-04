import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

const CONFIG_FILE = path.join(process.cwd(), "demo/config.json");

function readConfig(): any {
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
}

function writeConfig(config: any): void {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export const fetchLogsTool = tool(
  async ({ service, timeRange }) => {
    await new Promise((r) => setTimeout(r, 900));

    const config = readConfig();
    const logs: string[] = [];
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const svcLower = service.toLowerCase();

    const svcEntry = config.services?.[service];
    if (svcEntry && svcEntry.status !== "RUNNING") {
      logs.push(
        `[ERROR] ${now} ${service} - Service is in ${svcEntry.status} state`
      );
      logs.push(
        `[ERROR] ${now} ${service} - Health check failed, service not responding`
      );
    }

    if (svcLower.includes("payment")) {
      if (!config.paymentService?.apiKey) {
        logs.push(
          `[ERROR] ${now} PaymentService - API key is missing or empty, authentication failing`
        );
        logs.push(
          `[ERROR] ${now} PaymentService - All payment transactions failing with AuthenticationError`
        );
      }
      if (
        config.paymentService?.timeout != null &&
        config.paymentService.timeout < 1000
      ) {
        logs.push(
          `[ERROR] ${now} PaymentService - Timeout set to ${config.paymentService.timeout}ms, requests timing out`
        );
      }
      if (!logs.some((l) => l.includes("[ERROR]"))) {
        logs.push(
          `[INFO]  ${now} PaymentService - Service started, all systems nominal`
        );
      }
    } else if (svcLower.includes("user") || svcLower.includes("account")) {
      if (config.userService?.enabled === false) {
        logs.push(
          `[ERROR] ${now} UserService - Service is disabled in configuration`
        );
        logs.push(
          `[ERROR] ${now} UserService - All user operations returning 503 Service Unavailable`
        );
      }
      if (!logs.some((l) => l.includes("[ERROR]"))) {
        logs.push(`[INFO]  ${now} UserService - Service running normally`);
      }
    } else if (svcLower.includes("email")) {
      if (
        config.emailService?.rateLimit != null &&
        config.emailService.rateLimit <= 0
      ) {
        logs.push(
          `[ERROR] ${now} EmailService - Rate limit is ${config.emailService.rateLimit}, all emails blocked`
        );
        logs.push(
          `[ERROR] ${now} EmailService - Notification delivery queue backed up`
        );
      }
      if (!logs.some((l) => l.includes("[ERROR]"))) {
        logs.push(`[INFO]  ${now} EmailService - Mail delivery nominal`);
      }
    } else if (svcLower.includes("database") || svcLower.includes("db")) {
      if (
        config.database?.poolSize != null &&
        config.database.poolSize <= 0
      ) {
        logs.push(
          `[ERROR] ${now} DatabaseService - Connection pool size is 0, no connections available`
        );
        logs.push(
          `[ERROR] ${now} DatabaseService - All queries failing with ConnectionPoolExhausted`
        );
      }
      if (config.database?.connected === false) {
        logs.push(
          `[ERROR] ${now} DatabaseService - Database connection is down`
        );
      }
      if (!logs.some((l) => l.includes("[ERROR]"))) {
        logs.push(
          `[INFO]  ${now} DatabaseService - All connections healthy`
        );
      }
    } else {
      logs.push(`[INFO]  ${now} ${service} - No specific issues detected`);
    }

    if (logs.some((l) => l.includes("[ERROR]"))) {
      logs.push(
        `[WARN]  ${now} ${service} - Service degradation detected, intervention required`
      );
    }

    return JSON.stringify({
      success: true,
      service,
      timeRange,
      logCount: logs.length,
      logs: logs.join("\n"),
      fetchedAt: new Date().toISOString(),
    });
  },
  {
    name: "fetch_logs",
    description:
      "Retrieves recent log entries for a named service by reading the current system state from config.json. Always call this first when diagnosing an issue.",
    schema: z.object({
      service: z
        .string()
        .describe(
          "Name of the service to fetch logs for e.g. PaymentService"
        ),
      timeRange: z
        .string()
        .describe("Time range e.g. last_15_minutes, last_1_hour"),
    }),
  }
);

export const restartServiceTool = tool(
  async ({ serviceName, reason }) => {
    await new Promise((r) => setTimeout(r, 1200));
    try {
      const config = readConfig();
      const previousState =
        config.services?.[serviceName]?.status || "UNKNOWN";

      if (!config.services) config.services = {};
      config.services[serviceName] = {
        status: "RUNNING",
        lastRestart: new Date().toISOString(),
      };
      writeConfig(config);

      return JSON.stringify({
        success: true,
        action: "service_restarted",
        serviceName,
        reason,
        previousState,
        currentState: "RUNNING",
        startupTime: "4.2s",
        configModified: true,
        message: `${serviceName} restarted successfully. Status updated from ${previousState} to RUNNING in config.json. Health checks passing.`,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return JSON.stringify({ success: false, error: err.message });
    }
  },
  {
    name: "restart_service",
    description:
      "Restarts a named service and updates its status to RUNNING in config.json. Only use this after reviewing logs and confirming restart will help.",
    schema: z.object({
      serviceName: z
        .string()
        .describe("Exact name of the service to restart"),
      reason: z
        .string()
        .describe(
          "One sentence justification for why restart is warranted"
        ),
    }),
  }
);

export const notifyTeamTool = tool(
  async ({ channel, message, severity }) => {
    await new Promise((r) => setTimeout(r, 400));
    return JSON.stringify({
      success: true,
      action: "team_notified",
      channel,
      severity,
      message: `Notification sent to #${channel}: "${message}"`,
      notifiedAt: new Date().toISOString(),
    });
  },
  {
    name: "notify_team",
    description:
      "Sends an alert notification to a team Slack channel. Use for outages or issues that humans should be aware of.",
    schema: z.object({
      channel: z
        .string()
        .describe(
          "Slack channel name without # e.g. incidents, engineering, devops"
        ),
      message: z
        .string()
        .describe("The notification message to send, max 200 chars"),
      severity: z
        .enum(["info", "warning", "critical"])
        .describe("Severity level of the notification"),
    }),
  }
);

export const runDiagnosticTool = tool(
  async ({ checkType, target }) => {
    await new Promise((r) => setTimeout(r, 700));

    const config = readConfig();
    let result: object;

    switch (checkType) {
      case "health_check": {
        const svcStatus =
          config.services?.[target]?.status || "UNKNOWN";
        const isHealthy = svcStatus === "RUNNING";
        result = {
          status: isHealthy ? "healthy" : "degraded",
          serviceConfigStatus: svcStatus,
          responseTime: isHealthy ? "120ms" : "2340ms",
          errorRate: isHealthy ? "0.1%" : "23%",
          uptime: isHealthy ? "99.99%" : "99.1%",
        };
        break;
      }
      case "db_connection": {
        const poolSize = config.database?.poolSize ?? 0;
        const connected = config.database?.connected ?? false;
        result = {
          poolSize,
          activeConnections:
            poolSize > 0 ? Math.floor(poolSize * 0.6) : 0,
          waitingRequests: poolSize > 0 ? 2 : 47,
          avgQueryTime:
            poolSize > 0 && connected ? "45ms" : "timeout",
          connected,
        };
        break;
      }
      case "memory_usage": {
        result = {
          total: "8GB",
          used: "4.2GB",
          usagePercent: "52%",
          gcPressure: "normal",
        };
        break;
      }
      case "api_latency": {
        const svcStatus = config.services?.[target]?.status;
        const running = svcStatus === "RUNNING";
        result = {
          avgLatency: running ? "85ms" : "4200ms",
          p99Latency: running ? "200ms" : "timeout",
          requestsPerSecond: running ? 1240 : 12,
          errorRate: running ? "0.2%" : "78%",
        };
        break;
      }
      default:
        result = { status: "checked", target, result: "nominal" };
    }

    return JSON.stringify({
      success: true,
      checkType,
      target,
      result,
      timestamp: new Date().toISOString(),
    });
  },
  {
    name: "run_diagnostic",
    description:
      "Runs a specific diagnostic check on a service or system component using actual config state.",
    schema: z.object({
      checkType: z
        .enum([
          "health_check",
          "db_connection",
          "memory_usage",
          "api_latency",
        ])
        .describe("Type of diagnostic to run"),
      target: z
        .string()
        .describe("Service or system to run the diagnostic on"),
    }),
  }
);

export const l2Tools = [
  fetchLogsTool,
  restartServiceTool,
  notifyTeamTool,
  runDiagnosticTool,
];
