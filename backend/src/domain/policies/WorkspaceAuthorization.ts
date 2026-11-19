import { Membership } from "../entities/Membership";
import { Workspace } from "../entities/Workspace";
import { MembershipRole } from "../enums/MembershipRole";
import { WorkspaceAction } from "../enums/WorkspaceAction";
import { DomainError } from "../errors/DomainError";

export function assertWorkspaceAction(
  membership: Membership,
  workspace: Workspace,
  action: WorkspaceAction
): void {
  if (
    !(membership instanceof Membership) ||
    !(workspace instanceof Workspace) ||
    !membership.isActive ||
    membership.workspaceId !== workspace.id ||
    membership.isOwner !== (membership.accountId === workspace.ownerAccountId) ||
    (membership.role !== MembershipRole.ADMINISTRATOR && membership.role !== MembershipRole.OPERATOR) ||
    (membership.isOwner && membership.role !== MembershipRole.ADMINISTRATOR)
  ) {
    throw new DomainError("Vínculo sem acesso ao workspace.");
  }

  switch (action) {
    case WorkspaceAction.READ_INVENTORY:
    case WorkspaceAction.RECORD_STOCK_ENTRY:
    case WorkspaceAction.RECORD_STOCK_EXIT:
      return;
    case WorkspaceAction.PROPOSE_PRODUCT_CREATION:
    case WorkspaceAction.PROPOSE_PRODUCT_EDIT:
      if (membership.role === MembershipRole.OPERATOR) return;
      break;
    case WorkspaceAction.CREATE_PRODUCT:
    case WorkspaceAction.EDIT_PRODUCT:
    case WorkspaceAction.APPROVE_PRODUCT_PROPOSAL:
    case WorkspaceAction.INVITE_MEMBER:
    case WorkspaceAction.REMOVE_MEMBER:
    case WorkspaceAction.CHANGE_MEMBER_ROLE:
    case WorkspaceAction.DEACTIVATE_PRODUCT:
    case WorkspaceAction.DELETE_PRODUCT:
    case WorkspaceAction.MANAGE_ALERT_EMAIL:
      if (membership.role === MembershipRole.ADMINISTRATOR) return;
      break;
    case WorkspaceAction.LEAVE_WORKSPACE:
      if (!membership.isOwner) return;
      break;
    default:
      throw new DomainError("Ação do workspace desconhecida.");
  }

  throw new DomainError("Ação não permitida para este vínculo.");
}
