import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getFashionTaskSettings } from "@/lib/ai/task-settings";
import { buildFashionPrompt, getFashionVersions } from "@/prompts/fashion";
import { OperationError } from "@/features/operations/errors";
import {
  getImageRenderSettings,
  imageRenderSettingsSchema,
  type ImageRenderSettings,
} from "./image-settings";
import {
  avatarVisualDirectionSchema,
  type AvatarVisualDirection,
} from "@/features/preview/visual-direction";
import {
  capsuleGenerationConfig,
  capsuleGenerationConfigSchema,
  type CapsuleGenerationConfig,
} from "@/features/capsules/generation-context";
import {
  CapsuleOutputError,
  capsuleDiagnostics,
  type CapsuleDiagnostic,
} from "@/features/capsules/generation-schema";

export const FASHION_SCHEMA_VERSION = "fashion-item.v1";
export const FASHION_KNOWLEDGE_VERSION =
  getFashionVersions().knowledgeSourceHash;
export const FASHION_PROMPT_VERSION = `stylora-fashion-v1.openai-2.${FASHION_KNOWLEDGE_VERSION}`;
export const AVATAR_PROMPT_VERSION = `stylora-fashion-v1.avatar-5.${FASHION_KNOWLEDGE_VERSION}`;
export const TEXT_MODEL = getFashionTaskSettings("capsule_generation").model;
export const IMAGE_MODEL =
  process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2.6-flare";
const capsulePrompt = buildFashionPrompt("capsule_generation");
const capsuleDirections =
  "Return exactly brief.targetOutfits complete, meaningfully distinct outfits. Every item ID and evidence reference must be one of the supplied owned IDs. inputsUsed must use exact allowedSignals strings, not paraphrases. Use exactly two concise Why this reasons per outfit, with short summaries, differences and uncertainty. Do not recommend additions unless a real role gap unlocks at least two listed outfits. All addition indices are zero-based and every claimed use must reference the addition in that outfit. Required IDs must appear somewhere in the capsule. Never repair an unknown ID by guessing.";
const capsuleInstructions =
  capsulePrompt.instructions + "\n\n" + capsuleDirections;
export const CAPSULE_SOURCE_VERSIONS = {
  ...capsulePrompt.versions,
  promptAssemblyHash: createHash("sha256")
    .update(capsuleInstructions)
    .digest("hex"),
};
export const CAPSULE_PROMPT_VERSION = `stylora-fashion-v1.capsule-3.${CAPSULE_SOURCE_VERSIONS.promptAssemblyHash}`;

