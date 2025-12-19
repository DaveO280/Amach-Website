"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, Edit } from "lucide-react";
import { type HealthEvent } from "@/services/HealthEventService";
import { formatEventType } from "@/types/healthEventTypes";

interface VisualTimelineProps {
  events: HealthEvent[];
  onDeleteEvent?: (index: number) => void;
  onEditEvent?: (index: number) => void;
  isLoading?: boolean;
}

export default function VisualTimeline({
  events,
  onDeleteEvent,
  onEditEvent,
  isLoading = false,
}: VisualTimelineProps): JSX.Element {
  // Group events by date
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, HealthEvent[]>();

    events.forEach((event) => {
      const date = new Date(event.timestamp * 1000);
      const dateKey = date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey)!.push(event);
    });

    // Sort dates in reverse chronological order
    return Array.from(grouped.entries()).sort((a, b) => {
      const dateA = new Date(a[0]);
      const dateB = new Date(b[0]);
      return dateB.getTime() - dateA.getTime();
    });
  }, [events]);

  const formatEventData = (encryptedData: string): JSX.Element => {
    try {
      if (!encryptedData || encryptedData.trim().length === 0) {
        return (
          <span className="text-xs text-amber-600">(No data available)</span>
        );
      }

      const parsed = JSON.parse(encryptedData);

      // If the parsed data has a 'data' property that's an object, flatten it
      let data = parsed;
      if (parsed.data && typeof parsed.data === "object") {
        data = { ...parsed, ...parsed.data };
        delete data.data;
      }

      const entries = Object.entries(data);

      // Filter out technical fields
      const hiddenFields = ["eventtype", "id", "timestamp"];
      const displayEntries = entries.filter(
        ([key]) => !hiddenFields.includes(key.toLowerCase()),
      );

      // Priority fields
      const priorityFields = [
        "severity",
        "description",
        "location",
        "bodypart",
        "diagnosis",
        "medication",
        "dosage",
        "frequency",
        "condition",
        "symptoms",
        "treatment",
        "allergen",
        "reaction",
      ];
      const priority = displayEntries.filter(([key]) =>
        priorityFields.includes(key.toLowerCase()),
      );
      const other = displayEntries.filter(
        ([key]) => !priorityFields.includes(key.toLowerCase()),
      );

      const formatValue = (value: unknown): string => {
        if (value === null || value === undefined) return "N/A";
        if (typeof value === "object") {
          return JSON.stringify(value, null, 2);
        }
        return String(value);
      };

      return (
        <div className="space-y-1.5">
          {priority.map(([key, value]) => (
            <div key={key} className="text-sm">
              <span className="font-medium text-emerald-700 capitalize">
                {key.replace(/([A-Z])/g, " $1").trim()}:
              </span>{" "}
              <span className="text-gray-700">{formatValue(value)}</span>
            </div>
          ))}

          {other.length > 0 && (
            <details className="text-sm mt-2">
              <summary className="cursor-pointer text-emerald-600 hover:text-emerald-700 font-medium text-xs">
                More details ({other.length})
              </summary>
              <div className="mt-2 space-y-1 pl-3 border-l-2 border-emerald-200">
                {other.map(([key, value]) => (
                  <div key={key}>
                    <span className="font-medium text-emerald-700 capitalize text-xs">
                      {key.replace(/([A-Z])/g, " $1").trim()}:
                    </span>{" "}
                    <span className="text-gray-600 text-xs whitespace-pre-wrap">
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

  if (events.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <div className="text-6xl mb-4">📅</div>
        <p className="text-lg font-medium text-gray-600 mb-1">
          No events in your timeline yet
        </p>
        <p className="text-sm text-gray-500">
          Add your first health event to get started!
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline axis - hidden on mobile, visible on desktop */}
      <div className="hidden md:block absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-emerald-200 via-emerald-300 to-emerald-200"></div>

      {/* Events grouped by date */}
      <div className="space-y-6">
        {eventsByDate.map(([dateKey, dateEvents]) => (
          <div key={dateKey} className="relative">
            {/* Date Header */}
            <div className="flex items-center gap-4 mb-4">
              {/* Date badge - desktop */}
              <div className="hidden md:flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 border-4 border-white shadow-md z-10 flex-shrink-0">
                <div className="text-center">
                  <div className="text-xs font-semibold text-emerald-800">
                    {new Date(dateKey).toLocaleDateString("en-US", {
                      month: "short",
                    })}
                  </div>
                  <div className="text-lg font-bold text-emerald-900">
                    {new Date(dateKey).getDate()}
                  </div>
                </div>
              </div>

              {/* Date text - mobile */}
              <div className="md:hidden flex-shrink-0">
                <h3 className="text-base font-bold text-emerald-900">
                  {dateKey}
                </h3>
              </div>

              {/* Connecting line - desktop */}
              <div className="hidden md:block flex-1 h-px bg-emerald-200"></div>

              {/* Date header - desktop */}
              <div className="hidden md:block">
                <h3 className="text-sm font-semibold text-emerald-800">
                  {dateKey}
                </h3>
              </div>
            </div>

            {/* Events for this date */}
            <div className="space-y-3 md:ml-24">
              {dateEvents.map((event, eventIndex) => {
                // Extract event type for display
                let eventTypeDisplay = "Health Event";
                let eventIcon = "📋";

                try {
                  const data = JSON.parse(event.encryptedData);
                  if (data.eventType) {
                    eventTypeDisplay = formatEventType(String(data.eventType));

                    // Get icon based on event type
                    const typeString = String(data.eventType).toUpperCase();
                    if (typeString.includes("MEDICATION")) eventIcon = "💊";
                    else if (typeString.includes("CONDITION")) eventIcon = "🏥";
                    else if (typeString.includes("INJURY")) eventIcon = "🩹";
                    else if (typeString.includes("ILLNESS")) eventIcon = "🤒";
                    else if (
                      typeString.includes("SURGERY") ||
                      typeString.includes("PROCEDURE")
                    )
                      eventIcon = "🔬";
                    else if (typeString.includes("ALLERGY")) eventIcon = "⚠️";
                    else if (
                      typeString.includes("WEIGHT") ||
                      typeString.includes("HEIGHT") ||
                      typeString.includes("BLOOD")
                    )
                      eventIcon = "📊";
                    else if (typeString.includes("NOTE")) eventIcon = "📝";
                  }
                } catch {}

                // Calculate actual event index in full events array
                const globalIndex = events.findIndex(
                  (e) =>
                    e.timestamp === event.timestamp &&
                    e.encryptedData === event.encryptedData,
                );

                return (
                  <Card
                    key={`${event.timestamp}-${eventIndex}`}
                    className={`border-l-4 transition-all duration-200 ${
                      event.isActive
                        ? "border-l-emerald-500 bg-white hover:shadow-md"
                        : "border-l-gray-300 bg-gray-50 opacity-70"
                    }`}
                  >
                    <CardContent className="p-3 md:p-4">
                      <div className="flex gap-4">
                        {/* Left side: Icon + Content */}
                        <div className="flex-1 flex gap-3 min-w-0">
                          {/* Event icon */}
                          <div className="text-xl md:text-2xl flex-shrink-0">
                            {eventIcon}
                          </div>

                          <div className="flex-1 min-w-0">
                            {/* Event header with title */}
                            <h4 className="font-semibold text-gray-900 text-sm md:text-base mb-2">
                              {eventTypeDisplay}
                            </h4>

                            {/* Event data - now has full width */}
                            {event.isActive ? (
                              <div className="bg-emerald-50/50 rounded-lg p-2.5 md:p-3 border border-emerald-100">
                                {formatEventData(event.encryptedData)}
                              </div>
                            ) : (
                              <div className="bg-gray-50 rounded-lg p-2.5 md:p-3 border border-gray-200">
                                <p className="text-xs md:text-sm text-gray-500 italic">
                                  Event data deleted. Deletion recorded
                                  on-chain.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right side: Status + Actions (fixed width) */}
                        <div className="flex flex-col gap-2 items-end flex-shrink-0 w-20 md:w-24">
                          {/* Status badge */}
                          {event.isActive ? (
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-medium whitespace-nowrap">
                              Active
                            </span>
                          ) : (
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-medium whitespace-nowrap">
                              Deleted
                            </span>
                          )}

                          {/* Action buttons */}
                          {event.isActive && (
                            <div className="flex flex-col gap-1.5 w-full">
                              {onEditEvent && (
                                <Button
                                  onClick={() => onEditEvent(globalIndex)}
                                  variant="ghost"
                                  size="sm"
                                  className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 h-8 px-2 w-full justify-center"
                                  disabled={isLoading}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                              {onDeleteEvent && (
                                <Button
                                  onClick={() => onDeleteEvent(globalIndex)}
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-2 w-full justify-center"
                                  disabled={isLoading}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Timeline start marker - purely decorative, indicates beginning of timeline */}
      <div className="hidden md:flex items-center justify-start mt-6 ml-8 gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center pointer-events-none">
          <div className="text-emerald-500 font-semibold text-xs">🏁</div>
        </div>
        <p className="text-xs text-gray-400 italic">Timeline begins here</p>
      </div>
    </div>
  );
}
