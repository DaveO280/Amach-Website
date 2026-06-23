/**
 * Venice model discovery — queries the /models endpoint to find vision-capable
 * models available on this account.
 *
 * Used at startup to auto-select the best model for PDF parsing.
 * Results are cached for the process lifetime.
 */

export interface VeniceModel {
  id: string;
  object: string;
  type?: string;
  model_spec?: {
    capabilities?: {
      vision?: boolean;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

let _cachedModels: VeniceModel[] | null = null;

export async function listVeniceModels(): Promise<VeniceModel[]> {
  if (_cachedModels) return _cachedModels;

  const apiKey =
    typeof process !== "undefined" ? process.env.VENICE_API_KEY : undefined;
  if (!apiKey) return [];

  try {
    const res = await fetch("https://api.venice.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: VeniceModel[] };
    _cachedModels = json.data ?? [];
    return _cachedModels;
  } catch {
    return [];
  }
}

export async function getVisionCapableModels(): Promise<VeniceModel[]> {
  const models = await listVeniceModels();
  return models.filter((m) => m.model_spec?.capabilities?.vision === true);
}

export async function hasVisionSupport(): Promise<boolean> {
  const visionModels = await getVisionCapableModels();
  return visionModels.length > 0;
}
