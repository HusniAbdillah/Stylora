import { z } from "zod";

const category = z.enum([
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "accessory",
]);
const colors = z.array(z.string().trim().min(1).max(80)).max(5);

export const savedLookIdSchema = z
  .uuid()
  .transform((value) => value.toLowerCase());
export const shareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const imageIndexSchema = z
  .string()
  .regex(/^(?:[0-9]|1[0-9])$/)
  .transform(Number);
export const createShareSchema = z
  .strictObject({
    catchphrase: z.string().trim().max(240).default(""),
    expiresInHours: z.number().int().min(1).max(720).default(168),
    approvedMediaIds: z.array(savedLookIdSchema).max(20).default([]),
  })
  .refine(
    (value) =>
      new Set(value.approvedMediaIds).size === value.approvedMediaIds.length,
  );
export const listSharesSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export const snapshotItemsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(160),
      category,
      attributes: z
        .object({ colors: colors.default([]) })
        .default({ colors: [] }),
      asset_id: z.uuid().nullable().optional(),
    }),
  )
  .min(1)
  .max(20);
export const publicSnapshotSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  catchphrase: z.string().max(240).default(""),
  items: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(160),
        category,
        colors: colors.default([]),
      }),
    )
    .min(1)
    .max(20),
});

export function projectPublicSnapshot(
  title: string,
  items: unknown,
  catchphrase: string,
) {
  return publicSnapshotSchema.parse({
    title,
    catchphrase,
    items: snapshotItemsSchema.parse(items).map((item) => ({
      name: item.name,
      category: item.category,
      colors: item.attributes.colors,
    })),
  });
}
