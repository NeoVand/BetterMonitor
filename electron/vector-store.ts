/**
 * In-Memory Vector Store
 * Manages process embeddings and provides similarity search
 */

import { SystemProcess } from '../shared/types';
import { getEmbedding, getEmbeddings, cosineSimilarity } from './openrouter';
import { getCachedEmbedding, cacheEmbedding } from './database';

export interface ProcessVector {
  pid: number;
  name: string;
  command: string;
  embedding: number[];
  text: string;
}

/**
 * Generate a text representation of a process for embedding
 */
export function processToText(process: SystemProcess): string {
  // Summarize the command (remove paths, keep meaningful parts)
  const commandSummary = summarizeCommand(process.command);
  return `${process.name}: ${commandSummary}`;
}

/**
 * Summarize a command string for embedding
 * Removes long paths and keeps meaningful identifiers
 */
function summarizeCommand(command: string): string {
  if (!command) return '';
  
  // Remove common path prefixes
  let summary = command
    .replace(/\/Applications\/[^\/]+\.app\/Contents\/MacOS\//g, '')
    .replace(/\/usr\/local\/bin\//g, '')
    .replace(/\/usr\/bin\//g, '')
    .replace(/\/opt\/homebrew\/bin\//g, '')
    .replace(/\/System\/Library\/[^\s]+/g, '[system]')
    .replace(/\/Library\/[^\s]+/g, '[library]')
    .replace(/\/Users\/[^\/]+\//g, '~/')
    .replace(/\/private\/var\/[^\s]+/g, '[var]');
  
  // Truncate if too long
  if (summary.length > 200) {
    summary = summary.slice(0, 200) + '...';
  }
  
  return summary;
}

/**
 * In-memory vector store for process embeddings
 */
export class ProcessVectorStore {
  private vectors: Map<string, ProcessVector> = new Map();
  private pendingEmbeddings: Map<string, Promise<number[]>> = new Map();

  /**
   * Get a unique key for a process
   */
  private getKey(process: SystemProcess): string {
    return `${process.name}::${process.command}`.slice(0, 500);
  }

  /**
   * Get embedding for a process, using cache if available
   */
  async getProcessEmbedding(process: SystemProcess): Promise<number[]> {
    const text = processToText(process);
    
    // Check in-memory cache first
    const key = this.getKey(process);
    const existing = this.vectors.get(key);
    if (existing) {
      return existing.embedding;
    }
    
    // Check if we're already fetching this embedding
    if (this.pendingEmbeddings.has(key)) {
      return this.pendingEmbeddings.get(key)!;
    }
    
    // Check database cache
    const cached = getCachedEmbedding(text);
    if (cached) {
      this.vectors.set(key, {
        pid: process.pid,
        name: process.name,
        command: process.command,
        embedding: cached,
        text,
      });
      return cached;
    }
    
    // Fetch new embedding
    const fetchPromise = (async () => {
      const embedding = await getEmbedding(text);
      
      // Cache in database
      cacheEmbedding(text, embedding);
      
      // Store in memory
      this.vectors.set(key, {
        pid: process.pid,
        name: process.name,
        command: process.command,
        embedding,
        text,
      });
      
      this.pendingEmbeddings.delete(key);
      return embedding;
    })();
    
    this.pendingEmbeddings.set(key, fetchPromise);
    return fetchPromise;
  }

  /**
   * Batch get embeddings for multiple processes
   * Optimizes by batching API calls for uncached embeddings
   */
  async batchGetEmbeddings(processes: SystemProcess[]): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>();
    const uncached: { process: SystemProcess; text: string; key: string }[] = [];
    
    // First pass: check caches
    for (const process of processes) {
      const key = this.getKey(process);
      const text = processToText(process);
      
      // Check in-memory
      const existing = this.vectors.get(key);
      if (existing) {
        result.set(key, existing.embedding);
        continue;
      }
      
      // Check database
      const cached = getCachedEmbedding(text);
      if (cached) {
        this.vectors.set(key, {
          pid: process.pid,
          name: process.name,
          command: process.command,
          embedding: cached,
          text,
        });
        result.set(key, cached);
        continue;
      }
      
      uncached.push({ process, text, key });
    }
    
    // Batch fetch uncached embeddings
    if (uncached.length > 0) {
      const texts = uncached.map(u => u.text);
      
      try {
        // Batch in groups of 50 to avoid API limits
        const batchSize = 50;
        for (let i = 0; i < texts.length; i += batchSize) {
          const batch = texts.slice(i, i + batchSize);
          const batchItems = uncached.slice(i, i + batchSize);
          
          const embeddings = await getEmbeddings(batch);
          
          for (let j = 0; j < embeddings.length; j++) {
            const { process, text, key } = batchItems[j];
            const embedding = embeddings[j];
            
            // Cache in database
            cacheEmbedding(text, embedding);
            
            // Store in memory
            this.vectors.set(key, {
              pid: process.pid,
              name: process.name,
              command: process.command,
              embedding,
              text,
            });
            
            result.set(key, embedding);
          }
        }
      } catch (error) {
        console.error('Failed to batch get embeddings:', error);
        // Return what we have so far
      }
    }
    
    return result;
  }

  /**
   * Find the most similar processes to a given embedding
   */
  findSimilar(embedding: number[], topK: number = 10): { vector: ProcessVector; similarity: number }[] {
    const results: { vector: ProcessVector; similarity: number }[] = [];
    
    for (const vector of this.vectors.values()) {
      const similarity = cosineSimilarity(embedding, vector.embedding);
      results.push({ vector, similarity });
    }
    
    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);
    
    return results.slice(0, topK);
  }

  /**
   * Find the nearest cluster centroid for an embedding
   */
  findNearestCentroid(
    embedding: number[], 
    centroids: { id: string; centroid: number[] }[]
  ): { id: string; similarity: number } | null {
    if (centroids.length === 0) return null;
    
    let best: { id: string; similarity: number } | null = null;
    
    for (const { id, centroid } of centroids) {
      const similarity = cosineSimilarity(embedding, centroid);
      if (!best || similarity > best.similarity) {
        best = { id, similarity };
      }
    }
    
    return best;
  }

  /**
   * Calculate the centroid (average) of multiple embeddings
   */
  static calculateCentroid(embeddings: number[][]): number[] {
    if (embeddings.length === 0) return [];
    
    const dim = embeddings[0].length;
    const centroid = new Array(dim).fill(0);
    
    for (const embedding of embeddings) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += embedding[i];
      }
    }
    
    for (let i = 0; i < dim; i++) {
      centroid[i] /= embeddings.length;
    }
    
    return centroid;
  }

  /**
   * Get all stored vectors
   */
  getAllVectors(): ProcessVector[] {
    return Array.from(this.vectors.values());
  }

  /**
   * Clear all vectors (useful for full recluster)
   */
  clear(): void {
    this.vectors.clear();
    this.pendingEmbeddings.clear();
  }

  /**
   * Remove a specific process from the store
   */
  remove(process: SystemProcess): void {
    const key = this.getKey(process);
    this.vectors.delete(key);
  }

  /**
   * Get the number of stored vectors
   */
  get size(): number {
    return this.vectors.size;
  }
}

// Singleton instance
export const vectorStore = new ProcessVectorStore();

