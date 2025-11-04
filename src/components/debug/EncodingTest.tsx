// EncodingTest.tsx
// Tests if file is being read differently on mobile vs desktop

import React, { useState } from "react";

interface EncodingTestProps {
  file: File | null;
}

export const EncodingTest: React.FC<EncodingTestProps> = ({ file }) => {
  const [results, setResults] = useState<string>("");

  const testEncoding = async (): Promise<void> => {
    if (!file) {
      setResults("No file selected");
      return;
    }

    let output = "=== FILE ENCODING TEST ===\n\n";

    try {
      // Read first 1000 bytes
      const blob = file.slice(0, 1000);
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      output += `File: ${file.name}\n`;
      output += `Size: ${file.size} bytes\n\n`;

      // Check for BOM (Byte Order Mark)
      output += "--- BOM Check ---\n";
      if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        output += "⚠️ UTF-8 BOM detected\n";
      } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        output += "⚠️ UTF-16 LE BOM detected\n";
      } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        output += "⚠️ UTF-16 BE BOM detected\n";
      } else {
        output += "✅ No BOM\n";
      }
      output += "\n";

      // Show first 20 bytes
      output += "--- First 20 Bytes (hex) ---\n";
      const hexBytes = Array.from(bytes.slice(0, 20))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
      output += hexBytes + "\n\n";

      // Try reading as text
      output += "--- Text Content ---\n";
      const text = await blob.text();

      // Check first character
      const firstCharCode = text.charCodeAt(0);
      output += `First char code: ${firstCharCode} (${firstCharCode === 0xfeff ? "BOM" : "normal"})\n`;

      // Show first 500 chars
      output += "\nFirst 500 characters:\n";
      output += text.substring(0, 500);
      output += "\n...\n\n";

      // Check for Record tags
      output += "--- Structure Check ---\n";
      output += `Has "<?xml": ${text.includes("<?xml") ? "✅" : "❌"}\n`;
      output += `Has "<HealthData": ${text.includes("<HealthData") ? "✅" : "❌"}\n`;
      output += `Has "<Record": ${text.includes("<Record") ? "✅" : "❌"}\n`;
      output += `Has "<record" (lowercase): ${text.includes("<record") ? "⚠️" : "✅ (good)"}\n\n`;

      // Try finding first Record with regex
      output += "--- Regex Test ---\n";
      const recordMatch = text.match(/<Record[^>]*>/);
      if (recordMatch) {
        output += `✅ Found Record tag:\n${recordMatch[0]}\n`;
      } else {
        output += `❌ No Record tags found with /<Record[^>]*>/\n`;

        // Try case-insensitive
        const recordMatchCI = text.match(/<record[^>]*>/i);
        if (recordMatchCI) {
          output += `⚠️ Found with case-insensitive search:\n${recordMatchCI[0]}\n`;
        }
      }

      output += "\n--- Browser Info ---\n";
      output += `User Agent: ${navigator.userAgent}\n`;
      output += `Platform: ${navigator.platform}\n`;
    } catch (error) {
      output += `❌ ERROR: ${error}\n`;
    }

    setResults(output);
    console.log(output);
  };

  if (!file) {
    return (
      <div className="p-4 bg-gray-100 rounded-lg text-gray-500">
        Select a file first
      </div>
    );
  }

  return (
    <div className="p-4 bg-purple-50 border-2 border-purple-400 rounded-lg">
      <h3 className="text-lg font-bold text-purple-900 mb-3">
        🔍 File Encoding Test
      </h3>

      <button
        onClick={testEncoding}
        className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
      >
        Test File Encoding
      </button>

      {results && (
        <div className="mt-4 p-3 bg-white rounded border border-purple-300 max-h-96 overflow-y-auto">
          <pre className="text-xs whitespace-pre-wrap font-mono">{results}</pre>
        </div>
      )}

      <div className="mt-3 text-sm text-purple-800">
        <strong>What this tests:</strong>
        <ul className="list-disc list-inside mt-1 space-y-1">
          <li>If file has BOM (causes issues on mobile)</li>
          <li>If text encoding is correct</li>
          <li>If Record tags are readable</li>
          <li>First 500 characters of actual content</li>
        </ul>
      </div>
    </div>
  );
};
