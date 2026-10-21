import type { Request, Response } from "express";
import { AddStockExitUseCase } from "../../application/use-cases/AddStockExitUseCase";
import {
  emptyQuerySchema,
  parseHttpInput,
  productIdParamsSchema,
  stockMovementBodySchema,
} from "../schemas/products.schemas";

export class AddStockExitController {
  constructor(private readonly useCase: AddStockExitUseCase) {}

  async handle(req: Request, res: Response): Promise<Response> {
    const { id } = parseHttpInput(productIdParamsSchema, req.params);
    parseHttpInput(emptyQuerySchema, req.query);
    const { quantity } = parseHttpInput(stockMovementBodySchema, req.body);
    await this.useCase.execute({ productId: id, quantity });
    return res.status(201).json({ ok: true });
  }
}
