import { ChatOpenAI } from "@langchain/openai";

export const fastModel = new ChatOpenAI({
  model: "gpt-4o-mini",
  apiKey: process.env.OPENAI_API_KEY,
  maxTokens: 1024,
  temperature: 0,
});

export const smartModel = new ChatOpenAI({
  model: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
  maxTokens: 4096,
  temperature: 0,
});