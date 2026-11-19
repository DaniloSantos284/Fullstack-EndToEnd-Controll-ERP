import { Membership } from "../../domain/entities/Membership";
import { Workspace } from "../../domain/entities/Workspace";
import { MembershipRole } from "../../domain/enums/MembershipRole";
import { WorkspaceAction } from "../../domain/enums/WorkspaceAction";
import { DomainError } from "../../domain/errors/DomainError";
import { assertWorkspaceAction } from "../../domain/policies/WorkspaceAuthorization";
import { MembershipRepository } from "../../domain/repositories/MembershipRepository";
import { WorkspaceRepository } from "../../domain/repositories/WorkspaceRepository";
import { AppError } from "../use-cases/errors/AppError";
import { assertTrustedAccountContext, TrustedAccountContext } from "./TrustedAccountContext";

export function assertAuthorizedWorkspaceAction(
  membership: Membership,
  workspace: Workspace,
  action: WorkspaceAction
): void {
  try {
    assertWorkspaceAction(membership, workspace, action);
  } catch (error) {
    if (error instanceof DomainError) {
      throw new AppError(error.message, 403, "FORBIDDEN");
    }
    throw error;
  }
}

export async function resolveWorkspaceAccess(
  context: TrustedAccountContext,
  membershipRepository: MembershipRepository,
  workspaceRepository: WorkspaceRepository
): Promise<{ workspace: Workspace; membership: Membership }> {
  assertTrustedAccountContext(context);
  const accountId = context.account.id;

  const membership = await membershipRepository.findActiveByAccountId(accountId);
  if (membership === null) {
    throw new AppError("Vínculo ativo não encontrado.", 403, "MEMBERSHIP_NOT_FOUND");
  }
  if (
    !(membership instanceof Membership) ||
    membership.accountId !== accountId ||
    !membership.isActive ||
    typeof membership.workspaceId !== "string" ||
    membership.workspaceId.trim().length === 0 ||
    (membership.role !== MembershipRole.ADMINISTRATOR && membership.role !== MembershipRole.OPERATOR)
  ) {
    throw new AppError("Vínculo inconsistente ou sem acesso.", 403, "FORBIDDEN");
  }

  const workspace = await workspaceRepository.findById(membership.workspaceId);
  if (workspace === null) {
    throw new AppError("Workspace não encontrado.", 404, "WORKSPACE_NOT_FOUND");
  }
  if (
    !(workspace instanceof Workspace) ||
    workspace.id !== membership.workspaceId ||
    membership.isOwner !== (membership.accountId === workspace.ownerAccountId) ||
    (membership.isOwner && membership.role !== MembershipRole.ADMINISTRATOR)
  ) {
    throw new AppError("Workspace inconsistente ou sem acesso.", 403, "FORBIDDEN");
  }

  return { workspace, membership };
}
