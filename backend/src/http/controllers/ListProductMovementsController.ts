import type { Request, Response } from "express";
import { ListProductMovementsUseCase } from "../../application/use-cases/ListProductMovementsUseCase";
import {
  paginationFromRequest,
  parseHttpInput,
  productIdParamsSchema,
} from "../schemas/products.schemas";

export class ListProductMovementsController {
  constructor(private readonly useCase: ListProductMovementsUseCase) {}

  async handle(req: Request, res: Response): Promise<Response> {
    const { id } = parseHttpInput(productIdParamsSchema, req.params);
    const movements = await this.useCase.execute({
      productId: id,
      ...paginationFromRequest(req),
    });
    return res.status(200).json(movements);
  }
}
