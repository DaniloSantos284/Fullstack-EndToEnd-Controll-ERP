import { randomUUID } from "crypto";
import { StockMovement } from "./StockMovement";
import { ProductCategory } from "../enums/ProductCategory";
import { AppError } from "../../application/use-cases/errors/AppError";

type ProductProps = {
  name: string;
  price: number;
  category: ProductCategory;
  imageUrl?: string;
  barCode?: string;
  stockMovements?: StockMovement[];
};

export class Product {
  public readonly id: string;
  public readonly name: string;
  private price: number;
  private category: ProductCategory;
  public imageUrl?: string;
  public barCode?: string;

  private stockMovements: StockMovement[] = [];

  constructor(props: ProductProps) {
    if (!props.name || props.name.trim().length === 0) {
      throw new AppError("Product name is required", 400);
    }

    if (props.price < 0) {
      throw new AppError("Product price cannot be negative", 400);
    }

    this.id = randomUUID();
    this.name = props.name;
    this.price = props.price;
    this.category = props.category;
    // Usando exactOpcionalPropietyTypes, só atribui se existir
    if (props.imageUrl) this.imageUrl = props.imageUrl;
    if (props.barCode) this.barCode = props.barCode;

    if (props.stockMovements) this.stockMovements = props.stockMovements;
  }

  /**
   * Quantidade atual em estoque calculada
   * com base nos movimentos
   */
  get quantity(): number {
    return this.stockMovements.reduce(
      (total, movement) => total + movement.getSignedQuantity(),
      0
    );
  }

  /**
   * Registra um novo movimento de estoque
   */
  addMovement(movement: StockMovement): void {
    if (movement.isExit() && this.quantity < movement.quantity) {
      throw new AppError("Insufficient stock", 400);
    }

    this.stockMovements.push(movement);
  }

  /**
   * Retorna cópia imutável dos movimentos
   */
  get movements(): StockMovement[] {
    return [...this.stockMovements];
  }
}