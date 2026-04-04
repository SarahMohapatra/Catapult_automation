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

  ticket = updateTicket(ticket.id, { status: "in_progress" });
  notify();

  const classification = await classifyIssue(title, description);

  ticket = updateTicket(ticket.id, {
    tier: classification.tier,
    category: classification.category,
    confidence: classification.confidence,
    classificationReasoning: classification.reasoning,
  });
  notify();

  const allSteps: AgentStep[] = [];
  let resolutionStatus = "UNRESOLVED";
  let finalOutput = "";

  if (classification.tier === "L1") {
    const result = await runL1Agent(
      title,
      description,
      classification.category,
      (step) => {
        allSteps.push(step);
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
        notify();
      }
    );
    resolutionStatus = result.status;
    finalOutput = result.finalOutput;

    if (result.status === "ESCALATE") {
      resolutionStatus = "ESCALATED";
    }
  } else {
    const report = await runEscalationHandler(
      title,
      description,
      classification.category
    );
    resolutionStatus = "ESCALATED";
    finalOutput = report.summary;

    ticket = updateTicket(ticket.id, {
      status: "needs_human_review",
      agentOutput: {
        problem: report.summary,
        solution: `HUMAN REVIEW REQUIRED — ${report.whyBeyondScope}\n\nSuggested actions:\n${report.suggestedActions.map((a, i) => `${i + 1}. ${a}`).join("\n")}`,
        rawAgentOutput: JSON.stringify(report, null, 2),
        steps: allSteps,
        rootCause: report.whyBeyondScope,
        recommendedFollowUp: report.suggestedActions.join("\n"),
      },
    });
    notify();
    return ticket;
  }

  let reportSummary = finalOutput;
  try {
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
    reportSummary = incidentReport.actionsTaken;
  } catch {
    /* fall back to raw agent output */
  }

  const isEscalated =
    resolutionStatus === "ESCALATED" || resolutionStatus === "ESCALATE";

  ticket = updateTicket(ticket.id, {
    status: isEscalated ? "needs_human_review" : "resolved",
    tier: isEscalated ? "L3" : classification.tier,
    resolvedAt: isEscalated ? null : new Date().toISOString(),
    agentOutput: {
      problem: description,
      solution: reportSummary,
      rawAgentOutput: finalOutput,
      steps: allSteps,
    },
  });
  notify();

  return ticket;
}
