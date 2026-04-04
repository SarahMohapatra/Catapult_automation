import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { fastModel } from "./model";
import {
  CLASSIFIER_SYSTEM_PROMPT,
  CLASSIFIER_HUMAN_TEMPLATE,
  CODE_DEFECT_CLASSIFIER_SYSTEM_PROMPT,
} from "../prompts/classifier-prompt";

export type Tier = "L1" | "L2" | "L3";

export type ClassifierDomain = "it_support" | "code_defect";

export interface ClassificationResult {
  tier: Tier;
  category: string;
  confidence: number;
  reasoning: string;
}

function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  if (fenced) return fenced[1];

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return raw.slice(start, end + 1);
  }
  return null;
}

export async function classifyIssue(
  title: string,
  description: string,
  options?: { domain?: ClassifierDomain }
): Promise<ClassificationResult> {
  const domain = options?.domain ?? "it_support";
  const systemPrompt =
    domain === "code_defect"
      ? CODE_DEFECT_CLASSIFIER_SYSTEM_PROMPT
      : CLASSIFIER_SYSTEM_PROMPT;

  const humanMessage = CLASSIFIER_HUMAN_TEMPLATE.replace(
    "{title}",
    title
  ).replace("{description}", description);

  const response = await fastModel.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(humanMessage),
  ]);

  const rawText = response.content as string;

  const jsonStr = extractJsonObject(rawText);
  if (!jsonStr) {
    throw new Error(`Classifier returned non-JSON response: ${rawText}`);
  }

  const result = JSON.parse(jsonStr) as ClassificationResult;

  if (!["L1", "L2", "L3"].includes(result.tier)) {
    throw new Error(`Invalid tier in classifier response: ${result.tier}`);
  }

  return result;
}