// Health Event Service - Production service for managing health timeline events
// ⚠️ MIGRATION IN PROGRESS: This service is being refactored to use Privy wallet service
// TODO: Replace wagmi/SSO code with viem + Privy implementation
// For now, functions are stubbed to prevent build errors

import {
  SECURE_HEALTH_PROFILE_CONTRACT,
  secureHealthProfileAbi,
} from "@/lib/contractConfig";
import { getStorageService } from "@/storage";
import { type WalletEncryptionKey } from "@/utils/walletEncryption";

// Temporary stub for getWagmiConfig until migration is complete
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getWagmiConfig(): any {
  throw new Error(
    "HealthEventService is being migrated to Privy - this function is temporarily unavailable",
  );
}

// Temporary stub for readContract until migration is complete
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
async function readContract(..._args: any[]): Promise<any> {
  throw new Error(
    "HealthEventService is being migrated to Privy - this function is temporarily unavailable",
  );
}

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
  // V2 fields (optional for backward compatibility)
  storjUri?: string;
  contentHash?: string;
}

interface ContractHealthEvent {
  timestamp: bigint;
  searchTag: string;
  encryptedData: string;
  eventHash: string;
  isActive: boolean;
}

export interface AddHealthEventV2Result {
  success: boolean;
  txHash?: string;
  searchTag?: string;
  storjUri?: string;
  contentHash?: string;
  error?: string;
}

// Check if V2 contract functions are available
let isV2Contract: boolean | null = null;

