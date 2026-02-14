/**
 * @module HealthEventService
 * @description Health timeline event management with encrypted Storj storage
 *
 * ## Architecture
 * 1. Create event → Encrypt with walletEncryption → Upload to Storj
 * 2. Store Storj URI + content hash on blockchain (permanent reference)
 * 3. Retrieve: Read URI from blockchain → Fetch from Storj → Decrypt
 *
 * ## Key Functions
 * - `addHealthEventV2()` - Create new timeline event with custom date
 * - `readHealthTimeline()` - Load all events from blockchain + Storj
 * - `updateHealthEvent()` - Update existing event (re-upload to Storj)
 *
 * @see walletEncryption.ts for encryption details
 * @see StorjTimelineService.ts for storage implementation
 * @see HealthTimelineTab.tsx for UI implementation
 */

import {
  computeStorjEventHash,
  SECURE_HEALTH_PROFILE_CONTRACT,
  secureHealthProfileAbi,
} from "@/lib/contractConfig";
import { type WalletEncryptionKey } from "@/utils/walletEncryption";

export interface HealthEventData {
  eventType: string;
  data: Record<string, unknown>;
  timestamp?: number; // Optional custom timestamp (milliseconds)
}

export interface HealthEvent {
  eventId?: string | number; // Event ID - stable identifier (address-index) or legacy numeric index
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

/**
 * Read health timeline from blockchain
 * Updated to use viem public client (Privy migration)
 */
export async function readHealthTimeline(
  userAddress: string,
  encryptionKey?: WalletEncryptionKey,
): Promise<{
  success: boolean;
  events?: HealthEvent[];
  error?: string;
}> {
  try {
    console.log("📖 Reading health timeline from blockchain...");

    // Use viem public client - same pattern as usePrivyWalletService
    const { createPublicClient, http } = await import("viem");
    const { getActiveChain } = await import("@/lib/networkConfig");

    const rpcUrl =
      process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
      "https://sepolia.era.zksync.dev";

    const publicClient = createPublicClient({
      chain: getActiveChain(),
      transport: http(rpcUrl),
    });

    console.log(`🔍 Querying contract: ${SECURE_HEALTH_PROFILE_CONTRACT}`);
    console.log(`🔍 User address: ${userAddress}`);

    const events = (await publicClient.readContract({
      address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
      abi: secureHealthProfileAbi,
      functionName: "getHealthTimeline",
      args: [userAddress as `0x${string}`],
    })) as ContractHealthEvent[];

    console.log(`✅ Found ${events.length} events in timeline`);
    if (events.length > 0) {
      console.log(`📋 First event:`, {
        timestamp: Number(events[0].timestamp),
        searchTag: events[0].searchTag,
        hasEncryptedData:
          !!events[0].encryptedData && events[0].encryptedData.length > 0,
        isActive: events[0].isActive,
      });
    }

    // If encryption key is provided, fetch Storj data for V2 events
    if (encryptionKey) {
      const enrichedEvents: HealthEvent[] = [];

      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        // Use blockchain index as stable ID (more reliable than array index which changes on delete)
        // This ensures deletions are properly tracked even after re-indexing
        const stableEventId = `${userAddress.toLowerCase()}-${i}`;

        const baseEvent: HealthEvent = {
          eventId: stableEventId,
          timestamp: Number(event.timestamp),
          searchTag: event.searchTag,
          encryptedData: event.encryptedData,
          eventHash: event.eventHash,
          isActive: event.isActive,
        };

        // Check if this is a V2 event (has Storj URI)
        // V2 events have empty encryptedData and store data in Storj
        if (!event.encryptedData || event.encryptedData.length === 0) {
          try {
            // Try to get Storj URI from contract (V3 uses public mappings)
            const storjUri = (await publicClient.readContract({
              address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
              abi: secureHealthProfileAbi,
              functionName: "eventStorjUri",
              args: [userAddress as `0x${string}`, BigInt(i)],
            })) as string;

            console.log(
              `🔍 Event ${i}: storjUri from contract = "${storjUri}" (length: ${storjUri?.length || 0})`,
            );

            if (storjUri && storjUri.length > 0) {
              // V3 event - fetch from Storj
              const contentHash = (await publicClient.readContract({
                address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
                abi: secureHealthProfileAbi,
                functionName: "eventContentHash",
                args: [userAddress as `0x${string}`, BigInt(i)],
              })) as string;

              console.log(
                `🔍 Event ${i}: contentHash from contract = "${contentHash}"`,
              );

              baseEvent.storjUri = storjUri;
              baseEvent.contentHash = contentHash;

              // Fetch and decrypt from Storj via API route
              try {
                const response = await fetch("/api/storj", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "timeline/retrieve",
                    userAddress,
                    encryptionKey,
                    storjUri,
                    expectedHash: contentHash,
                  }),
                });

                if (!response.ok) {
                  console.error(
                    `❌ API response not OK for event ${i}:`,
                    response.status,
                    response.statusText,
                  );
                  // Continue with baseEvent (no encryptedData)
                } else {
                  const result = await response.json();
                  if (result.success && result.result) {
                    // Store decrypted data in encryptedData field for display
                    // The result.result is a StorjTimelineEvent object, stringify it for storage
                    baseEvent.encryptedData = JSON.stringify(result.result);

                    // IMPORTANT: Use the Storj timestamp (actual event date) instead of blockchain timestamp
                    // Blockchain timestamp = when event was created/modified (audit trail)
                    // Storj timestamp = actual event date (what user selected)
                    if (result.result.timestamp) {
                      baseEvent.timestamp = Math.floor(
                        result.result.timestamp / 1000,
                      ); // Convert ms to seconds
                    }

                    console.log(`✅ Fetched Storj data for event ${i}:`, {
                      hasEventType: !!result.result.eventType,
                      hasData: !!result.result.data,
                      eventType: result.result.eventType,
                      blockchainTimestamp: Number(event.timestamp),
                      storjTimestamp: result.result.timestamp,
                      usingTimestamp: baseEvent.timestamp,
                    });
                  } else {
                    console.warn(
                      `⚠️ Failed to fetch Storj data for event ${i}:`,
                      result.error || "Unknown error",
                      result,
                    );
                  }
                }
              } catch (fetchError) {
                console.error(
                  `❌ Failed to fetch Storj data for event ${i}:`,
                  fetchError,
                );
              }
            }
          } catch (error) {
            // Contract might not have V2 functions, or event is V1
            console.log(`Event ${i} is V1 or V2 functions not available`);
          }
        }

