export type TicketTier = "L1" | "L2" | "L3";

export type TicketStatus =
  | "received"
  | "classified"
  | "in_progress"
  | "resolved"
  | "escalated"
  | "failed";

export type TicketCategory =
  | "password_reset"
  | "account_unlock"
  | "vpn_issue"
  | "access_request"
  | "software_install"
  | "service_outage"
  | "api_error"
  | "performance_issue"
  | "deployment_failure"
  | "database_issue"
  | "security_incident"
  | "data_loss"
  | "unknown";

export type AuditEventType =
  | "ticket_received"
  | "classified"
  | "tool_called"
  | "tool_result"
  | "agent_reasoning"
  | "resolved"
  | "escalated"
  | "report_generated";

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface ClassificationResult {
  tier: TicketTier;
  category: TicketCategory;
  confidence: number;
  reasoning: string;
}

export interface ResolutionResult {
  success: boolean;
  summary: string;
  actionsTaken: string[];
  nextSteps?: string[];
}

export interface EscalationReport {
  summary: string;
  reason: string;
  suggestedActions: string[];
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  classification?: ClassificationResult;
  resolution?: ResolutionResult;
  escalationReport?: EscalationReport;
  auditLog: AuditEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketInput {
  title: string;
  description: string;
}

export interface TicketResponse {
  success: boolean;
  ticket: Ticket;
}