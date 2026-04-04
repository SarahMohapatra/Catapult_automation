<<<<<<< HEAD
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
=======
import {
  Ticket,
  CreateTicketInput,
  TicketStatus,
  ClassificationResult,
  ResolutionResult,
  EscalationReport,
} from "../types/ticket";

const globalForTickets = globalThis as typeof globalThis & {
  ticketsStore?: Map<string, Ticket>;
};

const tickets = globalForTickets.ticketsStore ?? new Map<string, Ticket>();

if (!globalForTickets.ticketsStore) {
  globalForTickets.ticketsStore = tickets;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export function createTicket(input: CreateTicketInput): Ticket {
  const now = new Date().toISOString();

  const ticket: Ticket = {
    id: generateId(),
    title: input.title,
    description: input.description,
    status: "received",
    auditLog: [
      {
        id: generateId(),
        type: "ticket_received",
        message: "Ticket received by NeuralOps",
        timestamp: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  tickets.set(ticket.id, ticket);
  return ticket;
}

export function getTicketById(id: string): Ticket | undefined {
  return tickets.get(id);
}

export function getAllTickets(): Ticket[] {
  return Array.from(tickets.values());
}

export function updateTicket(
  id: string,
  updates: Partial<Ticket>
): Ticket | undefined {
  const existingTicket = tickets.get(id);

  if (!existingTicket) {
    return undefined;
  }

  const updatedTicket: Ticket = {
    ...existingTicket,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  tickets.set(id, updatedTicket);
  return updatedTicket;
}

export function addAuditEvent(
  id: string,
  event: Ticket["auditLog"][number]
): Ticket | undefined {
  const existingTicket = tickets.get(id);

  if (!existingTicket) {
    return undefined;
  }

  const updatedTicket: Ticket = {
    ...existingTicket,
    auditLog: [...existingTicket.auditLog, event],
    updatedAt: new Date().toISOString(),
  };

  tickets.set(id, updatedTicket);
  return updatedTicket;
}

export function updateTicketStatus(
  id: string,
  status: TicketStatus
): Ticket | undefined {
  const existingTicket = tickets.get(id);

  if (!existingTicket) {
    return undefined;
  }

  const updatedTicket: Ticket = {
    ...existingTicket,
    status,
    updatedAt: new Date().toISOString(),
  };

  tickets.set(id, updatedTicket);
  return updatedTicket;
}

export function setTicketClassification(
  id: string,
  classification: ClassificationResult
): Ticket | undefined {
  const existingTicket = tickets.get(id);

  if (!existingTicket) {
    return undefined;
  }

  const updatedTicket: Ticket = {
    ...existingTicket,
    classification,
    status: "classified",
    updatedAt: new Date().toISOString(),
  };

  tickets.set(id, updatedTicket);
  return updatedTicket;
}

export function setTicketResolution(
  id: string,
  resolution: ResolutionResult
): Ticket | undefined {
  const existingTicket = tickets.get(id);

  if (!existingTicket) {
    return undefined;
  }

  const updatedTicket: Ticket = {
    ...existingTicket,
    resolution,
    status: resolution.success ? "resolved" : "failed",
    updatedAt: new Date().toISOString(),
  };

  tickets.set(id, updatedTicket);
  return updatedTicket;
}

export function setEscalationReport(
  id: string,
  escalationReport: EscalationReport
): Ticket | undefined {
  const existingTicket = tickets.get(id);

  if (!existingTicket) {
    return undefined;
  }

  const updatedTicket: Ticket = {
    ...existingTicket,
    escalationReport,
    status: "escalated",
    updatedAt: new Date().toISOString(),
  };

  tickets.set(id, updatedTicket);
  return updatedTicket;
>>>>>>> sidshukla-backend-api
}