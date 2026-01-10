/**
 * Utility for logging Venice AI prompts to files for debugging
 * Saves prompts to /public/debug-prompts/ directory
 */

const ENABLE_FILE_LOGGING = process.env.NODE_ENV === "development";

interface PromptLog {
  timestamp: string;
  agentName: string;
  systemPrompt: string;
  userPrompt: string;
  totalLength: number;
}

/**
 * Log a prompt to both console and file (in development only)
 */
export async function logPromptToFile(
  agentName: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<void> {
  if (!ENABLE_FILE_LOGGING) {
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${timestamp}_${agentName.replace(/\s+/g, "_")}.txt`;

  const logContent = `
================================================================================
VENICE AI PROMPT LOG
================================================================================
Agent: ${agentName}
Timestamp: ${new Date().toISOString()}
System Prompt Length: ${systemPrompt.length} chars
User Prompt Length: ${userPrompt.length} chars
Total Length: ${systemPrompt.length + userPrompt.length} chars
================================================================================

### SYSTEM PROMPT ###

${systemPrompt}

================================================================================

### USER PROMPT ###

${userPrompt}

================================================================================
END OF PROMPT LOG
================================================================================
`;

  // Log to console with a summary
  console.log(
    `📄 [Prompt Logger] Logged prompt for ${agentName} to: ${filename}`,
  );
  console.log(
    `   Total length: ${systemPrompt.length + userPrompt.length} chars`,
  );

  // In browser environment, trigger download instead of file write
  if (typeof window !== "undefined") {
    downloadPromptLog(filename, logContent);
  } else {
    // Server-side: attempt to write to file
    try {
      const fs = await import("fs/promises");
      const path = await import("path");

      const debugDir = path.join(process.cwd(), "public", "debug-prompts");

      // Ensure directory exists
      try {
        await fs.mkdir(debugDir, { recursive: true });
      } catch (err) {
        // Directory might already exist
      }

      const filePath = path.join(debugDir, filename);
      await fs.writeFile(filePath, logContent, "utf-8");

      console.log(`✅ [Prompt Logger] Wrote prompt to: ${filePath}`);
    } catch (error) {
      console.warn("[Prompt Logger] Could not write to file:", error);
    }
  }
}

/**
 * Trigger browser download of prompt log
 */
function downloadPromptLog(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log(`💾 [Prompt Logger] Download triggered for: ${filename}`);
}

/**
 * Create a consolidated log of all prompts from a session
 */
export function createSessionSummary(logs: PromptLog[]): string {
  const summary = `
VENICE AI SESSION SUMMARY
=========================
Total Prompts: ${logs.length}
Session Start: ${logs[0]?.timestamp || "N/A"}
Session End: ${logs[logs.length - 1]?.timestamp || "N/A"}

Agents Used:
${logs.map((log) => `- ${log.agentName} (${log.totalLength} chars)`).join("\n")}

Total Characters Sent: ${logs.reduce((sum, log) => sum + log.totalLength, 0)}

=========================
`;

  return (
    summary +
    logs
      .map(
        (log, i) => `

=========================
PROMPT ${i + 1}: ${log.agentName}
=========================
Timestamp: ${log.timestamp}

SYSTEM PROMPT:
${log.systemPrompt}

USER PROMPT:
${log.userPrompt}

`,
      )
      .join("\n")
  );
}
