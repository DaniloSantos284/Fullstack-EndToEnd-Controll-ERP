import { randomUUID } from "crypto";
import { MembershipRole } from "../enums/MembershipRole";
import { MembershipStatus } from "../enums/MembershipStatus";
import { DomainError } from "../errors/DomainError";
import { validateIdentifier } from "../validation/WorkspaceValidation";
import { Workspace } from "./Workspace";

type MembershipProps = {
  id?: unknown;
  accountId: unknown;
  role: unknown;
  status?: unknown;
};

export class Membership {
  public readonly id: string;
  public readonly accountId: string;
  public readonly workspaceId: string;
  public readonly role: MembershipRole;
  public readonly status: MembershipStatus;
  public readonly isOwner: boolean;
  private readonly workspace: Workspace;

  constructor(props: MembershipProps, workspace: Workspace) {
    if (!(workspace instanceof Workspace)) {
      throw new DomainError("Workspace inválido.");
    }

    const id = props.id === undefined
      ? randomUUID()
      : validateIdentifier(props.id, "Id do vínculo inválido.");
    const accountId = validateIdentifier(props.accountId, "Id da conta inválido.");
    const role = props.role;
    const status = props.status === undefined ? MembershipStatus.ACTIVE : props.status;

    if (role !== MembershipRole.ADMINISTRATOR && role !== MembershipRole.OPERATOR) {
      throw new DomainError("Papel do vínculo inválido.");
    }
    if (status !== MembershipStatus.ACTIVE && status !== MembershipStatus.ENDED) {
      throw new DomainError("Status do vínculo inválido.");
    }

    const isOwner = accountId === workspace.ownerAccountId;
    if (isOwner && (role !== MembershipRole.ADMINISTRATOR || status !== MembershipStatus.ACTIVE)) {
      throw new DomainError("O proprietário deve ser um administrador ativo.");
    }

    this.id = id;
    this.accountId = accountId;
    this.workspaceId = workspace.id;
    this.role = role;
    this.status = status;
    this.isOwner = isOwner;
    this.workspace = workspace;
    Object.freeze(this);
  }

  get isActive(): boolean {
    return this.status === MembershipStatus.ACTIVE;
  }

  changeRole(role: unknown): Membership {
    if (!this.isActive) {
      throw new DomainError("Não é possível alterar o papel de um vínculo encerrado.");
    }
    if (this.isOwner) {
      throw new DomainError("Não é possível alterar o papel do proprietário.");
    }

    return new Membership({
      id: this.id,
      accountId: this.accountId,
      role,
      status: this.status,
    }, this.workspace);
  }

  end(): Membership {
    if (!this.isActive) {
      throw new DomainError("O vínculo já está encerrado.");
    }
    if (this.isOwner) {
      throw new DomainError("Não é possível encerrar o vínculo do proprietário.");
    }

    return new Membership({
      id: this.id,
      accountId: this.accountId,
      role: this.role,
      status: MembershipStatus.ENDED,
    }, this.workspace);
  }
}
