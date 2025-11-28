import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { getSetting, saveProcessAnalysis, getProcessAnalysis } from "./database";
import { ProcessAnalysis } from "../shared/types";

const AnalysisSchema = z.object({
  friendlyName: z.string().describe("A human-readable name for the process"),
  category: z.enum(['System', 'Development', 'Browser', 'Communication', 'Media', 'Suspicious', 'Other'])
    .describe("The category of the process"),
  description: z.string().describe("A concise, non-technical explanation of what this process does"),
  riskLevel: z.enum(['Safe', 'Caution', 'High']).describe("The security risk level"),
});

export async function analyzeProcess(name: string, command: string): Promise<ProcessAnalysis | null> {
  // 1. Check Cache
  const cached = getProcessAnalysis(name, command);
  if (cached) return cached;

  // 2. Check API Key
  const apiKey = getSetting('openai_api_key');
  if (!apiKey) {
    return null; // Frontend will handle "Missing Key" state
  }

  try {
    const model = new ChatOpenAI({
      openAIApiKey: apiKey,
      modelName: "gpt-4o-mini",
      temperature: 0,
    });

    const structuredLlm = model.withStructuredOutput(AnalysisSchema);

    const result = await structuredLlm.invoke(
      `Analyze this macOS process:
       Name: "${name}"
       Command: "${command}"
       
       Provide a friendly name, category, description, and risk level.
       If it is a developer tool (node, python, vite), mark as Development.`
    );

    const analysis: ProcessAnalysis = {
      friendlyName: result.friendlyName,
      category: result.category as any, // Cast to match strict union
      description: result.description,
      riskLevel: result.riskLevel as any,
    };

    // 3. Save to Cache
    saveProcessAnalysis(name, command, analysis);

    return analysis;
  } catch (error) {
    console.error("AI Analysis Failed:", error);
    return null;
  }
}



