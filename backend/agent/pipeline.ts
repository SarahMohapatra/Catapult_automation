import { classifyIssue } from "./classifier";
import { runL1Agent } from "./l1-agent";
import { runL2Agent } from "./l2-agent";
import { runEscalationHandler } from "./escalation";
import { generateIncidentReport } from "./documenter";
import { createTicket, updateTicket, Ticket } from "../store/tickets";
import { AgentStep } from "./l1-agent";

export async function processTicket(
  title: string,
  description: string,
  onUpdate?: (ticket: Ticket) => void
): Promise<Ticket> {
  let ticket = createTicket(title, description);
  const notify = () => onUpdate && onUpdate(ticket);

  ticket = updateTicket(ticket.id, { status: "classifying" });
  notify();

  const classification = await classifyIssue(title, description);

  ticket = updateTicket(ticket.id, {
    tier: classification.tier,
    category: classification.category,
    confidence: classification.confidence,
    classificationReasoning: classification.reasoning,
    status: "resolving",
  });
  notify();

  const allSteps: AgentStep[] = [];
  let resolutionStatus = "UNRESOLVED";
  let finalOutput = "";
  let escalationReport = null;

  if (classification.tier === "L1") {
    const result = await runL1Agent(
      title,
      description,
      classification.category,
      (step) => {
        allSteps.push(step);
        ticket = updateTicket(ticket.id, { steps: [...allSteps] });
        notify();
      }
    );
    resolutionStatus = result.status;
    finalOutput = result.finalOutput;
  } else if (classification.tier === "L2") {
    const result = await runL2Agent(
      title,
      description,
      classification.category,
      (step) => {
        allSteps.push(step);
        ticket = updateTicket(ticket.id, { steps: [...allSteps] });
        notify();
      }
    );
    resolutionStatus = result.status;
    finalOutput = result.finalOutput;
  } else {
    const report = await runEscalationHandler(
      title,
      description,
      classification.category
    );
    escalationReport = report;
    resolutionStatus = "ESCALATED";
    finalOutput = report.summary;
  }

  const incidentReport = await generateIncidentReport({
    ticketId: ticket.id,
    title,
    description,
    tier: classification.tier,
    category: classification.category,
    confidence: classification.confidence,
    steps: allSteps,
    resolutionStatus,
    finalOutput,
  });

  ticket = updateTicket(ticket.id, {
    status:
      resolutionStatus === "ESCALATED" ||
      resolutionStatus === "ESCALATE"
        ? "escalated"
        : "resolved",
    steps: allSteps,
    resolutionStatus,
    finalOutput,
    incidentReport,
    escalationReport,
    resolvedAt: new Date().toISOString(),
  });
  notify();

  return ticket;
}