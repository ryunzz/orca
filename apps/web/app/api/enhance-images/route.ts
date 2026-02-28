import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const AZURE_FLUX_ENDPOINT = process.env.AZURE_FLUX_ENDPOINT ?? "";
const AZURE_FLUX_API_KEY = process.env.AZURE_FLUX_API_KEY ?? "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface EnhanceRequest {
  images: { url: string; heading: number }[];
  prompt: string;
  buildingName: string;
}

interface EnhancedImage {
  url: string;
  heading: number;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------
function buildFirePrompt(
  userPrompt: string,
  buildingName: string,
): string {
  return `Modify this image of ${buildingName} to depict the following emergency scenario: ${userPrompt}.

Fire conditions:
- Mid-severity active fire — clearly visible but NOT completely destroying the building
- Orange and yellow flames emerging from windows and/or specified areas
- Thick gray and dark smoke billowing upward from the fire source
- Smoke partially obscuring upper portions but the building structure remains identifiable
- The building's architectural details, materials, and surroundings are preserved
- Street-level photorealistic quality, maintaining the original camera perspective
- This should look like an active emergency response scene, not aftermath destruction

Image quality:
- Fix any black spots, dark patches, visual glitches, or aberrations present in the source image
- Fill in any missing or corrupted regions with plausible surrounding context (buildings, sky, road, foliage)
- Ensure the entire output is a clean, seamless, photorealistic photograph with no artifacts

The result must preserve enough building structure for 3D spatial reconstruction.`;
}

// ---------------------------------------------------------------------------
// FLUX 2 Pro img2img call via Azure AI Foundry
// Sends JSON with base64-encoded image to the BFL-compatible endpoint.
// ---------------------------------------------------------------------------


async function fluxImg2Img(
  imageBuffer: ArrayBuffer,
  prompt: string,
): Promise<string> {
  const imageBase64 = Buffer.from(imageBuffer).toString("base64");

  const payload = {
    prompt,
    input_image: imageBase64,
    n: 1,
    model: "FLUX.2-pro",
  };

  const t0 = Date.now();
  const res = await fetch(AZURE_FLUX_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${AZURE_FLUX_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const elapsed = Date.now() - t0;

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[enhance] FLUX failed ${res.status} in ${elapsed}ms: ${body}`);
    throw new Error(`FLUX img2img failed (${res.status}): ${body}`);
  }

  const data = await res.json();

  // Azure AI Foundry may return the result in different shapes depending on
  // the model wrapper. Try common response formats.
  const b64 =
    data.image ??                    // BFL native: { image: "<base64>" }
    data.data?.[0]?.b64_json ??      // OpenAI-compat: { data: [{ b64_json }] }
    data.result ??                   // Some wrappers use { result: "<base64>" }
    null;

  if (!b64 || typeof b64 !== "string") {
    console.error(`[enhance] Unexpected response keys=[${Object.keys(data).join(", ")}]`);
    throw new Error(`FLUX returned unexpected response: [${Object.keys(data).join(", ")}]`);
  }

  console.log(`[enhance] FLUX ok in ${elapsed}ms`);
  return b64;
}

// ---------------------------------------------------------------------------
// Download image URL → ArrayBuffer
// ---------------------------------------------------------------------------
async function downloadImage(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download image (${res.status})`);
  }
  return res.arrayBuffer();
}

// ---------------------------------------------------------------------------
// Process a single image: download → enhance → return data URI
// Throws on failure — no fallback.
// ---------------------------------------------------------------------------
async function processImage(
  image: { url: string; heading: number },
  prompt: string,
): Promise<EnhancedImage> {
  const imageBuffer = await downloadImage(image.url);
  const enhancedBase64 = await fluxImg2Img(imageBuffer, prompt);
  return {
    url: `data:image/jpeg;base64,${enhancedBase64}`,
    heading: image.heading,
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  if (!AZURE_FLUX_ENDPOINT || !AZURE_FLUX_API_KEY) {
    console.error("[enhance] Missing AZURE_FLUX env vars");
    return NextResponse.json(
      { error: "AZURE_FLUX_ENDPOINT and AZURE_FLUX_API_KEY must be set" },
      { status: 500 },
    );
  }

  let body: EnhanceRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { images, prompt, buildingName } = body;

  if (!images?.length || !prompt || !buildingName) {
    return NextResponse.json(
      { error: "Missing required fields: images, prompt, buildingName" },
      { status: 400 },
    );
  }

  const enhancedPrompt = buildFirePrompt(prompt, buildingName);

  console.log(
    `[enhance] ${images.length} images for "${buildingName}" — headings=[${images.map((i) => i.heading).join(", ")}]`,
  );

  const t0 = Date.now();

  try {
    const enhanced = await Promise.all(
      images.map((img) => processImage(img, enhancedPrompt)),
    );

    console.log(`[enhance] All ${enhanced.length} images done in ${Date.now() - t0}ms`);
    return NextResponse.json({ images: enhanced });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[enhance] Failed after ${Date.now() - t0}ms: ${msg}`);
    return NextResponse.json(
      { error: `Image enhancement failed: ${msg}` },
      { status: 502 },
    );
  }
}
