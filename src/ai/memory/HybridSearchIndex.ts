/**
 * Hybrid Search Index
 * BM25 implementation with optional vector search for "deep" mode
 */

import {
  SearchOptions,
  SearchResult,
  SearchIndexEntry,
  BM25Params,
  DEFAULT_BM25_PARAMS,
  DailyHealthLog,
  HealthPattern,
  HealthProfile,
} from './types';

export interface HybridSearchIndexConfig {
  bm25Params: BM25Params;
  deepSearchEnabled: boolean;
  embeddingModel?: string;
  embeddingDimensions?: number;
}

interface TokenizedDocument {
  id: string;
  tokens: string[];
  termFreq: Map<string, number>;
  length: number;
}

export class HybridSearchIndex {
  private config: HybridSearchIndexConfig;
  private documents: Map<string, TokenizedDocument> = new Map();
  private documentFrequency: Map<string, number> = new Map();
  private totalDocumentLength = 0;
  private avgDocumentLength = 0;
  private embeddingCache: Map<string, number[]> = new Map();

  constructor(config: Partial<HybridSearchIndexConfig> = {}) {
    this.config = {
      bm25Params: DEFAULT_BM25_PARAMS,
      deepSearchEnabled: false,
      embeddingDimensions: 384,
      ...config,
    };
  }

  /**
   * Tokenize text into terms
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
      .map(t => this.stem(t));
  }

  /**
   * Simple Porter Stemmer implementation
   */
  private stem(word: string): string {
    // Simplified stemming - remove common suffixes
    const suffixes = ['ing', 'ed', 'er', 'est', 'ly', 'tion', 's'];
    for (const suffix of suffixes) {
      if (word.endsWith(suffix) && word.length > suffix.length + 2) {
        return word.slice(0, -suffix.length);
      }
    }
    return word;
  }

  /**
   * Index a daily log
   */
  indexDailyLog(log: DailyHealthLog): void {
    const text = this.logToText(log);
    this.addDocument(log.id, text, {
      type: 'daily_log',
      date: log.date,
      userId: log.userId,
    });
  }

  /**
   * Index a health pattern
   */
  indexPattern(pattern: HealthPattern): void {
    const text = `${pattern.description} ${pattern.evidence.join(' ')} ${pattern.relatedMetrics.join(' ')}`;
    this.addDocument(pattern.id, text, {
      type: 'pattern',
      patternType: pattern.type,
      confidence: pattern.confidence,
    });
  }

  /**
   * Index health profile insights
   */
  indexProfile(profile: HealthProfile): void {
    // Index goals
    profile.goals.forEach(goal => {
      const text = `${goal.description} ${goal.category}`;
      this.addDocument(`goal:${goal.id}`, text, {
        type: 'goal',
        category: goal.category,
        status: goal.status,
      });
    });

    // Index correlations
    profile.correlations.forEach(corr => {
      const text = `${corr.explanation} ${corr.metricA} ${corr.metricB}`;
      this.addDocument(`correlation:${corr.id}`, text, {
        type: 'insight',
        insightType: 'correlation',
        confidence: corr.confidence,
      });
    });
  }

  /**
   * Convert a daily log to searchable text
   */
  private logToText(log: DailyHealthLog): string {
    const parts: string[] = [];

    if (log.summary) {
      parts.push(log.summary.overview);
      parts.push(...log.summary.insights);
      parts.push(...log.summary.recommendations);
    }

    if (log.sleep) {
      parts.push(`sleep ${log.sleep.quality} ${log.sleep.durationMinutes} minutes`);
      parts.push(log.sleep.notes || '');
    }

    if (log.activity) {
      parts.push(`activity ${log.activity.steps} steps ${log.activity.activeMinutes} minutes`);
      log.activity.workouts?.forEach(w => {
        parts.push(`workout ${w.type} ${w.intensity} ${w.notes || ''}`);
      });
    }

    if (log.meals) {
      log.meals.forEach(meal => {
        parts.push(`meal ${meal.type}`);
        meal.foods.forEach(f => parts.push(f.name));
        parts.push(meal.notes || '');
      });
    }

    if (log.moods) {
      log.moods.forEach(m => {
        parts.push(`mood level ${m.level} ${m.emotions.join(' ')}`);
        parts.push(m.context || '');
        parts.push(m.notes || '');
      });
    }

    return parts.filter(p => p.trim()).join(' ');
  }

