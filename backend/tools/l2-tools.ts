import { tool } from "@langchain/core/tools";
import { z } from "zod";

const FAKE_LOGS: Record<string, string> = {
  payment: `[ERROR] 2024-01-15 14:23:01 PaymentService - NullPointerException at PaymentProcessor.java:142
[ERROR] 2024-01-15 14:23:01 PaymentService - Failed to process transaction TXN-8821
[WARN]  2024-01-15 14:22:58 PaymentService - Database connection pool at 95% capacity (190/200)
[ERROR] 2024-01-15 14:22:45 PaymentService - NullPointerException at PaymentProcessor.java:142
[INFO]  2024-01-15 14:20:00 PaymentService - Service started, all systems nominal`,
  auth: `[ERROR] 2024-01-15 14:20:11 AuthService - JWT token validation failed: signature mismatch
[ERROR] 2024-01-15 14:20:10 AuthService - JWT token validation failed: signature mismatch
[WARN]  2024-01-15 14:20:05 AuthService - High authentication failure rate: 34% over last 5 min
[INFO]  2024-01-15 14:15:00 AuthService - Token secret rotated successfully`,
  default: `[ERROR] 2024-01-15 14:25:00 ServiceHost - Unhandled exception in request pipeline
[WARN]  2024-01-15 14:24:55 ServiceHost - Memory usage at 87% (7.1GB / 8GB)
[ERROR] 2024-01-15 14:24:40 ServiceHost - Health check failed, retrying...
[INFO]  2024-01-15 14:20:00 ServiceHost - Deployment v2.4.1 completed`,
};

export const fetchLogsTool = tool(
  async ({ service, timeRange }) => {
    await new Promise((r) => setTimeout(r, 900));
    const key = Object.keys(FAKE_LOGS).find((k) =>
      service.toLowerCase().includes(k)
    );
    const logs = key ? FAKE_LOGS[key] : FAKE_LOGS.default;
    return JSON.stringify({
      success: true,
      service,
      timeRange,
      logCount: logs.split("\n").length,
      logs,
      fetchedAt: new Date().toISOString(),
    });
  },
  {
    name: "fetch_logs",
    description:
      "Retrieves recent log entries for a named service. Always call this first when diagnosing an issue.",
    schema: z.object({
      service: z
        .string()
        .describe("Name of the service to fetch logs for e.g. PaymentService"),
      timeRange: z
        .string()
        .describe("Time range e.g. last_15_minutes, last_1_hour"),
    }),
  }
);

export const restartServiceTool = tool(
  async ({ serviceName, reason }) => {
    await new Promise((r) => setTimeout(r, 1200));
    return JSON.stringify({
      success: true,
      action: "service_restarted",
      serviceName,
      reason,
      previousState: "DEGRADED",
      currentState: "RUNNING",
      startupTime: "4.2s",
      message: `${serviceName} restarted successfully. Health checks passing. Previous state was DEGRADED.`,
      timestamp: new Date().toISOString(),
    });
  },
  {
    name: "restart_service",
    description:
      "Restarts a named service. Only use this after reviewing logs and confirming restart will help.",
    schema: z.object({
      serviceName: z.string().describe("Exact name of the service to restart"),
      reason: z
        .string()
        .describe("One sentence justification for why restart is warranted"),
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
    const results: Record<string, object> = {
      health_check: {
        status: "degraded",
        responseTime: "2340ms",
        errorRate: "23%",
        uptime: "99.1%",
      },
      db_connection: {
        poolSize: 200,
        activeConnections: 190,
        waitingRequests: 14,
        avgQueryTime: "340ms",
      },
      memory_usage: {
        total: "8GB",
        used: "7.1GB",
        usagePercent: "88%",
        gcPressure: "high",
      },
    };
    const result = results[checkType] || {
      status: "checked",
      target,
      result: "nominal",
    };
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
      "Runs a specific diagnostic check on a service or system component.",
    schema: z.object({
      checkType: z
        .enum(["health_check", "db_connection", "memory_usage", "api_latency"])
        .describe("Type of diagnostic to run"),
      target: z.string().describe("Service or system to run the diagnostic on"),
    }),
  }
);

export const l2Tools = [
  fetchLogsTool,
  restartServiceTool,
  notifyTeamTool,
  runDiagnosticTool,
];