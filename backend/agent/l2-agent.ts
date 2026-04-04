import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
import { smartModel } from "./model";
import { l2Tools } from "../tools/l2-tools";
import { L2_SYSTEM_PROMPT } from "../prompts/l2-system-prompt";
import { AgentStep } from "./l1-agent";

export interface L2ResolutionResult {
  status: "RESOLVED" | "PARTIALLY_RESOLVED" | "ESCALATE";
  steps: AgentStep[];
  finalOutput: string;
  rootCause?: string;
}

export async function runL2Agent(
  title: string,
  description: string,
  category: string,
  onStep?: (step: AgentStep) => void
): Promise<L2ResolutionResult> {
  const steps: AgentStep[] = [];

  const addStep = (step: AgentStep) => {
    steps.push(step);
    if (onStep) onStep(step);
  };

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", L2_SYSTEM_PROMPT],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  const agent = createToolCallingAgent({
    llm: smartModel,
    tools: l2Tools,
    prompt,
  });

  const executor = new AgentExecutor({
    agent,
    tools: l2Tools,
    maxIterations: 6,
    returnIntermediateSteps: true,
    verbose: false,
  });

  const input = `
Issue Title: ${title}
Issue Category: ${category}
Issue Description: ${description}

Diagnose this issue, identify the root cause, and apply the appropriate fix.
Remember to gather information before acting. End with a clear status: RESOLVED, PARTIALLY RESOLVED, or ESCALATE.
`;

  addStep({
    type: "thinking",
    content: `Starting L2 diagnosis for: "${title}" — Category: ${category}. Beginning with information gathering.`,
    timestamp: new Date().toISOString(),
  });

  const result = await executor.invoke({ input });

  if (result.intermediateSteps) {
    for (const step of result.intermediateSteps) {
      const action = step.action;
      const observation = step.observation;

      addStep({
        type: "tool_call",
        toolName: action.tool,
        content: `Calling ${action.tool} with: ${JSON.stringify(action.toolInput)}`,
        timestamp: new Date().toISOString(),
      });

      addStep({
        type: "tool_result",
        toolName: action.tool,
        content: typeof observation === "string" ? observation : JSON.stringify(observation),
        timestamp: new Date().toISOString(),
      });
    }
  }

  addStep({
    type: "complete",
    content: result.output,
    timestamp: new Date().toISOString(),
  });

  const outputLower = result.output.toLowerCase();
  let status: L2ResolutionResult["status"] = "RESOLVED";
  if (outputLower.includes("escalate")) status = "ESCALATE";
  else if (outputLower.includes("partially")) status = "PARTIALLY_RESOLVED";

  return {
    status,
    steps,
    finalOutput: result.output,
  };
}