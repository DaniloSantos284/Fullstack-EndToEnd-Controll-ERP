import { Membership } from "../../domain/entities/Membership";
import { MembershipRole } from "../../domain/enums/MembershipRole";
import { WorkspaceAction } from "../../domain/enums/WorkspaceAction";
import { DomainError } from "../../domain/errors/DomainError";
import { MembershipRepository } from "../../domain/repositories/MembershipRepository";
import { WorkspaceRepository } from "../../domain/repositories/WorkspaceRepository";
import { assertTrustedAccountContext, TrustedAccountContext } from "../security/TrustedAccountContext";
import { assertAuthorizedWorkspaceAction, resolveWorkspaceAccess } from "../security/WorkspaceAccess";
import { AppError } from "./errors/AppError";

/**
 * Ativação autorizada no core, não um workflow/API de convite. O contexto do
 * membro deve vir da futura fronteira confiável, nunca de DTO do cliente.
 * Não comprova aceitação de convite nem implementa transações reais.
 */
export class AddWorkspaceMemberUseCase {
  constructor(
    private readonly memberships: MembershipRepository,
    private readonly workspaces: WorkspaceRepository
  ) {}

  async execute(
    actor: TrustedAccountContext,
    member: TrustedAccountContext,
    role: MembershipRole
  ): Promise<Membership> {
    assertTrustedAccountContext(member);
    const memberAccountId = member.account.id;

    const { workspace, membership: actorMembership } = await resolveWorkspaceAccess(
      actor, this.memberships, this.workspaces
    );
    assertAuthorizedWorkspaceAction(actorMembership, workspace, WorkspaceAction.INVITE_MEMBER);

    if (memberAccountId === workspace.ownerAccountId) {
      throw new AppError("O vínculo do proprietário é protegido.", 403, "OWNER_PROTECTED");
    }
    if (role !== MembershipRole.ADMINISTRATOR && role !== MembershipRole.OPERATOR) {
      throw new DomainError("Papel do vínculo inválido.");
    }

    const activeMembership = await this.memberships.findActiveByAccountId(memberAccountId);
    if (activeMembership !== null) {
      throw new AppError("A conta já possui vínculo ativo.", 409, "ACTIVE_MEMBERSHIP_EXISTS");
    }

    const membership = new Membership({ accountId: memberAccountId, role }, workspace);
    await this.memberships.save(membership);
    return membership;
  }
}
