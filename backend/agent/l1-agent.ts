import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
import { smartModel } from "./model";
import { l1Tools } from "../tools/l1-tools";
import { L1_SYSTEM_PROMPT } from "../prompts/l1-system-prompt";
import { filesystemTools } from "../tools/file-system-tools";

const allL1Tools = [...l1Tools, ...filesystemTools];

export interface AgentStep {
  type: "thinking" | "tool_call" | "tool_result" | "complete";
  content: string;
  toolName?: string;
  timestamp: string;
}

export interface L1ResolutionResult {
  status: "RESOLVED" | "UNRESOLVED";
  steps: AgentStep[];
  finalOutput: string;
}

export async function runL1Agent(
  title: string,
  description: string,
  category: string,
  onStep?: (step: AgentStep) => void
): Promise<L1ResolutionResult> {
  const steps: AgentStep[] = [];

  const addStep = (step: AgentStep) => {
    steps.push(step);
    if (onStep) onStep(step);
  };

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", L1_SYSTEM_PROMPT],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  const agent = createToolCallingAgent({
    llm: smartModel,
    tools: allL1Tools,
    prompt,
  });

  const executor = new AgentExecutor({
    agent,
    tools: allL1Tools,
    maxIterations: 12,
    returnIntermediateSteps: true,
    verbose: false,
  });

  const input = `
Issue Title: ${title}
Issue Category: ${category}
Issue Description: ${description}

Resolve this issue completely using the tools available to you.
`;

  addStep({
    type: "thinking",
    content: `Analyzing issue: "${title}" — Category: ${category}`,
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

  return {
    status: "RESOLVED",
    steps,
    finalOutput: result.output,
  };
}