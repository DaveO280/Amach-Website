import { VeniceApiService } from "@/api/venice/VeniceApiService";
import { SleepAgent } from "@/agents/SleepAgent";
import type {
  AgentExecutionContext,
  AgentInsight,
  AppleHealthMetricMap,
  MetricSample,
} from "@/agents/types";

interface TestCase {
  name: string;
  query: string;
  appleHealthData: AppleHealthMetricMap;
  expectations: {
    shouldContain: string[];
    shouldNotContain: string[];
    minConfidence: number;
    minFindings: number;
    maxConcerns?: number;
  };
}

const DAYS_30 = 30 * 24 * 60 * 60 * 1000;

const SLEEP_TEST_CASES: TestCase[] = [
  {
    name: "Consistent good sleep",
    query: "How is my sleep quality?",
    appleHealthData: {
      HKCategoryTypeIdentifierSleepAnalysis: generateConsistentSleep(8, 14),
    },
    expectations: {
      shouldContain: ["consistent", "8", "adequate"],
      shouldNotContain: ["insufficient", "poor"],
      minConfidence: 0.6,
      minFindings: 1,
      maxConcerns: 0,
    },
  },
  {
    name: "Sleep deprivation pattern",
    query: "Why am I tired?",
    appleHealthData: {
      HKCategoryTypeIdentifierSleepAnalysis: generateConsistentSleep(5.5, 14),
    },
    expectations: {
      shouldContain: ["insufficient", "debt", "below"],
      shouldNotContain: ["excellent", "optimal"],
      minConfidence: 0.6,
      minFindings: 2,
    },
  },
  {
    name: "Inconsistent sleep schedule",
    query: "Analyze my sleep patterns",
    appleHealthData: {
      HKCategoryTypeIdentifierSleepAnalysis: [
        ...generateConsistentSleep(8, 5),
        ...generateConsistentSleep(10, 2),
        ...generateConsistentSleep(8, 5, 7),
        ...generateConsistentSleep(10, 2, 12),
      ],
    },
    expectations: {
      shouldContain: ["inconsistent", "range"],
      shouldNotContain: [],
      minConfidence: 0.5,
      minFindings: 1,
      maxConcerns: 0,
    },
  },
];

export async function runSleepAgentQualityTests(): Promise<void> {
  const veniceService = VeniceApiService.fromEnv();
  const sleepAgent = new SleepAgent(veniceService);

  const results = [];

  for (const testCase of SLEEP_TEST_CASES) {
    const context: AgentExecutionContext = {
      query: testCase.query,
      timeWindow: {
        start: new Date(Date.now() - DAYS_30),
        end: new Date(),
      },
      availableData: { appleHealth: testCase.appleHealthData },
    };

    const insight = await sleepAgent.analyze(context);
    const validation = validateInsight(insight, testCase.expectations);
    results.push({ testCase: testCase.name, ...validation, insight });

    if (!validation.passed) {
      console.warn(`❌ ${testCase.name} failed`, validation.issues);
      if (insight.rawResponse) {
        console.log(`--- Raw Venice response (${testCase.name}) ---`);
        console.log(insight.rawResponse);
        console.log("-------------------------------------------");
      } else {
        console.log(`--- Structured insight (${testCase.name}) ---`);
        console.log(JSON.stringify(insight, null, 2));
        console.log("-------------------------------------------");
      }
    } else {
      console.log(`✅ ${testCase.name} passed`);
    }
  }

  const passRate =
    results.filter((result) => result.passed).length / results.length;
  console.log(
    `Sleep Agent pass rate: ${(passRate * 100).toFixed(0)}% (${results.length} cases)`,
  );
}

function validateInsight(
  insight: AgentInsight,
  expectations: TestCase["expectations"],
): { passed: boolean; issues: string[] } {
  const issues: string[] = [];

  if (insight.confidence < expectations.minConfidence) {
    issues.push(
      `Confidence ${insight.confidence.toFixed(2)} below threshold ${expectations.minConfidence}`,
    );
  }

  if (insight.findings.length < expectations.minFindings) {
    issues.push(
      `Findings ${insight.findings.length} below threshold ${expectations.minFindings}`,
    );
  }

  if (
    typeof expectations.maxConcerns === "number" &&
    insight.concerns.length > expectations.maxConcerns
  ) {
    issues.push(
      `Too many concerns: ${insight.concerns.length} > ${expectations.maxConcerns}`,
    );
  }

  const serializedInsight = JSON.stringify(insight).toLowerCase();

  expectations.shouldContain.forEach((keyword) => {
    if (!serializedInsight.includes(keyword.toLowerCase())) {
      issues.push(`Missing expected keyword "${keyword}"`);
    }
  });

  expectations.shouldNotContain.forEach((keyword) => {
    if (serializedInsight.includes(keyword.toLowerCase())) {
      issues.push(`Found unexpected keyword "${keyword}"`);
    }
  });

  return { passed: issues.length === 0, issues };
}

function generateConsistentSleep(
  hours: number,
  nights: number,
  offsetDays = 0,
): MetricSample[] {
  const samples: MetricSample[] = [];
  for (let day = 0; day < nights; day++) {
    samples.push({
      timestamp: new Date(
        Date.now() - (offsetDays + day) * 24 * 60 * 60 * 1000,
      ),
      value: hours * 3600,
      unit: "seconds",
    });
  }
  return samples;
}

if (process.env.RUN_AGENT_TESTS === "true") {
  runSleepAgentQualityTests().catch((error) => {
    console.error("Sleep agent quality tests failed", error);
    process.exitCode = 1;
  });
}
