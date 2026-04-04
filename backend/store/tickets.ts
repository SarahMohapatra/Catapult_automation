import { IncidentReport } from "../agent/documenter";
import { EscalationReport } from "../agent/escalation";
import { AgentStep } from "../agent/l1-agent";

export type TicketStatus =
  | "pending"
  | "classifying"
  | "resolving"
  | "resolved"
  | "escalated"
  | "failed";

export interface Ticket {
  id: string;
  title: string;
  description: string;
  tier: "L1" | "L2" | "L3" | null;
  category: string | null;
  confidence: number | null;
  classificationReasoning: string | null;
  status: TicketStatus;
  steps: AgentStep[];
  resolutionStatus: string | null;
  finalOutput: string | null;
  incidentReport: IncidentReport | null;
  escalationReport: EscalationReport | null;
  createdAt: string;
  resolvedAt: string | null;
}

const ticketStore = new Map<string, Ticket>();

export function createTicket(title: string, description: string): Ticket {
  const id = `TKT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const ticket: Ticket = {
    id,
    title,
    description,
    tier: null,
    category: null,
    confidence: null,
    classificationReasoning: null,
    status: "pending",
    steps: [],
    resolutionStatus: null,
    finalOutput: null,
    incidentReport: null,
    escalationReport: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  ticketStore.set(id, ticket);
  return ticket;
}

export function updateTicket(id: string, updates: Partial<Ticket>): Ticket {
  const ticket = ticketStore.get(id);
  if (!ticket) throw new Error(`Ticket ${id} not found`);
  const updated = { ...ticket, ...updates };
  ticketStore.set(id, updated);
  return updated;
}

export function getTicket(id: string): Ticket | undefined {
  return ticketStore.get(id);
}

export function getAllTickets(): Ticket[] {
  return Array.from(ticketStore.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}