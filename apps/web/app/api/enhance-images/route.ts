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

The result must preserve enough building structure for 3D spatial reconstruction.`;
}

// ---------------------------------------------------------------------------
// FLUX 2 Pro img2img call via Azure AI Foundry
// Posts multipart/form-data directly to the model endpoint.
// ---------------------------------------------------------------------------
async function fluxImg2Img(
  imageBuffer: ArrayBuffer,
  prompt: string,
): Promise<string> {
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("output_format", "b64_json");
  form.append(
    "image",
    new Blob([imageBuffer], { type: "image/jpeg" }),
    "image.jpg",
  );

  const res = await fetch(AZURE_FLUX_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AZURE_FLUX_API_KEY}`,
    },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`FLUX img2img failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.data[0].b64_json as string;
}

// ---------------------------------------------------------------------------
// Download image URL → ArrayBuffer
// ---------------------------------------------------------------------------
async function downloadImage(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download image (${res.status}): ${url}`);
  }
  return res.arrayBuffer();
}

// ---------------------------------------------------------------------------
// Process a single image: download → enhance → return data URI
// Falls back to original URL on failure.
// ---------------------------------------------------------------------------
async function processImage(
  image: { url: string; heading: number },
  prompt: string,
): Promise<EnhancedImage> {
  try {
    const imageBuffer = await downloadImage(image.url);
    const enhancedBase64 = await fluxImg2Img(imageBuffer, prompt);
    return {
      url: `data:image/png;base64,${enhancedBase64}`,
      heading: image.heading,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(
      `[enhance-images] Failed to enhance image heading=${image.heading}: ${msg}`,
    );
    // Fallback: return the original Street View URL
    return { url: image.url, heading: image.heading };
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  if (!AZURE_FLUX_ENDPOINT || !AZURE_FLUX_API_KEY) {
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
    `[enhance-images] Enhancing ${images.length} images for "${buildingName}"`,
  );

  const enhanced = await Promise.all(
    images.map((img) => processImage(img, enhancedPrompt)),
  );

  return NextResponse.json({ images: enhanced });
}
