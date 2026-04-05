import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { smartModel } from "./model";
import { AgentStep } from "./l1-agent";

export interface IncidentReport {
  ticketId: string;
  issueSummary: string;
  tier: string;
  category: string;
  classificationConfidence: number;
  toolsUsed: string[];
  stepsCount: number;
  resolutionStatus: string;
  rootCauseHypothesis: string;
  actionsTaken: string;
  recommendedFollowUp: string;
  generatedAt: string;
}

const DOC_SYSTEM_PROMPT = `
You are an IT documentation specialist. Generate a concise incident report based on the resolution data provided.
If Tier is L3 or Resolution Status is ESCALATED, reflect that the issue was escalated to humans and align rootCauseHypothesis with the evidence (e.g. empty file vs single typo) when the steps or final output support it.
Respond ONLY with valid JSON matching this shape:
{
  "rootCauseHypothesis": "string - your best assessment of why this issue occurred",
  "actionsTaken": "string - 2-3 sentences summarizing what was done",
  "recommendedFollowUp": "string - one concrete recommendation to prevent recurrence"
}
`;

export async function generateIncidentReport(params: {
  ticketId: string;
  title: string;
  description: string;
  tier: string;
  category: string;
  confidence: number;
  steps: AgentStep[];
  resolutionStatus: string;
  finalOutput: string;
}): Promise<IncidentReport> {
  const toolsUsed = [
    ...new Set(
      params.steps
        .filter((s) => s.type === "tool_call" && s.toolName)
        .map((s) => s.toolName!)
    ),
  ];

  const stepsText = params.steps
    .map((s) => `[${s.type.toUpperCase()}] ${s.content}`)
    .join("\n");

  const response = await smartModel.invoke([
    new SystemMessage(DOC_SYSTEM_PROMPT),
    new HumanMessage(`
Issue: ${params.title}
Description: ${params.description}
Tier: ${params.tier} | Category: ${params.category}
Resolution Status: ${params.resolutionStatus}
Agent Steps:
${stepsText}
Final Output: ${params.finalOutput}
    `),
  ]);

  const rawText = response.content as string;
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  const docData = jsonMatch
    ? JSON.parse(jsonMatch[0])
    : {
        rootCauseHypothesis: "Under investigation",
        actionsTaken: params.finalOutput,
        recommendedFollowUp: "Review and monitor",
      };

  return {
    ticketId: params.ticketId,
    issueSummary: params.title,
    tier: params.tier,
    category: params.category,
    classificationConfidence: params.confidence,
    toolsUsed,
    stepsCount: params.steps.length,
    resolutionStatus: params.resolutionStatus,
    rootCauseHypothesis: docData.rootCauseHypothesis,
    actionsTaken: docData.actionsTaken,
    recommendedFollowUp: docData.recommendedFollowUp,
    generatedAt: new Date().toISOString(),
  };
}