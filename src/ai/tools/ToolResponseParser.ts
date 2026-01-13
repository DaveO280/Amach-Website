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
    const jsonBlockPattern = /```json\s*\n([\s\S]*?)\n```/g;
    let match;

    while ((match = jsonBlockPattern.exec(response)) !== null) {
      try {
        const json = JSON.parse(match[1]);
        if (json.tool && json.params) {
          toolCalls.push({ tool: json.tool, params: json.params });
        }
      } catch (error) {
        console.warn("[ToolResponseParser] Failed to parse JSON block:", error);
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
    let cleaned = response;

    // Remove JSON blocks
    cleaned = cleaned.replace(/```json\s*\n[\s\S]*?\n```/g, "");

    // Remove tool_call tags
    cleaned = cleaned.replace(/<tool_call>\s*[\s\S]*?\s*<\/tool_call>/g, "");

    return cleaned.trim();
  }
}
