import type { Request, Response } from "express";
import { GetProductDetailsUseCase } from "../../application/use-cases/GetProductDetailsUseCase";
import {
  paginationFromRequest,
  parseHttpInput,
  productIdParamsSchema,
} from "../schemas/products.schemas";

export class GetProductDetailsController {
  constructor(private readonly useCase: GetProductDetailsUseCase) {}

  async handle(req: Request, res: Response): Promise<Response> {
    const { id } = parseHttpInput(productIdParamsSchema, req.params);
    const result = await this.useCase.execute(id, paginationFromRequest(req));
    return res.status(200).json(result);
  }
}
