"use client";

import React, { useState } from "react";
import type { ParsedReportSummary } from "@/types/reportData";
import { formatReportsForAI } from "@/utils/reportFormatters";
import { Button } from "@/components/ui/button";
import { X, Upload, CheckCircle, AlertCircle } from "lucide-react";
import { getStorjReportService } from "@/storage/StorjReportService";
import { getWalletDerivedEncryptionKey } from "@/utils/walletEncryption";
import { useWalletService } from "@/hooks/useWalletService";

interface ReportParserViewerProps {
  reports: ParsedReportSummary[];
  onClose?: () => void;
  onDeleteReport?: (index: number) => void;
  onUpdateReport?: (
    index: number,
    updates: Partial<ParsedReportSummary>,
  ) => void;
}

export const ReportParserViewer: React.FC<ReportParserViewerProps> = ({
  reports,
  onClose,
  onDeleteReport,
  onUpdateReport,
}) => {
  const ENABLE_STORJ_SAVE_UI = process.env.NODE_ENV === "development";

  const [selectedReportIndex, setSelectedReportIndex] = useState<number | null>(
    reports.length > 0 ? 0 : null,
  );
  const [viewMode, setViewMode] = useState<"structured" | "json" | "formatted">(
    "structured",
  );
  const [savingToStorj, setSavingToStorj] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{
    success: boolean;
    message: string;
    storjUri?: string;
  } | null>(null);
  const { isConnected, address, signMessage } = useWalletService();

  // Update selected index when reports change
  React.useEffect(() => {
    if (reports.length === 0) {
      setSelectedReportIndex(null);
    } else if (
      selectedReportIndex !== null &&
      selectedReportIndex >= reports.length
    ) {
      // If selected report was deleted, select the last one or first one
      setSelectedReportIndex(reports.length - 1);
    }
  }, [reports.length, selectedReportIndex]);

  if (reports.length === 0) {
    return (
      <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
        <p className="text-amber-800">No parsed reports available.</p>
      </div>
    );
  }

  const selectedReport =
    selectedReportIndex !== null ? reports[selectedReportIndex] : null;

  // Calculate saved status
  const unsavedCount = reports.filter((r) => !r.storjUri).length;
  const savedCount = reports.filter((r) => r.storjUri).length;
  const allSaved = unsavedCount === 0;

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Parsed Report Viewer
          </h3>
          <p className="text-sm text-gray-600">
            {reports.length} report{reports.length !== 1 ? "s" : ""} parsed
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ENABLE_STORJ_SAVE_UI &&
            isConnected &&
            address &&
            reports.length > 0 &&
            (allSaved ? (
              <div className="flex items-center gap-1 text-sm text-emerald-600 px-2 py-1 rounded bg-emerald-50">
                <CheckCircle className="h-4 w-4" />
                <span>All {savedCount} report(s) saved</span>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setSavingToStorj(true);
                  setSaveStatus(null);

                  try {
                    if (!address || !signMessage) {
                      throw new Error("Wallet not connected");
                    }
                    const encryptionKey = await getWalletDerivedEncryptionKey(
                      address,
                      signMessage,
                    );
                    const reportService = getStorjReportService();

                    let successCount = savedCount; // Start with already saved count
                    let failCount = 0;
                    let newlySaved = 0;

                    for (let i = 0; i < reports.length; i++) {
                      const report = reports[i];

                      // Skip if already saved
                      if (report.storjUri) {
                        continue;
                      }

                      const result = await reportService.storeReport(
                        report,
                        address,
                        encryptionKey,
                        {
                          metadata: {
                            uploadedAt: new Date().toISOString(),
                            source: "report-viewer",
                          },
                        },
                      );

                      if (result.success && result.storjUri) {
                        successCount++;
                        newlySaved++;
                        // Update the report with Storj URI
                        if (onUpdateReport) {
                          onUpdateReport(i, {
                            storjUri: result.storjUri,
                            savedToStorjAt: new Date().toISOString(),
                          });
                        }
                      } else {
                        failCount++;
                      }
                    }

                    if (failCount === 0) {
                      setSaveStatus({
                        success: true,
                        message:
                          newlySaved > 0
                            ? `${newlySaved} new report(s) saved! (${successCount} total)`
                            : `All ${successCount} report(s) already saved`,
                      });
                    } else {
                      setSaveStatus({
                        success: false,
                        message: `${newlySaved} saved, ${failCount} failed`,
                      });
                    }

                    setTimeout(() => setSaveStatus(null), 5000);
                  } catch (error) {
                    console.error("Failed to save reports to Storj:", error);
                    setSaveStatus({
                      success: false,
                      message:
                        error instanceof Error
                          ? error.message
                          : "Unknown error",
                    });
                  } finally {
                    setSavingToStorj(false);
                  }
                }}
                disabled={savingToStorj || allSaved}
                className="flex items-center gap-1"
              >
                <Upload className="h-4 w-4" />
                {savingToStorj
                  ? "Saving..."
                  : `Save ${unsavedCount} to Storj${savedCount > 0 ? ` (${savedCount} already saved)` : ""}`}
              </Button>
            ))}
          {saveStatus && (
            <div
              className={`flex items-center gap-1 text-sm px-2 py-1 rounded ${
                saveStatus.success
                  ? "text-emerald-700 bg-emerald-50"
                  : "text-red-700 bg-red-50"
              }`}
            >
              {saveStatus.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <span>{saveStatus.message}</span>
            </div>
          )}
          {onClose && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-gray-600"
            >
              Close
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Report List */}
        <div className="w-64 border-r border-gray-200 overflow-y-auto bg-gray-50">
          <div className="p-2">
            {reports.map((report, index) => {
              const reportType =
                report.report.type === "dexa" ? "DEXA" : "Bloodwork";
              const reportDate =
                report.report.type === "dexa"
                  ? report.report.scanDate
                  : report.report.reportDate;
              const isSelected = selectedReportIndex === index;

              const isSaved = report.storjUri !== undefined;

              return (
                <div
                  key={index}
                  className={`relative w-full p-3 mb-2 rounded-lg border transition-colors ${
                    isSelected
                      ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                      : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <button
                    onClick={() => setSelectedReportIndex(index)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">{reportType}</div>
                      {isSaved && (
                        <div className="flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle className="h-3 w-3" />
                          <span>Saved</span>
                        </div>
                      )}
                    </div>
                    {reportDate && (
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(reportDate).toLocaleDateString()}
                      </div>
                    )}
                    <div className="text-xs text-gray-400 mt-1">
                      Extracted:{" "}
                      {new Date(report.extractedAt).toLocaleDateString()}
                    </div>
                    {report.report.type === "dexa" && (
                      <div className="text-xs text-gray-500 mt-1">
                        Confidence: {Math.round(report.report.confidence * 100)}
                        %
                      </div>
                    )}
                    {report.report.type === "bloodwork" && (
                      <div className="text-xs text-gray-500 mt-1">
                        {report.report.metrics.length} metrics
                      </div>
                    )}
                  </button>
                  {onDeleteReport && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete this ${reportType} report?`)) {
                          onDeleteReport(index);
                          if (selectedReportIndex === index) {
                            setSelectedReportIndex(null);
                          }
                        }
                      }}
                      className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                      title="Delete report"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Content - Report Details */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedReport ? (
            <>
              {/* View Mode Toggle and Actions */}
              <div className="flex items-center justify-between gap-2 p-3 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">
                    View:
                  </span>
                  <Button
                    variant={viewMode === "structured" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode("structured")}
                  >
                    Structured
                  </Button>
                  <Button
                    variant={viewMode === "formatted" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode("formatted")}
                  >
                    Formatted
                  </Button>
                  <Button
                    variant={viewMode === "json" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode("json")}
                  >
                    JSON
                  </Button>
                </div>

                {/* Save to Storj Button (dev-only for now) */}
                {ENABLE_STORJ_SAVE_UI &&
                  isConnected &&
                  address &&
                  selectedReport && (
                    <div className="flex items-center gap-2">
                      {saveStatus && (
                        <div
                          className={`flex items-center gap-1 text-sm ${
                            saveStatus.success
                              ? "text-emerald-600"
                              : "text-red-600"
                          }`}
                        >
                          {saveStatus.success ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <AlertCircle className="h-4 w-4" />
                          )}
                          <span>{saveStatus.message}</span>
                        </div>
                      )}
                      {selectedReport.storjUri ? (
                        <div className="flex items-center gap-1 text-sm text-emerald-600 px-2 py-1 rounded bg-emerald-50">
                          <CheckCircle className="h-4 w-4" />
                          <span>Saved to Storj</span>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            if (
                              !selectedReport ||
                              !address ||
                              selectedReportIndex === null
                            )
                              return;

                            setSavingToStorj(true);
                            setSaveStatus(null);

                            try {
                              if (!address || !signMessage) {
                                throw new Error("Wallet not connected");
                              }
                              const encryptionKey =
                                await getWalletDerivedEncryptionKey(
                                  address,
                                  signMessage,
                                );
                              const reportService = getStorjReportService();

                              const result = await reportService.storeReport(
                                selectedReport,
                                address,
                                encryptionKey,
                                {
                                  metadata: {
                                    uploadedAt: new Date().toISOString(),
                                    source: "report-viewer",
                                  },
                                },
                              );

                              if (result.success && result.storjUri) {
                                setSaveStatus({
                                  success: true,
                                  message: "Saved to Storj!",
                                  storjUri: result.storjUri,
                                });

                                // Update the report with Storj URI
                                if (onUpdateReport) {
                                  onUpdateReport(selectedReportIndex, {
                                    storjUri: result.storjUri,
                                    savedToStorjAt: new Date().toISOString(),
                                  });
                                }

                                // Clear status after 5 seconds
                                setTimeout(() => setSaveStatus(null), 5000);
                              } else {
                                setSaveStatus({
                                  success: false,
                                  message: result.error || "Failed to save",
                                });
                              }
                            } catch (error) {
                              console.error(
                                "Failed to save report to Storj:",
                                error,
                              );
                              setSaveStatus({
                                success: false,
                                message:
                                  error instanceof Error
                                    ? error.message
                                    : "Unknown error",
                              });
                            } finally {
                              setSavingToStorj(false);
                            }
                          }}
                          disabled={savingToStorj}
                          className="flex items-center gap-1"
                        >
                          <Upload className="h-4 w-4" />
                          {savingToStorj ? "Saving..." : "Save to Storj"}
                        </Button>
                      )}
                    </div>
                  )}
              </div>

              {/* Report Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {viewMode === "structured" && (
                  <StructuredView report={selectedReport} />
                )}
                {viewMode === "formatted" && (
                  <FormattedView report={selectedReport} />
                )}
                {viewMode === "json" && <JSONView report={selectedReport} />}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Select a report to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Structured View - Human-readable breakdown
const StructuredView: React.FC<{ report: ParsedReportSummary }> = ({
  report,
}) => {
  if (report.report.type === "dexa") {
    const dexa = report.report;
    return (
      <div className="space-y-4">
        <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
          <h4 className="font-semibold text-emerald-900 mb-2">
            DEXA Scan Report
          </h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {dexa.scanDate && (
              <div>
                <span className="font-medium text-gray-700">Scan Date:</span>{" "}
                <span className="text-gray-900">
                  {new Date(dexa.scanDate).toLocaleDateString()}
                </span>
              </div>
            )}
            {dexa.source && (
              <div>
                <span className="font-medium text-gray-700">Source:</span>{" "}
                <span className="text-gray-900">{dexa.source}</span>
              </div>
            )}
            {dexa.totalBodyFatPercent !== undefined && (
              <div>
                <span className="font-medium text-gray-700">
                  Total Body Fat:
                </span>{" "}
                <span className="text-gray-900">
                  {dexa.totalBodyFatPercent}%
                </span>
              </div>
            )}
            {dexa.totalLeanMassKg !== undefined && (
              <div>
                <span className="font-medium text-gray-700">Lean Mass:</span>{" "}
                <span className="text-gray-900">{dexa.totalLeanMassKg} kg</span>
              </div>
            )}
            {dexa.visceralFatRating !== undefined && (
              <div>
                <span className="font-medium text-gray-700">
                  Visceral Fat Rating:
                </span>{" "}
                <span className="text-gray-900">{dexa.visceralFatRating}</span>
              </div>
            )}
            {dexa.visceralFatVolumeCm3 !== undefined && (
              <div>
                <span className="font-medium text-gray-700">
                  Visceral Fat Volume:
                </span>{" "}
                <span className="text-gray-900">
                  {dexa.visceralFatVolumeCm3.toFixed(2)} cm³
                </span>
              </div>
            )}
            {dexa.visceralFatAreaCm2 !== undefined && (
              <div>
                <span className="font-medium text-gray-700">
                  Visceral Fat Area:
                </span>{" "}
                <span className="text-gray-900">
                  {dexa.visceralFatAreaCm2.toFixed(2)} cm²
                </span>
              </div>
            )}
            {dexa.androidGynoidRatio !== undefined && (
              <div>
                <span className="font-medium text-gray-700">A/G Ratio:</span>{" "}
                <span className="text-gray-900">{dexa.androidGynoidRatio}</span>
              </div>
            )}
            {dexa.boneDensityTotal && (
              <>
                {dexa.boneDensityTotal.bmd !== undefined && (
                  <div>
                    <span className="font-medium text-gray-700">BMD:</span>{" "}
                    <span className="text-gray-900">
                      {dexa.boneDensityTotal.bmd} g/cm²
                    </span>
                  </div>
                )}
                {dexa.boneDensityTotal.tScore !== undefined && (
                  <div>
                    <span className="font-medium text-gray-700">T-Score:</span>{" "}
                    <span className="text-gray-900">
                      {dexa.boneDensityTotal.tScore}
                    </span>
                  </div>
                )}
                {dexa.boneDensityTotal.zScore !== undefined && (
                  <div>
                    <span className="font-medium text-gray-700">Z-Score:</span>{" "}
                    <span className="text-gray-900">
                      {dexa.boneDensityTotal.zScore}
                    </span>
                  </div>
                )}
              </>
            )}
            <div>
              <span className="font-medium text-gray-700">Confidence:</span>{" "}
              <span className="text-gray-900">
                {Math.round(dexa.confidence * 100)}%
              </span>
            </div>
          </div>
        </div>

        {dexa.regions && dexa.regions.length > 0 && (
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h4 className="font-semibold text-blue-900 mb-3">
              Regional Analysis ({dexa.regions.length} regions)
            </h4>
            <div className="space-y-2">
              {dexa.regions.map((region, idx) => (
                <div
                  key={idx}
                  className="bg-white p-3 rounded border border-blue-100"
                >
                  <div className="font-medium text-gray-900 mb-1">
                    {region.region}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
                    {region.bodyFatPercent !== undefined && (
                      <div>
                        <span className="font-medium">Fat %:</span>{" "}
                        {region.bodyFatPercent}%
                      </div>
                    )}
                    {region.leanMassKg !== undefined && (
                      <div>
                        <span className="font-medium">Lean Mass:</span>{" "}
                        {region.leanMassKg} kg
                      </div>
                    )}
                    {region.fatMassKg !== undefined && (
                      <div>
                        <span className="font-medium">Fat Mass:</span>{" "}
                        {region.fatMassKg} kg
                      </div>
                    )}
                    {region.boneDensityGPerCm2 !== undefined && (
                      <div>
                        <span className="font-medium">BMD:</span>{" "}
                        {region.boneDensityGPerCm2} g/cm²
                      </div>
                    )}
                    {region.tScore !== undefined && (
                      <div>
                        <span className="font-medium">T-Score:</span>{" "}
                        {region.tScore}
                      </div>
                    )}
                    {region.zScore !== undefined && (
                      <div>
                        <span className="font-medium">Z-Score:</span>{" "}
                        {region.zScore}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {dexa.notes && dexa.notes.length > 0 && (
          <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
            <h4 className="font-semibold text-amber-900 mb-2">Notes</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-amber-800">
              {dexa.notes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  } else {
    const bloodwork = report.report;
    const flaggedMetrics = bloodwork.metrics.filter(
      (m) => m.flag && m.flag !== "normal",
    );

    return (
      <div className="space-y-4">
        <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
          <h4 className="font-semibold text-emerald-900 mb-2">
            Bloodwork Report
          </h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {bloodwork.reportDate && (
              <div>
                <span className="font-medium text-gray-700">Report Date:</span>{" "}
                <span className="text-gray-900">
                  {new Date(bloodwork.reportDate).toLocaleDateString()}
                </span>
              </div>
            )}
            {bloodwork.laboratory && (
              <div>
                <span className="font-medium text-gray-700">Laboratory:</span>{" "}
                <span className="text-gray-900">{bloodwork.laboratory}</span>
              </div>
            )}
            {bloodwork.source && (
              <div>
                <span className="font-medium text-gray-700">Source:</span>{" "}
                <span className="text-gray-900">{bloodwork.source}</span>
              </div>
            )}
            <div>
              <span className="font-medium text-gray-700">Total Metrics:</span>{" "}
              <span className="text-gray-900">{bloodwork.metrics.length}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">
                Flagged Metrics:
              </span>{" "}
              <span className="text-gray-900">{flaggedMetrics.length}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Confidence:</span>{" "}
              <span className="text-gray-900">
                {Math.round(bloodwork.confidence * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Metrics by Panel */}
        {Object.entries(bloodwork.panels).map(([panel, metrics]) => (
          <div
            key={panel}
            className="bg-blue-50 p-4 rounded-lg border border-blue-200"
          >
            <h4 className="font-semibold text-blue-900 mb-3">
              {panel.charAt(0).toUpperCase() + panel.slice(1)} Panel (
              {metrics.length} metrics)
            </h4>
            <div className="space-y-2">
              {metrics.map((metric, idx) => (
                <div
                  key={idx}
                  className={`bg-white p-3 rounded border ${
                    metric.flag && metric.flag !== "normal"
                      ? "border-red-200 bg-red-50"
                      : "border-blue-100"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {metric.name}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {metric.value !== undefined
                          ? `${metric.value} ${metric.unit || ""}`
                          : metric.valueText || "N/A"}
                        {metric.referenceRange && (
                          <span className="text-gray-500 ml-2">
                            (ref: {metric.referenceRange})
                          </span>
                        )}
                      </div>
                      {metric.collectedAt && (
                        <div className="text-xs text-gray-400 mt-1">
                          Collected:{" "}
                          {new Date(metric.collectedAt).toLocaleDateString()}
                        </div>
                      )}
                      {metric.interpretationNotes &&
                        metric.interpretationNotes.length > 0 && (
                          <div className="text-xs text-amber-700 mt-1">
                            {metric.interpretationNotes.join("; ")}
                          </div>
                        )}
                    </div>
                    {metric.flag && metric.flag !== "normal" && (
                      <div
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          metric.flag.includes("critical")
                            ? "bg-red-100 text-red-800"
                            : metric.flag === "high"
                              ? "bg-orange-100 text-orange-800"
                              : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {metric.flag.toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {bloodwork.notes && bloodwork.notes.length > 0 && (
          <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
            <h4 className="font-semibold text-amber-900 mb-2">Notes</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-amber-800">
              {bloodwork.notes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
};

// Formatted View - AI-ready format
const FormattedView: React.FC<{ report: ParsedReportSummary }> = ({
  report,
}) => {
  const formatted = formatReportsForAI([report]);
  return (
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
      <pre className="whitespace-pre-wrap text-sm font-mono text-gray-800">
        {formatted}
      </pre>
    </div>
  );
};

// JSON View - Raw data
const JSONView: React.FC<{ report: ParsedReportSummary }> = ({ report }) => {
  return (
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
      <pre className="whitespace-pre-wrap text-xs font-mono text-gray-800 overflow-auto">
        {JSON.stringify(report, null, 2)}
      </pre>
    </div>
  );
};
