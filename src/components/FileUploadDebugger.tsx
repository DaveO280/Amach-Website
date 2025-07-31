import Papa from "papaparse";
import React, { useState } from "react";
import { Button } from "./ui/button";

interface ParsedContent {
  content: string;
  analysis: string;
}

export const FileUploadDebugger: React.FC = (): JSX.Element => {
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [parsedContent, setParsedContent] = useState<ParsedContent | null>(
    null,
  );

  const analyzeFile = async (file: File): Promise<void> => {
    setDebugInfo("Analyzing file...");

    try {
      const reader = new FileReader();

      reader.onload = (e): void => {
        const content = e.target?.result as string;

        let analysis = `File Analysis:\n`;
        analysis += `- Name: ${file.name}\n`;
        analysis += `- Size: ${file.size} bytes\n`;
        analysis += `- Type: ${file.type}\n`;
        analysis += `- Content length: ${content.length} characters\n`;

        // Try to determine file type from content
        if (content.includes("<?xml") || content.includes("<HealthData")) {
          analysis += `- Detected: XML (Apple Health Export)\n`;

          // Count records
          const recordMatches = content.match(/<Record/g);
          const recordCount = recordMatches ? recordMatches.length : 0;
          analysis += `- Records found: ${recordCount}\n`;

          // Find unique metric types
          const typeMatches = content.match(/type="([^"]+)"/g);
          const types = typeMatches
            ? [
                ...new Set(
                  typeMatches.map((m) => m.match(/type="([^"]+)"/)?.[1]),
                ),
              ]
            : [];
          analysis += `- Unique metric types: ${types.length}\n`;
          analysis += `- Sample types: ${types.slice(0, 5).join(", ")}\n`;
        } else if (file.name.endsWith(".csv") || content.includes(",")) {
          analysis += `- Detected: CSV\n`;

          // Parse CSV to count rows
          const results = Papa.parse(content, { header: true });
          analysis += `- CSV rows: ${results.data.length}\n`;
          analysis += `- CSV columns: ${results.meta.fields?.length || 0}\n`;
          if (results.meta.fields) {
            analysis += `- Sample columns: ${results.meta.fields.slice(0, 5).join(", ")}\n`;
          }
        } else if (
          content.trim().startsWith("{") ||
          content.trim().startsWith("[")
        ) {
          analysis += `- Detected: JSON\n`;
          try {
            const parsed = JSON.parse(content);
            analysis += `- JSON type: ${Array.isArray(parsed) ? "Array" : "Object"}\n`;
            if (Array.isArray(parsed)) {
              analysis += `- Array length: ${parsed.length}\n`;
            } else {
              analysis += `- Object keys: ${Object.keys(parsed).length}\n`;
            }
          } catch (e) {
            analysis += `- JSON parsing failed: ${e}\n`;
          }
        } else if (
          file.type === "application/pdf" ||
          file.name.endsWith(".pdf")
        ) {
          analysis += `- Detected: PDF file\n`;
          analysis += `- PDF analysis not available in debug mode\n`;
        } else {
          analysis += `- Detected: Text file\n`;
          analysis += `- Lines: ${content.split("\n").length}\n`;
        }

        setDebugInfo(analysis);
        setParsedContent({ content, analysis });
      };

      reader.onerror = (): void => {
        setDebugInfo("Error reading file");
      };

      reader.readAsText(file);
    } catch (error) {
      setDebugInfo(
        `Error analyzing file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const handleFileSelect = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    const file = event.target.files?.[0];
    if (file) {
      analyzeFile(file);
    }
  };

  const clearDebug = (): void => {
    setDebugInfo("");
    setParsedContent(null);
  };

  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <h3 className="text-lg font-semibold mb-4">File Upload Debugger</h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Select File:</label>
          <input
            type="file"
            onChange={handleFileSelect}
            accept=".xml,.csv,.json,.txt,.pdf"
            className="w-full border rounded p-2"
          />
        </div>

        <div className="flex space-x-2">
          <Button onClick={clearDebug} variant="outline">
            Clear
          </Button>
        </div>

        {debugInfo && (
          <div>
            <label className="block text-sm font-medium mb-2">
              Analysis Results:
            </label>
            <div className="bg-white p-3 rounded border max-h-96 overflow-y-auto">
              <pre className="text-sm whitespace-pre-wrap">{debugInfo}</pre>
            </div>
          </div>
        )}

        {parsedContent && (
          <div>
            <label className="block text-sm font-medium mb-2">
              Content Preview (first 1000 chars):
            </label>
            <div className="bg-white p-3 rounded border max-h-96 overflow-y-auto">
              <pre className="text-sm whitespace-pre-wrap">
                {parsedContent.content.substring(0, 1000)}
                {parsedContent.content.length > 1000 ? "... (truncated)" : ""}
              </pre>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
        <h4 className="font-medium text-blue-800 mb-2">
          Troubleshooting Tips:
        </h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>
            • For Apple Health exports, look for XML files with &lt;Record&gt;
            elements
          </li>
          <li>
            • For PDF files, ensure they contain extractable text (not just
            images)
          </li>
          <li>• Check that the file contains the expected data types</li>
          <li>• Verify the file isn&apos;t corrupted or empty</li>
          <li>• Large files may take time to process</li>
        </ul>
      </div>
    </div>
  );
};
