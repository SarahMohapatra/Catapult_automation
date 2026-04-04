// Adding the missing type definitions directly to the file
export type TicketStatus =
  | "pending"
  | "received"
  | "classified"
  | "in_progress"
  | "resolving"
  | "resolved"
  | "escalated"
  | "failed";

export interface ClassificationResult {
  category: string;
  confidence: number;
  reasoning: string;
}

export interface ResolutionResult {
  success: boolean;
  output: string;
}

export interface EscalationReport {
  reason: string;
  timestamp: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  classification?: ClassificationResult;
  resolution?: ResolutionResult;
  escalationReport?: EscalationReport;
  auditLog: Array<{
    id: string;
    type: string;
    message: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketInput {
  title: string;
  description: string;
}

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
  // Sort by newest first just like the top half was trying to do!
  return Array.from(tickets.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
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
}