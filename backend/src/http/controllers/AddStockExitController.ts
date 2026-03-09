import { Request, Response } from "express";
import { AddStockExitUseCase } from "../../application/use-cases/AddStockExitUseCase";
import { AppError } from "../../application/use-cases/errors/AppError";

export class AddStockExitController {
    constructor(private useCase: AddStockExitUseCase) {}

    async handle(req: Request, res: Response): Promise<Response> {
        const { id } = req.params;
        const { quantity } = req.body ?? {};

        if (typeof id !== "string" || id.trim().length === 0) {
            throw new AppError("Parâmetro id inválido.", 400);
        }

        if (typeof quantity !== "number" || Number.isNaN(quantity) || quantity <= 0) {
            throw new AppError("Campo quantity inválido. Deve ser número maior que 0.", 400);
        }

        await this.useCase.execute({ productId: id, quantity });

        return res.status(201).json({ ok: true })
    }
}