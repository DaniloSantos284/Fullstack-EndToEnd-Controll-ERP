import { randomUUID } from "crypto";
import { ProductCategory } from "../enums/ProductCategory";
import { DomainError } from "../errors/DomainError";

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
    throw new DomainError(message);
  }

  return value;
}

export class Product {
  public readonly id: string;
  public readonly name: string;
  public readonly priceCents: number;
  public readonly category: ProductCategory;
  public readonly quantity: number;
  public readonly imageUrl?: string;
  public readonly barCode?: string;

  constructor(props: ProductProps) {
    if (
      typeof props.id !== "undefined" &&
      (typeof props.id !== "string" || props.id.trim().length === 0)
    ) {
      throw new DomainError("Id do produto inválido.");
    }

    if (
      typeof props.name !== "string" ||
      props.name.trim().length === 0 ||
      props.name.length > MAX_NAME_LENGTH
    ) {
      throw new DomainError("Product name is required");
    }

    if (
      typeof props.price !== "number" ||
      !Number.isFinite(props.price) ||
      props.price < 0 ||
      props.price > MAX_PRICE ||
      !hasAtMostTwoDecimalPlaces(props.price)
    ) {
      throw new DomainError("Preço inválido");
    }

    if (
      typeof props.category !== "string" ||
      !Object.values(ProductCategory).includes(props.category as ProductCategory)
    ) {
      throw new DomainError("Categoria inválida.");
    }

    const quantity = props.quantity === undefined ? 0 : props.quantity;
    if (
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity < 0 ||
      quantity > MAX_SIGNED_INT
    ) {
      throw new DomainError("Quantidade do produto inválida.");
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
    this.priceCents = Math.round(props.price * 100);
    this.category = props.category as ProductCategory;
    this.quantity = quantity;
    if (imageUrl !== undefined) this.imageUrl = imageUrl;
    if (barCode !== undefined) this.barCode = barCode;
  }

  get price(): number {
    return this.priceCents / 100;
  }
}
