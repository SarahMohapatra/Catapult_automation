import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { smartModel } from "./model";
import type { AgentStep } from "./l1-agent";

export interface EscalationReport {
  summary: string;
  whyBeyondScope: string;
  suggestedActions: string[];
  urgencyLevel: "high" | "critical";
  estimatedImpact: string;
}

/** Context from L1/L2 when automation failed and the ticket is promoted to L3. */
export interface PriorAgentContext {
  priorTier: "L1" | "L2";
  /** Tier from initial classification (before L3 reclassification). */
  intakeClassificationTier: string;
  finalOutput: string;
  stepsSummary: string;
  incidentReportSummary?: string;
  /** Preserved for the ticket UI; not sent as duplicate text to the model beyond stepsSummary. */
  steps?: AgentStep[];
}

const ESCALATION_SYSTEM_PROMPT = `
You are a senior IT incident analyst. An automated system has determined this issue is beyond L1/L2 automation scope and requires human intervention.

Your job is to:
1. Summarize the issue clearly for a senior engineer.
2. Explain exactly why this cannot be auto-resolved.
3. Provide 3 concrete, actionable steps a human engineer should take immediately.
4. Assess urgency and estimated impact.

When "Prior automated agent context" is included in the user message, ground your summary and root-cause wording in that evidence. Do not reduce an empty file, deleted module body, or unloadable module to "a minor syntax typo" if the evidence shows structural failure or missing source.

Respond ONLY with valid JSON matching this exact shape:
{
  "summary": "string - 2 sentence max summary of the issue",
  "whyBeyondScope": "string - one sentence explaining why automation cannot handle this",
  "suggestedActions": ["string", "string", "string"],
  "urgencyLevel": "high" | "critical",
  "estimatedImpact": "string - who/what is affected and how severely"
}
`;

export async function runEscalationHandler(
  title: string,
  description: string,
  category: string,
  priorAgent?: PriorAgentContext
): Promise<EscalationReport> {
  const priorBlock = priorAgent
    ? `

Prior automated agent (before human escalation):
- Agent tier: ${priorAgent.priorTier}
- Intake classification tier: ${priorAgent.intakeClassificationTier}
${priorAgent.incidentReportSummary ? `- Pre-escalation incident summary:\n${priorAgent.incidentReportSummary}\n` : ""}
- Final agent message:
${priorAgent.finalOutput}

Prior agent steps (tool traces):
${priorAgent.stepsSummary}
`
    : "";

  const response = await smartModel.invoke([
    new SystemMessage(ESCALATION_SYSTEM_PROMPT),
    new HumanMessage(
      `Issue Title: ${title}\nCategory: ${category}\nDescription: ${description}${priorBlock}`
    ),
  ]);

  const rawText = response.content as string;
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return {
      summary: title,
      whyBeyondScope:
        "Issue complexity exceeds automation capabilities and requires human expertise.",
      suggestedActions: [
        "Convene incident response team immediately",
        "Review system logs and recent changes",
        "Notify stakeholders and assess business impact",
      ],
      urgencyLevel: "critical",
      estimatedImpact: "Requires immediate human assessment",
    };
  }

  return JSON.parse(jsonMatch[0]) as EscalationReport;
}
