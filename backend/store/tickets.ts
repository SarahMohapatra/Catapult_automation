import * as fs from "fs";
import * as path from "path";
import { AgentStep } from "../agent/l1-agent";

export type TicketStatus =
  | "pending"
  | "in_progress"
  | "resolved"
  | "failed"
  | "needs_human_review";

export interface AgentOutput {
  problem: string;
  solution: string;
  rawAgentOutput: string;
  steps: AgentStep[];
  rootCause?: string;
  recommendedFollowUp?: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  tier: "L1" | "L2" | "L3" | null;
  category: string | null;
  confidence: number | null;
  classificationReasoning: string | null;
  status: TicketStatus;
  agentOutput: AgentOutput | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

const TICKETS_DIR = path.join(process.cwd(), "demo");
const ALL_TICKETS_FILE = path.join(TICKETS_DIR, "tickets.json");
const L3_TICKETS_FILE = path.join(TICKETS_DIR, "l3-tickets.json");

const tickets = new Map<string, Ticket>();

function ensureDir() {
  if (!fs.existsSync(TICKETS_DIR)) fs.mkdirSync(TICKETS_DIR, { recursive: true });
}

function loadTickets(): void {
  ensureDir();
  try {
    if (fs.existsSync(ALL_TICKETS_FILE)) {
      const data: Ticket[] = JSON.parse(fs.readFileSync(ALL_TICKETS_FILE, "utf-8"));
      for (const t of data) tickets.set(t.id, t);
    }
  } catch {
    /* start fresh if corrupt */
  }
}

function persist(): void {
  ensureDir();
  const all = Array.from(tickets.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  fs.writeFileSync(ALL_TICKETS_FILE, JSON.stringify(all, null, 2));

  const l3 = all.filter((t) => t.tier === "L3");
  fs.writeFileSync(L3_TICKETS_FILE, JSON.stringify(l3, null, 2));
}

// ── CRUD ──────────────────────────────────────────────

export function createTicket(title: string, description: string): Ticket {
  const id = `TKT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const now = new Date().toISOString();
  const ticket: Ticket = {
    id,
    title,
    description,
    tier: null,
    category: null,
    confidence: null,
    classificationReasoning: null,
    status: "pending",
    agentOutput: null,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  };
  tickets.set(id, ticket);
  persist();
  return ticket;
}

export function updateTicket(id: string, updates: Partial<Ticket>): Ticket {
  const ticket = tickets.get(id);
  if (!ticket) throw new Error(`Ticket ${id} not found`);
  const updated: Ticket = { ...ticket, ...updates, updatedAt: new Date().toISOString() };
  tickets.set(id, updated);
  persist();
  return updated;
}

export function getTicket(id: string): Ticket | undefined {
  return tickets.get(id);
}

export function getAllTickets(): Ticket[] {
  return Array.from(tickets.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// ── Queries ───────────────────────────────────────────

export function getTicketsByTier(tier: "L1" | "L2" | "L3"): Ticket[] {
  return getAllTickets().filter((t) => t.tier === tier);
}

export function getTicketsByStatus(status: TicketStatus): Ticket[] {
  return getAllTickets().filter((t) => t.status === status);
}

export function hasActiveTicketForIssue(title: string): boolean {
  return Array.from(tickets.values()).some(
    (t) => t.title === title && (t.status === "pending" || t.status === "in_progress")
  );
}

loadTickets();
