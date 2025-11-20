// Health Event Service - Production service for managing health timeline events
import { writeContract, readContract } from "@wagmi/core";
import { ethers } from "ethers";
import {
  wagmiConfig,
  SECURE_HEALTH_PROFILE_CONTRACT,
  secureHealthProfileAbi,
} from "@/lib/zksync-sso-config";
import { getUserSecret, generateSearchTag } from "@/utils/searchableEncryption";
import { zkSyncSsoWalletService } from "@/services/ZkSyncSsoWalletService";

export interface HealthEventData {
  eventType: string;
  data: Record<string, unknown>;
}

export interface HealthEvent {
  timestamp: number;
  searchTag: string;
  encryptedData: string;
  eventHash: string;
  isActive: boolean;
}

interface ContractHealthEvent {
  timestamp: bigint;
  searchTag: string;
  encryptedData: string;
  eventHash: string;
  isActive: boolean;
}

/**
 * Add a health event to the blockchain
 */
export async function addHealthEvent(params: HealthEventData): Promise<{
  success: boolean;
  txHash?: string;
  searchTag?: string;
  error?: string;
}> {
  try {
    console.log("💾 Adding health event to blockchain...");
    console.log("📝 Event type:", params.eventType);
    console.log("📦 Event data:", params.data);

    // 1. Get the user's wallet account
    const account = zkSyncSsoWalletService.getAccountInfo();
    if (!account?.address) {
      throw new Error("Wallet not connected");
    }

    // 2. Derive user secret from wallet
    console.log("🔑 Deriving user secret...");
    const userSecret = await getUserSecret(account);
    console.log("✅ User secret derived");

    // 3. Generate searchable encryption tag
    console.log("🏷️ Generating search tag...");
    const searchTag = generateSearchTag(params.eventType, userSecret);
    console.log("✅ Search tag generated:", searchTag);

    // 4. Prepare event payload
    const eventPayload = {
      eventType: params.eventType,
      ...params.data,
      timestamp: Date.now(),
    };

    console.log("🔐 Preparing event data...");
    const encryptedPayload = JSON.stringify(eventPayload);
    console.log("✅ Event data prepared");

    // 5. Generate event hash for integrity
    const eventHash = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(encryptedPayload + searchTag),
    );
    console.log("🔗 Event hash:", eventHash);

    // 6. Submit to blockchain
    console.log("📤 Submitting to blockchain...");
    const txHash = await writeContract(wagmiConfig, {
      address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
      abi: secureHealthProfileAbi,
      functionName: "addHealthEvent",
      args: [
        searchTag as `0x${string}`,
        encryptedPayload,
        eventHash as `0x${string}`,
      ],
    });

    console.log("✅ Transaction submitted:", txHash);
    console.log("🔍 View on explorer:");
    console.log(`   https://sepolia.explorer.zksync.io/tx/${txHash}`);

    return {
      success: true,
      txHash,
      searchTag,
    };
  } catch (error) {
    console.error("❌ Failed to add health event:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Read health timeline from blockchain
 */
export async function readHealthTimeline(userAddress: string): Promise<{
  success: boolean;
  events?: HealthEvent[];
  error?: string;
}> {
  try {
    console.log("📖 Reading health timeline from blockchain...");

    const events = (await readContract(wagmiConfig, {
      address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
      abi: secureHealthProfileAbi,
      functionName: "getHealthTimeline",
      args: [userAddress as `0x${string}`],
    })) as ContractHealthEvent[];

    console.log(`✅ Found ${events.length} events in timeline`);

    return {
      success: true,
      events: events.map((e) => ({
        timestamp: Number(e.timestamp),
        searchTag: e.searchTag,
        encryptedData: e.encryptedData,
        eventHash: e.eventHash,
        isActive: e.isActive,
      })),
    };
  } catch (error) {
    console.error("❌ Failed to read timeline:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Search events by event type (generates search tag and queries)
 * Works with ANY event type string - fully flexible!
 */
export async function searchEventsByType(
  userAddress: string,
  eventType: string,
): Promise<{
  success: boolean;
  events?: HealthEvent[];
  error?: string;
}> {
  try {
    console.log(`🔍 Searching for ${eventType} events...`);

    // Get account to derive user secret
    const account = zkSyncSsoWalletService.getAccountInfo();
    if (!account?.address) {
      throw new Error("Wallet not connected");
    }

    // Generate search tag for this event type
    const userSecret = await getUserSecret(account);
    const searchTag = generateSearchTag(eventType, userSecret);

    console.log(`🏷️ Search tag for ${eventType}:`, searchTag);

    const events = (await readContract(wagmiConfig, {
      address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
      abi: secureHealthProfileAbi,
      functionName: "getEventsByTag",
      args: [userAddress as `0x${string}`, searchTag as `0x${string}`],
    })) as ContractHealthEvent[];

    console.log(`✅ Found ${events.length} ${eventType} events`);

    // Decrypt and log event data
    events.forEach((event, i) => {
      try {
        const decrypted = JSON.parse(event.encryptedData);
        console.log(`Event ${i}:`, decrypted);
      } catch {
        console.log(`Event ${i}: (encrypted data)`);
      }
    });

    return {
      success: true,
      events: events.map((e) => ({
        timestamp: Number(e.timestamp),
        searchTag: e.searchTag,
        encryptedData: e.encryptedData,
        eventHash: e.eventHash,
        isActive: e.isActive,
      })),
    };
  } catch (error) {
    console.error(`❌ Failed to search ${eventType} events:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
