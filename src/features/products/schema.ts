import { z } from "zod";

export const categorySchema = z.enum([
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "accessory",
]);
export const weightsSchema = z
  .strictObject({
    price: z.number().min(0).max(1),
    rating: z.number().min(0).max(1),
    relevance: z.number().min(0).max(1),
  })
  .refine((weights) => weights.price + weights.rating + weights.relevance > 0);
export const defaultWeights = { price: 0.3, rating: 0.2, relevance: 0.5 };
export const searchInputSchema = z.strictObject({
  optionId: z.uuid(),
  optionItemId: z.uuid(),
  query: z.string().trim().min(2).max(240).optional(),
  weights: weightsSchema.optional(),
  retryKey: z.uuid().optional(),
});
export const importInputSchema = z.strictObject({
  sourceRevision: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(1).max(200),
});
export type Category = z.infer<typeof categorySchema>;
export type ScoreWeights = z.infer<typeof weightsSchema>;

export const offerSchema = z.object({
  product_id: z
    .union([z.string().min(1).max(512), z.number().int().nonnegative()])
    .nullish(),
  title: z.string().trim().min(1).max(500),
  source: z.string().trim().min(1).max(240),
  link: z.string().max(4096).nullish(),
  product_link: z.string().max(4096).nullish(),
  thumbnail: z.string().max(4096).nullish(),
  serpapi_thumbnail: z.string().max(4096).nullish(),
  price: z.string().max(120).nullish(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullish(),
  extracted_price: z.number().finite().nonnegative().nullish(),
  rating: z.number().min(0).max(5).nullish(),
  reviews: z.number().int().nonnegative().nullish(),
});
