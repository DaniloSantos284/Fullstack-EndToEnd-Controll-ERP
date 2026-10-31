import type { Request, Response } from "express";
import { CreateProductUseCase } from "../../application/use-cases/CreateProductUseCase";
import {
  createProductBodySchema,
  emptyQuerySchema,
  parseHttpInput,
} from "../schemas/products.schemas";

export class CreateProductController {
  constructor(private readonly useCase: CreateProductUseCase) {}

  async handle(req: Request, res: Response): Promise<Response> {
    parseHttpInput(emptyQuerySchema, req.query);
    const input = parseHttpInput(createProductBodySchema, req.body);
    const result = await this.useCase.execute({
      name: input.name,
      price: input.price,
      category: input.category,
      ...(input.imageUrl === undefined ? {} : { imageUrl: input.imageUrl }),
      ...(input.barCode === undefined ? {} : { barCode: input.barCode }),
    });
    return res.status(201).json(result);
  }
}
