import { PersonalAccount } from "../../domain/entities/PersonalAccount";
import { validateEmail, validateIdentifier } from "../../domain/validation/WorkspaceValidation";
import { AppError } from "../use-cases/errors/AppError";

/**
 * Fronteira interna: apenas um futuro adapter que autentique a identidade E
 * verifique seu email deve produzir este contexto. DTOs ou booleanos HTTP não
 * constituem prova. O core não verifica autenticidade nem verificação do email.
 */
export interface TrustedAccountContext {
  readonly account: PersonalAccount;
}

/** Valida apenas o formato e invariantes locais; não autentica a identidade. */
export function assertTrustedAccountContext(context: TrustedAccountContext): void {
  if (
    !context ||
    typeof context !== "object" ||
    !(context.account instanceof PersonalAccount)
  ) {
    throw new AppError("Contexto interno de conta inválido.", 401, "INVALID_ACCOUNT_CONTEXT");
  }

  validateIdentifier(context.account.id, "Id da conta pessoal inválido.");
  validateEmail(context.account.email, "Email da conta pessoal inválido.");
}