async function checkV2Support(): Promise<boolean> {
  if (isV2Contract !== null) return isV2Contract;

  try {
    // Try to call a V2-specific function
    const wagmiConfig = getWagmiConfig();
    await readContract(wagmiConfig, {
      address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
      abi: secureHealthProfileAbi,
      functionName: "getVersion",
      args: [],
    });

    // Check if version is 2 or higher
    const version = (await readContract(wagmiConfig, {
      address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
      abi: secureHealthProfileAbi,
      functionName: "getVersion",
      args: [],
    })) as number;

    isV2Contract = version >= 2;
    return isV2Contract;
  } catch {
    isV2Contract = false;
    return false;
  }
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
    // TODO: Update to accept wallet service as parameter
    // For now, this function needs to be called from a component that has access to useWalletService
    throw new Error(
      "HealthEventService.addHealthEvent needs to be updated to use wallet service hook - call from component with useWalletService",
    );
    /* Commented out until wallet service is passed as parameter
    // const account = walletService.getAccountInfo();
    // if (!account?.address) {
    //   throw new Error("Wallet not connected");
    // }

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
    const wagmiConfig = getWagmiConfig();
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
    */
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

    const wagmiConfig = getWagmiConfig();
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
  _userAddress: string,
  eventType: string,
): Promise<{
  success: boolean;
  events?: HealthEvent[];
  error?: string;
}> {
  try {
    console.log(`🔍 Searching for ${eventType} events...`);

    // Get account to derive user secret
    // TODO: Update to accept wallet service as parameter
    // Placeholder return - function needs to be updated
    return {
      success: false,
      error:
        "HealthEventService.searchEventsByType needs to be updated to use wallet service hook - call from component with useWalletService",
    };
    /* Commented out until wallet service is passed as parameter
    // const account = walletService.getAccountInfo();
    // if (!account?.address) {
    //   throw new Error("Wallet not connected");
    // }

    // Generate search tag for this event type
    const userSecret = await getUserSecret(account);
    const searchTag = generateSearchTag(eventType, userSecret);

    console.log(`🏷️ Search tag for ${eventType}:`, searchTag);

    const wagmiConfig = getWagmiConfig();
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
    */
  } catch (error) {
    console.error(`❌ Failed to search ${eventType} events:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * V2: Add a health event with Storj off-chain storage
 * Encrypts data, uploads to Storj, stores reference on-chain
 */
export async function addHealthEventV2(
  params: HealthEventData,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _signMessageFn: (message: string) => Promise<string>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _onProgress?: (progress: number) => void,
): Promise<AddHealthEventV2Result> {
  try {
    console.log("💾 Adding health event with Storj storage...");
    console.log("📝 Event type:", params.eventType);

    // 1. Get the user's wallet account
    // TODO: Update to accept wallet service as parameter
    // Note: This function already accepts signMessageFn, so it can work with Privy
    // But it still needs account info - should be passed as parameter
    // Placeholder return - function needs to be updated
    return {
      success: false,
      error:
        "HealthEventService.addHealthEventV2 needs to be updated - account should be passed as parameter",
    };
    /* Commented out until wallet service is passed as parameter
    // const account = walletService.getAccountInfo();
    // if (!account?.address) {
    //   throw new Error("Wallet not connected");
    // }

    // 2. Get encryption key
    console.log("🔑 Getting encryption key...");
    const encryptionKey = await getCachedWalletEncryptionKey(
      account.address,
      signMessageFn,
    );

    // 3. Derive user secret for search tag
    console.log("🔑 Deriving user secret...");
    const userSecret = await getUserSecret(account);

    // 4. Generate searchable encryption tag
    const searchTag = generateSearchTag(params.eventType, userSecret);
    console.log("🏷️ Search tag generated:", searchTag);

    // 5. Prepare event payload
    const eventPayload = {
      eventType: params.eventType,
      ...params.data,
      timestamp: Date.now(),
    };

    // 6. Upload to Storj (encrypts automatically)
    console.log("☁️ Uploading to Storj...");
    onProgress?.(10);

    const storageService = getStorageService();
    const storageResult = await storageService.storeHealthData(
      eventPayload,
      account.address,
      encryptionKey,
      {
        dataType: `timeline-${params.eventType}`,
        metadata: {
          eventType: params.eventType,
        },
        onProgress: (p) => onProgress?.(10 + p * 0.6), // 10-70%
      },
    );

    console.log("✅ Uploaded to Storj:", storageResult.storjUri);
    onProgress?.(70);

    // 7. Generate event hash for integrity
    const eventHash = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(
        storageResult.contentHash + searchTag + storageResult.storjUri,
      ),
    );

    // 8. Submit to blockchain (V2 function)
    console.log("📤 Submitting to blockchain...");
    onProgress?.(80);

    const wagmiConfig = getWagmiConfig();
    const txHash = await writeContract(wagmiConfig, {
      address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
      abi: secureHealthProfileAbi,
      functionName: "addHealthEventV2",
      args: [
        searchTag as `0x${string}`,
        storageResult.storjUri,
        `0x${storageResult.contentHash}` as `0x${string}`,
        eventHash as `0x${string}`,
      ],
    });

    console.log("✅ Transaction submitted:", txHash);
    onProgress?.(100);

    return {
      success: true,
      txHash,
      searchTag,
      storjUri: storageResult.storjUri,
      contentHash: storageResult.contentHash,
    };
    */
  } catch (error) {
    console.error("❌ Failed to add health event (V2):", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * V2: Read health timeline with Storj data fetching
 * Fetches encrypted data from Storj URIs and decrypts
 */
export async function readHealthTimelineV2(
  userAddress: string,
  encryptionKey: WalletEncryptionKey,
): Promise<{
  success: boolean;
  events?: Array<HealthEvent & { decryptedData?: unknown }>;
  error?: string;
}> {
  try {
    console.log("📖 Reading health timeline with Storj data...");

    // 1. Get timeline from blockchain
    const wagmiConfig = getWagmiConfig();
    const events = (await readContract(wagmiConfig, {
      address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
      abi: secureHealthProfileAbi,
      functionName: "getHealthTimeline",
      args: [userAddress as `0x${string}`],
    })) as ContractHealthEvent[];

    console.log(`✅ Found ${events.length} events in timeline`);

    const storageService = getStorageService();
    const enrichedEvents: Array<HealthEvent & { decryptedData?: unknown }> = [];

    // 2. Process each event
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const baseEvent: HealthEvent = {
        timestamp: Number(event.timestamp),
        searchTag: event.searchTag,
        encryptedData: event.encryptedData,
        eventHash: event.eventHash,
        isActive: event.isActive,
      };

      // Check if this is a V2 event (has Storj URI)
      try {
        const storjUri = (await readContract(wagmiConfig, {
          address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
          abi: secureHealthProfileAbi,
          functionName: "getEventStorjUri",
          args: [userAddress as `0x${string}`, BigInt(i)],
        })) as string;

        if (storjUri && storjUri.length > 0) {
          // V2 event - fetch from Storj
          const contentHash = (await readContract(wagmiConfig, {
            address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
            abi: secureHealthProfileAbi,
            functionName: "getEventContentHash",
            args: [userAddress as `0x${string}`, BigInt(i)],
          })) as string;

          baseEvent.storjUri = storjUri;
          baseEvent.contentHash = contentHash;

          // Fetch and decrypt from Storj
          try {
            const retrieved = await storageService.retrieveHealthData(
              storjUri,
              encryptionKey,
              contentHash,
            );
            enrichedEvents.push({
              ...baseEvent,
              decryptedData: retrieved.data,
            });
          } catch (fetchError) {
            console.warn(
              `Failed to fetch Storj data for event ${i}:`,
              fetchError,
            );
            enrichedEvents.push(baseEvent);
          }
        } else {
          // V1 event - data is inline
          try {
            const decryptedData = JSON.parse(event.encryptedData);
            enrichedEvents.push({
              ...baseEvent,
              decryptedData,
            });
          } catch {
            enrichedEvents.push(baseEvent);
          }
        }
      } catch {
        // V1 contract or error - treat as inline data
        try {
          const decryptedData = JSON.parse(event.encryptedData);
          enrichedEvents.push({
            ...baseEvent,
            decryptedData,
          });
        } catch {
          enrichedEvents.push(baseEvent);
        }
      }
    }

    return {
      success: true,
      events: enrichedEvents,
    };
  } catch (error) {
    console.error("❌ Failed to read timeline (V2):", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if the contract supports V2 features
 */
export async function isV2Supported(): Promise<boolean> {
  return checkV2Support();
}
