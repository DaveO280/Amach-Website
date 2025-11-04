// RegexCompatibilityTest.tsx
// Add this to your app temporarily to test if regex works on mobile

import React, { useState } from "react";

export const RegexCompatibilityTest: React.FC = () => {
  const [results, setResults] = useState<string>("");

  const testRegex = (): void => {
    const testXML = `
      <HealthData>
        <Record type="HKQuantityTypeIdentifierStepCount" value="100" startDate="2024-01-01" />
        <Record type="HKQuantityTypeIdentifierHeartRate" value="75" startDate="2024-01-01" />
      </HealthData>
    `;

    let output = "=== REGEX COMPATIBILITY TEST ===\n\n";

    // Test 1: Basic Record matching
    try {
      const pattern1 = /<Record[^>]*>/g;
      const matches1 = testXML.match(pattern1);
      output += `Test 1 - Basic <Record> matching:\n`;
      output += matches1
        ? `✅ PASS - Found ${matches1.length} matches\n`
        : `❌ FAIL - No matches\n`;
      if (matches1) {
        output += `First match: ${matches1[0].substring(0, 50)}...\n`;
      }
    } catch (e) {
      output += `Test 1: ❌ ERROR - ${e}\n`;
    }
    output += "\n";

    // Test 2: Self-closing Record matching
    try {
      const pattern2 = /<Record[^>]*\/>/g;
      const matches2 = testXML.match(pattern2);
      output += `Test 2 - Self-closing <Record /> matching:\n`;
      output += matches2
        ? `✅ PASS - Found ${matches2.length} matches\n`
        : `❌ FAIL - No matches\n`;
    } catch (e) {
      output += `Test 2: ❌ ERROR - ${e}\n`;
    }
    output += "\n";

    // Test 3: Lookbehind (NOT supported in older Safari)
    try {
      const pattern3 = /(?<=type=")([^"]+)(?=")/g;
      const matches3 = testXML.match(pattern3);
      output += `Test 3 - Lookbehind (Safari 16.4+ only):\n`;
      output += matches3
        ? `✅ PASS - Found ${matches3.length} matches\n`
        : `⚠️ Not supported\n`;
    } catch (e) {
      output += `Test 3: ❌ NOT SUPPORTED - ${e}\n`;
    }
    output += "\n";

    // Test 4: Dotall flag (s flag)
    try {
      const pattern4 = /<Record[^>]*>/gs;
      const matches4 = testXML.match(pattern4);
      output += `Test 4 - Dotall flag (s):\n`;
      output += matches4
        ? `✅ PASS - Found ${matches4.length} matches\n`
        : `❌ FAIL\n`;
    } catch (e) {
      output += `Test 4: ❌ ERROR - ${e}\n`;
    }
    output += "\n";

    // Test 5: Named groups (ES2018)
    try {
      const pattern5 = /<Record[^>]*type="(?<type>[^"]+)"[^>]*>/g;
      const match5 = pattern5.exec(testXML);
      output += `Test 5 - Named capture groups:\n`;
      output += match5?.groups?.type
        ? `✅ PASS - Captured: ${match5.groups.type}\n`
        : `❌ FAIL\n`;
    } catch (e) {
      output += `Test 5: ❌ ERROR - ${e}\n`;
    }
    output += "\n";

    // Test 6: Your actual parser pattern
    try {
      const pattern6 = /<Record[^>]*(?:\/>|>.*?<\/Record>)/gs;
      const matches6 = testXML.match(pattern6);
      output += `Test 6 - Your parser's pattern:\n`;
      output += matches6
        ? `✅ PASS - Found ${matches6.length} matches\n`
        : `❌ FAIL - No matches\n`;
      if (matches6) {
        output += `Matches:\n`;
        matches6.forEach((m, i) => {
          output += `  ${i + 1}: ${m.substring(0, 60)}...\n`;
        });
      }
    } catch (e) {
      output += `Test 6: ❌ ERROR - ${e}\n`;
    }
    output += "\n";

    // Browser info
    output += "=== BROWSER INFO ===\n";
    output += `User Agent: ${navigator.userAgent}\n`;
    output += `Platform: ${navigator.platform}\n`;

    setResults(output);
    console.log(output);
  };

  return (
    <div className="p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg">
      <h3 className="text-lg font-bold text-yellow-900 mb-3">
        🧪 Regex Compatibility Test
      </h3>

      <button
        onClick={testRegex}
        className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
      >
        Run Test
      </button>

      {results && (
        <div className="mt-4 p-3 bg-white rounded border border-yellow-300">
          <pre className="text-xs whitespace-pre-wrap font-mono">{results}</pre>
        </div>
      )}

      <div className="mt-3 text-sm text-yellow-800">
        <strong>What this tests:</strong>
        <ul className="list-disc list-inside mt-1 space-y-1">
          <li>If your regex patterns work on this browser</li>
          <li>Which ES2018+ features are supported</li>
          <li>Your actual parser&apos;s regex pattern</li>
        </ul>
      </div>
    </div>
  );
};
