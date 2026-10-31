export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;

    constructor (message: string, statusCode = 400, code?: string) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        this.code = code ?? (statusCode === 404 ? "NOT_FOUND" : statusCode === 409 ? "CONFLICT" : "VALIDATION_ERROR");
    }
}
