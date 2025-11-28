/**
 * OpenRouter Client
 * Unified interface for chat completions and embeddings via OpenRouter API
 */

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { getAISetting, saveAISetting } from "./database";

// OpenRouter API base URL
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Default headers for OpenRouter
const OPENROUTER_HEADERS = {
  'HTTP-Referer': 'https://bettermonitor.app',
  'X-Title': 'Better Monitor',
};

// Available models on OpenRouter (verified from API - Nov 2024)
// Note: Some free models don't support system messages, Mistral does
export const CHAT_MODELS = [
  { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 24B (Free)', free: true },
  { id: 'qwen/qwen3-4b:free', name: 'Qwen 3 4B (Free)', free: true },
  { id: 'google/gemma-3-4b-it:free', name: 'Gemma 3 4B (Free, no system msg)', free: true },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', free: false },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', free: false },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', free: false },
];

export const EMBEDDING_MODELS = [
  { id: 'openai/text-embedding-3-small', name: 'OpenAI Embedding Small', dimensions: 1536 },
  { id: 'openai/text-embedding-3-large', name: 'OpenAI Embedding Large', dimensions: 3072 },
];

export interface AISettings {
  apiKey: string;
  chatModel: string;
  embeddingModel: string;
  temperature: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

/**
 * Get current AI settings from database
 */
export function getAISettings(): AISettings {
  return {
    apiKey: getAISetting('openrouter_api_key') || '',
    chatModel: getAISetting('chat_model') || 'mistralai/mistral-small-3.1-24b-instruct:free',
    embeddingModel: getAISetting('embedding_model') || 'openai/text-embedding-3-small',
    temperature: parseFloat(getAISetting('temperature') || '0.3'),
  };
}

/**
 * Save AI settings to database
 */
export function saveAISettings(settings: Partial<AISettings>): void {
  if (settings.apiKey !== undefined) {
    saveAISetting('openrouter_api_key', settings.apiKey);
  }
  if (settings.chatModel !== undefined) {
    saveAISetting('chat_model', settings.chatModel);
  }
  if (settings.embeddingModel !== undefined) {
    saveAISetting('embedding_model', settings.embeddingModel);
  }
  if (settings.temperature !== undefined) {
    saveAISetting('temperature', String(settings.temperature));
  }
}

/**
 * Create a LangChain ChatOpenAI instance configured for OpenRouter
 */
export function createChatModel(settings?: Partial<AISettings>): ChatOpenAI {
  const config = { ...getAISettings(), ...settings };
  
  if (!config.apiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  return new ChatOpenAI({
    model: config.chatModel,
    temperature: config.temperature,
    apiKey: config.apiKey,
    streaming: true,
    configuration: {
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: OPENROUTER_HEADERS,
    }
  });
}

/**
 * Get embeddings for an array of texts using OpenRouter
 */
export async function getEmbeddings(texts: string[], settings?: Partial<AISettings>): Promise<number[][]> {
  const config = { ...getAISettings(), ...settings };
  
  if (!config.apiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  if (texts.length === 0) {
    return [];
  }

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        ...OPENROUTER_HEADERS,
      },
      body: JSON.stringify({
        model: config.embeddingModel,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.data.map((item: { embedding: number[] }) => item.embedding);
  } catch (error) {
    console.error('Failed to get embeddings:', error);
    throw error;
  }
}

/**
 * Get a single embedding for a text
 */
export async function getEmbedding(text: string, settings?: Partial<AISettings>): Promise<number[]> {
  const embeddings = await getEmbeddings([text], settings);
  return embeddings[0];
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }
  
  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);
  
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }
  
  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Simple chat completion (non-streaming)
 */
export async function chatComplete(
  messages: ChatMessage[],
  settings?: Partial<AISettings>
): Promise<string> {
  const model = createChatModel(settings);
  
  const langchainMessages: BaseMessage[] = messages.map(msg => {
    switch (msg.role) {
      case 'system':
        return new SystemMessage(msg.content);
      case 'user':
        return new HumanMessage(msg.content);
      case 'assistant':
        return new AIMessage(msg.content);
      default:
        return new HumanMessage(msg.content);
    }
  });
  
  const response = await model.invoke(langchainMessages);
  return response.content as string;
}

/**
 * Streaming chat completion - returns an async generator
 */
export async function* chatStream(
  messages: ChatMessage[],
  settings?: Partial<AISettings>
): AsyncGenerator<string, void, unknown> {
  const model = createChatModel(settings);
  
  const langchainMessages: BaseMessage[] = messages.map(msg => {
    switch (msg.role) {
      case 'system':
        return new SystemMessage(msg.content);
      case 'user':
        return new HumanMessage(msg.content);
      case 'assistant':
        return new AIMessage(msg.content);
      default:
        return new HumanMessage(msg.content);
    }
  });
  
  const stream = await model.stream(langchainMessages);
  
  for await (const chunk of stream) {
    if (typeof chunk.content === 'string') {
      yield chunk.content;
    }
  }
}

/**
 * Test API connection
 */
export async function testConnection(apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...OPENROUTER_HEADERS,
      },
    });
    
    if (response.ok) {
      return { success: true };
    } else {
      const error = await response.text();
      return { success: false, error: `API error: ${response.status} - ${error}` };
    }
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

