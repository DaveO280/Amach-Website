"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePrivyWalletService } from "@/hooks/usePrivyWalletService";
import {
  addHealthEventV2,
  readHealthTimeline,
  type HealthEvent,
} from "@/services/HealthEventService";
import {
  HealthEventType,
  getEventTypeDefinition,
  getEventTypesByCategory,
} from "@/types/healthEventTypes";
import { Plus, X, Eye, Filter, ChevronDown } from "lucide-react";
import VisualTimeline from "./VisualTimeline";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EventFieldValue {
  key: string;
  value: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  medication: "💊 Medications",
  condition: "🏥 Conditions & Diagnoses",
  injury: "🩹 Injuries",
  illness: "🤒 Illnesses",
  procedure: "🔬 Procedures",
  allergy: "⚠️ Allergies",
  measurement: "📊 Measurements",
  general: "📝 General",
  custom: "➕ Custom",
};

export default function HealthTimelineTab(): JSX.Element {
  const walletService = usePrivyWalletService();
  const address = walletService.getAddress();
  const isConnected = walletService.isWalletConnected();

  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedEventType, setSelectedEventType] = useState<
    HealthEventType | ""
  >("");
  const [customEventType, setCustomEventType] = useState<string>("");
  const [eventFields, setEventFields] = useState<EventFieldValue[]>([]);
  const [eventDate, setEventDate] = useState<string>(""); // Date for new events (YYYY-MM-DD)
  const [message, setMessage] = useState<string>("");
  const [progress, setProgress] = useState(0);

  // New filter states
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [dateRange, setDateRange] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  // Edit event states
  const [editingEventIndex, setEditingEventIndex] = useState<number | null>(
    null,
  );
  const [editEventType, setEditEventType] = useState<string>("");
  const [editEventDate, setEditEventDate] = useState<string>("");
  const [editEventFields, setEditEventFields] = useState<EventFieldValue[]>([]);

  // Get event types grouped by category
  const eventTypesByCategory = useMemo(() => {
    const categories = getEventTypesByCategory();
    console.log("📋 Event types by category:", categories);
    console.log("📋 Total categories:", Object.keys(categories).length);
    return categories;
  }, []);

  // Get current event type definition
  const currentEventDef = useMemo(() => {
    if (!selectedEventType) return null;
    return getEventTypeDefinition(selectedEventType);
  }, [selectedEventType]);

  // Filter events based on category and date range
  const filteredEvents = useMemo(() => {
    let filtered = [...events];

    // Filter by category
    if (selectedCategories.size > 0) {
      filtered = filtered.filter((event) => {
        try {
          const data = JSON.parse(event.encryptedData);
          const eventType = String(data.eventType || "").toUpperCase();

          // Determine category from event type
          let category = "general";
          if (eventType.includes("MEDICATION")) category = "medication";
          else if (eventType.includes("CONDITION")) category = "condition";
          else if (eventType.includes("INJURY")) category = "injury";
          else if (eventType.includes("ILLNESS")) category = "illness";
          else if (
            eventType.includes("SURGERY") ||
            eventType.includes("PROCEDURE")
          )
            category = "procedure";
          else if (eventType.includes("ALLERGY")) category = "allergy";
          else if (
            eventType.includes("WEIGHT") ||
            eventType.includes("HEIGHT") ||
            eventType.includes("BLOOD")
          )
            category = "measurement";
          else if (eventType.includes("NOTE") || eventType.includes("SNAPSHOT"))
            category = "general";
          else if (eventType.includes("CUSTOM")) category = "custom";

          return selectedCategories.has(category);
        } catch {
          return true;
        }
      });
    }

    // Filter by date range
    if (dateRange !== "all") {
      const now = Date.now();
      const cutoffTime = (() => {
        switch (dateRange) {
          case "6months":
            return now - 6 * 30 * 24 * 60 * 60 * 1000;
          case "year":
            return now - 365 * 24 * 60 * 60 * 1000;
          case "2years":
            return now - 2 * 365 * 24 * 60 * 60 * 1000;
          default:
            return 0;
        }
      })();

      filtered = filtered.filter(
        (event) => event.timestamp * 1000 >= cutoffTime,
      );
    }

    return filtered;
  }, [events, selectedCategories, dateRange]);

  // Toggle category filter
  const toggleCategory = (category: string) => {
    const newCategories = new Set(selectedCategories);
    if (newCategories.has(category)) {
      newCategories.delete(category);
    } else {
      newCategories.add(category);
    }
    setSelectedCategories(newCategories);
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedCategories(new Set());
    setDateRange("all");
  };

  // Update fields when event type changes
  useEffect(() => {
    if (selectedEventType && currentEventDef) {
      if (selectedEventType === HealthEventType.CUSTOM) {
        // Custom: start with empty fields
        setEventFields([{ key: "", value: "" }]);
      } else {
        // Predefined: populate with suggested fields
        const fields: EventFieldValue[] = currentEventDef.suggestedFields.map(
          (field) => ({
            key: field.key,
            value: "",
          }),
        );
        setEventFields(fields.length > 0 ? fields : [{ key: "", value: "" }]);
      }
    }
  }, [selectedEventType, currentEventDef]);

  const loadTimeline = async (): Promise<void> => {
    if (!address) return;

    setIsLoading(true);
    setMessage("Loading timeline...");

    try {
      // Get encryption key to fetch Storj data for V2 events
      let encryptionKey:
        | import("@/utils/walletEncryption").WalletEncryptionKey
        | undefined;
      try {
        const { getCachedWalletEncryptionKey } =
          await import("@/utils/walletEncryption");
        encryptionKey = await getCachedWalletEncryptionKey(
          address,
          walletService.signMessage,
        );
        console.log("✅ Got encryption key for Storj data fetching");
      } catch (keyError) {
        console.warn(
          "⚠️ Could not get encryption key, will only show blockchain data:",
          keyError,
        );
      }

      const result = await readHealthTimeline(address, encryptionKey);
      if (result.success && result.events) {
        // Filter out events marked as deleted in localStorage
        const deletedEventIds = JSON.parse(
          localStorage.getItem("deletedEventIds") || "[]",
        );
        const visibleEvents = result.events.filter(
          (event) => event.isActive && !deletedEventIds.includes(event.eventId),
        );

        console.log(
          `📋 Total events: ${result.events.length}, Visible: ${visibleEvents.length}, Hidden: ${result.events.length - visibleEvents.length} (${deletedEventIds.length} deleted locally)`,
        );

        setEvents(visibleEvents);
        setMessage(`Loaded ${visibleEvents.length} event(s)`);
      } else {
        setMessage(result.error || "Failed to load timeline");
      }
    } catch (error) {
      setMessage(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Load timeline on mount
  useEffect(() => {
    if (isConnected && address) {
      void loadTimeline();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  // Debug: Track editingEventIndex changes
  useEffect(() => {
    console.log("🔔 editingEventIndex changed to:", editingEventIndex);
    console.log(
      "🔔 Dialog should be:",
      editingEventIndex !== null ? "OPEN" : "CLOSED",
    );
  }, [editingEventIndex]);

  const handleAddEvent = async (): Promise<void> => {
    if (!selectedEventType) {
      setMessage("❌ Please select an event type");
      return;
    }

    if (
      selectedEventType === HealthEventType.CUSTOM &&
      !customEventType.trim()
    ) {
      setMessage("❌ Please enter a custom event type name");
      return;
    }

    if (!address) {
      setMessage("❌ Wallet not connected");
      return;
    }

    setIsLoading(true);
    setProgress(0);
    setMessage("Adding event...");

    try {
      // Get wallet client function
      const getWalletClient = walletService.getWalletClient;

      // Convert fields to data object
      const data: Record<string, unknown> = {};
      eventFields.forEach((field) => {
        if (field.key.trim()) {
          const trimmedValue = field.value.trim();
          if (trimmedValue === "") return;

          // Try to parse as number
          if (!isNaN(Number(trimmedValue)) && trimmedValue !== "") {
            data[field.key.trim()] = Number(trimmedValue);
          } else if (trimmedValue.toLowerCase() === "true") {
            data[field.key.trim()] = true;
          } else if (trimmedValue.toLowerCase() === "false") {
            data[field.key.trim()] = false;
          } else {
            data[field.key.trim()] = trimmedValue;
          }
        }
      });

      // Determine event type string
      const eventTypeString =
        selectedEventType === HealthEventType.CUSTOM
          ? customEventType.trim().toUpperCase().replace(/\s+/g, "_")
          : selectedEventType;

      // Parse custom event date if provided
      let customTimestamp: number | undefined;
      if (eventDate) {
        const [year, month, day] = eventDate.split("-").map(Number);
        const dateObj = new Date(year, month - 1, day); // month is 0-indexed
        customTimestamp = dateObj.getTime(); // milliseconds
      }

      // Use addHealthEventV2 with Storj
      const result = await addHealthEventV2(
        {
          eventType: eventTypeString,
          data,
          timestamp: customTimestamp, // Pass custom timestamp if provided
        },
        address,
        walletService.signMessage,
        getWalletClient,
        (p) => setProgress(p),
      );

      if (result.success) {
        setMessage(
          `✅ Event added! Transaction: ${result.txHash?.substring(0, 10)}... Waiting for confirmation...`,
        );
        // Clear form
        setSelectedEventType("");
        setCustomEventType("");
        setEventFields([{ key: "", value: "" }]);
        setEventDate(""); // Clear event date
        setShowAddForm(false);
        setProgress(0);

        // Wait for transaction confirmation before reloading
        if (result.txHash) {
          try {
            const { createPublicClient, http } = await import("viem");
            const { getActiveChain } = await import("@/lib/networkConfig");
            const rpcUrl =
              process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
              "https://sepolia.era.zksync.dev";
            const publicClient = createPublicClient({
              chain: getActiveChain(),
              transport: http(rpcUrl),
            });

            console.log("⏳ Waiting for transaction confirmation...");
            const receipt = await publicClient.waitForTransactionReceipt({
              hash: result.txHash as `0x${string}`,
            });

            if (receipt.status === "success") {
              console.log("✅ Transaction confirmed! Reloading timeline...");
              setMessage(`✅ Event confirmed! Reloading timeline...`);
              // Wait a bit more for the state to propagate
              setTimeout(() => loadTimeline(), 3000);
            } else {
              setMessage(`❌ Transaction failed on-chain`);
            }
          } catch (waitError) {
            console.warn("⚠️ Could not wait for confirmation:", waitError);
            // Still try to reload after delay
            setTimeout(() => loadTimeline(), 5000);
          }
        } else {
          // No txHash, just reload after delay
          setTimeout(() => loadTimeline(), 2000);
        }
      } else {
        setMessage(`❌ Failed: ${result.error}`);
      }
    } catch (error) {
      setMessage(
        `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsLoading(false);
      setProgress(0);
    }
  };

  const handleEditEvent = (eventIndex: number): void => {
    console.log("🔍 handleEditEvent called with index:", eventIndex);
    console.log("📊 Current state - editingEventIndex:", editingEventIndex);
    console.log("📋 Total events in state:", events.length);

    const event = events[eventIndex];
    if (!event) {
      console.error("❌ Event not found at index:", eventIndex);
      return;
    }

    console.log("✅ Event found:", {
      eventId: event.eventId,
      timestamp: event.timestamp,
      isActive: event.isActive,
    });

    // Parse the encrypted data to get event fields
    try {
      if (!event.encryptedData || event.encryptedData.trim().length === 0) {
        console.error("❌ Event has no encrypted data to parse:", {
          eventId: event.eventId,
          hasStorjUri: !!event.storjUri,
        });
        throw new Error("Event has no encrypted data");
      }

      const eventData = JSON.parse(event.encryptedData);
      console.log("📋 Event data:", eventData);

      // Extract event type
      const eventType = eventData.eventType || "UNKNOWN";
      setEditEventType(eventType);

      // Convert timestamp to date input format (YYYY-MM-DD) in local timezone
      const eventDate = new Date(event.timestamp * 1000);
      const year = eventDate.getFullYear();
      const month = String(eventDate.getMonth() + 1).padStart(2, "0");
      const day = String(eventDate.getDate()).padStart(2, "0");
      const dateString = `${year}-${month}-${day}`;
      setEditEventDate(dateString);

      // Extract fields (exclude eventType, timestamp, id, data wrapper, and metadata)
      const fields: EventFieldValue[] = [];
      const excludedFields = [
        "eventType",
        "timestamp",
        "data",
        "id",
        "metadata",
        "attestations",
      ];

      Object.entries(eventData).forEach(([key, value]) => {
        if (!excludedFields.includes(key)) {
          fields.push({
            key,
            value: String(value),
          });
        }
      });

      // If there's a nested 'data' object, extract those fields too
      if (eventData.data && typeof eventData.data === "object") {
        Object.entries(eventData.data).forEach(([key, value]) => {
          fields.push({
            key,
            value: String(value),
          });
        });
      }

      // If no fields found, add one empty field for editing
      if (fields.length === 0) {
        fields.push({ key: "", value: "" });
      }

      setEditEventFields(fields);
      setEditingEventIndex(eventIndex);

      console.log("✅ Edit state populated:", {
        eventType,
        date: dateString,
        fieldsCount: fields.length,
      });
    } catch (error) {
      console.error("❌ Failed to parse event data:", error);
      // Set defaults if parsing fails
      const eventDate = new Date(event.timestamp * 1000);
      const year = eventDate.getFullYear();
      const month = String(eventDate.getMonth() + 1).padStart(2, "0");
      const day = String(eventDate.getDate()).padStart(2, "0");
      const dateString = `${year}-${month}-${day}`;
      setEditEventType("UNKNOWN");
      setEditEventDate(dateString);
      setEditEventFields([{ key: "", value: "" }]);
      setEditingEventIndex(eventIndex);
    }
  };

  const handleSaveEdit = async (): Promise<void> => {
    if (editingEventIndex === null || !editEventDate || !address) return;

    const event = events[editingEventIndex];
    if (!event) return;

    setIsLoading(true);
    setMessage("Updating event date...");

    try {
      // Parse the new date in local timezone and create new timestamp
      // Date input gives us "YYYY-MM-DD", we need to parse it as local time, not UTC
      const [year, month, day] = editEventDate.split("-").map(Number);
      const newDate = new Date(year, month - 1, day); // month is 0-indexed
      const newTimestamp = Math.floor(newDate.getTime() / 1000);

      console.log("📅 Updating event date:", {
        oldTimestamp: event.timestamp,
        newTimestamp,
        oldDate: new Date(event.timestamp * 1000).toISOString(),
        newDate: newDate.toISOString(),
      });

      // If event has Storj URI, update the data in Storj
      if (event.storjUri) {
        try {
          console.log("☁️ Updating event in Storj:", event.storjUri);
          const { getCachedWalletEncryptionKey } =
            await import("@/utils/walletEncryption");

          const encryptionKey = await getCachedWalletEncryptionKey(
            address,
            walletService.signMessage,
          );

          // Step 1: Retrieve the current event data from Storj
          const retrieveResponse = await fetch("/api/storj", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "timeline/retrieve",
              storjUri: event.storjUri,
              userAddress: address,
              encryptionKey,
            }),
          });

          if (!retrieveResponse.ok) {
            throw new Error("Failed to retrieve event data from Storj");
          }

          const retrieveResult = await retrieveResponse.json();
          const eventData = retrieveResult.result;

          if (!eventData) {
            throw new Error("No event data returned from Storj");
          }

          // Step 2: Update the event data with new timestamp and fields
          // Build updated data object from edit fields
          const updatedData: Record<string, unknown> = {};
          editEventFields.forEach((field) => {
            const key = field.key.trim();
            const value = field.value.trim();
            if (key && value) {
              // Try to parse as number or boolean
              if (!isNaN(Number(value)) && value !== "") {
                updatedData[key] = Number(value);
              } else if (value.toLowerCase() === "true") {
                updatedData[key] = true;
              } else if (value.toLowerCase() === "false") {
                updatedData[key] = false;
              } else {
                updatedData[key] = value;
              }
            }
          });

          const updatedEventData = {
            id: crypto.randomUUID(), // New ID for the updated event
            timestamp: newTimestamp * 1000, // Convert back to milliseconds for storage
            eventType: editEventType, // Keep the event type
            data: updatedData, // Update with edited fields
          };

          console.log(
            "📝 Creating new event to replace edited one:",
            updatedEventData,
          );
          console.log("🔍 DEBUG - Timestamp details:", {
            editEventDate,
            newDate: newDate.toISOString(),
            newTimestampSeconds: newTimestamp,
            newTimestampMillis: newTimestamp * 1000,
            updatedEventDataTimestamp: updatedEventData.timestamp,
            asDate: new Date(updatedEventData.timestamp).toISOString(),
          });

          // Step 3: Deactivate the old event on blockchain (creates audit trail)
          if (event.eventId !== undefined) {
            console.log("🔗 Deactivating old event on blockchain...");
            const { getActiveChain } = await import("@/lib/networkConfig");
            const { secureHealthProfileAbi, SECURE_HEALTH_PROFILE_CONTRACT } =
              await import("@/lib/contractConfig");
            const { createPublicClient, http } = await import("viem");

            const walletClient = await walletService.getWalletClient();
            if (!walletClient || !walletClient.account) {
              throw new Error("Wallet client not available");
            }

            const deactivateTxHash = await walletClient.writeContract({
              address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
              abi: secureHealthProfileAbi,
              functionName: "deactivateHealthEvent",
              args: [BigInt(event.eventId)],
              chain: getActiveChain(),
              account: walletClient.account,
            });

            console.log("⏳ Waiting for deactivation confirmation...");
            const rpcUrl =
              process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
              "https://sepolia.era.zksync.dev";
            const publicClient = createPublicClient({
              chain: getActiveChain(),
              transport: http(rpcUrl),
            });

            await publicClient.waitForTransactionReceipt({
              hash: deactivateTxHash,
            });
            console.log("✅ Old event deactivated");

            // Mark old event as deleted locally
            const deletedEventIds = JSON.parse(
              localStorage.getItem("deletedEventIds") || "[]",
            );
            deletedEventIds.push(event.eventId);
            localStorage.setItem(
              "deletedEventIds",
              JSON.stringify(deletedEventIds),
            );
          }

          // Step 4: Create a new event with updated data
          console.log("☁️ Creating new event with updated data...");

          const result = await addHealthEventV2(
            {
              eventType: updatedEventData.eventType,
              data: updatedEventData.data,
              timestamp: updatedEventData.timestamp, // Pass the custom timestamp
            },
            address,
            walletService.signMessage,
            walletService.getWalletClient,
            (p) => setProgress(p),
          );

          if (!result.success) {
            throw new Error(result.error || "Failed to create updated event");
          }

          console.log("✅ New event created with updated data");

          // Step 5: Close dialog and clear edit state
          setEditingEventIndex(null);
          setEditEventDate("");
          setEditEventType("");
          setEditEventFields([]);

          // Step 6: Reload timeline to show the new event
          setMessage("✅ Event updated successfully! Reloading timeline...");
          setTimeout(() => loadTimeline(), 2000);
        } catch (storjError) {
          console.error("❌ Failed to update in Storj:", storjError);

          // Fallback to local-only update
          const continueLocalOnly = confirm(
            "Failed to update in cloud storage. Update locally only? (Cloud data will remain unchanged)",
          );

          if (!continueLocalOnly) {
            setIsLoading(false);
            setMessage("❌ Update cancelled");
            return;
          }

          // Local-only update
          const updatedEvents = [...events];
          updatedEvents[editingEventIndex] = {
            ...event,
            timestamp: newTimestamp,
          };
          setEvents(updatedEvents);
          setMessage("⚠️ Date updated locally only");
        }
      } else {
        // No Storj URI - just update locally
        const updatedEvents = [...events];
        updatedEvents[editingEventIndex] = {
          ...event,
          timestamp: newTimestamp,
        };
        setEvents(updatedEvents);
        setMessage("✅ Date updated!");
      }

      console.log("✅ Event date updated");

      // Close dialog
      setEditingEventIndex(null);
      setEditEventDate("");
    } catch (error) {
      setMessage(
        `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteEvent = async (eventIndex: number): Promise<void> => {
    if (!address) {
      setMessage("❌ Wallet not connected");
      return;
    }

    console.log(
      "🗑️ handleDeleteEvent called - eventIndex:",
      eventIndex,
      "total events:",
      events.length,
    );

    const event = events[eventIndex];
    if (!event) {
      console.error("❌ Event not found at index:", eventIndex);
      setMessage("❌ Event not found");
      return;
    }

    console.log("📋 Event to delete:", {
      eventId: event.eventId,
      timestamp: event.timestamp,
      isActive: event.isActive,
      storjUri: event.storjUri,
    });

    if (
      !confirm(
        "Are you sure you want to delete this event? This will permanently delete the event data from storage and mark it as deleted on-chain.",
      )
    ) {
      return;
    }

    setIsLoading(true);
    setMessage("Deleting event...");

    try {
      // Step 1: Delete from Storj if it's a V2 event with storjUri
      if (event.storjUri) {
        try {
          console.log("🗑️ Deleting event data from Storj:", event.storjUri);
          const { getCachedWalletEncryptionKey } =
            await import("@/utils/walletEncryption");

          const encryptionKey = await getCachedWalletEncryptionKey(
            address,
            walletService.signMessage,
          );

          // Call the server-side API route for deletion
          const response = await fetch("/api/storj", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "storage/delete",
              storjUri: event.storjUri,
              userAddress: address,
              encryptionKey,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(
              errorData.error || `Delete failed: ${response.status}`,
            );
          }

          console.log("✅ Event data deleted from Storj");
        } catch (storjError) {
          console.error("❌ Failed to delete from Storj:", storjError);

          // Ask user if they want to continue with local deletion only
          const continueWithLocalOnly = confirm(
            "Failed to delete from cloud storage. Would you like to hide the event locally? (Data will remain in storage)",
          );

          if (!continueWithLocalOnly) {
            setIsLoading(false);
            setMessage("❌ Deletion cancelled");
            return;
          }

          // Fall back to localStorage deletion
          console.log("⚠️ Falling back to local-only deletion");
        }
      }

      // Step 2: Record deletion on blockchain
      if (event.eventId !== undefined) {
        try {
          console.log(
            "⛓️ Recording deletion on blockchain for eventId:",
            event.eventId,
          );
          setMessage("Recording deletion on blockchain...");

          const getWalletClient = walletService.getWalletClient;
          const walletClient = await getWalletClient();

          if (!walletClient || !walletClient.account) {
            throw new Error("Wallet client or account not available");
          }

          const { SECURE_HEALTH_PROFILE_CONTRACT, secureHealthProfileAbi } =
            await import("@/lib/contractConfig");
          const { getActiveChain } = await import("@/lib/networkConfig");
          const { createPublicClient, http } = await import("viem");

          // Extract blockchain index from eventId (format: "address-index")
          const blockchainIndex =
            typeof event.eventId === "string"
              ? parseInt(event.eventId.split("-").pop() || "0", 10)
              : event.eventId || 0;

          // Call deactivateHealthEvent on the contract
          const txHash = await walletClient.writeContract({
            address: SECURE_HEALTH_PROFILE_CONTRACT as `0x${string}`,
            abi: secureHealthProfileAbi,
            functionName: "deactivateHealthEvent",
            args: [BigInt(blockchainIndex)],
            chain: getActiveChain(),
            account: walletClient.account,
          });

          console.log("📝 Deletion transaction submitted:", txHash);
          setMessage(
            `⏳ Deletion transaction submitted: ${txHash.substring(0, 10)}...`,
          );

          // Wait for transaction confirmation
          const rpcUrl =
            process.env.NEXT_PUBLIC_ZKSYNC_RPC_URL ||
            "https://sepolia.era.zksync.dev";
          const publicClient = createPublicClient({
            chain: getActiveChain(),
            transport: http(rpcUrl),
          });

          console.log("⏳ Waiting for deletion transaction confirmation...");
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
          });

          if (receipt.status === "success") {
            console.log("✅ Deletion confirmed on-chain!");
            setMessage("✅ Deletion confirmed on-chain!");
          } else {
            console.warn("⚠️ Deletion transaction failed on-chain");
            setMessage("⚠️ Deletion transaction failed");
          }
        } catch (blockchainError) {
          console.error(
            "❌ Failed to record deletion on blockchain:",
            blockchainError,
          );

          // Ask user if they want to continue with local deletion only
          const continueWithoutBlockchain = confirm(
            "Failed to record deletion on blockchain. Continue with local deletion only? (Event will remain active on-chain)",
          );

          if (!continueWithoutBlockchain) {
            setIsLoading(false);
            setMessage("❌ Deletion cancelled");
            return;
          }

          setMessage("⚠️ Deleted locally only (not recorded on-chain)");
        }
      }

      // Step 3: Store deletion record in localStorage (as backup)
      const deletedEvents = JSON.parse(
        localStorage.getItem("deletedEventIds") || "[]",
      );
      if (
        event.eventId !== undefined &&
        !deletedEvents.includes(event.eventId)
      ) {
        deletedEvents.push(event.eventId);
        localStorage.setItem("deletedEventIds", JSON.stringify(deletedEvents));
        console.log(
          "📝 Stored deletion record in localStorage for eventId:",
          event.eventId,
        );
      }

      // Step 4: Remove from local state immediately
      const updatedEvents = events.filter((_, index) => index !== eventIndex);
      setEvents(updatedEvents);

      console.log("✅ Event removed from timeline");
    } catch (error) {
      console.error("❌ Delete error:", error);
      setMessage(
        `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">
          Please connect your wallet to view your health timeline
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={() => setShowAddForm(!showAddForm)}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          {showAddForm ? "Cancel" : "Add Event"}
        </Button>
        <Button
          onClick={loadTimeline}
          variant="outline"
          size="sm"
          disabled={isLoading}
          className="flex items-center gap-2"
        >
          <Eye className="h-4 w-4" />
          View All
        </Button>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.startsWith("✅") ||
            message.toLowerCase().includes("loaded") ||
            message.toLowerCase().includes("found")
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : message.startsWith("❌")
                ? "bg-red-50 text-red-800 border border-red-200"
                : "bg-blue-50 text-blue-800 border border-blue-200"
          }`}
        >
          {message}
        </div>
      )}

      {/* Progress Bar */}
      {progress > 0 && progress < 100 && (
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Add Event Form */}
      {showAddForm && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardHeader>
            <CardTitle className="text-lg text-emerald-900">
              Add Health Event
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Event Type Selector */}
            <div>
              <Label htmlFor="eventType">Event Type</Label>
              <Select
                value={selectedEventType}
                onValueChange={(value) =>
                  setSelectedEventType(value as HealthEventType | "")
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select an event type..." />
                </SelectTrigger>
                <SelectContent
                  className="z-[100] !bg-white !border-gray-300 shadow-xl max-h-[400px] w-[var(--radix-select-trigger-width)] min-w-[300px]"
                  position="popper"
                  side="bottom"
                  sideOffset={4}
                >
                  {Object.keys(eventTypesByCategory).length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-gray-500">
                      No event types available
                    </div>
                  ) : (
                    Object.entries(eventTypesByCategory).map(
                      ([category, types], categoryIndex) => (
                        <div key={category}>
                          {categoryIndex > 0 && (
                            <div className="h-px bg-gray-200 my-1" />
                          )}
                          <div className="px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-50 sticky top-0 z-10">
                            {CATEGORY_LABELS[category] || category}
                          </div>
                          {types.map((typeDef) => (
                            <SelectItem
                              key={typeDef.type}
                              value={typeDef.type}
                              className="pl-8 pr-3 py-2 cursor-pointer hover:bg-emerald-50 focus:bg-emerald-50"
                            >
                              <span className="mr-2 text-base">
                                {typeDef.icon}
                              </span>
                              <span className="text-sm">{typeDef.label}</span>
                            </SelectItem>
                          ))}
                        </div>
                      ),
                    )
                  )}
                </SelectContent>
              </Select>
              {currentEventDef?.description && (
                <p className="text-xs text-gray-500 mt-1">
                  {currentEventDef.description}
                </p>
              )}
            </div>

            {/* Custom Event Type Input */}
            {selectedEventType === HealthEventType.CUSTOM && (
              <div>
                <Label htmlFor="customEventType">Custom Event Type Name</Label>
                <Input
                  id="customEventType"
                  value={customEventType}
                  onChange={(e) => setCustomEventType(e.target.value)}
                  placeholder="e.g., Exercise Completed, Mood Recorded"
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Will be converted to: &quot;EXERCISE_COMPLETED&quot;,
                  &quot;MOOD_RECORDED&quot;, etc.
                </p>
              </div>
            )}

            {/* Event Date Input */}
            <div>
              <Label htmlFor="eventDate">Event Date</Label>
              <Input
                id="eventDate"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]} // Prevent future dates
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                When did this event occur? Leave empty to use current date/time.
              </p>
            </div>

            {/* Dynamic Fields */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Event Data</Label>
                {selectedEventType !== HealthEventType.CUSTOM &&
                  currentEventDef?.suggestedFields.length === 0 && (
                    <Button
                      type="button"
                      onClick={() =>
                        setEventFields([...eventFields, { key: "", value: "" }])
                      }
                      variant="outline"
                      size="sm"
                      className="text-xs h-6"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Field
                    </Button>
                  )}
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {eventFields.map((field, index) => {
                  const fieldDef = currentEventDef?.suggestedFields.find(
                    (f) => f.key === field.key,
                  );

                  return (
                    <div key={index} className="flex gap-2 items-center">
                      <div className="flex-1">
                        {fieldDef ? (
                          <Label className="text-xs text-gray-600">
                            {fieldDef.label}
                            {fieldDef.required && (
                              <span className="text-red-500 ml-1">*</span>
                            )}
                          </Label>
                        ) : (
                          <Input
                            value={field.key}
                            onChange={(e) => {
                              const newFields = [...eventFields];
                              newFields[index].key = e.target.value;
                              setEventFields(newFields);
                            }}
                            placeholder="Field name"
                            className="text-sm mb-1"
                          />
                        )}
                        {fieldDef?.type === "select" ? (
                          <Select
                            value={field.value || ""}
                            onValueChange={(value) => {
                              const newFields = [...eventFields];
                              newFields[index].value = value;
                              setEventFields(newFields);
                            }}
                          >
                            <SelectTrigger className="h-9 w-full">
                              <SelectValue
                                placeholder={
                                  fieldDef.placeholder || "Select..."
                                }
                              />
                            </SelectTrigger>
                            <SelectContent
                              className="!bg-white !border-gray-300 shadow-lg z-[110]"
                              position="popper"
                              side="bottom"
                              sideOffset={4}
                            >
                              {fieldDef.options?.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={field.value}
                            onChange={(e) => {
                              const newFields = [...eventFields];
                              newFields[index].value = e.target.value;
                              setEventFields(newFields);
                            }}
                            placeholder={fieldDef?.placeholder || "Value"}
                            type={
                              fieldDef?.type === "number"
                                ? "number"
                                : fieldDef?.type === "date"
                                  ? "date"
                                  : "text"
                            }
                            className="text-sm"
                          />
                        )}
                      </div>
                      {(selectedEventType === HealthEventType.CUSTOM ||
                        eventFields.length > 1) && (
                        <Button
                          type="button"
                          onClick={() =>
                            setEventFields(
                              eventFields.filter((_, i) => i !== index),
                            )
                          }
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 mt-6"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <Button
              onClick={handleAddEvent}
              disabled={
                isLoading ||
                !selectedEventType ||
                (selectedEventType === HealthEventType.CUSTOM &&
                  !customEventType.trim())
              }
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {isLoading ? `Adding... ${progress}%` : "Add Event"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filters Section */}
      <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50/50 to-white">
        <CardContent className="p-4">
          <div className="space-y-4">
            {/* Filter Header */}
            <div className="flex items-center justify-between">
              <Button
                onClick={() => setShowFilters(!showFilters)}
                variant="ghost"
                className="flex items-center gap-2 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100 p-2"
              >
                <Filter className="h-4 w-4" />
                <span className="font-medium">Filters</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showFilters ? "rotate-180" : ""}`}
                />
              </Button>

              {(selectedCategories.size > 0 || dateRange !== "all") && (
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="bg-emerald-100 text-emerald-800"
                  >
                    {selectedCategories.size > 0 &&
                      `${selectedCategories.size} categories`}
                    {selectedCategories.size > 0 &&
                      dateRange !== "all" &&
                      " • "}
                    {dateRange !== "all" && dateRange}
                  </Badge>
                  <Button
                    onClick={clearFilters}
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>

            {/* Filter Controls */}
            {showFilters && (
              <div className="space-y-4 pt-2 border-t border-emerald-100">
                {/* Category Filters */}
                <div>
                  <Label className="text-sm font-semibold text-gray-700 mb-2 block">
                    Event Categories
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                      <Button
                        key={key}
                        onClick={() => toggleCategory(key)}
                        variant={
                          selectedCategories.has(key) ? "default" : "outline"
                        }
                        size="sm"
                        className={`text-xs md:text-sm ${
                          selectedCategories.has(key)
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        }`}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Date Range Filter */}
                <div>
                  <Label className="text-sm font-semibold text-gray-700 mb-2 block">
                    Time Period
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "all", label: "All Time" },
                      { value: "6months", label: "Last 6 Months" },
                      { value: "year", label: "Last Year" },
                      { value: "2years", label: "Last 2 Years" },
                    ].map(({ value, label }) => (
                      <Button
                        key={value}
                        onClick={() => setDateRange(value)}
                        variant={dateRange === value ? "default" : "outline"}
                        size="sm"
                        className={`text-xs md:text-sm ${
                          dateRange === value
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        }`}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Results Summary */}
                <div className="text-sm text-gray-600 pt-2 border-t border-emerald-100">
                  Showing{" "}
                  <span className="font-semibold text-emerald-700">
                    {filteredEvents.length}
                  </span>{" "}
                  of <span className="font-semibold">{events.length}</span>{" "}
                  events
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Visual Timeline */}
      <VisualTimeline
        events={filteredEvents}
        onDeleteEvent={handleDeleteEvent}
        onEditEvent={handleEditEvent}
        isLoading={isLoading}
      />

      {/* Edit Event Dialog */}
      <Dialog
        open={editingEventIndex !== null}
        onOpenChange={(open) => {
          console.log("🔔 Dialog onOpenChange called with:", open);
          if (!open) {
            setEditingEventIndex(null);
            setEditEventDate("");
            setEditEventType("");
            setEditEventFields([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto z-[9999]">
          <DialogHeader>
            <DialogTitle>Edit Health Event</DialogTitle>
            <DialogDescription>
              Update the details of this health event
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Event Type (read-only display) */}
            <div>
              <Label className="text-sm font-medium">Event Type</Label>
              <div className="mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700">
                {editEventType
                  ? getEventTypeDefinition(editEventType).label
                  : "Unknown"}
              </div>
            </div>

            {/* Event Date */}
            <div>
              <Label htmlFor="editEventDate">Event Date</Label>
              <Input
                id="editEventDate"
                type="date"
                value={editEventDate}
                onChange={(e) => setEditEventDate(e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Event Fields */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Event Details</Label>
                <Button
                  type="button"
                  onClick={() =>
                    setEditEventFields([
                      ...editEventFields,
                      { key: "", value: "" },
                    ])
                  }
                  variant="outline"
                  size="sm"
                  className="h-8"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Field
                </Button>
              </div>

              <div className="space-y-2">
                {editEventFields.map((field, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={field.key}
                      onChange={(e) => {
                        const newFields = [...editEventFields];
                        newFields[index].key = e.target.value;
                        setEditEventFields(newFields);
                      }}
                      placeholder="Field name (e.g., severity, medication)"
                      className="flex-1 text-sm"
                    />
                    <Input
                      value={field.value}
                      onChange={(e) => {
                        const newFields = [...editEventFields];
                        newFields[index].value = e.target.value;
                        setEditEventFields(newFields);
                      }}
                      placeholder="Value"
                      className="flex-1 text-sm"
                    />
                    {editEventFields.length > 1 && (
                      <Button
                        type="button"
                        onClick={() =>
                          setEditEventFields(
                            editEventFields.filter((_, i) => i !== index),
                          )
                        }
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0 text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingEventIndex(null);
                setEditEventDate("");
                setEditEventType("");
                setEditEventFields([]);
              }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={isLoading || !editEventDate}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
