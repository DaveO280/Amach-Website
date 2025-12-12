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
  searchEventsByType,
  deleteHealthEvent,
  type HealthEvent,
} from "@/services/HealthEventService";
import {
  HealthEventType,
  getEventTypeDefinition,
  getEventTypesByCategory,
  formatEventType,
} from "@/types/healthEventTypes";
import { Plus, X, Search, Calendar, Eye, Trash2 } from "lucide-react";

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
  const [searchType, setSearchType] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [progress, setProgress] = useState(0);

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
        setEvents(result.events);
        setMessage(`Loaded ${result.events.length} event(s)`);
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

      // Use addHealthEventV2 with Storj
      const result = await addHealthEventV2(
        { eventType: eventTypeString, data },
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

  const handleSearch = async (): Promise<void> => {
    if (!searchType.trim() || !address) {
      setMessage("❌ Please enter an event type to search");
      return;
    }

    setIsLoading(true);
    setMessage(`Searching for ${searchType}...`);

    try {
      const result = await searchEventsByType(
        address,
        searchType,
        walletService.signMessage,
      );
      if (result.success && result.events) {
        setEvents(result.events);
        setMessage(`✅ Found ${result.events.length} ${searchType} event(s)`);
      } else {
        setMessage(result.error || "No events found");
      }
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

    const event = events[eventIndex];
    if (!event) {
      setMessage("❌ Event not found");
      return;
    }

    if (event.eventId === undefined) {
      setMessage("❌ Event ID not available. Please reload timeline.");
      return;
    }

    if (
      !confirm(
        "Are you sure you want to delete this event? This will record the deletion on-chain (event marked as inactive).",
      )
    ) {
      return;
    }

    setIsLoading(true);
    setMessage("Deleting event...");

    try {
      const result = await deleteHealthEvent(
        event.eventId,
        address,
        walletService.getWalletClient,
      );

      if (result.success) {
        setMessage(
          `✅ Event deleted! Transaction: ${result.txHash?.substring(0, 10)}...`,
        );
        // Reload timeline to show updated state
        setTimeout(() => loadTimeline(), 2000);
      } else {
        setMessage(`❌ Failed: ${result.error}`);
      }
    } catch (error) {
      setMessage(
        `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const formatEventData = (encryptedData: string): JSX.Element => {
    try {
      const parsed = JSON.parse(encryptedData);

      // If the parsed data has a 'data' property that's an object, flatten it
      let data = parsed;
      if (parsed.data && typeof parsed.data === "object") {
        // Merge the nested 'data' object into the parent
        data = { ...parsed, ...parsed.data };
        delete data.data; // Remove the nested 'data' key
      }

      const entries = Object.entries(data);

      // Filter out technical fields that shouldn't be displayed
      const hiddenFields = ["eventtype", "id", "timestamp"];
      const displayEntries = entries.filter(
        ([key]) => !hiddenFields.includes(key.toLowerCase()),
      );

      // Separate into priority fields and other fields
      const priorityFields = [
        "severity",
        "description",
        "location",
        "bodypart",
        "diagnosis",
        "medication",
        "symptoms",
        "treatment",
      ];
      const priority = displayEntries.filter(([key]) =>
        priorityFields.includes(key.toLowerCase()),
      );
      const other = displayEntries.filter(
        ([key]) => !priorityFields.includes(key.toLowerCase()),
      );

      // Helper to format value (handle objects, arrays, etc.)
      const formatValue = (value: unknown): string => {
        if (value === null || value === undefined) return "N/A";
        if (typeof value === "object") {
          return JSON.stringify(value, null, 2);
        }
        return String(value);
      };

      return (
        <div className="space-y-2">
          {/* Priority fields shown prominently */}
          {priority.map(([key, value]) => (
            <div key={key} className="text-sm">
              <span className="font-semibold text-emerald-700 capitalize">
                {key.replace(/([A-Z])/g, " $1").trim()}:
              </span>{" "}
              <span className="text-gray-700">{formatValue(value)}</span>
            </div>
          ))}

          {/* Other fields */}
          {other.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-emerald-600 hover:text-emerald-700 font-medium">
                More details ({other.length})
              </summary>
              <div className="mt-2 space-y-1 pl-4 border-l-2 border-emerald-200">
                {other.map(([key, value]) => (
                  <div key={key}>
                    <span className="font-semibold text-emerald-700 capitalize">
                      {key.replace(/([A-Z])/g, " $1").trim()}:
                    </span>{" "}
                    <span className="text-gray-700 whitespace-pre-wrap">
                      {formatValue(value)}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      );
    } catch {
      return <span className="text-xs text-gray-500">(encrypted data)</span>;
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

      {/* Search */}
      <div className="flex gap-2">
        <Input
          value={searchType}
          onChange={(e) => setSearchType(e.target.value)}
          placeholder="Search by event type (e.g., MEDICATION_STARTED)"
          className="flex-1"
        />
        <Button
          onClick={handleSearch}
          disabled={isLoading || !searchType.trim()}
          variant="outline"
          className="flex items-center gap-2"
        >
          <Search className="h-4 w-4" />
          Search
        </Button>
      </div>

      {/* Events List */}
      <div className="space-y-3">
        {events.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50 text-emerald-300" />
            <p className="text-gray-600">
              No events found. Add your first health event above!
            </p>
          </div>
        ) : (
          events.map((event, index) => {
            // Extract event type for display
            let eventTypeDisplay = "Health Event";
            try {
              const data = JSON.parse(event.encryptedData);
              if (data.eventType) {
                eventTypeDisplay = formatEventType(String(data.eventType));
              }
            } catch {}

            return (
              <Card
                key={index}
                className={`border-emerald-200 bg-emerald-50/30 shadow-sm hover:shadow-md transition-shadow ${
                  !event.isActive ? "opacity-60" : ""
                }`}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Event Type Header */}
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-2 w-2 rounded-full ${
                            event.isActive ? "bg-emerald-500" : "bg-gray-400"
                          }`}
                        ></div>
                        <h3 className="font-semibold text-emerald-900 text-lg">
                          {eventTypeDisplay}
                        </h3>
                        {!event.isActive && (
                          <span className="text-xs text-gray-500 italic">
                            (Deleted)
                          </span>
                        )}
                      </div>

                      {/* Timestamp */}
                      <div className="text-xs text-emerald-600 font-medium">
                        {new Date(event.timestamp * 1000).toLocaleString(
                          undefined,
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          },
                        )}
                      </div>

                      {/* Event Data */}
                      {event.isActive && (
                        <div className="bg-white rounded-lg p-3 border border-emerald-100 space-y-2">
                          {formatEventData(event.encryptedData)}
                        </div>
                      )}
                      {!event.isActive && (
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <p className="text-sm text-gray-500 italic">
                            Event data deleted. Deletion recorded on-chain.
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {/* Status Badge */}
                      {event.isActive ? (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full font-medium whitespace-nowrap">
                          Active
                        </span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1.5 rounded-full font-medium whitespace-nowrap">
                          Deleted
                        </span>
                      )}

                      {/* Delete Button */}
                      {event.isActive && (
                        <Button
                          onClick={() => handleDeleteEvent(index)}
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8"
                          disabled={isLoading}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
