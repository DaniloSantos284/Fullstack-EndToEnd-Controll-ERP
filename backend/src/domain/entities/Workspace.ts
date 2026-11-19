import { randomUUID } from "crypto";
import { validateEmail, validateIdentifier } from "../validation/WorkspaceValidation";

type WorkspaceProps = {
  id?: unknown;
  ownerAccountId: unknown;
  alertEmail: unknown;
};

export class Workspace {
  public readonly id: string;
  public readonly ownerAccountId: string;
  public readonly alertEmail: string;

  constructor(props: WorkspaceProps) {
    this.id = props.id === undefined
      ? randomUUID()
      : validateIdentifier(props.id, "Id do workspace inválido.");
    this.ownerAccountId = validateIdentifier(
      props.ownerAccountId,
      "Id da conta proprietária inválido."
    );
    this.alertEmail = validateEmail(props.alertEmail, "Email de alertas inválido.");
    Object.freeze(this);
  }
}
