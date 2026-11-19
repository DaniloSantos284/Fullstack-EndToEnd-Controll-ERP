import { Membership } from "../../domain/entities/Membership";
import { Workspace } from "../../domain/entities/Workspace";
import { WorkspaceAction } from "../../domain/enums/WorkspaceAction";
import { MembershipRepository } from "../../domain/repositories/MembershipRepository";
import { WorkspaceRepository } from "../../domain/repositories/WorkspaceRepository";
import { TrustedAccountContext } from "../security/TrustedAccountContext";
import { assertAuthorizedWorkspaceAction, resolveWorkspaceAccess } from "../security/WorkspaceAccess";

export class AuthorizeWorkspaceActionUseCase {
  constructor(
    private readonly memberships: MembershipRepository,
    private readonly workspaces: WorkspaceRepository
  ) {}

  async execute(
    context: TrustedAccountContext,
    action: WorkspaceAction
  ): Promise<{ workspace: Workspace; membership: Membership }> {
    const access = await resolveWorkspaceAccess(context, this.memberships, this.workspaces);
    assertAuthorizedWorkspaceAction(access.membership, access.workspace, action);
    return access;
  }
}
