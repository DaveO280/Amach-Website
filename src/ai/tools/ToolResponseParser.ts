/**
 * Parses AI responses to extract tool calls
 */

import { ToolCall } from "./ToolExecutor";

export class ToolResponseParser {
  /**
   * Extract tool calls from AI response
   * Supports both JSON format and text with JSON blocks
   */
  static parseToolCalls(response: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    // Try to parse as pure JSON first
    try {
      const json = JSON.parse(response);
      if (json.tool && json.params) {
        toolCalls.push({ tool: json.tool, params: json.params });
        return toolCalls;
      }
    } catch {
      // Not pure JSON, continue to extract from text
    }

    // Look for JSON blocks in markdown code fences
    // Handle both formats: ```json\n{...}\n``` and ```json {...} ```
    // Also handle cases where there might be extra whitespace or the closing ``` is on a new line
    const jsonBlockPattern = /```json\s*([\s\S]*?)\s*```/g;
    let match;

    while ((match = jsonBlockPattern.exec(response)) !== null) {
      try {
        const jsonContent = match[1].trim();
        if (!jsonContent) {
          continue; // Skip empty blocks
        }
        const json = JSON.parse(jsonContent);
        if (json.tool && json.params) {
          toolCalls.push({ tool: json.tool, params: json.params });
        } else if (process.env.NODE_ENV === "development") {
          console.warn(
            "[ToolResponseParser] JSON block found but missing 'tool' or 'params':",
            json,
          );
        }
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "[ToolResponseParser] Failed to parse JSON block:",
            error,
            "\nContent:",
            match[1].substring(0, 200),
          );
        }
      }
    }

    // Look for <tool_call> tags
    const toolCallPattern = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;

    while ((match = toolCallPattern.exec(response)) !== null) {
      try {
        const json = JSON.parse(match[1]);
        if (json.tool && json.params) {
          toolCalls.push({ tool: json.tool, params: json.params });
        }
      } catch (error) {
        console.warn(
          "[ToolResponseParser] Failed to parse tool_call tag:",
          error,
        );
      }
    }

    return toolCalls;
  }

  /**
   * Check if response contains tool calls
   */
  static hasToolCalls(response: string): boolean {
    return (
      response.includes('"tool":') ||
      response.includes("<tool_call>") ||
      (response.includes("```json") && response.includes('"params"'))
    );
  }

  /**
   * Remove tool call JSON from response to get clean text
   */
  static stripToolCalls(response: string): string {
    if (!response) return response;
    let cleaned = response;

    // Remove JSON blocks in markdown code fences (handle various formats)
    // Matches: ```json {...} ```, ```json\n{...}\n```, etc.
    cleaned = cleaned.replace(/```json\s*[\s\S]*?\s*```/g, "");

    // Remove tool_call tags
    cleaned = cleaned.replace(/<tool_call>\s*[\s\S]*?\s*<\/tool_call>/g, "");

    // Also remove any standalone JSON tool calls that might appear without code fences
    // This catches cases where the AI outputs raw JSON tool calls
    try {
      const jsonMatch = cleaned.match(
        /^\s*\{[^}]*"tool"[^}]*"params"[^}]*\}\s*$/,
      );
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.tool && parsed.params) {
            cleaned = cleaned.replace(jsonMatch[0], "").trim();
          }
        } catch {
          // Not valid JSON, ignore
        }
      }
    } catch {
      // Ignore errors in cleanup
    }

    return cleaned.trim();
  }
}
