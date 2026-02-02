/**
 * BM25 Search Implementation
 * 
 * Lightweight BM25 (Best Match 25) text search algorithm.
 * No external dependencies - pure TypeScript implementation.
 * Used as the primary search method in standard mode.
 */

export interface BM25Document {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface BM25Config {
  k1: number; // Term frequency saturation (1.2-2.0, default 1.5)
  b: number; // Length normalization (0-1, default 0.75)
}

export interface BM25Index {
  documents: Map<string, BM25Document>;
  tokenizedDocs: Map<string, string[]>;
  invertedIndex: Map<string, Set<string>>; // term -> docIds
  documentFrequencies: Map<string, number>; // term -> df
  documentLengths: Map<string, number>;
  avgDocumentLength: number;
  totalDocuments: number;
  config: BM25Config;
}

export interface BM25SearchResult {
  id: string;
  score: number;
  document: BM25Document;
}

// Default configuration
const DEFAULT_CONFIG: BM25Config = {
  k1: 1.5,
  b: 0.75
};

/**
 * Tokenize text for indexing/searching
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2)
    .map(stem);
}

/**
 * Simple Porter stemmer implementation
 */
function stem(word: string): string {
  // Basic stemming rules
  return word
    .replace(/ies$/, "y")
    .replace(/ied$/, "y")
    .replace(/ying$/, "y")
    .replace(/s$/, "")
    .replace(/ing$/, "")
    .replace(/ed$/, "")
    .replace(/er$/, "")
    .replace(/est$/, "")
    .replace(/ly$/, "");
}

/**
 * Create a new BM25 index
 */
export function createBM25Index(config: Partial<BM25Config> = {}): BM25Index {
  return {
    documents: new Map(),
    tokenizedDocs: new Map(),
    invertedIndex: new Map(),
    documentFrequencies: new Map(),
    documentLengths: new Map(),
    avgDocumentLength: 0,
    totalDocuments: 0,
    config: { ...DEFAULT_CONFIG, ...config }
  };
}

/**
 * Add a document to the index
 */
export function addDocumentToIndex(
  index: BM25Index,
  id: string,
  content: string,
  metadata?: Record<string, unknown>
): void {
  const tokens = tokenize(content);
  
  const doc: BM25Document = { id, content, metadata };
  index.documents.set(id, doc);
  index.tokenizedDocs.set(id, tokens);
  index.documentLengths.set(id, tokens.length);
  
  // Update inverted index
  const uniqueTokens = new Set(tokens);
  for (const term of uniqueTokens) {
    if (!index.invertedIndex.has(term)) {
      index.invertedIndex.set(term, new Set());
    }
    index.invertedIndex.get(term)!.add(id);
    
    // Update document frequency
    index.documentFrequencies.set(
      term,
      (index.documentFrequencies.get(term) || 0) + 1
    );
  }
  
  // Recalculate average document length
  index.totalDocuments++;
  const totalLength = Array.from(index.documentLengths.values())
    .reduce((a, b) => a + b, 0);
  index.avgDocumentLength = totalLength / index.totalDocuments;
}

/**
 * Remove a document from the index
 */
export function removeDocumentFromIndex(index: BM25Index, id: string): void {
  const tokens = index.tokenizedDocs.get(id);
  if (!tokens) return;
  
  // Update inverted index
  const uniqueTokens = new Set(tokens);
  for (const term of uniqueTokens) {
    index.invertedIndex.get(term)?.delete(id);
    if (index.invertedIndex.get(term)?.size === 0) {
      index.invertedIndex.delete(term);
      index.documentFrequencies.delete(term);
    } else {
      index.documentFrequencies.set(
        term,
        (index.documentFrequencies.get(term) || 1) - 1
      );
    }
  }
  
  // Remove document
  index.documents.delete(id);
  index.tokenizedDocs.delete(id);
  index.documentLengths.delete(id);
  
  // Recalculate average
  index.totalDocuments--;
  if (index.totalDocuments > 0) {
    const totalLength = Array.from(index.documentLengths.values())
      .reduce((a, b) => a + b, 0);
    index.avgDocumentLength = totalLength / index.totalDocuments;
  } else {
    index.avgDocumentLength = 0;
  }
}

/**
 * Search the index using BM25
 */
export function searchBM25(
  index: BM25Index,
  query: string,
  options: { limit?: number; filters?: Record<string, (val: unknown) => boolean> } = {}
): BM25SearchResult[] {
  const queryTokens = tokenize(query);
  const scores = new Map<string, number>();
  
  // Calculate BM25 score for each document
  for (const term of queryTokens) {
    const docIds = index.invertedIndex.get(term);
    if (!docIds || docIds.size === 0) continue;
    
    // Inverse document frequency
    const df = index.documentFrequencies.get(term) || 0;
    const idf = Math.log(
      (index.totalDocuments - df + 0.5) / (df + 0.5) + 1
    );
    
    for (const docId of docIds) {
      const docTokens = index.tokenizedDocs.get(docId)!;
      const tf = docTokens.filter(t => t === term).length;
      const docLength = index.documentLengths.get(docId)!;
      
      // BM25 scoring formula
      const numerator = tf * (index.config.k1 + 1);
      const denominator = tf + index.config.k1 * (
        1 - index.config.b + index.config.b * (docLength / index.avgDocumentLength)
      );
      
      const score = idf * (numerator / denominator);
      scores.set(docId, (scores.get(docId) || 0) + score);
    }
  }
  
  // Convert to results array
  let results: BM25SearchResult[] = Array.from(scores.entries())
    .map(([id, score]) => ({
      id,
      score,
      document: index.documents.get(id)!
    }));
  
  // Apply filters
  if (options.filters) {
    results = results.filter(({ document }) => {
      return Object.entries(options.filters!).every(([key, predicate]) => {
        return predicate(document.metadata?.[key]);
      });
    });
  }
  
  // Sort by score and return
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit || 10);
}

/**
 * Serialize index for storage
 */
export function serializeIndex(index: BM25Index): string {
  const data = {
    documents: Array.from(index.documents.entries()),
    tokenizedDocs: Array.from(index.tokenizedDocs.entries()),
    invertedIndex: Array.from(index.invertedIndex.entries()).map(([k, v]) => [k, Array.from(v)]),
    documentFrequencies: Array.from(index.documentFrequencies.entries()),
    documentLengths: Array.from(index.documentLengths.entries()),
    avgDocumentLength: index.avgDocumentLength,
    totalDocuments: index.totalDocuments,
    config: index.config
  };
  return JSON.stringify(data);
}

/**
 * Deserialize index from storage
 */
export function deserializeIndex(serialized: string): BM25Index {
  const data = JSON.parse(serialized);
  
  return {
    documents: new Map(data.documents),
    tokenizedDocs: new Map(data.tokenizedDocs),
    invertedIndex: new Map(data.invertedIndex.map(([k, v]: [string, string[]]) => [k, new Set(v)])),
    documentFrequencies: new Map(data.documentFrequencies),
    documentLengths: new Map(data.documentLengths),
    avgDocumentLength: data.avgDocumentLength,
    totalDocuments: data.totalDocuments,
    config: data.config
  };
}

/**
 * Get index statistics
 */
export function getIndexStats(index: BM25Index): {
  totalDocuments: number;
  uniqueTerms: number;
  avgDocumentLength: number;
} {
  return {
    totalDocuments: index.totalDocuments,
    uniqueTerms: index.invertedIndex.size,
    avgDocumentLength: index.avgDocumentLength
  };
}
