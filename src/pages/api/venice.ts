import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  // Allow POST and OPTIONS for CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const apiKey = process.env.VENICE_API_KEY;
  const apiEndpoint =
    process.env.VENICE_API_ENDPOINT || "https://api.venice.ai/api/v1";
  const modelName = process.env.VENICE_MODEL_NAME || "llama-3.1-405b";

  if (!apiKey) {
    res.status(500).json({ error: "API key is not configured" });
    return;
  }

  try {
    const {
      messages = [],
      max_tokens = 2000,
      temperature = 0.7,
    } = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      res
        .status(400)
        .json({ error: "Invalid request: messages array is required" });
      return;
    }
    if (!max_tokens || max_tokens < 1) {
      res
        .status(400)
        .json({
          error: "Invalid request: max_tokens must be a positive number",
        });
      return;
    }

    const response = await fetch(`${apiEndpoint}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        messages,
        max_tokens,
        temperature,
        model: modelName,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({
        error: `Venice API error: ${response.status} ${response.statusText}`,
        details: errorText,
      });
      return;
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (err: unknown) {
    res.status(500).json({
      error: "Failed to connect to Venice API",
      details: err instanceof Error ? err.message : String(err),
    });
  }
}
