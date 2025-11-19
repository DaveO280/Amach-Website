"use client";

import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import { Button } from "@/components/ui/button";
import { useAi } from "@/store/aiStore";
import { Send, X } from "lucide-react";
import Papa from "papaparse";
import React, { useEffect, useRef, useState } from "react";
import { healthDataStore } from "../../data/store/healthDataStore";
import { parsePDF } from "../../utils/pdfParser";
import { parseHealthReport } from "@/utils/reportParsers";

// Define types for our message interface
interface MessageType {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

const CosaintChatUI: React.FC = () => {
  const {
    messages,
    sendMessage,
    isLoading,
    error,
    clearMessages,
    useMultiAgent,
    setUseMultiAgent,
  } = useAi();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    metrics,
    uploadedFiles,
    addUploadedFile,
    removeUploadedFile,
    addParsedReports,
    clearChatHistory,
  } = useHealthDataContext();

  // Add state for upload form
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadRawData, setUploadRawData] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  // Local state to hide uploads in chat UI
  const [uploadsHidden, setUploadsHidden] = useState(false);
  // State for saved files from IndexedDB
  const [savedFiles, setSavedFiles] = useState<
    Array<{
      id: string;
      fileName: string;
      fileType: string;
      fileSize: number;
      uploadedAt: string;
      lastAccessed: string;
    }>
  >([]);
  const [showSavedFiles, setShowSavedFiles] = useState(false);
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoExpandOnSend, setAutoExpandOnSend] = useState(true);

  const AUTO_EXPAND_STORAGE_KEY = "cosaintAutoExpandOnSend";

  const inferReportType = (
    fileName: string,
  ): "dexa" | "bloodwork" | undefined => {
    const lower = fileName.toLowerCase();
    if (lower.includes("dexa") || lower.includes("dxa")) {
      return "dexa";
    }
    if (
      lower.includes("lab") ||
      lower.includes("blood") ||
      lower.includes("panel") ||
      lower.includes("lipid") ||
      lower.includes("hormone")
    ) {
      return "bloodwork";
    }
    return undefined;
  };

  // Scroll to the bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus the input field when the component mounts
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Load saved files when component mounts
  useEffect(() => {
    loadSavedFiles();
  }, []);

  // Reset loading time when loading state changes
  useEffect(() => {
    if (!isLoading) {
      setLoadingStartTime(null);
    }
  }, [isLoading]);

  useEffect((): (() => void) | void => {
    if (!isExpanded) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return (): void => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isExpanded]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const storedValue = window.localStorage.getItem(AUTO_EXPAND_STORAGE_KEY);
      if (storedValue !== null) {
        setAutoExpandOnSend(storedValue === "true");
      }
    } catch (error) {
      console.warn("Failed to read auto-expand preference:", error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(
        AUTO_EXPAND_STORAGE_KEY,
        String(autoExpandOnSend),
      );
    } catch (error) {
      console.warn("Failed to persist auto-expand preference:", error);
    }
  }, [autoExpandOnSend]);

  const handleSendMessage = async (): Promise<void> => {
    if (input.trim() === "") return;
    setLoadingStartTime(Date.now());
    if (autoExpandOnSend && !isExpanded) {
      setIsExpanded(true);
    }
    await sendMessage(input);
    setInput("");
    setLoadingStartTime(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Load saved files from IndexedDB
  const loadSavedFiles = async (): Promise<void> => {
    try {
      const files = await healthDataStore.getAllUploadedFiles();
      setSavedFiles(
        files.map((file) => ({
          id: file.id,
          fileName: file.fileName,
          fileType: file.fileType,
          fileSize: file.fileSize,
          uploadedAt: file.uploadedAt,
          lastAccessed: file.lastAccessed,
        })),
      );
    } catch (error) {
      console.error("❌ Failed to load saved files:", error);
    }
  };

  // Load a saved file into chat context
  const loadSavedFileIntoContext = async (fileId: string): Promise<void> => {
    try {
      const file = await healthDataStore.getUploadedFile(fileId);
      if (file) {
        const parsedReports =
          file.parsedContent && typeof file.parsedContent === "string"
            ? parseHealthReport(file.parsedContent, {
                sourceName: file.fileName,
              })
            : [];

        if (parsedReports.length) {
          addParsedReports(parsedReports);
        }

        addUploadedFile({
          type: file.fileType.includes("pdf")
            ? "pdf"
            : file.fileType.split("/")[1] || "unknown",
          summary: `${file.fileName} (${file.fileType.toUpperCase()}) - ${file.fileSize} bytes`,
          date: file.uploadedAt,
          rawData: {
            fileName: file.fileName,
            fileSize: file.fileSize,
            fileType: file.fileType,
            parsedType: file.fileType.includes("pdf")
              ? "pdf"
              : file.fileType.split("/")[1] || "unknown",
            content: file.parsedContent,
            preview:
              file.parsedContent.length > 10000
                ? file.parsedContent.substring(0, 10000) + "... (truncated)"
                : file.parsedContent,
            pageCount: file.pageCount,
            metadata: file.metadata,
          },
          parsedReports,
        });
        console.log(`✅ Loaded saved file into context: ${file.fileName}`);
      }
    } catch (error) {
      console.error("❌ Failed to load saved file:", error);
    }
  };

  // Delete a saved file from IndexedDB
  const deleteSavedFile = async (fileId: string): Promise<void> => {
    try {
      await healthDataStore.deleteUploadedFile(fileId);
      console.log(`✅ Deleted saved file: ${fileId}`);
      // Reload the saved files list
      await loadSavedFiles();
    } catch (error) {
      console.error("❌ Failed to delete saved file:", error);
    }
  };

  // Parse file content based on file type
  const parseFileContent = async (
    file: File,
  ): Promise<{ content: string; type: string }> => {
    return new Promise((resolve, reject): void => {
      const reader = new FileReader();

      reader.onload = (e): void => {
        try {
          const content = e.target?.result as string;

          if (file.type === "text/csv" || file.name.endsWith(".csv")) {
            // Parse CSV files
            const results = Papa.parse(content, {
              header: true,
            });
            resolve({
              content: JSON.stringify(results.data, null, 2),
              type: "csv",
            });
          } else if (file.type === "text/xml" || file.name.endsWith(".xml")) {
            // For XML files, store the raw content
            resolve({
              content: content,
              type: "xml",
            });
          } else if (
            file.type === "application/json" ||
            file.name.endsWith(".json")
          ) {
            // Parse JSON files
            try {
              const parsed = JSON.parse(content);
              resolve({
                content: JSON.stringify(parsed, null, 2),
                type: "json",
              });
            } catch (error) {
              reject(
                new Error(
                  `JSON parsing error: ${error instanceof Error ? error.message : "Invalid JSON"}`,
                ),
              );
            }
          } else if (file.type === "text/plain" || file.name.endsWith(".txt")) {
            // For text files, store the raw content
            resolve({
              content: content,
              type: "text",
            });
          } else if (
            file.type === "application/pdf" ||
            file.name.endsWith(".pdf")
          ) {
            // For PDF files, we need to handle them separately since they're binary
            reject(new Error("PDF files should be handled by the PDF parser"));
          } else {
            // For other file types, try to read as text
            resolve({
              content: content,
              type: "unknown",
            });
          }
        } catch (error) {
          reject(
            new Error(
              `File processing error: ${error instanceof Error ? error.message : "Unknown error"}`,
            ),
          );
        }
      };

      reader.onerror = (): void => {
        reject(new Error("Failed to read file"));
      };

      reader.readAsText(file);
    });
  };

  // Handler for upload form submit
  const handleUploadSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!uploadRawData) {
      setUploadError("Please select a file to upload.");
      return;
    }

    setIsProcessingFile(true);
    setUploadError("");

    try {
      // Get the file from the input
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const file = fileInput?.files?.[0];

      if (!file) {
        setUploadError("No file selected.");
        return;
      }

      // Parse the file content based on file type
      let parsedContent: {
        content: string;
        type: string;
        pageCount?: number;
        metadata?: Record<string, unknown>;
      };

      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        // Use PDF parser for PDF files
        const pdfResult = await parsePDF(file);
        parsedContent = {
          content: pdfResult.text,
          type: "pdf",
          pageCount: pdfResult.pageCount,
          metadata: pdfResult.metadata,
        };
      } else {
        // Use regular parser for other file types
        parsedContent = await parseFileContent(file);
      }

      // Add the parsed file to context
      const parsedReports =
        parsedContent.type === "pdf" || parsedContent.type === "text"
          ? parseHealthReport(parsedContent.content, {
              inferredType: inferReportType(file.name),
              sourceName: file.name,
            })
          : [];

      if (parsedReports.length) {
        addParsedReports(parsedReports);
      }

      addUploadedFile({
        type: parsedContent.type,
        summary: `${file.name} (${parsedContent.type.toUpperCase()}) - ${file.size} bytes`,
        date: new Date().toISOString(),
        rawData: {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          parsedType: parsedContent.type,
          content: parsedContent.content,
          // For large files, store a preview instead of full content
          preview:
            parsedContent.content.length > 10000
              ? parsedContent.content.substring(0, 10000) + "... (truncated)"
              : parsedContent.content,
          // Additional PDF-specific data
          pageCount: parsedContent.pageCount || undefined,
          metadata: parsedContent.metadata || undefined,
        },
        parsedReports,
      });

      // Save the parsed file to IndexedDB for persistence
      try {
        const fileId = await healthDataStore.saveUploadedFile(
          file,
          parsedContent.content,
          parsedContent.metadata,
          parsedContent.pageCount,
        );
        console.log(`✅ File saved to IndexedDB with ID: ${fileId}`);
      } catch (dbError) {
        console.error("❌ Failed to save file to IndexedDB:", dbError);
        // Don't fail the upload if IndexedDB save fails
      }

      setShowUploadForm(false);
      setUploadRawData("");
      console.log(
        `✅ File uploaded successfully: ${file.name} (${parsedContent.type})`,
      );
    } catch (error) {
      console.error("❌ File upload error:", error);
      setUploadError(
        `Failed to process file: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsProcessingFile(false);
    }
  };

  const containerClasses = isExpanded
    ? "flex h-full flex-col gap-4 overflow-hidden"
    : "flex flex-col min-h-[75vh] max-h-[90vh] lg:h-[calc(100vh-220px)]";

  const chatHistoryClasses = isExpanded
    ? "flex-1 overflow-y-auto rounded-3xl border border-emerald-100 bg-white p-6 shadow-lg"
    : "mb-4 flex-1 overflow-y-auto rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm";

  const chatLayout = (
    <div className={containerClasses}>
      <div className="flex flex-col gap-3">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Analysis mode
            </span>
            <div className="flex flex-col gap-1">
              <div className="inline-flex w-fit rounded-lg border border-emerald-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setUseMultiAgent(false)}
                  className={`whitespace-nowrap px-3 py-1 text-xs font-medium transition-colors ${
                    !useMultiAgent
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-emerald-700 hover:bg-emerald-50"
                  }`}
                >
                  Standard (faster)
                </button>
                <button
                  type="button"
                  onClick={() => setUseMultiAgent(true)}
                  className={`whitespace-nowrap px-3 py-1 text-xs font-medium transition-colors ${
                    useMultiAgent
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-emerald-700 hover:bg-emerald-50"
                  }`}
                >
                  Deep multi-agent (slower)
                </button>
              </div>
              <span className="text-[11px] text-amber-700">
                Multi-agent runs all specialists before Cosaint replies and may
                take a few extra seconds.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 self-end sm:self-auto">
            <label className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-emerald-600"
                checked={autoExpandOnSend}
                onChange={(event) => setAutoExpandOnSend(event.target.checked)}
              />
              Auto expand on send
            </label>
            <Button
              size="sm"
              variant="outline"
              className="whitespace-nowrap"
              onClick={() => setIsExpanded((prev) => !prev)}
            >
              {isExpanded ? "Exit expanded view" : "Expand view"}
            </Button>
          </div>
        </div>

        {!isExpanded && (
          <div className="flex flex-col items-start gap-2">
            <Button
              size="sm"
              className="w-fit bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => setShowUploadForm((v) => !v)}
            >
              {showUploadForm ? "Cancel" : "Upload File to Context"}
            </Button>
            {showUploadForm && (
              <form
                onSubmit={handleUploadSubmit}
                className="w-full max-w-md rounded-lg border border-emerald-100 bg-emerald-50 p-3"
              >
                <div className="mb-2">
                  <label className="mb-1 block text-xs font-semibold">
                    File
                  </label>
                  <input
                    type="file"
                    className="w-full rounded border p-2 text-sm"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setUploadRawData(
                          JSON.stringify({
                            fileName: file.name,
                            size: file.size,
                            type: file.type,
                          }),
                        );
                      } else {
                        setUploadRawData("");
                      }
                    }}
                    accept=".csv,.xml,.json,.txt,.pdf,text/csv,text/xml,application/json,text/plain,application/pdf"
                    required
                  />
                  {uploadRawData && (
                    <div className="mt-1 text-xs text-gray-600">
                      File selected: {JSON.parse(uploadRawData).fileName}
                    </div>
                  )}
                </div>
                {uploadError && (
                  <div className="mb-2 text-xs text-red-600">{uploadError}</div>
                )}
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isProcessingFile}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {isProcessingFile ? "Processing..." : "Upload"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {!isExpanded && (
        <div className="w-full max-w-md">
          <Button
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={() => {
              setShowSavedFiles(!showSavedFiles);
              if (!showSavedFiles) {
                loadSavedFiles();
              }
            }}
          >
            {showSavedFiles ? "Hide" : "Show"} Saved Files ({savedFiles.length})
          </Button>

          {showSavedFiles && (
            <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-3">
              <h3 className="mb-2 text-sm font-semibold">Saved Files</h3>
              {savedFiles.length === 0 ? (
                <p className="text-xs text-gray-600">No saved files found.</p>
              ) : (
                <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                  {savedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between rounded border bg-white p-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {file.fileName}
                        </div>
                        <div className="text-gray-500">
                          {file.fileType} • {(file.fileSize / 1024).toFixed(1)}{" "}
                          KB
                        </div>
                        <div className="text-gray-400">
                          {new Date(file.uploadedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="ml-2 flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => loadSavedFileIntoContext(file.id)}
                        >
                          Load
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteSavedFile(file.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!isExpanded && uploadedFiles.length > 0 && !uploadsHidden && (
        <div className="mb-4">
          <h4 className="mb-2 font-semibold text-emerald-800">
            Uploaded Files
          </h4>
          <div className="mb-2 flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setUploadsHidden(true)}
            >
              Hide Uploads
            </Button>
          </div>
          <ul className="flex flex-row flex-wrap gap-2">
            {uploadedFiles.map((file, idx) => (
              <li
                key={idx}
                className="flex min-w-0 max-w-[200px] items-center rounded-full bg-emerald-50 px-2 py-1 text-xs"
                style={{ lineHeight: 1.2 }}
              >
                <span className="max-w-[140px] truncate font-medium text-emerald-900">
                  {file.summary}
                </span>
                <button
                  type="button"
                  className="ml-1 rounded p-1 text-emerald-700 hover:bg-emerald-200"
                  aria-label="Remove file"
                  onClick={() => removeUploadedFile(idx)}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isExpanded && uploadedFiles.length > 0 && uploadsHidden && (
        <div className="mb-4 flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setUploadsHidden(false)}
          >
            Show Uploads
          </Button>
        </div>
      )}

      {!isExpanded && (
        <div className="mb-2 text-sm text-emerald-800">
          Available Metrics:{" "}
          {metrics
            ? Object.keys(metrics)
                .map((key) => {
                  if (key === "hrv") return "HRV";
                  if (key === "restingHR") return "Resting HR";
                  return (
                    key.charAt(0).toUpperCase() +
                    key
                      .slice(1)
                      .split(/(?=[A-Z])/)
                      .join(" ")
                  );
                })
                .join(", ")
            : "None"}
        </div>
      )}

      {messages.length > 0 && (
        <div className="mb-2 flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              clearMessages();
              clearChatHistory();
            }}
            disabled={isLoading}
          >
            Clear Chat
          </Button>
        </div>
      )}

      <div className={chatHistoryClasses}>
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-gray-500">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
              <span className="text-2xl">🌿</span>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-emerald-700">
              Welcome to Cosaint AI Health Companion
            </h3>
            <p className="max-w-md text-sm">
              I&apos;m here to provide holistic health insights combining
              traditional wisdom with modern science. How can I help you today?
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message: MessageType) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] break-words rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line shadow-sm ${
                    message.role === "user"
                      ? "bg-emerald-600 text-white"
                      : "border border-amber-100 bg-amber-50 text-amber-900"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {error && (
        <div className="mb-2 rounded bg-red-50 p-2 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>): void =>
            setInput(e.target.value)
          }
          onKeyDown={handleKeyDown}
          placeholder="Ask Cosaint about your health..."
          className="min-h-[60px] w-full resize-none rounded-md border border-gray-300 p-3 pr-12 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
          maxLength={500}
          disabled={isLoading}
        />
        <Button
          className="absolute bottom-2 right-2"
          size="sm"
          onClick={handleSendMessage}
          disabled={isLoading || input.trim() === ""}
        >
          {isLoading ? (
            <div className="flex items-center gap-1">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"></div>
              <span className="text-xs">
                {loadingStartTime
                  ? `${Math.floor((Date.now() - loadingStartTime) / 1000)}s`
                  : "AI"}
              </span>
            </div>
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="mt-1 text-right text-xs text-gray-500">
        {input.length}/500
      </div>
    </div>
  );

  return (
    <>
      {isExpanded && (
        <div className="fixed inset-0 z-40 bg-emerald-950/40 backdrop-blur-sm transition-opacity" />
      )}
      {isExpanded ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <div className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/60 to-white p-6 shadow-2xl">
            {chatLayout}
          </div>
        </div>
      ) : (
        chatLayout
      )}
    </>
  );
};

export default CosaintChatUI;
