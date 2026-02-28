/**
 * Generate a new world on World Labs using four local images.
 *
 * Usage:
 *   1. Place image1.png, image2.png, image3.png, image4.png in this folder
 *   2. Run: bun run scripts/generate-world.ts
 *
 * Outputs the operation ID for polling.
 */

import { readFileSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_URL = "https://api.worldlabs.ai/marble/v1";
const MODEL = "Marble 0.1-plus";
const DISPLAY_NAME = "Internal World";
const TEXT_PROMPT = "A detailed 3D environment";

const IMAGES = [
  { file: "image_1.png", heading: 0 },
  { file: "image_3.png", heading: 180 },
];

function getApiKey(): string {
  const key = process.env.NEXT_PUBLIC_WORLDLABS_API_KEY ?? "";
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_WORLDLABS_API_KEY is not set. " +
        "Make sure .env.local is loaded or pass it directly: " +
        "NEXT_PUBLIC_WORLDLABS_API_KEY=xxx bun run scripts/generate-world.ts"
    );
  }
  return key;
}

function loadImageAsBase64(filename: string): { extension: string; data: string } {
  const filepath = join(__dirname, filename);
  const buffer = readFileSync(filepath);
  const ext = extname(filename).replace(".", "").toLowerCase();
  return {
    extension: ext === "jpg" ? "jpeg" : ext,
    data: buffer.toString("base64"),
  };
}

async function main() {
  const apiKey = getApiKey();

  console.log(`Preparing ${IMAGES.length} images...`);

  const multiImagePrompt = IMAGES.map(({ file, heading }) => {
    const { extension, data } = loadImageAsBase64(file);
    console.log(`  Loaded ${file} (${extension}, ${Math.round(data.length / 1024)}KB base64)`);
    return {
      azimuth: heading,
      content: {
        source: "data_base64" as const,
        extension,
        data_base64: data,
      },
    };
  });

  console.log(`\nGenerating world "${DISPLAY_NAME}"...`);

  const res = await fetch(`${BASE_URL}/worlds:generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "WLT-Api-Key": apiKey,
    },
    body: JSON.stringify({
      display_name: DISPLAY_NAME,
      model: MODEL,
      world_prompt: {
        type: "multi-image",
        multi_image_prompt: multiImagePrompt,
        reconstruct_images: true,
        text_prompt: TEXT_PROMPT,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`generateWorld failed (${res.status}): ${body}`);
  }

  const result = await res.json();

  console.log("\nWorld generation started!");
  console.log(`  Operation ID: ${result.operation_id}`);
  console.log(`  Done: ${result.done}`);
  if (result.created_at) console.log(`  Created at: ${result.created_at}`);
  if (result.expires_at) console.log(`  Expires at: ${result.expires_at}`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