export class OpenAIUnavailableError extends Error {
  providerAttempts = 0;
  providerRequestId: string | null = null;
  constructor(
    public readonly code: string,
    public readonly retryable = false,
    public readonly retryAfterSeconds?: number,
    public readonly diagnostics: CapsuleDiagnostic[] = [],
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
  beforeRequest?: () => Promise<void>,
) {
  const deadline = Date.now() + timeout;
  const key = apiKey();
  await beforeRequest?.();
  const remaining = deadline - Date.now();
  if (remaining <= 0 || signal?.aborted)
    throw new OpenAIUnavailableError("OPENAI_DEADLINE_EXCEEDED");
  let response: Response;
  try {
    response = await fetch(`https://api.openai.com/v1/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        ...(json ? { "Content-Type": "application/json" } : {}),
      },
      body,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(remaining)])
        : AbortSignal.timeout(remaining),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof OpenAIUnavailableError) throw error;
    throw new OpenAIUnavailableError("OPENAI_CONNECTION_FAILED", true);
  }
  if (!response.ok) {
    const quotaExhausted =
      response.status === 429 &&
      z
        .object({ error: z.object({ code: z.literal("insufficient_quota") }) })
        .safeParse(await response.json().catch(() => null)).success;
    const retryHeader = response.headers.get("retry-after");
    const numericDelay = retryHeader === null ? NaN : Number(retryHeader);
    const retryDelay = Number.isFinite(numericDelay)
      ? numericDelay
      : (Date.parse(retryHeader ?? "") - Date.now()) / 1000;
    const failure = new OpenAIUnavailableError(
      quotaExhausted
        ? "OPENAI_QUOTA_EXHAUSTED"
        : `OPENAI_HTTP_${response.status}`,
      !quotaExhausted && (response.status === 429 || response.status >= 500),
      !quotaExhausted && Number.isFinite(retryDelay)
        ? Math.min(86400, Math.max(0, Math.ceil(retryDelay)))
        : undefined,
      [
        {
          code: quotaExhausted
            ? "INSUFFICIENT_QUOTA"
            : `HTTP_${response.status}`,
          path: quotaExhausted ? "error.code" : "response",
        },
      ],
    );
    failure.providerRequestId = safeRequestId(
      response.headers.get("x-request-id"),
    );
    throw failure;
  }
  return response;
}

const textResponse = z.object({
  status: z.string(),
  error: z.object({ code: z.string() }).nullable().optional(),
  incomplete_details: z
    .object({ reason: z.string().optional() })
    .nullable()
    .optional(),
  output: z.array(
    z.object({
      type: z.string(),
      content: z
        .array(z.object({ type: z.string(), text: z.string().optional() }))
        .optional(),
    }),
  ),
});
const usageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
  input_tokens_details: z
    .object({ cached_tokens: z.number().int().nonnegative().optional() })
    .optional(),
  output_tokens_details: z
    .object({ reasoning_tokens: z.number().int().nonnegative().optional() })
    .optional(),
});
export const capsuleProviderMetadataSchema = z.object({
  model: z.string().min(1).max(120),
  promptVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  knowledgeVersion: z.string().min(1),
  providerAttempts: z.number().int().min(0).max(3),
  latencyMs: z.number().nonnegative(),
  usage: usageSchema.nullable(),
  requests: z
    .array(
      z.object({
        attempt: z.number().int().min(1).max(3),
        requestId: z
          .string()
          .regex(/^[A-Za-z0-9_-]{1,200}$/)
          .nullable(),
        latencyMs: z.number().nonnegative(),
        responseStatus: z.string().max(80),
        usage: usageSchema.nullable(),
      }),
    )
    .max(3),
});
export type CapsuleProviderMetadata = z.infer<
  typeof capsuleProviderMetadataSchema
>;
function safeRequestId(value: string | null) {
  return value && /^[A-Za-z0-9_-]{1,200}$/.test(value) ? value : null;
}

export function parseFashionJsonOutput<T>(
  value: unknown,
  validate: (value: unknown) => T,
): T {
  const envelope = textResponse.safeParse(value);
  if (!envelope.success)
    throw new OpenAIUnavailableError(
      "OPENAI_RESPONSE_SCHEMA_INVALID",
      false,
      undefined,
      capsuleDiagnostics(envelope.error.issues),
    );
  const content = envelope.data.output.flatMap(
    (output) => output.content ?? [],
  );
  if (content.some((part) => part.type === "refusal"))
    throw new OpenAIUnavailableError(
      "OPENAI_RESPONSE_REFUSED",
      false,
      undefined,
      [{ code: "REFUSAL", path: "output" }],
    );
  if (envelope.data.status === "failed") {
    const code = envelope.data.error?.code;
    const transient =
      code === "server_error"
        ? "PROVIDER_SERVER_ERROR"
        : code === "rate_limit_exceeded"
          ? "PROVIDER_RATE_LIMITED"
          : null;
    const terminal =
      code === "invalid_prompt"
        ? "INVALID_PROMPT"
        : code === "insufficient_quota"
          ? "INSUFFICIENT_QUOTA"
          : "RESPONSE_FAILED";
    throw new OpenAIUnavailableError(
      transient ?? "OPENAI_RESPONSE_FAILED",
      transient !== null,
      undefined,
      [
        {
          code: transient ?? terminal,
          path: code ? "error.code" : "status",
        },
      ],
    );
  }
  if (envelope.data.status !== "completed") {
    const truncated =
      envelope.data.incomplete_details?.reason === "max_output_tokens";
    throw new OpenAIUnavailableError(
      truncated ? "OPENAI_OUTPUT_TRUNCATED" : "OPENAI_RESPONSE_INCOMPLETE",
      false,
      undefined,
      [
        {
          code: truncated
            ? "MAX_OUTPUT_TOKENS"
            : envelope.data.incomplete_details?.reason === "content_filter"
              ? "CONTENT_FILTERED"
              : "INCOMPLETE_RESPONSE",
          path: "status",
        },
      ],
    );
  }
  const text = content
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("");
  if (!text.trim())
    throw new OpenAIUnavailableError("OPENAI_OUTPUT_EMPTY", false, undefined, [
      { code: "EMPTY_OUTPUT", path: "output" },
    ]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new OpenAIUnavailableError(
      "OPENAI_OUTPUT_JSON_INVALID",
      false,
      undefined,
      [{ code: "INVALID_JSON", path: "output" }],
    );
  }
  try {
    return validate(parsed);
  } catch (error) {
    if (error instanceof CapsuleOutputError) throw error;
    if (error instanceof z.ZodError)
      throw new OpenAIUnavailableError(
        "OPENAI_OUTPUT_SCHEMA_INVALID",
        false,
        undefined,
        capsuleDiagnostics(error.issues),
      );
    throw new OpenAIUnavailableError(
      "OPENAI_VALIDATION_FAILED",
      false,
      undefined,
      [{ code: "VALIDATION_FAILED", path: "output" }],
    );
  }
}

export async function generateFashionJson<T>(input: {
  task: "capsule";
  context: unknown;
  schema: Record<string, unknown>;
  validate: (value: unknown) => T;
  signal?: AbortSignal;
  config?: CapsuleGenerationConfig;
  legacy?: boolean;
  beforeCorrection?: () => Promise<void>;
  beforeRequest?: (attempt: number) => Promise<void>;
  afterRequest?: () => Promise<void>;
  onProviderMetadata?: (metadata: CapsuleProviderMetadata) => Promise<void>;
}) {
  const started = Date.now();
  const target = z
    .object({
      brief: z.object({ targetOutfits: z.number().int().min(3).max(6) }),
    })
    .safeParse(input.context);
  const config = capsuleGenerationConfigSchema.parse(
    input.config ??
      capsuleGenerationConfig(
        TEXT_MODEL,
        target.success ? target.data.brief.targetOutfits : 3,
        getFashionTaskSettings("capsule_generation"),
      ),
  );
  const deadline = Date.now() + (input.legacy ? 110000 : config.deadlineMs);
  const maximum = input.legacy ? 1 : config.maxProviderRequests;
  const requests: CapsuleProviderMetadata["requests"] = [];
  function providerMetadata(): CapsuleProviderMetadata {
    const usage =
      requests.length && requests.every((entry) => entry.usage)
        ? requests.reduce(
            (total, entry) => ({
              input_tokens: total.input_tokens + entry.usage!.input_tokens,
              output_tokens: total.output_tokens + entry.usage!.output_tokens,
              total_tokens: total.total_tokens + entry.usage!.total_tokens,
            }),
            { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
          )
        : null;
    return {
      model: config.model,
      promptVersion: input.legacy
        ? FASHION_PROMPT_VERSION
        : CAPSULE_PROMPT_VERSION,
      schemaVersion: FASHION_SCHEMA_VERSION,
      knowledgeVersion: FASHION_KNOWLEDGE_VERSION,
      providerAttempts: requests.length,
      latencyMs: Math.max(0, Date.now() - started),
      usage,
      requests: [...requests],
    };
  }
  let feedback: { code: string; diagnostics: CapsuleDiagnostic[] } | undefined;
  for (let attempt = 1; attempt <= maximum; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 1000 || input.signal?.aborted)
      throw Object.assign(
        new OpenAIUnavailableError("OPENAI_DEADLINE_EXCEEDED"),
        {
          providerAttempts: requests.length,
          providerMetadata: providerMetadata(),
        },
      );
    let requestStarted = false;
    let responseRecorded = false;
    const requestStartedAt = Date.now();
    try {
      const response = await request(
        "responses",
        JSON.stringify({
          model: config.model,
          store: false,
          instructions: input.legacy
            ? instructions(input.task)
            : capsuleInstructions,
          input: JSON.stringify(
            feedback
              ? {
                  context: input.context,
                  validationFeedback: {
                    ...feedback,
                    instruction:
                      "Return one complete corrected result from the same captured context. Fix only the stated schema/domain failures; do not invent references or relax constraints.",
                  },
                }
              : input.context,
          ),
          max_output_tokens: input.legacy ? 10000 : config.maxOutputTokens,
          ...(!input.legacy && config.reasoningEffort
            ? { reasoning: { effort: config.reasoningEffort } }
            : {}),
          text: {
            ...(!input.legacy && config.reasoningEffort
              ? { verbosity: "low" }
              : {}),
            format: {
              type: "json_schema",
              name: "capsule_result",
              schema: input.schema,
              strict: true,
            },
          },
        }),
        Math.min(input.legacy ? 110000 : 100000, remaining),
        true,
        input.signal,
        async () => {
          await input.beforeRequest?.(attempt);
          requestStarted = true;
        },
      );
      let envelope: unknown;
      try {
        envelope = await response.json();
      } catch (error) {
        const failure = new OpenAIUnavailableError(
          error instanceof SyntaxError
            ? "OPENAI_RESPONSE_JSON_INVALID"
            : "OPENAI_CONNECTION_FAILED",
          !(error instanceof SyntaxError),
          undefined,
          [
            {
              code:
                error instanceof SyntaxError
                  ? "INVALID_RESPONSE_JSON"
                  : "RESPONSE_READ_FAILED",
              path: "response",
            },
          ],
        );
        failure.providerRequestId = safeRequestId(
          response.headers.get("x-request-id"),
        );
        throw failure;
      }
      const info = z
        .object({
          status: z
            .enum([
              "completed",
              "incomplete",
              "failed",
              "cancelled",
              "queued",
              "in_progress",
            ])
            .optional(),
          usage: usageSchema.nullable().optional(),
        })
        .safeParse(envelope);
      requests.push({
        attempt,
        requestId: safeRequestId(response.headers.get("x-request-id")),
        latencyMs: Math.max(0, Date.now() - requestStartedAt),
        responseStatus: info.success
          ? (info.data.status ?? "unknown")
          : "unknown",
        usage: info.success ? (info.data.usage ?? null) : null,
      });
      responseRecorded = true;
      await input.onProviderMetadata?.(providerMetadata());
      const value = parseFashionJsonOutput(envelope, input.validate);
      return {
        value,
        model: config.model,
        promptVersion: input.legacy
          ? FASHION_PROMPT_VERSION
          : CAPSULE_PROMPT_VERSION,
        schemaVersion: FASHION_SCHEMA_VERSION,
        knowledgeVersion: FASHION_KNOWLEDGE_VERSION,
        sourceVersions: input.legacy
          ? capsulePrompt.versions
          : CAPSULE_SOURCE_VERSIONS,
        providerRequestId: safeRequestId(response.headers.get("x-request-id")),
        providerAttempts: attempt,
        providerMetadata: providerMetadata(),
      };
    } catch (error) {
      if (requestStarted && !responseRecorded) {
        requests.push({
          attempt,
          requestId:
            error instanceof OpenAIUnavailableError
              ? error.providerRequestId
              : null,
          latencyMs: Math.max(0, Date.now() - requestStartedAt),
          responseStatus: "request_failed",
          usage: null,
        });
        await input.onProviderMetadata?.(providerMetadata());
      }
      if (
        error instanceof OperationError &&
        !(error instanceof CapsuleOutputError)
      )
        throw Object.assign(error, {
          providerAttempts: requests.length,
          providerMetadata: providerMetadata(),
        });
      const failure =
        error instanceof OpenAIUnavailableError ||
        error instanceof CapsuleOutputError
          ? error
          : new OpenAIUnavailableError("OPENAI_VALIDATION_FAILED");
      failure.providerAttempts = requests.length;
      const correctable =
        failure instanceof CapsuleOutputError
          ? [
              "CAPSULE_SCHEMA_INVALID",
              "CAPSULE_OUTPUT_COUNT_INVALID",
              "CAPSULE_ADDITION_KEY_DUPLICATE",
              "CAPSULE_REFERENCE_DUPLICATE",
              "CAPSULE_REFERENCE_INVALID",
              "CAPSULE_ADDITION_REFERENCE_INVALID",
              "CAPSULE_SIGNAL_INVALID",
              "CAPSULE_EVIDENCE_INVALID",
              "CAPSULE_OUTFIT_INCOMPLETE",
              "CAPSULE_OUTFITS_NOT_DISTINCT",
              "CAPSULE_REQUIRED_ITEM_MISSING",
              "CAPSULE_REUSE_EVIDENCE_INVALID",
            ].includes(failure.code)
          : failure.code === "OPENAI_OUTPUT_SCHEMA_INVALID";
      if (
        !correctable ||
        attempt >= maximum ||
        deadline - Date.now() < 15000 ||
        input.signal?.aborted
      )
        throw Object.assign(failure, { providerMetadata: providerMetadata() });
      await input.beforeCorrection?.();
      feedback = { code: failure.code, diagnostics: failure.diagnostics };
    } finally {
      if (requestStarted) {
        try {
          await input.afterRequest?.();
        } catch {
          console.warn(
            JSON.stringify({
              event: "provider_slot_release_failed",
              kind: "capsule_generation",
            }),
          );
        }
      }
    }
  }
  throw new OpenAIUnavailableError("OPENAI_VALIDATION_FAILED");
}

const imageResponse = z.object({
  data: z.array(z.object({ b64_json: z.string().min(1) })).length(1),
});

// One fixed figure keeps every render consistent. It mirrors the avatar section
// of FASHION-PROMPT.md and sits in its own block so it is not lost among the
// long runtime instructions.
export const AVATAR_FIGURE_DIRECTION =
  "A smooth, matte, human-proportioned mannequin with a featureless oval head: no face, eyes, mouth, hair or ears, and no headwear unless a hat is a selected item. Neck, arms, hands and legs are plain and jointless in one uniform matte tone set by the selected skin swatch and undertone, or neutral warm stone when none is selected. Never render a realistic face and never omit the head. Feet stay plain mannequin feet unless footwear is selected.";
const AVATAR_COMPOSITION_RULES =
  "The visualDirection.composition.selectedSlots list is exhaustive. This may be a partial composition, not a request to complete an outfit. Render no clothing or accessories from omittedSlots, even when style, occasion, footwear comfort or pose suggests them. Unselected areas remain unadorned mannequin material. Garment photographs are authoritative for existing graphics and construction; preserve their lettering, geometry, pockets, fastenings and hems without replacing or simplifying them.";
const AVATAR_RENDER_RULES =
  "Full-length figure on a warm porcelain studio background with soft diffuse light. Render believable fabric texture, seams, drape and construction from the supplied garment references. Keep the exact selected garment colors, patterns, logos and silhouette; do not invent branding, clothing or accessories. Apply only the supplied visual preferences and outfit pose. Keep garment fronts, hems and selected accessories readable. The skin swatch is an approximate appearance reference under neutral lighting, never an ethnicity. Fit intent affects the illustrative styling without redesigning the garment. Avoid beauty filters, extreme proportions, text labels and impossible anatomy.";

export function avatarPersonalizationInstructions(
  direction: AvatarVisualDirection,
) {
  const { skin, body, fit } = direction.preferences;
  const shades: Record<string, string> = {
    depth_01: "light warm beige",
    depth_02: "light tan",
    depth_03: "medium tan",
    depth_04: "medium brown",
    depth_05: "dark brown",
    depth_06: "deep dark brown",
  };
  return [
    "Garment photographs specify clothing only. Do not copy any reference wearer's skin, body or identity.",
    skin?.hex
      ? `Paint every exposed mannequin surface ${shades[skin.swatchId ?? ""] ?? skin.depthLabel}, using sRGB ${skin.hex} as the diffuse material color${skin.undertone ? ` with the selected ${skin.undertone} undertone` : ""}. Match this paint reference across the head, neck, arms, hands and visible legs. Preserve its selected depth under neutral light; do not substitute the neutral warm-stone default or bleach dark paint to beige, peach or ivory. Highlights may vary without changing the broad material midtone. This paint direction applies to the mannequin, not the clothes or background.`
      : "No skin swatch was selected. Use the neutral warm-stone mannequin material.",
    body?.id
      ? `Use the selected ${body.label} body reference: ${body.description}. Preserve this body silhouette beneath the garments; garment reference wearers do not override it.`
      : "No body reference was selected. Keep neutral, natural mannequin proportions.",
    fit
      ? `The selected fit intent is ${fit}. Show its ease and drape where the existing garment cut permits it, while preserving the garment's construction and length. Do not change sizes, patterns or garment design to promise a physical fit.`
      : "No fit intent was selected. Preserve the referenced garment cut.",
    direction.pose.instructions,
  ].join("\n");
}

export function buildAvatarImagePrompt(input: {
  instructions: string;
  items: unknown[];
  visualDirection: AvatarVisualDirection;
}) {
  return [
    input.instructions,
    `<figure>\n${AVATAR_FIGURE_DIRECTION}\n</figure>`,
    `<render_rules>\n${AVATAR_RENDER_RULES}\n</render_rules>`,
    AVATAR_COMPOSITION_RULES,
    input.visualDirection.composition.omittedSlots.includes("shoes")
      ? "No footwear is selected. Show bare mannequin feet: no shoes, sandals, socks, slippers or neutral replacement footwear."
      : "Footwear is selected. Use only the selected referenced footwear; never substitute a generic pair.",
    `<outfit>\n${JSON.stringify({
      items: input.items,
      visualDirection: input.visualDirection,
    })}\n</outfit>`,
    `<appearance_requirements>\n${avatarPersonalizationInstructions(input.visualDirection)}\n</appearance_requirements>`,
  ].join("\n\n");
}

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
  const model = settings.model ?? IMAGE_MODEL;
  body.set("model", model);
  body.set("size", settings.size);
  body.set("quality", settings.quality);
  body.set("output_format", settings.format);
  body.set("n", "1");
  if (settings.inputFidelity)
    body.set("input_fidelity", settings.inputFidelity);
  body.set(
    "prompt",
    buildAvatarImagePrompt({
      instructions: instructions("avatar"),
      items: input.items,
      visualDirection,
    }),
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
          model,
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
    model,
    promptVersion: AVATAR_PROMPT_VERSION,
    schemaVersion: FASHION_SCHEMA_VERSION,
    knowledgeVersion: FASHION_KNOWLEDGE_VERSION,
    providerRequestId: response.headers.get("x-request-id"),
  };
}
