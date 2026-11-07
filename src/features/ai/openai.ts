import "server-only";
import { z } from "zod";
import { buildFashionPrompt, getFashionVersions } from "@/prompts/fashion";
import {
  getImageRenderSettings,
  imageRenderSettingsSchema,
  type ImageRenderSettings,
} from "./image-settings";
import {
  avatarVisualDirectionSchema,
  type AvatarVisualDirection,
} from "@/features/preview/visual-direction";

export const FASHION_SCHEMA_VERSION = "fashion-item.v1";
export const FASHION_KNOWLEDGE_VERSION =
  getFashionVersions().knowledgeSourceHash;
export const FASHION_PROMPT_VERSION = `stylora-fashion-v1.openai-2.${FASHION_KNOWLEDGE_VERSION}`;
export const AVATAR_PROMPT_VERSION = `stylora-fashion-v1.avatar-3.${FASHION_KNOWLEDGE_VERSION}`;
export const TEXT_MODEL =
  process.env.OPENAI_TEXT_MODEL?.trim() ||
  process.env.OPENAI_MODEL?.trim() ||
  "gpt-5-mini";
export const IMAGE_MODEL =
  process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1.5";

export class OpenAIUnavailableError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable = false,
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = "OpenAIUnavailableError";
  }
}

function apiKey() {
  const value =
    process.env.OPENAI_API_KEY?.trim() || process.env.MODEL_API_KEY?.trim();
  if (!value) throw new OpenAIUnavailableError("OPENAI_UNCONFIGURED");
  return value;
}

function instructions(task: "capsule" | "avatar") {
  return buildFashionPrompt(
    task === "capsule" ? "capsule_generation" : "preview_image",
  ).instructions;
}

