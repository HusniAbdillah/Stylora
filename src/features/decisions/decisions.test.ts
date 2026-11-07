import { describe, expect, it } from "vitest";
import { savedMediaState } from "./media";
import { saveInputSchema, selectionInputSchema } from "./schemas";

const optionId = "3f9b6f84-5379-4d39-8ea0-82b2e3cbd653";
const optionItemId = "0913da75-d639-4a78-849b-a0d37553c837";
const operationId = "a71c2b6e-71d3-40f6-91c3-8312754f4e01";
const assetId = "c83d6d9c-f37d-47c1-85c7-f24c9016829e";

describe("decision contracts", () => {
  it("rejects duplicate slots and client-supplied workspace IDs", () => {
    const input = {
      optionId,
      expectedRevision: 0,
      choices: [{ slotId: "top", optionItemId }],
    };
    expect(selectionInputSchema.safeParse(input).success).toBe(true);
    expect(
      selectionInputSchema.safeParse({
        ...input,
        choices: [...input.choices, ...input.choices],
      }).success,
    ).toBe(false);
    expect(
      selectionInputSchema.safeParse({ ...input, workspaceId: optionId })
        .success,
    ).toBe(false);
    expect(
      saveInputSchema.safeParse({
        optionId,
        expectedRevision: 0,
        title: "Outfit",
        idempotencyKey: "save-1",
      }).success,
    ).toBe(false);
  });

  it("keeps queued and failed images absent while preserving operation identity", () => {
    const media = {
      status: "queued",
      output_asset_id: assetId,
      operation_id: operationId,
    };
    expect(
      savedMediaState(
        media,
        { status: "queued", attempt_count: 0 },
        true,
        "https://example.com/image.png",
        true,
      ),
    ).toMatchObject({
      status: "queued",
      assetId: null,
      imageUrl: null,
      operationId,
      canRetry: false,
    });
    expect(
      savedMediaState(
        { ...media, status: "failed" },
        { status: "failed", attempt_count: 1 },
        false,
        null,
        true,
      ),
    ).toMatchObject({
      status: "failed",
      imageUrl: null,
      operationId,
      canRetry: true,
    });
    expect(
      savedMediaState(
        { ...media, status: "failed" },
        { status: "failed", attempt_count: 3 },
        false,
        null,
        true,
      ).canRetry,
    ).toBe(false);
  });

  it("only exposes an image after succeeded media references a ready preview", () => {
    const media = {
      status: "succeeded",
      output_asset_id: assetId,
      operation_id: operationId,
    };
    const operation = { status: "succeeded", attempt_count: 1 };
    expect(
      savedMediaState(
        media,
        operation,
        false,
        "https://example.com/image.png",
        true,
      ).imageUrl,
    ).toBeNull();
    expect(
      savedMediaState(
        media,
        operation,
        true,
        "https://example.com/image.png",
        true,
      ).imageUrl,
    ).toBe("https://example.com/image.png");
    expect(
      savedMediaState(
        { ...media, status: "failed" },
        { ...operation, status: "failed" },
        false,
        null,
        false,
      ).canRetry,
    ).toBe(false);
  });
});
