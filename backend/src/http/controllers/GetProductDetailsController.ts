import { Request, Response } from "express";
import { GetProductDetailsUseCase } from "../../application/use-cases/GetProductDetailsUseCase";

export class GetProductDetailsController {
  constructor(
    private getProductDetailsUseCase: GetProductDetailsUseCase
  ) {}

  async handle(req: Request, res: Response): Promise<Response> {
    const { id } = req.params;

    if (typeof id !== "string" || id.trim().length === 0) {
      return res.status(400).json({
        message: "Id do produto inválido",
      });
    }

    const result =
      await this.getProductDetailsUseCase.execute(id);

    return res.status(200).json(result);
  }
}
