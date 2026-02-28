// ---------------------------------------------------------------------------
// Client-side helper for the image enhancement API route
// ---------------------------------------------------------------------------

export interface EnhanceImagesParams {
  images: { url: string; heading: number }[];
  prompt: string;
  buildingName: string;
}

export interface EnhanceImagesResult {
  images: { url: string; heading: number }[];
}

/**
 * Call the server-side /api/enhance-images route to apply fire/smoke effects
 * to Street View images via FLUX 2 Pro img2img.
 *
 * Throws on any failure — no fallback to originals.
 */
export async function enhanceImages(
  params: EnhanceImagesParams,
): Promise<EnhanceImagesResult> {
  const res = await fetch("/api/enhance-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Enhancement API ${res.status}: ${body}`);
  }

  return res.json();
}