async function request(
  path: string,
  body: BodyInit,
  timeout: number,
  json = true,
  signal?: AbortSignal,
) {
  let response: Response;
  try {
    response = await fetch(`https://api.openai.com/v1/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        ...(json ? { "Content-Type": "application/json" } : {}),
      },
      body,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
        : AbortSignal.timeout(timeout),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof OpenAIUnavailableError) throw error;
    throw new OpenAIUnavailableError("OPENAI_CONNECTION_FAILED", true);
  }
  if (!response.ok) {
    const retryHeader = response.headers.get("retry-after");
    const numericDelay = retryHeader === null ? NaN : Number(retryHeader);
    const retryDelay = Number.isFinite(numericDelay)
      ? numericDelay
      : (Date.parse(retryHeader ?? "") - Date.now()) / 1000;
    throw new OpenAIUnavailableError(
      `OPENAI_HTTP_${response.status}`,
      response.status === 429 || response.status >= 500,
      Number.isFinite(retryDelay)
        ? Math.min(86400, Math.max(0, Math.ceil(retryDelay)))
        : undefined,
    );
  }
  return response;
}

const textResponse = z.object({
  status: z.string(),
  output: z.array(
    z.object({
      type: z.string(),
      content: z
        .array(z.object({ type: z.string(), text: z.string().optional() }))
        .optional(),
    }),
  ),
});

export async function generateFashionJson<T>(input: {
  task: "capsule";
  context: unknown;
  schema: Record<string, unknown>;
  validate: (value: unknown) => T;
  signal?: AbortSignal;
}) {
  const response = await request(
    "responses",
    JSON.stringify({
      model: TEXT_MODEL,
      store: false,
      instructions: instructions(input.task),
      input: JSON.stringify(input.context),
      max_output_tokens: 10000,
      text: {
        format: {
          type: "json_schema",
          name: "capsule_result",
          schema: input.schema,
          strict: true,
        },
      },
    }),
    110000,
    true,
    input.signal,
  );
  try {
    const parsed = textResponse.parse(await response.json());
    if (parsed.status !== "completed") throw new Error("incomplete");
    const content = parsed.output.flatMap((output) => output.content ?? []);
    if (content.some((part) => part.type === "refusal"))
      throw new Error("refused");
    const text = content
      .filter((part) => part.type === "output_text")
      .map((part) => part.text ?? "")
      .join("");
    const value = input.validate(JSON.parse(text));
    return {
      value,
      model: TEXT_MODEL,
      promptVersion: FASHION_PROMPT_VERSION,
      schemaVersion: FASHION_SCHEMA_VERSION,
      knowledgeVersion: FASHION_KNOWLEDGE_VERSION,
      providerRequestId: response.headers.get("x-request-id"),
    };
  } catch {
    throw new OpenAIUnavailableError("OPENAI_INVALID_OUTPUT");
  }
}

const imageResponse = z.object({
  data: z.array(z.object({ b64_json: z.string().min(1) })).length(1),
});

export async function generateFashionImage(input: {
  items: unknown[];
  visualDirection: AvatarVisualDirection;
  allowDescriptionOnly?: boolean;
  renderSettings?: ImageRenderSettings;
  signal?: AbortSignal;
  images: {
    bytes: Uint8Array;
    mimeType: "image/png" | "image/jpeg" | "image/webp";
  }[];
}) {
  if (
    (!input.images.length && !input.allowDescriptionOnly) ||
    input.images.length > 16 ||
    input.images.some((image) => image.bytes.length > 10485760)
  ) {
    throw new OpenAIUnavailableError("OPENAI_IMAGE_INPUT_INVALID");
  }
  const settings = imageRenderSettingsSchema.parse(
    input.renderSettings ?? getImageRenderSettings(),
  );
  const visualDirection = avatarVisualDirectionSchema.parse(
    input.visualDirection,
  );
  const body = new FormData();
  body.set("model", IMAGE_MODEL);
  body.set("size", settings.size);
  body.set("quality", settings.quality);
  body.set("output_format", settings.format);
  body.set("n", "1");
  body.set("input_fidelity", settings.inputFidelity);
  body.set(
    "prompt",
    [
      instructions("avatar"),
      "Create one full-length non-identifying fashion mannequin on a warm porcelain studio background with soft diffuse light. Render believable fabric texture, seams, drape and construction from the supplied garment references. Keep the exact selected garment colors, patterns, logos and silhouette; do not invent branding, clothing or accessories. Apply only the supplied visual preferences and outfit pose. Keep garment fronts, hems and selected accessories readable. Skin swatch is an approximate appearance reference under neutral lighting, never an ethnicity. Fit intent affects the illustrative styling without redesigning the garment. Show a neutral mannequin for unspecified human features. Avoid beauty filters, extreme proportions, text labels and impossible anatomy.",
      JSON.stringify({
        items: input.items,
        visualDirection,
      }),
    ].join("\n\n"),
  );
  for (const [index, image] of input.images.entries()) {
    const extension =
      image.mimeType === "image/png"
        ? "png"
        : image.mimeType === "image/webp"
          ? "webp"
          : "jpg";
    body.append(
      "image[]",
      new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }),
      `garment-${index}.${extension}`,
    );
  }
  const prompt = body.get("prompt");
  if (typeof prompt !== "string" || prompt.length > 31800) {
    throw new OpenAIUnavailableError("OPENAI_IMAGE_PROMPT_TOO_LARGE");
  }
  const response = input.images.length
    ? await request("images/edits", body, 230000, false, input.signal)
    : await request(
        "images/generations",
        JSON.stringify({
          model: IMAGE_MODEL,
          prompt: `${prompt}\nThis saved-outfit task permits illustrative rendering from canonical descriptions. Missing reference images remain uncertain.`,
          size: settings.size,
          quality: settings.quality,
          output_format: settings.format,
          n: 1,
        }),
        230000,
        true,
        input.signal,
      );
  const parsed = imageResponse.safeParse(await response.json());
  if (!parsed.success)
    throw new OpenAIUnavailableError("OPENAI_IMAGE_OUTPUT_INVALID");
  const bytes = Buffer.from(parsed.data.data[0].b64_json, "base64");
  if (!bytes.length || bytes.length > 10485760)
    throw new OpenAIUnavailableError("OPENAI_IMAGE_OUTPUT_TOO_LARGE");
  return {
    bytes: new Uint8Array(bytes),
    mimeType: "image/png" as const,
    model: IMAGE_MODEL,
    promptVersion: AVATAR_PROMPT_VERSION,
    schemaVersion: FASHION_SCHEMA_VERSION,
    knowledgeVersion: FASHION_KNOWLEDGE_VERSION,
    providerRequestId: response.headers.get("x-request-id"),
  };
}
