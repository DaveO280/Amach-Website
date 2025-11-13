import type { VeniceApiService } from "@/api/venice/VeniceApiService";

import { BaseHealthAgent } from "./BaseHealthAgent";
import { ActivityEnergyAgent } from "./ActivityEnergyAgent";
import { CardiovascularAgent } from "./CardiovascularAgent";
import { DexaAgent } from "./DexaAgent";
import { BloodworkAgent } from "./BloodworkAgent";
import { SleepAgent } from "./SleepAgent";
import { RecoveryStressAgent } from "./RecoveryStressAgent";

export type AgentRegistry = Record<string, BaseHealthAgent>;

export function buildDefaultAgentRegistry(
  veniceService: VeniceApiService,
): AgentRegistry {
  const agents: BaseHealthAgent[] = [
    new SleepAgent(veniceService),
    new ActivityEnergyAgent(veniceService),
    new CardiovascularAgent(veniceService),
    new RecoveryStressAgent(veniceService),
    new DexaAgent(veniceService),
    new BloodworkAgent(veniceService),
  ];
  return Object.fromEntries(agents.map((agent) => [agent.id, agent]));
}

export function listDefaultAgents(
  veniceService: VeniceApiService,
): BaseHealthAgent[] {
  return [
    new SleepAgent(veniceService),
    new ActivityEnergyAgent(veniceService),
    new CardiovascularAgent(veniceService),
    new RecoveryStressAgent(veniceService),
    new DexaAgent(veniceService),
    new BloodworkAgent(veniceService),
  ];
}
