import { randomUUID } from "crypto";
import { ProductCategory } from "../enums/ProductCategory";
import { AppError } from "../../application/use-cases/errors/AppError";

type ProductProps = {
  id?: unknown;
  name: unknown;
  price: unknown;
  category: unknown;
  quantity?: unknown;
  imageUrl?: unknown;
  barCode?: unknown;
};

const MAX_NAME_LENGTH = 255;
const MAX_IMAGE_URL_LENGTH = 500;
const MAX_BAR_CODE_LENGTH = 100;
const MAX_SIGNED_INT = 2_147_483_647;
const MAX_PRICE = 99_999_999.99;

function hasAtMostTwoDecimalPlaces(value: number): boolean {
  const cents = value * 100;
  const roundingError = Number.EPSILON * Math.max(1, Math.abs(cents)) * 4;

  return Math.abs(cents - Math.round(cents)) <= roundingError;
}

function validateOptionalString(
  value: unknown,
  maxLength: number,
  message: string
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.length > maxLength) {
    throw new AppError(message, 400);
  }

  return value;
}

export class Product {
  public readonly id: string;
  public readonly name: string;
  public readonly price: number;
  public readonly category: ProductCategory;
  public readonly quantity: number;
  public readonly imageUrl?: string;
  public readonly barCode?: string;

  constructor(props: ProductProps) {
    if (
      typeof props.id !== "undefined" &&
      (typeof props.id !== "string" || props.id.trim().length === 0)
    ) {
      throw new AppError("Id do produto inválido.", 400);
    }

    if (
      typeof props.name !== "string" ||
      props.name.trim().length === 0 ||
      props.name.length > MAX_NAME_LENGTH
    ) {
      throw new AppError("Product name is required", 400);
    }

    if (
      typeof props.price !== "number" ||
      !Number.isFinite(props.price) ||
      props.price < 0 ||
      props.price > MAX_PRICE ||
      !hasAtMostTwoDecimalPlaces(props.price)
    ) {
      throw new AppError("Preço inválido", 400);
    }

    if (
      typeof props.category !== "string" ||
      !Object.values(ProductCategory).includes(props.category as ProductCategory)
    ) {
      throw new AppError("Categoria inválida.", 400);
    }

    const quantity = props.quantity === undefined ? 0 : props.quantity;
    if (
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity < 0 ||
      quantity > MAX_SIGNED_INT
    ) {
      throw new AppError("Quantidade do produto inválida.", 400);
    }

    const imageUrl = validateOptionalString(
      props.imageUrl,
      MAX_IMAGE_URL_LENGTH,
      "URL da imagem inválida."
    );
    const barCode = validateOptionalString(
      props.barCode,
      MAX_BAR_CODE_LENGTH,
      "Código de barras inválido."
    );

    this.id = props.id ?? randomUUID();
    this.name = props.name;
    this.price = props.price;
    this.category = props.category as ProductCategory;
    this.quantity = quantity;
    if (imageUrl !== undefined) this.imageUrl = imageUrl;
    if (barCode !== undefined) this.barCode = barCode;
  }
}
