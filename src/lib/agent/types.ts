export interface AgentStyle {
  all: string[];
  chat: string[];
  post: string[];
}

export interface TopicResponse {
  keywords: string[];
  responses: string[];
}

export interface ResponseContext {
  topics: TopicResponse[];
  defaultResponses: string[];
  greetings: string[];
}

export interface AgentCharacteristics {
  name: string;
  bio: string[];
  lore: string[];
  knowledge: string[];
  messageExamples: Array<
    Array<{
      user: string;
      content: {
        text: string;
      };
    }>
  >;
  topics: string[];
  style: AgentStyle;
  adjectives: string[];
  responseContext: ResponseContext;
}

// Extended characteristics specific to health chat
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
