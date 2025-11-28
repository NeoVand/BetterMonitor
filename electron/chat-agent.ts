/**
 * Chat Agent with RAG capabilities
 * Uses LangGraph for agentic conversation with process context
 */

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { getAISettings, ChatMessage } from "./openrouter";
import { getSystemProcesses } from "./monitor";
import { getCurrentClusters } from "./clustering";
import { vectorStore } from "./vector-store";
import { getChatHistory, addChatMessage, clearChatHistory } from "./database";
import { SystemProcess, ProcessCluster } from "../shared/types";

// OpenRouter configuration
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_HEADERS = {
  'HTTP-Referer': 'https://bettermonitor.app',
  'X-Title': 'Better Monitor',
};

/**
 * Create the chat model configured for OpenRouter
 */
function createChatModel(): ChatOpenAI {
  const settings = getAISettings();
  
  if (!settings.apiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  return new ChatOpenAI({
    model: settings.chatModel,
    temperature: settings.temperature,
    apiKey: settings.apiKey,
    streaming: true,
    configuration: {
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: OPENROUTER_HEADERS,
    }
  });
}

/**
 * Generate system context with current process information
 */
async function getSystemContext(): Promise<string> {
  try {
    const { processes, global } = await getSystemProcesses();
    const clusters = getCurrentClusters();
    
    // Top processes by CPU
    const topCpu = [...processes]
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 5);
    
    // Top processes by memory
    const topMem = [...processes]
      .sort((a, b) => b.mem - a.mem)
      .slice(0, 5);
    
    // Format context
    let context = `## Current System State\n\n`;
    
    if (global) {
      context += `**System Resources:**\n`;
      context += `- Total Memory Used: ${(global.mem.used / 1024 / 1024 / 1024).toFixed(1)} GB\n`;
      context += `- Network: ↓${formatBytes(global.net.rx_sec)}/s ↑${formatBytes(global.net.tx_sec)}/s\n`;
      context += `- Active Connections: ${global.connections?.length || 0}\n\n`;
    }
    
    context += `**Top CPU Processes:**\n`;
    topCpu.forEach((p, i) => {
      context += `${i + 1}. ${p.name} (PID: ${p.pid}) - ${p.cpu.toFixed(1)}% CPU, ${p.mem.toFixed(0)} MB\n`;
    });
    
    context += `\n**Top Memory Processes:**\n`;
    topMem.forEach((p, i) => {
      context += `${i + 1}. ${p.name} (PID: ${p.pid}) - ${p.mem.toFixed(0)} MB, ${p.cpu.toFixed(1)}% CPU\n`;
    });
    
    if (clusters.length > 0) {
      context += `\n**Process Clusters (${clusters.length}):**\n`;
      clusters.slice(0, 5).forEach(c => {
        context += `- ${c.name} (${c.category}): ${c.aggregateStats.processCount} processes, ${c.aggregateStats.totalCpu.toFixed(1)}% CPU\n`;
      });
    }
    
    context += `\n**Total Processes:** ${processes.length}\n`;
    
    return context;
  } catch (error) {
    console.error('Failed to get system context:', error);
    return 'System context unavailable.';
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/**
 * Search for processes by name or description
 */
async function searchProcesses(query: string): Promise<SystemProcess[]> {
  const { processes } = await getSystemProcesses();
  
  const queryLower = query.toLowerCase();
  return processes.filter(p => 
    p.name.toLowerCase().includes(queryLower) ||
    p.command.toLowerCase().includes(queryLower)
  ).slice(0, 10);
}

/**
 * Get the system prompt for the chat agent
 */
function getSystemPrompt(context: string): string {
  return `You are an AI assistant for Better Monitor, a macOS process monitoring application.
You help users understand what processes are running on their system, identify resource-heavy processes,
and provide insights about system performance.

${context}

## Your Capabilities:
1. Explain what specific processes do and whether they're safe
2. Identify resource-heavy processes and suggest optimizations
3. Detect unusual patterns or suspicious activity
4. Help users understand process relationships and clusters
5. Answer questions about system performance

## Guidelines:
- Be concise but informative
- Use the provided system data to give accurate, real-time answers
- If you're unsure about something, say so
- When discussing processes, include relevant metrics (CPU, memory)
- Suggest actionable steps when appropriate
- If asked about a specific process, search for it in the current data

Respond naturally and helpfully.`;
}

/**
 * Process a chat message and generate a response
 */
export async function processChat(userMessage: string): Promise<string> {
  try {
    // Get current system context
    const context = await getSystemContext();
    
    // Get chat history
    const history = getChatHistory(10);
    
    // Build messages
    const messages: BaseMessage[] = [
      new SystemMessage(getSystemPrompt(context)),
    ];
    
    // Add history
    for (const msg of history) {
      if (msg.role === 'user') {
        messages.push(new HumanMessage(msg.content));
      } else if (msg.role === 'assistant') {
        messages.push(new AIMessage(msg.content));
      }
    }
    
    // Add current message
    messages.push(new HumanMessage(userMessage));
    
    // Create model and get response
    const model = createChatModel();
    const response = await model.invoke(messages);
    
    return response.content as string;
  } catch (error) {
    console.error('Chat processing error:', error);
    throw error;
  }
}

/**
 * Stream a chat response
 */
export async function* streamChat(userMessage: string): AsyncGenerator<string, void, unknown> {
  try {
    // Get current system context
    const context = await getSystemContext();
    
    // Get chat history
    const history = getChatHistory(10);
    
    // Build messages
    const messages: BaseMessage[] = [
      new SystemMessage(getSystemPrompt(context)),
    ];
    
    // Add history
    for (const msg of history) {
      if (msg.role === 'user') {
        messages.push(new HumanMessage(msg.content));
      } else if (msg.role === 'assistant') {
        messages.push(new AIMessage(msg.content));
      }
    }
    
    // Add current message
    messages.push(new HumanMessage(userMessage));
    
    // Create model and stream response
    const model = createChatModel();
    const stream = await model.stream(messages);
    
    for await (const chunk of stream) {
      if (typeof chunk.content === 'string') {
        yield chunk.content;
      }
    }
  } catch (error) {
    console.error('Chat streaming error:', error);
    throw error;
  }
}

/**
 * Get suggestions for what to ask
 */
export function getChatSuggestions(): string[] {
  return [
    "What's using the most CPU right now?",
    "Are there any suspicious processes running?",
    "Tell me about Chrome's resource usage",
    "Which processes are using the network?",
    "How can I reduce memory usage?",
    "What are the system processes doing?",
  ];
}

