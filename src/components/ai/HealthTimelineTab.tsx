"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useZkSyncSsoWallet } from "@/hooks/useZkSyncSsoWallet";
import {
  addHealthEvent,
  readHealthTimeline,
  searchEventsByType,
  type HealthEvent,
} from "@/services/HealthEventService";
import { Plus, X, Search, Calendar, Eye } from "lucide-react";

export default function HealthTimelineTab(): JSX.Element {
  const { isConnected, address } = useZkSyncSsoWallet();
  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [eventType, setEventType] = useState<string>("");
  const [eventFields, setEventFields] = useState<
    Array<{ key: string; value: string }>
  >([{ key: "", value: "" }]);
  const [searchType, setSearchType] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  const loadTimeline = async (): Promise<void> => {
    if (!address) return;

    setIsLoading(true);
    setMessage("Loading timeline...");

    try {
      const result = await readHealthTimeline(address);
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
    if (!eventType.trim()) {
      setMessage("❌ Please enter an event type");
      return;
    }

    if (!address) {
      setMessage("❌ Wallet not connected");
      return;
    }

    setIsLoading(true);
    setMessage("Adding event...");

    try {
      // Convert key-value pairs to JSON
      const data: Record<string, unknown> = {};
      eventFields.forEach((field) => {
        if (field.key.trim()) {
          const trimmedValue = field.value.trim();
          if (trimmedValue === "") return;

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

      const result = await addHealthEvent({ eventType, data });

      if (result.success) {
        setMessage(
          `✅ Event added! Transaction: ${result.txHash?.substring(0, 10)}...`,
        );
        // Clear form
        setEventType("");
        setEventFields([{ key: "", value: "" }]);
        setShowAddForm(false);
        // Reload timeline
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

  const handleSearch = async (): Promise<void> => {
    if (!searchType.trim() || !address) {
      setMessage("❌ Please enter an event type to search");
      return;
    }

    setIsLoading(true);
    setMessage(`Searching for ${searchType}...`);

    try {
      const result = await searchEventsByType(address, searchType);
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

  // Format event type from "MEDICATION_STARTED" to "Medication Started"
  const formatEventType = (eventType: string): string => {
    return eventType
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  const formatEventData = (encryptedData: string): JSX.Element => {
    try {
      const data = JSON.parse(encryptedData);
      const entries = Object.entries(data);

      // Filter out eventType since it's shown as the heading
      const otherEntries = entries.filter(
        ([key]) => key.toLowerCase() !== "eventtype",
      );

      return (
        <>
          {otherEntries.map(([key, value]) => (
            <div key={key} className="text-sm">
              <span className="font-semibold text-emerald-700 capitalize">
                {key.replace(/([A-Z])/g, " $1").trim()}:
              </span>{" "}
              <span className="text-gray-700">{String(value)}</span>
            </div>
          ))}
        </>
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

      {/* Add Event Form */}
      {showAddForm && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardHeader>
            <CardTitle className="text-lg text-emerald-900">
              Add Health Event
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="eventType">Event Type</Label>
              <Input
                id="eventType"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                placeholder="e.g., EXERCISE_COMPLETED, MOOD_RECORDED, MEDICATION_STARTED"
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                Will display as: &quot;Exercise Completed&quot;, &quot;Mood
                Recorded&quot;, etc.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Event Data</Label>
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
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {eventFields.map((field, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Input
                      value={field.key}
                      onChange={(e) => {
                        const newFields = [...eventFields];
                        newFields[index].key = e.target.value;
                        setEventFields(newFields);
                      }}
                      placeholder="Key"
                      className="text-sm flex-1"
                    />
                    <Input
                      value={field.value}
                      onChange={(e) => {
                        const newFields = [...eventFields];
                        newFields[index].value = e.target.value;
                        setEventFields(newFields);
                      }}
                      placeholder="Value"
                      className="text-sm flex-1"
                    />
                    {eventFields.length > 1 && (
                      <Button
                        type="button"
                        onClick={() =>
                          setEventFields(
                            eventFields.filter((_, i) => i !== index),
                          )
                        }
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Button
              onClick={handleAddEvent}
              disabled={isLoading || !eventType.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {isLoading ? "Adding..." : "Add Event"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="flex gap-2">
        <Input
          value={searchType}
          onChange={(e) => setSearchType(e.target.value)}
          placeholder="Search by event type (e.g., MEDICATION_STARTED, EXERCISE_COMPLETED)"
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
                className="border-emerald-200 bg-emerald-50/30 shadow-sm hover:shadow-md transition-shadow"
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Event Type Header */}
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                        <h3 className="font-semibold text-emerald-900 text-lg">
                          {eventTypeDisplay}
                        </h3>
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
                      <div className="bg-white rounded-lg p-3 border border-emerald-100 space-y-2">
                        {formatEventData(event.encryptedData)}
                      </div>
                    </div>

                    {/* Status Badge */}
                    {event.isActive ? (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full font-medium whitespace-nowrap">
                        Active
                      </span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1.5 rounded-full font-medium whitespace-nowrap">
                        Inactive
                      </span>
                    )}
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
