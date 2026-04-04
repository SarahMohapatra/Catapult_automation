import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { smartModel } from "./model";

export interface EscalationReport {
  summary: string;
  whyBeyondScope: string;
  suggestedActions: string[];
  urgencyLevel: "high" | "critical";
  estimatedImpact: string;
}

const ESCALATION_SYSTEM_PROMPT = `
You are a senior IT incident analyst. An automated system has determined this issue is beyond L1/L2 automation scope and requires human intervention.

Your job is to:
1. Summarize the issue clearly for a senior engineer.
2. Explain exactly why this cannot be auto-resolved.
3. Provide 3 concrete, actionable steps a human engineer should take immediately.
4. Assess urgency and estimated impact.

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
  category: string
): Promise<EscalationReport> {
  const response = await smartModel.invoke([
    new SystemMessage(ESCALATION_SYSTEM_PROMPT),
    new HumanMessage(
      `Issue Title: ${title}\nCategory: ${category}\nDescription: ${description}`
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