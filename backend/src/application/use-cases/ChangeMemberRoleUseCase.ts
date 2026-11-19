import { Membership } from "../../domain/entities/Membership";
import { MembershipRole } from "../../domain/enums/MembershipRole";
import { WorkspaceAction } from "../../domain/enums/WorkspaceAction";
import { MembershipRepository } from "../../domain/repositories/MembershipRepository";
import { WorkspaceRepository } from "../../domain/repositories/WorkspaceRepository";
import { TrustedAccountContext } from "../security/TrustedAccountContext";
import { assertAuthorizedWorkspaceAction, resolveWorkspaceAccess } from "../security/WorkspaceAccess";
import { AppError } from "./errors/AppError";

export class ChangeMemberRoleUseCase {
  constructor(
    private readonly memberships: MembershipRepository,
    private readonly workspaces: WorkspaceRepository
  ) {}

  async execute(
    actor: TrustedAccountContext,
    input: { membershipId: string; role: MembershipRole }
  ): Promise<Membership> {
    const { workspace, membership: actorMembership } = await resolveWorkspaceAccess(
      actor, this.memberships, this.workspaces
    );
    assertAuthorizedWorkspaceAction(actorMembership, workspace, WorkspaceAction.CHANGE_MEMBER_ROLE);

    const target = await this.memberships.findById(input.membershipId);
    if (target === null) {
      throw new AppError("Vínculo não encontrado.", 404, "MEMBERSHIP_NOT_FOUND");
    }
    if (
      !(target instanceof Membership) ||
      target.id !== input.membershipId ||
      target.workspaceId !== workspace.id ||
      !target.isActive ||
      target.isOwner !== (target.accountId === workspace.ownerAccountId)
    ) {
      throw new AppError("Vínculo sem acesso ao workspace.", 403, "FORBIDDEN");
    }

    const membership = target.changeRole(input.role);
    await this.memberships.save(membership);
    return membership;
  }
}
