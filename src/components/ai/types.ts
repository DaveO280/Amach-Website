// src/components/ai/types.ts

// Base agent characteristics
export interface AgentCharacteristics {
  name: string;
  bio: string[];
  lore: string[];
  knowledge: string[];
  messageExamples: any[][];
  topics: string[];
  style: {
    all: string[];
    chat: string[];
    post: string[];
  };
  adjectives: string[];
  responseContext: {
    topics: {
      keywords: string[];
      responses: string[];
    }[];
    defaultResponses: string[];
    greetings: string[];
  };
}

// Extensions for health-specific agent
export interface HealthAgentCharacteristics extends AgentCharacteristics {
  healthMetricResponses?: {
    [key: string]: {
      interpretation: string[];
      suggestions: string[];
      correlations: string[];
    };
  };
  trendAnalysis?: {
    increasing: string[];
    decreasing: string[];
    stable: string[];
    fluctuating: string[];
  };
  dataVisualization?: {
    patterns: string[];
    insights: string[];
    recommendations: string[];
  };
}
