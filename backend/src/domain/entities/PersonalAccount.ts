import { randomUUID } from "crypto";
import { validateEmail, validateIdentifier } from "../validation/WorkspaceValidation";

type PersonalAccountProps = {
  id?: unknown;
  email: unknown;
};

export class PersonalAccount {
  public readonly id: string;
  public readonly email: string;

  constructor(props: PersonalAccountProps) {
    this.id = props.id === undefined
      ? randomUUID()
      : validateIdentifier(props.id, "Id da conta pessoal inválido.");
    this.email = validateEmail(props.email, "Email da conta pessoal inválido.");
    Object.freeze(this);
  }
}
