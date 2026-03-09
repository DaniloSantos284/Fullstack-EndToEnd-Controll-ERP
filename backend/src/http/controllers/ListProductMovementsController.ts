import { Request, Response } from "express";
import { AppError } from "../../application/use-cases/errors/AppError";
import { ListProductMovementsUseCase } from "../../application/use-cases/ListProductMovementsUseCase";


export class ListProductMovementsController {
    constructor(private useCase: ListProductMovementsUseCase) {}

    async handle(req: Request, res: Response): Promise<Response> {
        const { id } = req.params;

        if (typeof id !== "string" || id.trim().length === 0) {
            throw new AppError("Parâmetro id inválido.", 400);
        }

        const movements = await this.useCase.execute({ productId: id });

        // Entidade possui Date; Ao serializar vira string ISO automaticamente;
        return res.status(200).json(movements);
    }
}