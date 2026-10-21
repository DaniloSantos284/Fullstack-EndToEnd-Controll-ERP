import type { Request, Response } from "express";
import { AddStockEntryUseCase } from "../../application/use-cases/AddStockEntryUseCase";
import {
  emptyQuerySchema,
  parseHttpInput,
  productIdParamsSchema,
  stockMovementBodySchema,
} from "../schemas/products.schemas";

export class AddStockEntryController {
  constructor(private readonly useCase: AddStockEntryUseCase) {}

  async handle(req: Request, res: Response): Promise<Response> {
    const { id } = parseHttpInput(productIdParamsSchema, req.params);
    parseHttpInput(emptyQuerySchema, req.query);
    const { quantity } = parseHttpInput(stockMovementBodySchema, req.body);
    await this.useCase.execute({ productId: id, quantity });
    return res.status(201).json({ ok: true });
  }
}
