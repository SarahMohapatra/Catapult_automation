import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import * as http from "http";
import * as fs from "fs";
import { classifyIssue } from "./backend/agent/classifier";
import { runL1Agent } from "./backend/agent/l1-agent";
import { runL2Agent } from "./backend/agent/l2-agent";
import {
  runEscalationHandler,
  PriorAgentContext,
} from "./backend/agent/escalation";
import { generateIncidentReport } from "./backend/agent/documenter";
import {
  createTicket,
  updateTicket,
  getAllTickets,
  getTicketsByTier,
  hasActiveTicketForIssue,
  clearAllTickets,
  Ticket,
} from "./backend/store/tickets";
import { AgentStep } from "./backend/agent/l1-agent";
import { detectDefect, matchKnownBugLabel, buildUnknownDefectDescription, buildCatalogDefectDescription } from "./demo/defect-pipeline";
import { runValidationSuite } from "./demo/test-runner";
import { bugs, fixBug } from "./demo/bug-injector";

const PORT = 4000;
const CONFIG_PATH = path.join(process.cwd(), "demo/config.json");
const WORKER_LOGIC_PATH = path.join(process.cwd(), "demo/worker-logic.ts");
/** Committed canonical source — reset always prefers this over a corrupted worker-logic.ts */
const WORKER_LOGIC_BASELINE_PATH = path.join(
  process.cwd(),
  "demo/worker-logic.baseline.ts"
);
const WORKER_LOG_PATH = path.join(process.cwd(), "demo/worker.log");
const HTML_PATH = path.join(process.cwd(), "public/index.html");

const MAX_ESCALATION_STEPS_CHARS = 15_000;

function formatAgentStepsForEscalation(steps: AgentStep[]): string {
  if (!steps.length) return "(no prior automated steps)";
  const text = steps
    .map(
      (s) =>
        `[${s.type}]${s.toolName ? ` ${s.toolName}` : ""} ${s.content}`
    )
    .join("\n");
  if (text.length <= MAX_ESCALATION_STEPS_CHARS) return text;
  return `${text.slice(0, MAX_ESCALATION_STEPS_CHARS)}\n…(truncated)`;
}

function buildPriorAgentContext(
  priorTier: "L1" | "L2",
  intakeClassificationTier: string | null | undefined,
  steps: AgentStep[],
  finalOutput: string,
  incidentReportSummary?: string
): PriorAgentContext {
  return {
    priorTier,
    intakeClassificationTier: intakeClassificationTier ?? priorTier,
    finalOutput,
    stepsSummary: formatAgentStepsForEscalation(steps),
    incidentReportSummary,
    steps,
  };
}
const CHECK_INTERVAL_MS = 5_000;

// ─── Pristine Snapshots (captured at boot for reset) ────

let pristineConfig: any = null;
let pristineWorkerSource: string | null = null;