  /**
   * Add a document to the index
   */
  private addDocument(id: string, text: string, metadata: Record<string, unknown>): void {
    const tokens = this.tokenize(text);
    const termFreq = new Map<string, number>();

    // Count term frequencies
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }

    // Update document frequency
    for (const term of termFreq.keys()) {
      this.documentFrequency.set(term, (this.documentFrequency.get(term) || 0) + 1);
    }

    // Update total document length
    this.totalDocumentLength += tokens.length;
    this.avgDocumentLength = this.totalDocumentLength / (this.documents.size + 1);

    // Store document
    this.documents.set(id, {
      id,
      tokens,
      termFreq,
      length: tokens.length,
    });

    // Generate embedding if deep search enabled
    if (this.config.deepSearchEnabled) {
      this.generateEmbedding(id, text);
    }
  }

  /**
   * Generate embedding for a document (simplified local implementation)
   * In production, this would use a proper embedding model
   */
  private generateEmbedding(id: string, text: string): void {
    // Simplified embedding using term frequency vector
    // In production, use a proper embedding model like all-MiniLM-L6-v2
    const vocab = Array.from(this.documentFrequency.keys()).slice(0, this.config.embeddingDimensions);
    const embedding = new Array(this.config.embeddingDimensions).fill(0);

    const tokens = this.tokenize(text);
    const termFreq = new Map<string, number>();
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }

    for (let i = 0; i < vocab.length; i++) {
      const term = vocab[i];
      const tf = termFreq.get(term) || 0;
      const idf = Math.log(
        (this.documents.size + 1) / ((this.documentFrequency.get(term) || 1) + 0.5)
      );
      embedding[i] = tf * idf;
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    const normalized = embedding.map(v => v / (magnitude || 1));

    this.embeddingCache.set(id, normalized);
  }

  /**
   * Calculate BM25 score for a query against a document
   */
  private calculateBM25(
    queryTokens: string[],
    doc: TokenizedDocument,
    avgDocLength: number
  ): number {
    const { k1, b } = this.config.bm25Params;
    let score = 0;

    for (const term of queryTokens) {
      const tf = doc.termFreq.get(term) || 0;
      if (tf === 0) continue;

      const df = this.documentFrequency.get(term) || 1;
      const idf = Math.log((this.documents.size - df + 0.5) / (df + 0.5) + 1);

      const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (doc.length / avgDocLength)));

      score += idf * tfNorm;
    }

    return score;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  /**
   * Search the index
   */
  search(query: string, options: SearchOptions): SearchResult[] {
    const queryTokens = this.tokenize(query);
    const results: SearchResult[] = [];

    // BM25 scoring for all documents
    const bm25Scores = new Map<string, number>();
    for (const [id, doc] of this.documents) {
      const score = this.calculateBM25(queryTokens, doc, this.avgDocumentLength || 1);
      if (score > 0) {
        bm25Scores.set(id, score);
      }
    }

    // Deep search: combine with vector similarity
    if (options.mode === 'deep' && this.config.deepSearchEnabled) {
      const queryEmbedding = this.computeQueryEmbedding(queryTokens);

      for (const [id, bm25Score] of bm25Scores) {
        const docEmbedding = this.embeddingCache.get(id);
        if (docEmbedding) {
          const vectorScore = this.cosineSimilarity(queryEmbedding, docEmbedding);
          // Combine scores: 70% BM25, 30% vector
          const combinedScore = 0.7 * (bm25Score / Math.max(...bm25Scores.values() || [1])) + 0.3 * vectorScore;
          bm25Scores.set(id, combinedScore);
        }
      }
    }

    // Sort by score and apply limit
    const sortedResults = Array.from(bm25Scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, options.limit || 10);

    // Build result objects
    for (const [id, score] of sortedResults) {
      const doc = this.documents.get(id);
      if (!doc) continue;

      // Generate highlights
      const highlights = this.generateHighlights(queryTokens, doc);

      results.push({
        id,
        type: 'daily_log',
        score,
        content: doc.tokens.slice(0, 50).join(' '), // Preview
        highlights,
        metadata: {}, // Would include actual metadata from document storage
      });
    }

    return results;
  }

  /**
   * Compute query embedding for deep search
   */
  private computeQueryEmbedding(tokens: string[]): number[] {
    const vocab = Array.from(this.documentFrequency.keys()).slice(0, this.config.embeddingDimensions);
    const embedding = new Array(this.config.embeddingDimensions).fill(0);

    const termFreq = new Map<string, number>();
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }

    for (let i = 0; i < vocab.length; i++) {
      const term = vocab[i];
      const tf = termFreq.get(term) || 0;
      embedding[i] = tf;
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    return embedding.map(v => v / (magnitude || 1));
  }

  /**
   * Generate highlight snippets matching query terms
   */
  private generateHighlights(queryTokens: string[], doc: TokenizedDocument): string[] {
    const highlights: string[] = [];
    const tokens = doc.tokens;

    for (let i = 0; i < tokens.length; i++) {
      if (queryTokens.includes(tokens[i])) {
        // Extract context around match
        const start = Math.max(0, i - 5);
        const end = Math.min(tokens.length, i + 6);
        const snippet = tokens.slice(start, end).join(' ');
        if (!highlights.includes(snippet)) {
          highlights.push(snippet);
        }
      }
    }

    return highlights.slice(0, 3); // Top 3 highlights
  }

  /**
   * Remove a document from the index
   */
  removeDocument(id: string): void {
    const doc = this.documents.get(id);
    if (!doc) return;

    // Update document frequencies
    for (const term of doc.termFreq.keys()) {
      const df = this.documentFrequency.get(term);
      if (df) {
        if (df <= 1) {
          this.documentFrequency.delete(term);
        } else {
          this.documentFrequency.set(term, df - 1);
        }
      }
    }

    // Update totals
    this.totalDocumentLength -= doc.length;
    this.documents.delete(id);
    this.embeddingCache.delete(id);

    // Recalculate average
    if (this.documents.size > 0) {
      this.avgDocumentLength = this.totalDocumentLength / this.documents.size;
    } else {
      this.avgDocumentLength = 0;
    }
  }

  /**
   * Clear the entire index
   */
  clear(): void {
    this.documents.clear();
    this.documentFrequency.clear();
    this.embeddingCache.clear();
    this.totalDocumentLength = 0;
    this.avgDocumentLength = 0;
  }

  /**
   * Get index statistics
   */
  getStats(): {
    documentCount: number;
    vocabularySize: number;
    avgDocumentLength: number;
    embeddingCacheSize: number;
  } {
    return {
      documentCount: this.documents.size,
      vocabularySize: this.documentFrequency.size,
      avgDocumentLength: this.avgDocumentLength,
      embeddingCacheSize: this.embeddingCache.size,
    };
  }

  /**
   * Export index to JSON (for persistence)
   */
  export(): SearchIndexEntry[] {
    return Array.from(this.documents.values()).map(doc => ({
      id: doc.id,
      document: doc.tokens.join(' '),
      tokens: doc.tokens,
      termFrequencies: Object.fromEntries(doc.termFreq),
      documentLength: doc.length,
      metadata: {},
      vector: this.embeddingCache.get(doc.id),
    }));
  }

  /**
   * Import index from JSON
   */
  import(entries: SearchIndexEntry[]): void {
    this.clear();

    for (const entry of entries) {
      const termFreq = new Map(Object.entries(entry.termFrequencies));

      this.documents.set(entry.id, {
        id: entry.id,
        tokens: entry.tokens,
        termFreq,
        length: entry.documentLength,
      });

      // Update frequencies
      for (const term of termFreq.keys()) {
        this.documentFrequency.set(
          term,
          (this.documentFrequency.get(term) || 0) + 1
        );
      }

      this.totalDocumentLength += entry.documentLength;

      if (entry.vector) {
        this.embeddingCache.set(entry.id, entry.vector);
      }
    }

    this.avgDocumentLength = this.documents.size > 0
      ? this.totalDocumentLength / this.documents.size
      : 0;
  }
}
