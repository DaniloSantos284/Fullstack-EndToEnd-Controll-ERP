import { Membership } from "../../domain/entities/Membership";
import { Workspace } from "../../domain/entities/Workspace";
import { MembershipRole } from "../../domain/enums/MembershipRole";
import { MembershipStatus } from "../../domain/enums/MembershipStatus";
import { MembershipRepository } from "../../domain/repositories/MembershipRepository";
import { WorkspaceRepository } from "../../domain/repositories/WorkspaceRepository";
import { assertTrustedAccountContext, TrustedAccountContext } from "../security/TrustedAccountContext";
import { AppError } from "./errors/AppError";

export class BootstrapWorkspaceUseCase {
  constructor(
    private readonly memberships: MembershipRepository,
    private readonly workspaces: WorkspaceRepository
  ) {}

  async execute(context: TrustedAccountContext): Promise<{ workspace: Workspace; membership: Membership }> {
    assertTrustedAccountContext(context);
    const accountId = context.account.id;
    const alertEmail = context.account.email;

    const activeMembership = await this.memberships.findActiveByAccountId(accountId);
    if (activeMembership !== null) {
      throw new AppError("A conta já possui vínculo ativo.", 409, "ACTIVE_MEMBERSHIP_EXISTS");
    }

    const workspace = new Workspace({
      ownerAccountId: accountId,
      alertEmail,
    });
    const membership = new Membership({
      accountId,
      role: MembershipRole.ADMINISTRATOR,
      status: MembershipStatus.ACTIVE,
    }, workspace);

    // O precheck não substitui as garantias transacionais do repositório futuro.
    await this.workspaces.saveWithOwner(workspace, membership);

    return { workspace, membership };
  }
}
