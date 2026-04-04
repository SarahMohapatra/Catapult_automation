import "dotenv/config";
import { processTicket } from "../backend/agent/pipeline";

const SAMPLE_TICKET = {
  title: "Employee locked out of account",
  description:
    "New hire Sarah Chen (sarah.chen@company.com) reports she cannot log in to her account. " +
    "She has tried resetting her password via the self-service portal but it says her account is locked. " +
    "She needs access restored ASAP to complete onboarding.",
};

async function main() {
  console.log("=".repeat(60));
  console.log("  NeuralOps Pipeline — Test Run");
  console.log("=".repeat(60));
  console.log();
  console.log(`Ticket: "${SAMPLE_TICKET.title}"`);
  console.log(`Description: ${SAMPLE_TICKET.description}`);
  console.log();

  const ticket = await processTicket(
    SAMPLE_TICKET.title,
    SAMPLE_TICKET.description,
    (updated) => {
      console.log(`  [${updated.status.toUpperCase()}]`, updated.tier ?? "", updated.category ?? "");
      if (updated.steps.length > 0) {
        const latest = updated.steps[updated.steps.length - 1];
        console.log(`    → ${latest.type}: ${latest.content.slice(0, 120)}`);
      }
    }
  );

  console.log();
  console.log("=".repeat(60));
  console.log("  RESULT");
  console.log("=".repeat(60));
  console.log();
  console.log(`Ticket ID:    ${ticket.id}`);
  console.log(`Status:       ${ticket.status}`);
  console.log(`Tier:         ${ticket.tier}`);
  console.log(`Category:     ${ticket.category}`);
  console.log(`Confidence:   ${ticket.confidence}`);
  console.log(`Resolution:   ${ticket.resolutionStatus}`);
  console.log();
  console.log("--- Final Output ---");
  console.log(ticket.finalOutput);
  console.log();

  if (ticket.incidentReport) {
    console.log("--- Incident Report ---");
    console.log(`  Root Cause:  ${ticket.incidentReport.rootCauseHypothesis}`);
    console.log(`  Actions:     ${ticket.incidentReport.actionsTaken}`);
    console.log(`  Follow-up:   ${ticket.incidentReport.recommendedFollowUp}`);
    console.log(`  Tools Used:  ${ticket.incidentReport.toolsUsed.join(", ")}`);
  }

  if (ticket.escalationReport) {
    console.log("--- Escalation Report ---");
    console.log(`  Summary:     ${ticket.escalationReport.summary}`);
    console.log(`  Why:         ${ticket.escalationReport.whyBeyondScope}`);
    console.log(`  Urgency:     ${ticket.escalationReport.urgencyLevel}`);
    console.log(`  Actions:     ${ticket.escalationReport.suggestedActions.join("; ")}`);
  }

  console.log();
  console.log(`Created:  ${ticket.createdAt}`);
  console.log(`Resolved: ${ticket.resolvedAt}`);
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
