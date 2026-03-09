import { AppError } from "../../application/use-cases/errors/AppError";
import { StockMovementType } from "../enums/StockMovementType";

type StockMovementProps = {
  id: string;
  productId: string;
  type: StockMovementType;
  quantity: number;
  createdAt?: Date;
};

export class StockMovement {
  public readonly id: string;
  public readonly productId: string;
  public readonly type: StockMovementType;
  public readonly quantity: number;
  public readonly createdAt: Date;

  constructor(props: StockMovementProps) {
    if (props.quantity <= 0) {
      throw new AppError("A quantidade de movimento deve ser maior que zero.", 400);
    }

    this.id = props.id;
    this.productId = props.productId;
    this.type = props.type;
    this.quantity = props.quantity;
    this.createdAt = props.createdAt ?? new Date();
  }

  isEntry(): boolean {
    return this.type === StockMovementType.ENTRY;
  }
  

  // Indica se o movimento é de saída do estoque
  isExit(): boolean {
    return this.type === StockMovementType.EXIT;
  }

  /**
   * Retorna a quantidade com sinal:
   * - positivo para entrada
   * - negativo para saída
   */
  getSignedQuantity(): number {
    return this.isExit() ? -this.quantity : this.quantity;
  }

}