try {
  pristineConfig = JSON.parse(JSON.stringify(JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"))));
} catch { /* captured on first successful read */ }

/** Prefer committed baseline so reset works even if worker-logic.ts was corrupted before boot. */
function readWorkerPristineSnapshot(): string | null {
  try {
    if (fs.existsSync(WORKER_LOGIC_BASELINE_PATH)) {
      return fs.readFileSync(WORKER_LOGIC_BASELINE_PATH, "utf-8");
    }
  } catch { /* baseline missing or unreadable */ }
  try {
    return fs.readFileSync(WORKER_LOGIC_PATH, "utf-8");
  } catch { /* file may not exist yet */ }
  return null;
}

try {
  pristineWorkerSource = readWorkerPristineSnapshot();
} catch { /* optional */ }

// ─── SSE Client Management ─────────────────────────────

const sseClients = new Set<http.ServerResponse>();

function broadcast(event: string, data: any) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  Array.from(sseClients).forEach((res) => res.write(frame));
}

// ─── Config I/O ─────────────────────────────────────────

function readConfig(): any {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

function writeConfig(data: any) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

// ─── Issue Detection ────────────────────────────────────
//
// Each detected issue carries a suggestedTier so well-known patterns
// can skip the AI classifier.  For ad-hoc issues submitted via the
// API the classifier is always used.

interface DetectedIssue {
  title: string;
  description: string;
  category: string;
  suggestedTier: "L1" | "L2" | "L3";
  verify: (config: any) => boolean | Promise<boolean>;
}

function detectIssues(config: any): DetectedIssue[] {
  const issues: DetectedIssue[] = [];

  // ── Pre-check: detect catastrophic config wipe ──────────
  //
  // When entire sections are missing (not just bad values), the
  // fine-grained checks below would silently skip them because
  // e.g. `undefined !== false` and `undefined` is not `<= 0`.
  // Detect missing sections explicitly so the system doesn't
  // resolve one issue and ignore the rest.

  const requiredSections = ["database", "userService", "emailService", "paymentService", "services", "users"];
  const missingSections = requiredSections.filter(
    (s) => !config[s] || (typeof config[s] === "object" && Object.keys(config[s]).length === 0)
  );

  if (missingSections.length >= 3) {
    issues.push({
      title: "Critical configuration wipe detected",
      description: `The configuration has been severely corrupted — ${missingSections.length} required sections are missing or empty: ${missingSections.join(", ")}.\nConfig file: demo/config.json\nThis indicates catastrophic data loss requiring full restoration.\nExpected sections:\n- database: { "connected": true, "poolSize": 20 }\n- userService: { "enabled": true, "maxUsers": 1000 }\n- emailService: { "smtpHost": "smtp.gmail.com", "rateLimit": 100 }\n- paymentService: { "apiKey": "pk_demo_abc123xyz", "timeout": 5000 }\n- services: PaymentService, AuthService, EmailService, DatabaseService all with status "RUNNING"\n- users: employee accounts (USR-4421, USR-7821, USR-3312)`,
      category: "infrastructure_outage",
      suggestedTier: "L3",
      verify: (c) =>
        requiredSections.every(
          (s) => c[s] && typeof c[s] === "object" && Object.keys(c[s]).length > 0
        ),
    });
    return issues;
  }

  // ── Individual missing-section checks (1-2 sections gone) ──

  if (!config.database || Object.keys(config.database).length === 0) {
    issues.push({
      title: "Database configuration section missing",
      description: `The entire database section is missing from config.json. All database operations are unavailable.\nConfig file: demo/config.json\nExpected: { "connected": true, "poolSize": 20 }\nRestore the complete database section using write_config, then verify.`,
      category: "config_corruption",
      suggestedTier: "L2",
      verify: (c) => !!c.database && c.database.connected === true && c.database.poolSize > 0,
    });
  }

  if (!config.userService || Object.keys(config.userService).length === 0) {
    issues.push({
      title: "UserService configuration section missing",
      description: `The entire userService section is missing from config.json. User management is unavailable.\nConfig file: demo/config.json\nExpected: { "enabled": true, "maxUsers": 1000 }\nRestore the complete userService section using write_config, then verify.`,
      category: "config_corruption",
      suggestedTier: "L2",
      verify: (c) => !!c.userService && c.userService.enabled === true,
    });
  }

  if (!config.emailService || Object.keys(config.emailService).length === 0) {
    issues.push({
      title: "EmailService configuration section missing",
      description: `The entire emailService section is missing from config.json. Email functionality is unavailable.\nConfig file: demo/config.json\nExpected: { "smtpHost": "smtp.gmail.com", "rateLimit": 100 }\nRestore the complete emailService section using write_config, then verify.`,
      category: "config_corruption",
      suggestedTier: "L2",
      verify: (c) => !!c.emailService && !!c.emailService.smtpHost && c.emailService.rateLimit > 0,
    });
  }

  if (!config.paymentService || Object.keys(config.paymentService).length === 0) {
    issues.push({
      title: "PaymentService configuration section missing",
      description: `The entire paymentService section is missing from config.json. All payment processing is failing.\nConfig file: demo/config.json\nExpected: { "apiKey": "pk_demo_abc123xyz", "timeout": 5000 }\nRestore the complete paymentService section using write_config, then verify.`,
      category: "config_corruption",
      suggestedTier: "L2",
      verify: (c) => !!c.paymentService?.apiKey && c.paymentService.apiKey !== "",
    });
  }

  if (!config.services || Object.keys(config.services).length === 0) {
    issues.push({
      title: "Services configuration section missing",
      description: `The entire services section is missing from config.json. Service monitoring is unavailable.\nConfig file: demo/config.json\nExpected: PaymentService, AuthService, EmailService, DatabaseService — all with status "RUNNING"\nRestore the services section using write_config, then verify.`,
      category: "config_corruption",
      suggestedTier: "L2",
      verify: (c) => {
        const svcs = c.services;
        return (
          !!svcs &&
          ["PaymentService", "AuthService", "EmailService", "DatabaseService"].every(
            (s) => svcs[s]?.status === "RUNNING"
          )
        );
      },
    });
  }

  if (!config.users || Object.keys(config.users).length === 0) {
    issues.push({
      title: "User accounts section missing from config",
      description: `The entire users section is missing from config.json. All employee accounts are unavailable.\nConfig file: demo/config.json\nRestore user accounts for all employees, then verify.`,
      category: "config_corruption",
      suggestedTier: "L2",
      verify: (c) => !!c.users && Object.keys(c.users).length > 0,
    });
  }

  // ── L1: User-level issues (only when users section exists) ──

  for (const [id, user] of Object.entries(config.users || {})) {
    const u = user as any;
    if (u.locked === true) {
      issues.push({
        title: `User ${u.name} (${id}) is locked out`,
        description: `User ${u.name} (${u.email}, ID: ${id}) is locked out. Their account shows locked=true. Please reset their password and unlock the account.`,
        category: "password_reset",
        suggestedTier: "L1",
        verify: (c) => c.users?.[id]?.locked === false,
      });
    }
    if (u.mfaEnabled === false) {
      issues.push({
        title: `User ${u.name} (${id}) has MFA disabled`,
        description: `Employee ${u.name} (${id}) had their multi-factor authentication accidentally disabled. Please re-enable MFA using an authenticator app.`,
        category: "mfa_setup",
        suggestedTier: "L1",
        verify: (c) => c.users?.[id]?.mfaEnabled === true,
      });
    }
  }

  // ── L2: Service / config issues (guarded — only fire when section exists
  //    so they don't double-count with the missing-section checks above) ──

  if (config.paymentService && (!config.paymentService.apiKey || config.paymentService.apiKey === "")) {
    issues.push({
      title: "PaymentService API key missing",
      description: `The PaymentService API key has been wiped from config.json. All payment processing is failing with authentication errors.\nConfig file: demo/config.json\nField: paymentService.apiKey\nExpected: non-empty string like "pk_demo_abc123xyz"\nRead the config, restore the API key, verify the fix.`,
      category: "config_corruption",
      suggestedTier: "L2",
      verify: (c) => !!c.paymentService?.apiKey && c.paymentService.apiKey !== "",
    });
  }

  if (config.userService && config.userService.enabled === false) {
    issues.push({
      title: "UserService disabled",
      description: `The userService.enabled flag has been set to false in config.json. All user creation requests are failing.\nConfig file: demo/config.json\nField: userService.enabled\nExpected: true\nRead the config, set enabled back to true, verify.`,
      category: "config_corruption",
      suggestedTier: "L2",
      verify: (c) => c.userService?.enabled === true,
    });
  }

  if (config.database && config.database.poolSize != null && config.database.poolSize <= 0) {
    issues.push({
      title: "Database pool size is zero",
      description: `The database.poolSize has been set to 0 in config.json. All database operations are failing.\nConfig file: demo/config.json\nField: database.poolSize\nExpected: positive number like 20\nRead the config, restore poolSize to 20, verify.`,
      category: "config_corruption",
      suggestedTier: "L2",
      verify: (c) => c.database?.poolSize > 0,
    });
  }

  if (config.emailService && config.emailService.rateLimit != null && config.emailService.rateLimit <= 0) {
    issues.push({
      title: "Email rate limit is zero",
      description: `The emailService.rateLimit has been set to 0 in config.json. No emails can be sent.\nConfig file: demo/config.json\nField: emailService.rateLimit\nExpected: positive number like 100\nRead the config, restore rateLimit to 100, verify.`,
      category: "config_corruption",
      suggestedTier: "L2",
      verify: (c) => c.emailService?.rateLimit > 0,
    });
  }

  if (config.database && config.database.connected === false) {
    issues.push({
      title: "Database disconnected",
      description: `The database.connected flag is false in config.json. All database operations are failing.\nConfig file: demo/config.json\nField: database.connected\nExpected: true\nRead the config, restore connected to true, verify.`,
      category: "config_corruption",
      suggestedTier: "L2",
      verify: (c) => c.database?.connected === true,
    });
  }

  const crashedServices: string[] = [];
  if (config.services) {
    for (const [name, svc] of Object.entries(config.services)) {
      const s = (svc as any).status;
      if (s && s !== "RUNNING") {
        crashedServices.push(name);
      }
    }
  }

  // ── L3: Multi-service outage → requires human review ─
  if (crashedServices.length >= 3) {
    issues.push({
      title: `Multi-service outage: ${crashedServices.join(", ")}`,
      description: `${crashedServices.length} services are down simultaneously (${crashedServices.join(", ")}). This pattern indicates a possible infrastructure-level failure that is beyond automated remediation. Requires immediate human investigation.`,
      category: "infrastructure_outage",
      suggestedTier: "L3",
      verify: (c) => {
        const svcMap = c.services || {};
        return crashedServices.every((n) => svcMap[n]?.status === "RUNNING");
      },
    });
  } else if (config.services) {
    for (const name of crashedServices) {
      const s = (config.services[name] as any).status;
      issues.push({
        title: `${name} is ${s}`,
        description: `The ${name} has status "${s}" in config.json.\nConfig file: demo/config.json\nField: services.${name}.status\nExpected: "RUNNING"\nDiagnose the issue using fetch_logs and run_diagnostic. Restart the service using restart_service to restore it to RUNNING state. Verify the fix.`,
        category: s === "CRASHED" ? "service_crash" : "service_degradation",
        suggestedTier: "L2",
        verify: (c) => c.services?.[name]?.status === "RUNNING",
      });
    }
  }

  // ── L3: Complete database failure (disconnected + zero pool) ─
  if (config.database?.connected === false && config.database?.poolSize <= 0) {
    const alreadyHasDbL3 = issues.some(
      (i) => i.category === "infrastructure_outage"
    );
    if (!alreadyHasDbL3) {
      issues.push({
        title: "Complete database failure",
        description: `Database is both disconnected (connected=false) and has zero connection pool (poolSize=0). This indicates a critical infrastructure failure that likely requires manual DBA intervention, not just config restoration.`,
        category: "infrastructure_outage",
        suggestedTier: "L3",
        verify: (c) => c.database?.connected === true && c.database?.poolSize > 0,
      });
    }
  }

  return issues;
}

// ─── Pipeline: Process a Single Issue ───────────────────

async function processIssue(
  issue: DetectedIssue & { useClassifier?: boolean }
): Promise<Ticket> {
  // 1. Create ticket — status: pending
  let ticket = createTicket(issue.title, issue.description);
  broadcast("ticket_created", { ticket });
  log("info", `Ticket created: ${ticket.id} — ${issue.title}`);

  // 2. Classify — use AI classifier or suggested tier
  let tier = issue.suggestedTier;
  let category = issue.category;
  let confidence = 1.0;
  let reasoning = "Known issue pattern detected by config monitor";

  if (issue.useClassifier) {
    try {
      const domain = issue.category === "code_defect" ? "code_defect" as const : "it_support" as const;
      log("info", `Classifying "${issue.title}" via AI classifier (domain: ${domain})...`);
      const classification = await classifyIssue(issue.title, issue.description, { domain });
      tier = classification.tier;
      category = classification.category;
      confidence = classification.confidence;
      reasoning = classification.reasoning;
      log("info", `Classified as ${tier} (${category}, confidence ${confidence})`);
    } catch (err: any) {
      log("warn", `Classifier failed, using suggested tier ${tier}: ${err.message}`);
    }
  }

  ticket = updateTicket(ticket.id, {
    tier,
    category,
    confidence,
    classificationReasoning: reasoning,
    status: "pending",
  });
  broadcast("ticket_updated", { ticket });

  // 3. Route based on tier
  try {
    if (tier === "L3") {
      return await handleL3(ticket, issue);
    } else if (tier === "L1") {
      return await handleL1(ticket, issue);
    } else {
      return await handleL2(ticket, issue);
    }
  } catch (err: any) {
    log("error", `Error processing ${ticket.id}: ${err.message}`);
    ticket = updateTicket(ticket.id, {
      status: "failed",
      agentOutput: {
        problem: issue.description,
        solution: `Processing failed with error: ${err.message}`,
        rawAgentOutput: "",
        steps: [],
      },
    });
    broadcast("ticket_updated", { ticket });
    return ticket;
  }
}

// ─── L1 Handler ─────────────────────────────────────────

async function handleL1(ticket: Ticket, issue: DetectedIssue): Promise<Ticket> {
  log("info", `[L1] Agent starting on: ${ticket.title}`);

  const intakeClassificationTier = ticket.tier;

  const result = await runL1Agent(
    issue.title,
    issue.description,
    issue.category,
    (step) => broadcast("agent_step", { ticketId: ticket.id, ...step })
  );

  const fixed = await issue.verify(readConfig());

  let reportSummary = "";
  try {
    const report = await generateIncidentReport({
      ticketId: ticket.id,
      title: issue.title,
      description: issue.description,
      tier: fixed ? "L1" : "L3",
      category: issue.category,
      confidence: ticket.confidence ?? 1,
      steps: result.steps,
      resolutionStatus: fixed ? result.status : "ESCALATED",
      finalOutput: result.finalOutput,
    });
    reportSummary = report.actionsTaken;
  } catch {
    reportSummary = result.finalOutput;
  }

  if (!fixed) {
    log("warn", `[L1] Fix failed for ${ticket.id}, reclassifying as L3`);
    ticket = updateTicket(ticket.id, {
      tier: "L3",
      agentOutput: {
        problem: issue.description,
        solution: reportSummary,
        rawAgentOutput: result.finalOutput,
        steps: result.steps,
      },
    });
    broadcast("ticket_updated", { ticket });
    return await handleL3(
      ticket,
      issue,
      buildPriorAgentContext(
        "L1",
        intakeClassificationTier,
        result.steps,
        result.finalOutput,
        reportSummary
      )
    );
  }

  ticket = updateTicket(ticket.id, {
    status: "resolved",
    resolvedAt: new Date().toISOString(),
    agentOutput: {
      problem: issue.description,
      solution: reportSummary,
      rawAgentOutput: result.finalOutput,
      steps: result.steps,
    },
  });
  broadcast("ticket_updated", { ticket });
  log("success", `[L1] ${ticket.id}: resolved`);
  return ticket;
}

// ─── L2 Handler ─────────────────────────────────────────

async function handleL2(ticket: Ticket, issue: DetectedIssue): Promise<Ticket> {
  log("info", `[L2] Agent starting on: ${ticket.title}`);

  const intakeClassificationTier = ticket.tier;

  const result = await runL2Agent(
    issue.title,
    issue.description,
    issue.category,
    (step) => broadcast("agent_step", { ticketId: ticket.id, ...step })
  );

  // If L2 agent escalates, promote to L3
  if (result.status === "ESCALATE") {
    log("warn", `[L2] Agent escalated ${ticket.id} to L3`);
    let reportSummary = "";
    try {
      const report = await generateIncidentReport({
        ticketId: ticket.id,
        title: issue.title,
        description: issue.description,
        tier: "L3",
        category: issue.category,
        confidence: ticket.confidence ?? 1,
        steps: result.steps,
        resolutionStatus: "ESCALATED",
        finalOutput: result.finalOutput,
      });
      reportSummary = report.actionsTaken;
    } catch {
      reportSummary = result.finalOutput;
    }
    ticket = updateTicket(ticket.id, { tier: "L3" });
    return await handleL3(
      ticket,
      issue,
      buildPriorAgentContext(
        "L2",
        intakeClassificationTier,
        result.steps,
        result.finalOutput,
        reportSummary
      )
    );
  }

  const fixed = await issue.verify(readConfig());

  let reportSummary = "";
  try {
    const report = await generateIncidentReport({
      ticketId: ticket.id,
      title: issue.title,
      description: issue.description,
      tier: fixed ? "L2" : "L3",
      category: issue.category,
      confidence: ticket.confidence ?? 1,
      steps: result.steps,
      resolutionStatus: fixed ? result.status : "ESCALATED",
      finalOutput: result.finalOutput,
    });
    reportSummary = report.actionsTaken;
  } catch {
    reportSummary = result.finalOutput;
  }

  if (!fixed) {
    log("warn", `[L2] Fix failed for ${ticket.id}, reclassifying as L3`);
    ticket = updateTicket(ticket.id, {
      tier: "L3",
      agentOutput: {
        problem: issue.description,
        solution: reportSummary,
        rawAgentOutput: result.finalOutput,
        steps: result.steps,
      },
    });
    broadcast("ticket_updated", { ticket });
    return await handleL3(
      ticket,
      issue,
      buildPriorAgentContext(
        "L2",
        intakeClassificationTier,
        result.steps,
        result.finalOutput,
        reportSummary
      )
    );
  }

  ticket = updateTicket(ticket.id, {
    status: "resolved",
    resolvedAt: new Date().toISOString(),
    agentOutput: {
      problem: issue.description,
      solution: reportSummary,
      rawAgentOutput: result.finalOutput,
      steps: result.steps,
    },
  });
  broadcast("ticket_updated", { ticket });
  log("success", `[L2] ${ticket.id}: resolved`);
  return ticket;
}

// ─── L3 Handler (Escalation — needs human review) ───────

async function handleL3(
  ticket: Ticket,
  issue: DetectedIssue,
  priorAgent?: PriorAgentContext
): Promise<Ticket> {
  log("info", `[L3] Escalating to human review: ${ticket.title}`);

  let escalation;
  try {
    escalation = await runEscalationHandler(
      issue.title,
      issue.description,
      issue.category,
      priorAgent
    );
  } catch {
    escalation = {
      summary: issue.title,
      whyBeyondScope: "Issue complexity exceeds automation capabilities.",
      suggestedActions: [
        "Convene incident response team",
        "Review system logs and recent changes",
        "Notify stakeholders",
      ],
      urgencyLevel: "critical" as const,
      estimatedImpact: "Requires immediate human assessment",
    };
  }

  const { steps: _omitSteps, ...priorForJson } = priorAgent ?? {};
  const rawAgentPayload = priorAgent
    ? { escalation, priorAgent: priorForJson }
    : { escalation };

  ticket = updateTicket(ticket.id, {
    tier: "L3",
    status: "needs_human_review",
    agentOutput: {
      problem: escalation.summary,
      solution: `HUMAN REVIEW REQUIRED — ${escalation.whyBeyondScope}\n\nSuggested actions:\n${escalation.suggestedActions.map((a, i) => `${i + 1}. ${a}`).join("\n")}`,
      rawAgentOutput: JSON.stringify(rawAgentPayload, null, 2),
      steps: priorAgent?.steps ?? [],
      rootCause: escalation.whyBeyondScope,
      recommendedFollowUp: escalation.suggestedActions.join("\n"),
    },
  });

  broadcast("ticket_updated", { ticket });
  log("warn", `[L3] ${ticket.id}: needs_human_review`);
  return ticket;
}

// ─── Worker-Logic Defect Detection ──────────────────────

function readWorkerLogic(): string | null {
  try {
    return fs.readFileSync(WORKER_LOGIC_PATH, "utf-8");
  } catch {
    return null;
  }
}

let lastWorkerHash = "";

function workerHash(source: string): string {
  let h = 0;
  for (let i = 0; i < source.length; i++) {
    h = ((h << 5) - h + source.charCodeAt(i)) | 0;
  }
  return String(h);
}

async function checkWorkerLogic(): Promise<DetectedIssue[]> {
  const source = readWorkerLogic();
  if (!source) return [];

  const hash = workerHash(source);
  if (hash === lastWorkerHash) return [];
  lastWorkerHash = hash;

  const detection = await detectDefect(source);
  if (detection.healthy) return [];

  const catalogMatch = matchKnownBugLabel(source, bugs);

  const title = catalogMatch
    ? `Code defect: ${catalogMatch.name}`
    : `Code defect in worker-logic.ts (${detection.validation.summary})`;

  const description = catalogMatch
    ? buildCatalogDefectDescription(catalogMatch)
    : buildUnknownDefectDescription(detection.validation, source);

  const suggestedTier: "L1" | "L2" | "L3" = catalogMatch?.tier ?? "L2";

  return [{
    title,
    description,
    category: "code_defect",
    suggestedTier,
    verify: async () => {
      const currentSource = readWorkerLogic();
      if (!currentSource) return false;
      if (catalogMatch) return !currentSource.includes(catalogMatch.buggyLine);
      const recheck = await runValidationSuite(currentSource);
      return recheck.passed;
    },
  }];
}

// ─── Reset to Starting Position ─────────────────────────

function resetToStartingPosition() {
  if (pristineConfig) {
    writeConfig(pristineConfig);
    lastConfigHash = configHash(pristineConfig);
    broadcast("config_updated", { config: pristineConfig });
    log("info", "Config reset to starting position");
  }

  const workerSnap = readWorkerPristineSnapshot();
  if (workerSnap) {
    fs.writeFileSync(WORKER_LOGIC_PATH, workerSnap, "utf-8");
    pristineWorkerSource = workerSnap;
    lastWorkerHash = "";
    broadcast("code_updated", { source: workerSnap });
    log("info", "Worker-logic code reset to starting position");
  }

  clearAllTickets();
  broadcast("pipeline_complete", {
    tickets: getAllTickets(),
    config: readConfig(),
    workerSource: readWorkerLogic(),
  });
  log("info", "All tickets cleared — system reset complete");
}

// ─── Monitoring Loop ────────────────────────────────────

let processing = false;
let paused = false;
let lastConfigHash = "";

function configHash(config: any): string {
  return JSON.stringify(config);
}

async function checkAndProcess() {
  if (processing || paused) return;

  let config: any;
  try {
    config = readConfig();
  } catch {
    log("error", "Failed to read config.json");
    return;
  }

  const hash = configHash(config);
  const configChanged = hash !== lastConfigHash;
  lastConfigHash = hash;

  const configIssues = detectIssues(config);

  let codeIssues: DetectedIssue[] = [];
  try {
    codeIssues = await checkWorkerLogic();
  } catch (err: any) {
    log("warn", `Worker-logic check failed: ${err.message}`);
  }

  const allIssues = [...configIssues, ...codeIssues];
  const newIssues = allIssues.filter((i) => !hasActiveTicketForIssue(i.title));

  const workerSource = readWorkerLogic();
  broadcast("config_snapshot", { config });
  if (workerSource) broadcast("code_snapshot", { source: workerSource });

  if (newIssues.length === 0) {
    broadcast("check", {
      healthy: true,
      issueCount: 0,
      configChanged,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  processing = true;
  broadcast("check", {
    healthy: false,
    issueCount: newIssues.length,
    configChanged,
    timestamp: new Date().toISOString(),
  });
  log("status", `Detected ${newIssues.length} new issue(s) — starting pipeline`);

  let haltedByL3 = false;

  for (const issue of newIssues) {
    const ticket = issue.category === "code_defect"
      ? await processIssue({ ...issue, useClassifier: true })
      : await processIssue(issue);

    if (issue.category === "code_defect" && ticket.status !== "resolved") {
      lastWorkerHash = "";
    }

    if (ticket.tier === "L3" && ticket.status !== "resolved") {
      log("warn", `Unresolved L3 detected (${ticket.id}) — monitoring paused. Use "Reset System" to restore and resume.`);
      paused = true;
      broadcast("monitoring_paused", { reason: "L3 escalation", ticketId: ticket.id });
      haltedByL3 = true;
      break;
    }
  }

  if (!haltedByL3) {
    broadcast("pipeline_complete", {
      tickets: getAllTickets(),
      config: readConfig(),
      workerSource: readWorkerLogic(),
    });
    log("success", "Pipeline run complete");
  }
  processing = false;
}

// ─── Helpers ────────────────────────────────────────────

function log(type: string, message: string) {
  const ts = new Date().toISOString();
  const prefix = { success: "✓", error: "✗", warn: "⚠", info: "→", status: "●" }[type] || "·";
  console.log(`  ${prefix} [${ts.slice(11, 19)}] ${message}`);
  broadcast("log", { type, message, timestamp: ts });
}

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

  // ── Dashboard ─────────────────────────────────────────

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

  // ── Config API ────────────────────────────────────────

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

  // ── Tickets API ───────────────────────────────────────

  if (req.method === "GET" && url === "/api/tickets") {
    return json(res, 200, getAllTickets());
  }

  if (req.method === "GET" && url === "/api/tickets/l3") {
    return json(res, 200, getTicketsByTier("L3"));
  }

  // Submit an ad-hoc ticket (uses the AI classifier)
  if (req.method === "POST" && url === "/api/tickets") {
    if (processing)
      return json(res, 409, { error: "Pipeline is already running" });

    try {
      const body = JSON.parse(await parseBody(req));
      const { title, description } = body;
      if (!title || !description) {
        return json(res, 400, { error: "title and description are required" });
      }

      processing = true;
      const ticket = await processIssue({
        title,
        description,
        category: "manual_submission",
        suggestedTier: "L2",
        useClassifier: true,
        verify: () => true,
      });
      processing = false;
      return json(res, 201, ticket);
    } catch (err: any) {
      processing = false;
      return json(res, 500, { error: err.message });
    }
  }

  // ── Worker Code API ─────────────────────────────────────

  if (req.method === "GET" && url === "/api/code") {
    try {
      const source = fs.readFileSync(WORKER_LOGIC_PATH, "utf-8");
      return json(res, 200, { source });
    } catch (err: any) {
      return json(res, 500, { error: err.message });
    }
  }

  if (req.method === "PUT" && url === "/api/code") {
    try {
      const body = JSON.parse(await parseBody(req));
      const { source } = body;
      if (!source) return json(res, 400, { error: "source is required" });
      fs.writeFileSync(WORKER_LOGIC_PATH, source, "utf-8");
      lastWorkerHash = "";
      broadcast("code_updated", { source });
      return json(res, 200, { ok: true });
    } catch (err: any) {
      return json(res, 400, { error: err.message });
    }
  }

  if (req.method === "POST" && url === "/api/code/reset") {
    try {
      const snap = readWorkerPristineSnapshot();
      if (snap) {
        fs.writeFileSync(WORKER_LOGIC_PATH, snap, "utf-8");
        pristineWorkerSource = snap;
        lastWorkerHash = "";
        broadcast("code_updated", { source: snap });
        return json(res, 200, {
          ok: true,
          restored: 0,
          pristine: true,
          source: snap,
        });
      }
      let restored = 0;
      for (const bug of bugs) {
        if (fixBug(bug)) restored++;
      }
      const source = fs.readFileSync(WORKER_LOGIC_PATH, "utf-8");
      lastWorkerHash = "";
      broadcast("code_updated", { source });
      return json(res, 200, { ok: true, restored, pristine: false, source });
    } catch (err: any) {
      return json(res, 500, { error: err.message });
    }
  }

  if (req.method === "GET" && url === "/api/worker-logs") {
    try {
      const content = fs.existsSync(WORKER_LOG_PATH)
        ? fs.readFileSync(WORKER_LOG_PATH, "utf-8")
        : "";
      const lines = content.split("\n").filter(Boolean).slice(-50);
      return json(res, 200, { logs: lines });
    } catch (err: any) {
      return json(res, 500, { error: err.message });
    }
  }

  // ── Trigger manual check ──────────────────────────────

  if (req.method === "POST" && url === "/api/check") {
    if (processing)
      return json(res, 409, { error: "Pipeline is already running" });
    checkAndProcess();
    return json(res, 200, { ok: true });
  }

  // ── Reset system to starting position ─────────────────

  if (req.method === "POST" && url === "/api/reset") {
    resetToStartingPosition();
    paused = false;
    broadcast("monitoring_resumed", {});
    return json(res, 200, { ok: true });
  }

  // ── SSE ───────────────────────────────────────────────

  if (req.method === "GET" && url === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const workerSrc = readWorkerLogic();
    res.write(`event: connected\ndata: ${JSON.stringify({ tickets: getAllTickets(), workerSource: workerSrc })}\n\n`);
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

// ─── Boot ───────────────────────────────────────────────

server.listen(PORT, () => {
  console.log("");
  console.log("  Catapult Automation — Config + Code Monitor + Ticket Pipeline");
  console.log("  ─────────────────────────────────────────────────────────────");
  console.log(`  Dashboard:  http://localhost:${PORT}`);
  console.log(`  API:        http://localhost:${PORT}/api/tickets`);
  console.log(`  Code:       http://localhost:${PORT}/api/code`);
  console.log(`  Events:     http://localhost:${PORT}/api/events`);
  console.log(`  Interval:   every ${CHECK_INTERVAL_MS / 1000}s`);
  console.log("");
});

try {
  lastConfigHash = configHash(readConfig());
} catch {
  /* will be caught on first check */
}

setTimeout(checkAndProcess, 3000);
setInterval(checkAndProcess, CHECK_INTERVAL_MS);
