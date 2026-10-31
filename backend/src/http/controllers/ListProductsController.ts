import type { Request, Response } from "express";
import { ListProductsUseCase } from "../../application/use-cases/ListProductsUseCase";
import { paginationFromRequest } from "../schemas/products.schemas";

export class ListProductsController {
  constructor(private readonly useCase: ListProductsUseCase) {}

  async handle(req: Request, res: Response): Promise<Response> {
    const products = await this.useCase.execute(paginationFromRequest(req));
    return res.status(200).json(products);
  }
}
