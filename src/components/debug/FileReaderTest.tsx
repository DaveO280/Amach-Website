// FileReaderTest.tsx
// Tests if FileReader behaves differently on mobile

import React, { useState } from "react";

interface FileReaderTestProps {
  file: File | null;
}

export const FileReaderTest: React.FC<FileReaderTestProps> = ({ file }) => {
  const [results, setResults] = useState<string>("");

  const testFileReader = async (): Promise<void> => {
    if (!file) {
      setResults("No file selected");
      return;
    }

    let output = "=== FILE READER TEST ===\n\n";

    // Test 1: Using .text() method (modern)
    output += "Test 1: blob.text() method\n";
    try {
      const blob = file.slice(0, 10000);
      const text1 = await blob.text();
      output += `✅ Success - Read ${text1.length} chars\n`;
      output += `Has "<Record": ${text1.includes("<Record") ? "✅" : "❌"}\n`;
      output += `First 100 chars: ${text1.substring(0, 100)}\n\n`;
    } catch (e) {
      output += `❌ Failed: ${e}\n\n`;
    }

    // Test 2: Using FileReader (traditional)
    output += "Test 2: FileReader.readAsText()\n";
    try {
      const blob = file.slice(0, 10000);
      const text2 = await new Promise<string>((resolve, reject): void => {
        const reader = new FileReader();
        reader.onload = (e): void => {
          resolve(e.target?.result as string);
        };
        reader.onerror = reject;
        reader.readAsText(blob);
      });
      output += `✅ Success - Read ${text2.length} chars\n`;
      output += `Has "<Record": ${text2.includes("<Record") ? "✅" : "❌"}\n`;
      output += `First 100 chars: ${text2.substring(0, 100)}\n\n`;
    } catch (e) {
      output += `❌ Failed: ${e}\n\n`;
    }

    // Test 3: Try with explicit UTF-8 encoding
    output += "Test 3: FileReader with explicit UTF-8\n";
    try {
      const blob = file.slice(0, 10000);
      const text3 = await new Promise<string>((resolve, reject): void => {
        const reader = new FileReader();
        reader.onload = (e): void => {
          resolve(e.target?.result as string);
        };
        reader.onerror = reject;
        reader.readAsText(blob, "UTF-8");
      });
      output += `✅ Success - Read ${text3.length} chars\n`;
      output += `Has "<Record": ${text3.includes("<Record") ? "✅" : "❌"}\n\n`;
    } catch (e) {
      output += `❌ Failed: ${e}\n\n`;
    }

    // Test 4: Read as ArrayBuffer then decode
    output += "Test 4: ArrayBuffer + TextDecoder\n";
    try {
      const blob = file.slice(0, 10000);
      const arrayBuffer = await blob.arrayBuffer();
      const decoder = new TextDecoder("utf-8");
      const text4 = decoder.decode(arrayBuffer);
      output += `✅ Success - Read ${text4.length} chars\n`;
      output += `Has "<Record": ${text4.includes("<Record") ? "✅" : "❌"}\n\n`;
    } catch (e) {
      output += `❌ Failed: ${e}\n\n`;
    }

    // Test 5: Simulate your actual parser's chunk reading
    output += "Test 5: Simulating Parser Chunk Reading\n";
    try {
      const CHUNK_SIZE = 128 * 1024; // 128KB like your parser
      const blob = file.slice(0, CHUNK_SIZE);

      // Method your parser likely uses
      const text5 = await new Promise<string>((resolve, reject): void => {
        const reader = new FileReader();
        reader.onload = (e): void => {
          resolve(e.target?.result as string);
        };
        reader.onerror = reject;
        reader.readAsText(blob);
      });

      output += `✅ Read ${text5.length} chars from first chunk\n`;

      // Try to find records
      const recordMatches = text5.match(/<Record[^>]*>/g);
      output += `Records found with /<Record[^>]*>/g: ${recordMatches ? recordMatches.length : 0}\n`;

      if (recordMatches && recordMatches.length > 0) {
        output += `First record: ${recordMatches[0]}\n`;
      } else {
        // Try alternative patterns
        const alt1 = text5.match(/<Record[^>]*>/);
        output += `Single match (no g flag): ${alt1 ? "YES" : "NO"}\n`;

        const alt2 = text5.match(/<record[^>]*>/i);
        output += `Case insensitive: ${alt2 ? "YES" : "NO"}\n`;

        // Show what IS in the text
        output += `\nActual content preview:\n`;
        output += text5.substring(0, 500);
        output += "\n...\n";
      }
    } catch (e) {
      output += `❌ Failed: ${e}\n\n`;
    }

    output += "\n--- Environment ---\n";
    output += `Browser: ${navigator.userAgent}\n`;
    output += `Platform: ${navigator.platform}\n`;
    output += `File size: ${file.size} bytes\n`;

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
    <div className="p-4 bg-green-50 border-2 border-green-400 rounded-lg">
      <h3 className="text-lg font-bold text-green-900 mb-3">
        📖 FileReader Compatibility Test
      </h3>

      <button
        onClick={testFileReader}
        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
      >
        Test FileReader Methods
      </button>

      {results && (
        <div className="mt-4 p-3 bg-white rounded border border-green-300 max-h-96 overflow-y-auto">
          <pre className="text-xs whitespace-pre-wrap font-mono">{results}</pre>
        </div>
      )}

      <div className="mt-3 text-sm text-green-800">
        <strong>What this tests:</strong>
        <ul className="list-disc list-inside mt-1 space-y-1">
          <li>Different ways to read file content</li>
          <li>If mobile Safari reads files differently</li>
          <li>Simulates your actual parser&apos;s reading method</li>
          <li>Shows if records are found in first chunk</li>
        </ul>
      </div>
    </div>
  );
};
