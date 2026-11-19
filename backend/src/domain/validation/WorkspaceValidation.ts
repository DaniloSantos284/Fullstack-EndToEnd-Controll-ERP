import { DomainError } from "../errors/DomainError";

export function validateIdentifier(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DomainError(message);
  }

  return value;
}

export function validateEmail(value: unknown, message: string): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  ) {
    throw new DomainError(message);
  }

  return value;
}
