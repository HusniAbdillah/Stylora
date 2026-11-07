import { z } from "zod";

export const lookParamsSchema = z.strictObject({ lookId: z.uuid() });
export const optionParamsSchema = lookParamsSchema.extend({
  optionId: z.uuid(),
});
export const savedParamsSchema = z.strictObject({ id: z.uuid() });
export const emptyBodySchema = z.strictObject({});

export const selectionInputSchema = z
  .strictObject({
    optionId: z.uuid(),
    expectedRevision: z.number().int().min(0),
    choices: z
      .array(
        z.strictObject({
          slotId: z.string().trim().min(1).max(80),
          optionItemId: z.uuid(),
        }),
      )
      .min(1)
      .max(20),
  })
  .refine(
    (input) =>
      new Set(input.choices.map((choice) => choice.slotId)).size ===
      input.choices.length,
    {
      message: "Choose one candidate per slot.",
      path: ["choices"],
    },
  );

export const saveInputSchema = z.strictObject({
  optionId: z.uuid(),
  expectedRevision: z.number().int().min(1),
  idempotencyKey: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(160),
});

export const savedListSchema = z.strictObject({
  filter: z.enum(["all", "shared", "preparing"]).default("all"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(1024).optional(),
});

export const cursorSchema = z.strictObject({
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});

export type SelectionInput = z.infer<typeof selectionInputSchema>;
export type SaveInput = z.infer<typeof saveInputSchema>;
export type SavedListInput = z.infer<typeof savedListSchema>;
