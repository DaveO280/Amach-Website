"use client";

import { useHealthDataContext } from "@/components/HealthDataContextWrapper";
import { Button } from "@/components/ui/button";
import { useAi } from "@/store/aiStore";
import type { UploadedFileSummary } from "@/types/HealthContext";
import { Send, X } from "lucide-react";
import Papa from "papaparse";
import React, { useEffect, useRef, useState } from "react";
import { healthDataStore } from "../../data/store/healthDataStore";
import { parsePDF } from "../../utils/pdfParser";

// Define types for our message interface
interface MessageType {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

const CosaintChatUI: React.FC = () => {
  const { messages, sendMessage, isLoading, error, clearMessages } = useAi();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { metrics, uploadedFiles, addUploadedFile, removeUploadedFile } =
    useHealthDataContext();

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

  const handleSendMessage = async (): Promise<void> => {
    if (input.trim() === "") return;
    setLoadingStartTime(Date.now());
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

  return (
    <div className="flex flex-col h-[75vh] max-h-[800px] min-h-[400px]">
      {/* Chat UI content only, no tabs */}
      {/* Generate Health Analysis Button (if present in parent, this is a placeholder for alignment) */}
      {/* Move Add Context Button under Generate Health Analysis */}
      <div className="mb-2 flex flex-col items-start gap-2">
        {/* Add Context Button */}
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white w-fit"
          onClick={() => setShowUploadForm((v) => !v)}
        >
          {showUploadForm ? "Cancel" : "Upload File to Context"}
        </Button>
        {/* Upload Form */}
        {showUploadForm && (
          <form
            onSubmit={handleUploadSubmit}
            className="mt-2 mb-4 bg-emerald-50 p-3 rounded-lg border border-emerald-100 w-full max-w-md"
          >
            <div className="mb-2">
              <label className="block text-xs font-semibold mb-1">File</label>
              <input
                type="file"
                className="w-full border rounded p-2 text-sm"
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
                <div className="text-xs text-gray-600 mt-1">
                  File selected: {JSON.parse(uploadRawData).fileName}
                </div>
              )}
            </div>
            {uploadError && (
              <div className="text-xs text-red-600 mb-2">{uploadError}</div>
            )}
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={isProcessingFile}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isProcessingFile ? "Processing..." : "Upload"}
              </Button>
            </div>
          </form>
        )}

        {/* Saved Files Section */}
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
            <div className="mt-2 bg-blue-50 p-3 rounded-lg border border-blue-100">
              <h3 className="text-sm font-semibold mb-2">Saved Files</h3>
              {savedFiles.length === 0 ? (
                <p className="text-xs text-gray-600">No saved files found.</p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {savedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-2 bg-white rounded border text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
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
                      <div className="flex gap-1 ml-2">
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
      </div>
      {/* Uploaded Files & Summaries Section */}
      {uploadedFiles.length > 0 && !uploadsHidden && (
        <div className="mb-4">
          <h4 className="font-semibold text-emerald-800 mb-2">
            Uploaded Files
          </h4>
          <div className="flex justify-end mb-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setUploadsHidden(true)}
            >
              Hide Uploads
            </Button>
          </div>
          <ul className="flex flex-row flex-wrap gap-2">
            {uploadedFiles.map((file: UploadedFileSummary, idx: number) => (
              <li
                key={idx}
                className="bg-emerald-50 px-2 py-1 rounded-full flex items-center text-xs min-w-0 max-w-[160px]"
                style={{ lineHeight: 1.2 }}
              >
                <span className="truncate max-w-[110px] font-medium text-emerald-900">
                  {file.summary}
                </span>
                <button
                  type="button"
                  className="ml-1 p-1 rounded hover:bg-emerald-200 text-emerald-700"
                  aria-label="Remove file"
                  onClick={() => removeUploadedFile(idx)}
                >
                  <X className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Show Uploads Button */}
      {uploadedFiles.length > 0 && uploadsHidden && (
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
      {/* Health Data Status */}
      <div className="mb-2 text-sm text-emerald-800">
        Available Metrics:{" "}
        {metrics
          ? Object.keys(metrics)
              .map((key) => {
                // Special case for HRV
                if (key === "hrv") return "HRV";
                // Special case for RestingHR
                if (key === "restingHR") return "Resting HR";
                // Default case
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

      {/* Clear Chat Button */}
      {messages.length > 0 && (
        <div className="mb-2 flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            onClick={clearMessages}
            disabled={isLoading}
          >
            Clear Chat
          </Button>
        </div>
      )}

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto p-4 bg-white/30 rounded-lg mb-4 border border-emerald-100">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
              <span className="text-2xl">🌿</span>
            </div>
            <h3 className="text-lg font-semibold mb-2 text-emerald-700">
              Welcome to Cosaint AI Health Companion
            </h3>
            <p className="text-sm max-w-md">
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
                  className={`max-w-[80%] p-3 rounded-lg ${
                    message.role === "user"
                      ? "bg-emerald-600 text-white"
                      : "bg-amber-50 text-amber-900 border border-amber-100"
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

      {/* Error Message */}
      {error && (
        <div className="mb-2 p-2 bg-red-50 text-red-600 rounded text-sm">
          {error}
        </div>
      )}

      {/* Input Area */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>): void =>
            setInput(e.target.value)
          }
          onKeyDown={handleKeyDown}
          placeholder="Ask Cosaint about your health..."
          className="w-full pr-12 min-h-[60px] resize-none rounded-md border border-gray-300 p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          maxLength={500}
          disabled={isLoading}
        />
        <Button
          className="absolute right-2 bottom-2"
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

      {/* Character limit counter */}
      <div className="text-xs text-right mt-1 text-gray-500">
        {input.length}/500
      </div>
    </div>
  );
};

export default CosaintChatUI;