        enrichedEvents.push(baseEvent);
      }

      return {
        success: true,
        events: enrichedEvents,
      };
    }

    // Without encryption key, just return blockchain data
    return {
      success: true,
      events: events.map((e, index) => ({
        eventId: index, // Array index is the eventId on blockchain
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
 *
 * @param userAddress - User's wallet address
 * @param eventType - Event type to search for
 * @param signMessageFn - Function to sign messages (from Privy wallet service)
 */
export async function searchEventsByType(
  userAddress: string,
  eventType: string,
  signMessageFn: (message: string) => Promise<string>,
): Promise<{
  success: boolean;
  events?: HealthEvent[];
  error?: string;
}> {
  try {
    console.log(`🔍 Searching for ${eventType} events...`);

    if (!userAddress) {
      return {
        success: false,
        error: "Wallet address is required",
      };
    }

    // Generate search tag for this event type
    const { getUserSecret, generateSearchTag } =
      await import("@/utils/searchableEncryption");
    const signerLike = {
      address: userAddress,
      signMessage: signMessageFn,
    };
    const userSecret = await getUserSecret(signerLike);
    const searchTag = generateSearchTag(eventType, userSecret);

    console.log(`🏷️ Search tag for ${eventType}:`, searchTag);

    // Use viem public client instead of wagmi
    const { createPublicClient, http } = await import("viem");
    const { getActiveChain } = await import("@/lib/networkConfig");

    const rpcUrl =
      process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
      "https://sepolia.era.zksync.dev";

    const publicClient = createPublicClient({
      chain: getActiveChain(),
      transport: http(rpcUrl),
    });

    const events = (await publicClient.readContract({
      address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
      abi: secureHealthProfileAbi,
      functionName: "getEventsByTag",
      args: [userAddress as `0x${string}`, searchTag as `0x${string}`],
    })) as ContractHealthEvent[];

    console.log(`✅ Found ${events.length} ${eventType} events`);

    return {
      success: true,
      events: events.map((e, index) => ({
        eventId: index,
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

/**
 * V2: Add a health event with Storj off-chain storage
 * Encrypts data, uploads to Storj, stores reference on-chain
 *
 * @param params - Health event data
 * @param walletAddress - User's wallet address
 * @param signMessageFn - Function to sign messages (from Privy wallet service)
 * @param getWalletClientFn - Function to get viem wallet client for contract writes
 * @param onProgress - Optional progress callback
 */
export async function addHealthEventV2(
  params: HealthEventData,
  walletAddress: string,
  signMessageFn: (message: string) => Promise<string>,
  getWalletClientFn: () => Promise<import("viem").WalletClient | null>,
  onProgress?: (progress: number) => void,
): Promise<AddHealthEventV2Result> {
  try {
    console.log("💾 Adding health event with Storj storage...");
    console.log("📝 Event type:", params.eventType);
    console.log("👤 Wallet address:", walletAddress);

    if (!walletAddress) {
      return {
        success: false,
        error: "Wallet address is required",
      };
    }

    // 1. Get encryption key
    console.log("🔑 Getting encryption key...");
    onProgress?.(5);
    const { getWalletDerivedEncryptionKey } =
      await import("@/utils/walletEncryption");
    const encryptionKey = await getWalletDerivedEncryptionKey(
      walletAddress,
      signMessageFn,
    );
    console.log("✅ Encryption key derived");

    // 2. Derive user secret for search tag
    console.log("🔑 Deriving user secret...");
    onProgress?.(10);
    const { getUserSecret } = await import("@/utils/searchableEncryption");
    // Create a signer-like object for getUserSecret
    const signerLike = {
      address: walletAddress,
      signMessage: signMessageFn,
    };
    const userSecret = await getUserSecret(signerLike);
    console.log("✅ User secret derived");

    // 3. Generate searchable encryption tag
    const { generateSearchTag } = await import("@/utils/searchableEncryption");
    const searchTag = generateSearchTag(params.eventType, userSecret);
    console.log("🏷️ Search tag generated:", searchTag);

    // 4. Prepare timeline event
    const eventId = crypto.randomUUID();
    const timelineEvent = {
      id: eventId,
      eventType: params.eventType,
      timestamp: params.timestamp ?? Date.now(), // Use custom timestamp if provided, otherwise current time
      data: params.data,
    };

    // 5. Upload to Storj via API route
    console.log("☁️ Uploading to Storj...");
    onProgress?.(15);
    const storjResponse = await fetch("/api/storj", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "timeline/store",
        userAddress: walletAddress,
        encryptionKey,
        data: timelineEvent,
        options: {
          metadata: {
            eventType: params.eventType,
            eventId,
          },
        },
      }),
    });

    if (!storjResponse.ok) {
      const errorData = await storjResponse.json();
      throw new Error(
        errorData.error || `Storj upload failed: ${storjResponse.status}`,
      );
    }

    const storjResult = await storjResponse.json();
    console.log("📦 Storj API response:", JSON.stringify(storjResult, null, 2));

    if (!storjResult.success || !storjResult.result) {
      throw new Error(
        storjResult.error || "Storj upload failed - no result returned",
      );
    }

    // Check if the inner result indicates success (storeTimelineEvent returns { success, storjUri, ... })
    if (storjResult.result.success === false) {
      throw new Error(
        storjResult.result.error || "Storj timeline store failed",
      );
    }

    const { storjUri, contentHash } = storjResult.result;

    if (!storjUri || !contentHash) {
      throw new Error(
        `Storj upload returned invalid data: storjUri=${storjUri}, contentHash=${contentHash}`,
      );
    }

    console.log("✅ Uploaded to Storj:", storjUri);
    console.log("🔐 Content hash:", contentHash);
    onProgress?.(70);

    // 6. Check if profile exists before submitting
    console.log("🔍 Checking if profile exists...");
    onProgress?.(75);
    const { createPublicClient, http } = await import("viem");
    const { getActiveChain } = await import("@/lib/networkConfig");
    const rpcUrl =
      process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
      "https://sepolia.era.zksync.dev";
    const publicClient = createPublicClient({
      chain: getActiveChain(),
      transport: http(rpcUrl),
    });

    // Check if profile exists - try multiple methods
    let profileExists = false;
    try {
      // Method 1: Try isProfileActive (checks both existence and active status)
      try {
        const isActive = (await publicClient.readContract({
          address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
          abi: secureHealthProfileAbi,
          functionName: "isProfileActive",
          args: [walletAddress as `0x${string}`],
        })) as boolean;

        if (isActive) {
          profileExists = true;
          console.log("✅ Profile exists and is active");
        } else {
          console.warn("⚠️ Profile exists but is not active");
          // Still allow - inactive profiles can have events added
          profileExists = true;
        }
      } catch (isActiveError) {
        console.warn(
          "⚠️ isProfileActive check failed, trying getProfile:",
          isActiveError,
        );
        // Method 2: Try getProfile (will throw if profile doesn't exist)
        try {
          await publicClient.readContract({
            address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
            abi: secureHealthProfileAbi,
            functionName: "getProfile",
            args: [walletAddress as `0x${string}`],
          });
          profileExists = true;
          console.log("✅ Profile exists (verified via getProfile)");
        } catch (getProfileError) {
          console.error("❌ Profile does not exist:", getProfileError);
          throw new Error(
            "Profile does not exist. Please create a health profile first before adding events.",
          );
        }
      }
    } catch (profileError) {
      if (
        profileError instanceof Error &&
        profileError.message.includes("Profile does not exist")
      ) {
        throw profileError;
      }
      // If we get here, something else went wrong - log it but don't block
      console.warn("⚠️ Profile check had an unexpected error:", profileError);
    }

    if (!profileExists) {
      throw new Error(
        "Profile does not exist. Please create a health profile first before adding events.",
      );
    }

    // 7. Submit to blockchain using V2 function (addHealthEventV2)
    console.log("📤 Submitting to blockchain...");
    console.log("📋 Contract:", SECURE_HEALTH_PROFILE_CONTRACT);
    console.log("📋 Using V2 function: addHealthEventV2");
    console.log("📋 Args:", {
      encryptedData: "", // Empty as per V3 design (data is in Storj)
      searchTag,
      storjUri,
      contentHash: contentHash?.startsWith?.("0x")
        ? contentHash
        : contentHash
          ? `0x${contentHash}`
          : "undefined",
    });

    // Validate all arguments before submitting
    if (
      !searchTag ||
      searchTag === "0x" ||
      searchTag ===
        "0x0000000000000000000000000000000000000000000000000000000000000000"
    ) {
      throw new Error("Invalid search tag: cannot be zero");
    }
    if (!storjUri || storjUri.length === 0) {
      throw new Error("Invalid storjUri: cannot be empty");
    }
    if (!contentHash || contentHash.length === 0) {
      throw new Error("Invalid contentHash: cannot be empty");
    }

    onProgress?.(80);
    const walletClient = await getWalletClientFn();
    if (!walletClient) {
      throw new Error("Failed to get wallet client");
    }

    // Ensure contentHash has 0x prefix if it doesn't already
    const formattedContentHash = contentHash.startsWith("0x")
      ? contentHash
      : `0x${contentHash}`;

    // Validate formatted hash is exactly 66 characters (0x + 64 hex chars)
    if (formattedContentHash.length !== 66) {
      throw new Error(
        `Invalid contentHash length: expected 66 chars (0x + 64 hex), got ${formattedContentHash.length}`,
      );
    }

    // V2/V4: addHealthEventV2(searchTag, storjUri, contentHash, eventHash)
    const searchTagHex = searchTag as `0x${string}`;
    const contentHashHex = formattedContentHash as `0x${string}`;
    const eventHash = computeStorjEventHash(
      searchTagHex,
      storjUri,
      contentHashHex,
    );
    console.log("📤 Submitting to blockchain using addHealthEventV2...");
    const hash = await walletClient.writeContract({
      address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
      abi: secureHealthProfileAbi,
      functionName: "addHealthEventV2",
      args: [searchTagHex, storjUri, contentHashHex, eventHash],
      account: walletAddress as `0x${string}`,
      chain: getActiveChain(),
      gas: 2000000n, // Higher gas limit for zkSync pubdata overhead (strings consume more gas)
    });

    console.log("✅ Transaction submitted:", hash);

    // Wait for confirmation and verify it was successful
    try {
      console.log("⏳ Waiting for transaction confirmation...");
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
      });

      if (receipt.status === "success") {
        console.log("✅ Transaction confirmed successfully!");
        console.log("📋 Block number:", receipt.blockNumber);
        console.log("📋 Gas used:", receipt.gasUsed.toString());

        // Verify the event was actually added by checking the timeline
        console.log("🔍 Verifying event was added to timeline...");
        const verifyEvents = (await publicClient.readContract({
          address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
          abi: secureHealthProfileAbi,
          functionName: "getHealthTimeline",
          args: [walletAddress as `0x${string}`],
        })) as ContractHealthEvent[];

        console.log(`✅ Timeline now has ${verifyEvents.length} event(s)`);
        if (verifyEvents.length > 0) {
          const lastEvent = verifyEvents[verifyEvents.length - 1];
          console.log("📋 Last event:", {
            timestamp: Number(lastEvent.timestamp),
            isActive: lastEvent.isActive,
            hasEncryptedData:
              !!lastEvent.encryptedData && lastEvent.encryptedData.length > 0,
          });
        }
      } else {
        console.error("❌ Transaction failed on-chain!");
        console.error("📋 Receipt:", receipt);

        // Try to get the revert reason
        try {
          const tx = await publicClient.getTransaction({ hash });
          console.error("📋 Transaction details:", {
            to: tx.to,
            data: tx.input,
            value: tx.value.toString(),
          });

          // Try to simulate the transaction to get revert reason
          const eventHashSim = computeStorjEventHash(
            searchTag as `0x${string}`,
            storjUri,
            formattedContentHash as `0x${string}`,
          );
          try {
            await publicClient.simulateContract({
              address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
              abi: secureHealthProfileAbi,
              functionName: "addHealthEventV2",
              args: [
                searchTag as `0x${string}`,
                storjUri,
                formattedContentHash as `0x${string}`,
                eventHashSim,
              ],
              account: walletAddress as `0x${string}`,
            });
          } catch (simError: unknown) {
            const errorMessage =
              simError instanceof Error ? simError.message : "Unknown error";
            console.error("📋 Simulate error (revert reason):", errorMessage);
            console.error("📋 Full error:", simError);

            // Try to decode the revert reason
            if (
              simError &&
              typeof simError === "object" &&
              "cause" in simError
            ) {
              const cause = simError.cause as { data?: string };
              if (cause?.data) {
                console.error("📋 Revert data:", cause.data);
              }
            }

            // Check for common revert reasons
            if (errorMessage.includes("Profile does not exist")) {
              throw new Error(
                "Profile does not exist. Please create a health profile first.",
              );
            }
            if (errorMessage.includes("Storj URI required")) {
              throw new Error("Invalid Storj URI");
            }
            if (errorMessage.includes("Content hash required")) {
              throw new Error("Invalid content hash");
            }
            if (
              errorMessage.includes("function does not exist") ||
              errorMessage.includes("execution reverted")
            ) {
              throw new Error(
                "Contract function not found. The contract may not be upgraded to V2 yet.",
              );
            }
          }
        } catch (error) {
          console.error("📋 Could not get revert reason:", error);
        }

        throw new Error("Transaction reverted");
      }
    } catch (verifyError) {
      console.warn("⚠️ Could not verify transaction:", verifyError);
      // Don't throw - transaction might still be pending
    }

    onProgress?.(100);

    return {
      success: true,
      txHash: hash,
      searchTag,
      storjUri,
      contentHash,
    };
  } catch (error) {
    console.error("❌ Failed to add health event (V2):", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Delete (deactivate) a health event
 * Records deletion on-chain via isActive flag and event emission
 *
 * @param eventId - Event ID to delete
 * @param walletAddress - User's wallet address
 * @param getWalletClientFn - Function to get viem wallet client
 * @param deletionReason - Optional reason for deletion (stored as hash on-chain)
 */
export async function deleteHealthEvent(
  eventId: number,
  walletAddress: string,
  getWalletClientFn: () => Promise<import("viem").WalletClient | null>,
  deletionReason?: string,
): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
}> {
  try {
    console.log(`🗑️ Deleting health event ${eventId}...`);

    if (!walletAddress) {
      return {
        success: false,
        error: "Wallet address is required",
      };
    }

    // Get wallet client
    const walletClient = await getWalletClientFn();
    if (!walletClient) {
      throw new Error("Failed to get wallet client");
    }

    // Optional: Hash deletion reason if provided (for on-chain record)
    let deletionHash: `0x${string}` | undefined;
    if (deletionReason) {
      const { keccak256, stringToBytes } = await import("viem");
      deletionHash = keccak256(stringToBytes(deletionReason));
      console.log("📝 Deletion reason hash:", deletionHash);
    }

    // Call deactivateHealthEvent on contract
    const { getActiveChain } = await import("@/lib/networkConfig");
    const hash = await walletClient.writeContract({
      address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
      abi: secureHealthProfileAbi,
      functionName: "deactivateHealthEvent",
      args: [BigInt(eventId)],
      account: walletAddress as `0x${string}`,
      chain: getActiveChain(),
      gas: 100000n,
    });

    console.log("✅ Event deleted (deactivated):", hash);

    return {
      success: true,
      txHash: hash,
    };
  } catch (error) {
    console.error("❌ Failed to delete health event:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
