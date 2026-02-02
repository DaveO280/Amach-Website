/**
 * Cosaint AI Service
 * Enhanced with memory enrichment
 */

import type { MemorySystem, MemoryEnrichmentContext, EnrichedResponse } from '../ai/memory';
import { searchMemory } from '../ai/memory';

export interface CosaintAiConfig {
  memoryEnabled: boolean;
  defaultSearchLimit: number;
  responseTimeoutMs: number;
}

export class CosaintAiService {
  private config: CosaintAiConfig;
  private memory: MemorySystem | null = null;

  constructor(config: Partial<CosaintAiConfig> = {}) {
    this.config = {
      memoryEnabled: true,
      defaultSearchLimit: 5,
      responseTimeoutMs: 30000,
      ...config,
    };
  }

  /**
   * Attach memory system for enriched responses
   */
  attachMemory(memory: MemorySystem): void {
    this.memory = memory;
  }

  /**
   * Generate AI response with memory context
   */
  async generateResponse(
    userId: string,
    query: string,
    options?: { useMemory?: boolean; deepSearch?: boolean }
  ): Promise<EnrichedResponse> {
    const useMemory = options?.useMemory ?? this.config.memoryEnabled;
    
    if (!useMemory || !this.memory) {
      // Standard response without memory
      return {
        response: await this.callBaseModel(query),
        sources: [],
        confidence: 1.0,
        suggestedFollowups: [],
      };
    }

    // Build memory context
    const context = await this.buildMemoryContext(userId, query);
    
    // Search relevant memories
    const searchResults = searchMemory(this.memory, query, {
      mode: options?.deepSearch ? 'deep' : 'standard',
      limit: this.config.defaultSearchLimit,
    });

    // Enrich prompt with context
    const enrichedPrompt = this.enrichPrompt(query, context, searchResults);
    
    // Generate response
    const response = await this.callBaseModel(enrichedPrompt);

    return {
      response,
      sources: searchResults,
      confidence: this.calculateConfidence(searchResults),
      suggestedFollowups: this.generateFollowups(query, searchResults),
    };
  }

  /**
   * Build memory context for the user
   */
  private async buildMemoryContext(
    userId: string,
    query: string
  ): Promise<MemoryEnrichmentContext> {
    if (!this.memory) throw new Error('Memory not attached');

    const profile = await this.memory.profiles.getOrCreateProfile(userId);
    
    // Get recent logs (last 7 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    
    const recentLogs = await this.memory.logs.getLogsForRange(
      userId,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );

    // Get relevant patterns
    const relevantPatterns = profile.patterns
      .filter(p => this.isPatternRelevant(p, query))
      .slice(0, 3);

    return {
      userId,
      currentQuery: query,
      recentLogs,
      profile,
      relevantPatterns,
      timeframe: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    };
  }

  /**
   * Check if a pattern is relevant to the query
   */
  private isPatternRelevant(pattern: { type: string; description: string }, query: string): boolean {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const patternText = `${pattern.type} ${pattern.description}`.toLowerCase();
    return queryTerms.some(term => patternText.includes(term));
  }

  /**
   * Enrich the prompt with memory context
   */
  private enrichPrompt(
    query: string,
    context: MemoryEnrichmentContext,
    searchResults: { id: string; content: string; score: number }[]
  ): string {
    const parts: string[] = [];

    // Add user context
    if (context.profile.wellnessPersona) {
      parts.push(`User wellness persona: ${context.profile.wellnessPersona.archetype}`);
      parts.push(`Communication style: ${context.profile.wellnessPersona.communicationStyle}`);
    }

    // Add recent context summary
    if (context.recentLogs.length > 0) {
      parts.push(`\nRecent health data (${context.recentLogs.length} days):`);
      context.recentLogs.slice(-3).forEach(log => {
        if (log.summary) {
          parts.push(`- ${log.date}: ${log.summary.overview}`);
        }
      });
    }

    // Add relevant patterns
    if (context.relevantPatterns.length > 0) {
      parts.push(`\nRelevant patterns:`);
      context.relevantPatterns.forEach(p => {
        parts.push(`- ${p.description}`);
      });
    }

    // Add search results
    if (searchResults.length > 0) {
      parts.push(`\nRelevant historical entries:`);
      searchResults.slice(0, 3).forEach(r => {
        parts.push(`- ${r.content.substring(0, 100)}...`);
      });
    }

    parts.push(`\nUser query: ${query}`);
    parts.push(`\nProvide a personalized, context-aware response.`);

    return parts.join('\n');
  }

  /**
   * Calculate confidence based on search results
   */
  private calculateConfidence(
    results: { score: number }[]
  ): number {
    if (results.length === 0) return 0.5;
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    return Math.min(1, Math.max(0.3, avgScore));
  }

  /**
   * Generate follow-up suggestions
   */
  private generateFollowups(
    query: string,
    results: { type: string }[]
  ): string[] {
    const followups: string[] = [];
    
    if (query.includes('sleep')) {
      followups.push('How does my sleep compare to last month?');
      followups.push('What affects my sleep quality?');
    }
    
    if (query.includes('activity') || query.includes('steps')) {
      followups.push('Show my weekly activity trends');
      followups.push('When am I most active?');
    }
    
    if (results.some(r => r.type === 'pattern')) {
      followups.push('What patterns have you noticed?');
    }

    return followups.slice(0, 3);
  }

  /**
   * Call base AI model (placeholder)
   */
  private async callBaseModel(prompt: string): Promise<string> {
    // This would integrate with your actual AI service
    // For now, return a placeholder
    return `[AI response based on: ${prompt.substring(0, 50)}...]`;
  }

  /**
   * Health-specific query helper
   */
  async queryHealth(
    userId: string,
    metric: 'sleep' | 'activity' | 'nutrition' | 'mood',
    timeframe: 'day' | 'week' | 'month'
  ): Promise<EnrichedResponse> {
    const query = `Show my ${metric} for the last ${timeframe}`;
    return this.generateResponse(userId, query, { deepSearch: timeframe === 'month' });
  }

  /**
   * Get insights with memory context
   */
  async getInsights(userId: string): Promise<EnrichedResponse> {
    const query = 'What insights can you provide about my health?';
    return this.generateResponse(userId, query, { useMemory: true, deepSearch: true });
  }
}

// Singleton instance
let instance: CosaintAiService | null = null;

export function getCosaintAiService(): CosaintAiService {
  if (!instance) {
    instance = new CosaintAiService();
  }
  return instance;
}
