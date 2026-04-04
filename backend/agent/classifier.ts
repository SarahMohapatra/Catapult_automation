import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { fastModel } from "./model";
import {
  CLASSIFIER_SYSTEM_PROMPT,
  CLASSIFIER_HUMAN_TEMPLATE,
} from "../prompts/classifier-prompt";

export type Tier = "L1" | "L2" | "L3";

export interface ClassificationResult {
  tier: Tier;
  category: string;
  confidence: number;
  reasoning: string;
}

export async function classifyIssue(
  title: string,
  description: string
): Promise<ClassificationResult> {
  const humanMessage = CLASSIFIER_HUMAN_TEMPLATE.replace(
    "{title}",
    title
  ).replace("{description}", description);

  const response = await fastModel.invoke([
    new SystemMessage(CLASSIFIER_SYSTEM_PROMPT),
    new HumanMessage(humanMessage),
  ]);

  const rawText = response.content as string;

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Classifier returned non-JSON response: ${rawText}`);
  }

  const result = JSON.parse(jsonMatch[0]) as ClassificationResult;

  if (!["L1", "L2", "L3"].includes(result.tier)) {
    throw new Error(`Invalid tier in classifier response: ${result.tier}`);
  }

  return result;
}