import { Request, Response } from "express";
import { ListProductsUseCase } from "../../application/use-cases/ListProductsUseCase"

export class ListProductsController {
    constructor(
        private listProductsUseCase: ListProductsUseCase
    ) {}

    async handle(_req: Request, res: Response): Promise<Response> {
        const products = await this.listProductsUseCase.execute();


        return res.status(200).json(products);
    }
}