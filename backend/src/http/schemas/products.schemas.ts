import type { Request } from "express";
import { z } from "zod";
import { ProductCategory } from "../../domain/enums/ProductCategory";
import { HttpError } from "../errors/HttpError";

const MAX_SIGNED_INT = 2_147_483_647;
const MAX_PRICE = 99_999_999.99;
const MAX_PAGE_LIMIT = 100;
const MAX_PAGINATION_OFFSET = 10_000;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_LIMIT = 20;

const httpImageUrl = z.string().max(500).refine((value) => {
  if (value === "") return true;

  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
});

const positiveIntegerQuery = (max: number) => z.string().regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().safe().positive().max(max));

export const productIdParamsSchema = z.strictObject({ id: z.uuid() });
export const emptyQuerySchema = z.strictObject({});

export const paginationQuerySchema = z.strictObject({
  page: positiveIntegerQuery(1_000_000).optional(),
  limit: positiveIntegerQuery(MAX_PAGE_LIMIT).optional(),
}).refine(({ page = DEFAULT_PAGE, limit = DEFAULT_PAGE_LIMIT }) =>
  (page - 1) * limit <= MAX_PAGINATION_OFFSET,
);

export const createProductBodySchema = z.strictObject({
  name: z.string().trim().min(1).max(255),
  price: z.number().finite().min(0).max(MAX_PRICE).refine((price) => {
    const cents = price * 100;
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(cents)) * 4;
    return Math.abs(cents - Math.round(cents)) <= tolerance;
  }, "O preço deve ter no máximo duas casas decimais."),
  category: z.enum(ProductCategory),
  imageUrl: httpImageUrl.optional(),
  barCode: z.string().max(100).optional(),
});

export const stockMovementBodySchema = z.strictObject({
  quantity: z.number().int().positive().max(MAX_SIGNED_INT),
});

export type PaginationInput = { page: number; limit: number };

export function parseHttpInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError("Dados da requisição inválidos.", 400, "VALIDATION_ERROR");
  }
  return parsed.data;
}

export function paginationFromRequest(req: Request): PaginationInput {
  const query = parseHttpInput(paginationQuerySchema, req.query);
  return { page: query.page ?? DEFAULT_PAGE, limit: query.limit ?? DEFAULT_PAGE_LIMIT };
}
