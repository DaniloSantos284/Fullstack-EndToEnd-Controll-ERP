import { Request, Response } from "express";
import { CreateProductUseCase } from "../../application/use-cases/CreateProductUseCase";
import { AppError } from "../../application/use-cases/errors/AppError";
import { ProductCategory } from "../../domain/enums/ProductCategory";


export class CreateProductController {
  constructor(private createProductUseCase: CreateProductUseCase) {}

  async handle(req: Request, res: Response): Promise<Response> {
    const { name, price, category, imageUrl, barCode } = req.body ?? {};

    // Validação mínima
    if (typeof name !== "string") throw new AppError("Campo name inválido.", 400);
    if (typeof price !== "number") throw new AppError("Campo preço inválido.", 400);
    if (typeof category !== "string") throw new AppError("Campo categoria inválido.", 400);

    // Garante que category é um valor enum
    const isValidCategory = Object.values(ProductCategory).includes(category as ProductCategory);
    if (!isValidCategory) throw new AppError("Categoria inválida.", 400);

    const result = await this.createProductUseCase.execute({
      name,
      price,
      category: category as ProductCategory,
      ...(typeof imageUrl === "string" ? { imageUrl } : {}),
      ...(typeof barCode === "string" ? { barCode: barCode } : {})
    });

    return res.status(201).json(result);
  }
}