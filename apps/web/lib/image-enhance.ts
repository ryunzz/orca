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
 * On complete failure, falls back to returning the original images unchanged.
 */
export async function enhanceImages(
  params: EnhanceImagesParams,
): Promise<EnhanceImagesResult> {
  try {
    const res = await fetch("/api/enhance-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[image-enhance] API returned ${res.status}: ${body}`);
      // Fallback: return originals
      return { images: params.images };
    }

    const data: EnhanceImagesResult = await res.json();
    return data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[image-enhance] Failed to enhance images: ${msg}`);
    // Fallback: return originals
    return { images: params.images };
  }
}
