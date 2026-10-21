import { DomainError } from "../errors/DomainError";
import { StockMovementType } from "../enums/StockMovementType";

type StockMovementProps = {
  id: unknown;
  productId: unknown;
  type: unknown;
  quantity: unknown;
  createdAt?: unknown;
};

const MAX_SIGNED_INT = 2_147_483_647;

export class StockMovement {
  public readonly id: string;
  public readonly productId: string;
  public readonly type: StockMovementType;
  public readonly quantity: number;
  public readonly createdAt: Date;

  constructor(props: StockMovementProps) {
    if (
      typeof props.quantity !== "number" ||
      !Number.isSafeInteger(props.quantity) ||
      props.quantity <= 0 ||
      props.quantity > MAX_SIGNED_INT
    ) {
      throw new DomainError("A quantidade de movimento deve ser um inteiro positivo válido.");
    }

    if (
      props.type !== StockMovementType.ENTRY &&
      props.type !== StockMovementType.EXIT
    ) {
      throw new DomainError("Tipo de movimento inválido.");
    }

    const createdAt = props.createdAt === undefined ? new Date() : props.createdAt;
    if (!(createdAt instanceof Date) || !Number.isFinite(createdAt.getTime())) {
      throw new DomainError("Data de movimento inválida.");
    }

    if (typeof props.id !== "string" || typeof props.productId !== "string") {
      throw new DomainError("Identificador de movimento inválido.");
    }

    this.id = props.id;
    this.productId = props.productId;
    this.type = props.type;
    this.quantity = props.quantity;
    this.createdAt = new Date(createdAt.getTime());
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
