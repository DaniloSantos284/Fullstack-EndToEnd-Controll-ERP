import { describe, expect, it, jest } from '@jest/globals';
import type { TrustedAccountContext } from '../../src/application/security/TrustedAccountContext';
import { AddWorkspaceMemberUseCase } from '../../src/application/use-cases/AddWorkspaceMemberUseCase';
import { AuthorizeWorkspaceActionUseCase } from '../../src/application/use-cases/AuthorizeWorkspaceActionUseCase';
import { BootstrapWorkspaceUseCase } from '../../src/application/use-cases/BootstrapWorkspaceUseCase';
import { ChangeMemberRoleUseCase } from '../../src/application/use-cases/ChangeMemberRoleUseCase';
import { EndMembershipUseCase } from '../../src/application/use-cases/EndMembershipUseCase';
import { AppError } from '../../src/application/use-cases/errors/AppError';
import { Membership } from '../../src/domain/entities/Membership';
import { PersonalAccount } from '../../src/domain/entities/PersonalAccount';
import { Workspace } from '../../src/domain/entities/Workspace';
import { MembershipRole } from '../../src/domain/enums/MembershipRole';
import { MembershipStatus } from '../../src/domain/enums/MembershipStatus';
import { WorkspaceAction } from '../../src/domain/enums/WorkspaceAction';
import type { MembershipRepository } from '../../src/domain/repositories/MembershipRepository';
import type { WorkspaceRepository } from '../../src/domain/repositories/WorkspaceRepository';

function context(id: string): TrustedAccountContext {
  return { account: new PersonalAccount({ id, email: `${id}@example.test` }) };
}

function space(id = 'workspace-a', ownerAccountId = 'owner-a') {
  return new Workspace({ id, ownerAccountId, alertEmail: `${id}@example.test` });
}

function membership(
  workspace: Workspace,
  accountId: string,
  role = MembershipRole.OPERATOR,
  status = MembershipStatus.ACTIVE,
  id = `${workspace.id}-${accountId}`,
) {
  return new Membership({ id, accountId, role, status }, workspace);
}

// Fakes unitários: não representam transações, exclusão mútua ou garantias de concorrência.
function repositories(initialSpaces: Workspace[] = [], initialMemberships: Membership[] = []) {
  const spaces = new Map(initialSpaces.map((item) => [item.id, item]));
  const rows = new Map(initialMemberships.map((item) => [item.id, item]));
  const memberships: MembershipRepository = {
    findActiveByAccountId: jest.fn<MembershipRepository['findActiveByAccountId']>(async (id) =>
      [...rows.values()].find((item) => item.accountId === id && item.isActive) ?? null),
    findById: jest.fn<MembershipRepository['findById']>(async (id) => rows.get(id) ?? null),
    save: jest.fn<MembershipRepository['save']>(async (item) => { rows.set(item.id, item); }),
  };
  const workspaces: WorkspaceRepository = {
    findById: jest.fn<WorkspaceRepository['findById']>(async (id) => spaces.get(id) ?? null),
    saveWithOwner: jest.fn<WorkspaceRepository['saveWithOwner']>(async (workspace, owner) => {
      spaces.set(workspace.id, workspace);
      rows.set(owner.id, owner);
    }),
  };
  return { memberships, workspaces, rows, spaces };
}

function scenario() {
  const workspace = space();
  const otherWorkspace = space('workspace-b', 'owner-b');
  const owner = membership(workspace, 'owner-a', MembershipRole.ADMINISTRATOR);
  const admin = membership(workspace, 'admin-a', MembershipRole.ADMINISTRATOR);
  const operator = membership(workspace, 'operator-a');
  const other = membership(otherWorkspace, 'operator-b');
  const repo = repositories([workspace, otherWorkspace], [owner, admin, operator, other]);
  return { ...repo, workspace, otherWorkspace, owner, admin, operator, other };
}

async function expectForbidden(operation: Promise<unknown>) {
  await expect(operation).rejects.toBeInstanceOf(AppError);
  await expect(operation).rejects.toMatchObject({ statusCode: 403 });
}

describe('BootstrapWorkspaceUseCase', () => {
  it('cria workspace com email da conta e proprietário administrador ativo', async () => {
    const repo = repositories();
    const actor = context('new-owner');
    const result = await new BootstrapWorkspaceUseCase(repo.memberships, repo.workspaces).execute(actor);
    expect(result.workspace.ownerAccountId).toBe(actor.account.id);
    expect(result.workspace.alertEmail).toBe(actor.account.email);
    expect(result.membership).toMatchObject({
      accountId: actor.account.id,
      workspaceId: result.workspace.id,
      role: MembershipRole.ADMINISTRATOR,
      status: MembershipStatus.ACTIVE,
      isOwner: true,
    });
    expect(repo.memberships.findActiveByAccountId).toHaveBeenCalledWith(actor.account.id);
    expect(repo.workspaces.saveWithOwner).toHaveBeenCalledTimes(1);
    expect(repo.workspaces.saveWithOwner).toHaveBeenCalledWith(result.workspace, result.membership);
    expect(repo.memberships.save).not.toHaveBeenCalled();
    expect(actor.account.email).toBe('new-owner@example.test');
  });

  it('rejeita novo workspace quando existe vínculo ativo global, inclusive em outro workspace', async () => {
    const state = scenario();
    await expect(new BootstrapWorkspaceUseCase(state.memberships, state.workspaces)
      .execute(context('operator-b'))).rejects.toMatchObject({
      statusCode: 409, code: 'ACTIVE_MEMBERSHIP_EXISTS',
    });
    expect(state.workspaces.saveWithOwner).not.toHaveBeenCalled();
    expect(state.memberships.save).not.toHaveBeenCalled();
  });

  it('usa a conta checada mesmo se o alias do contexto mudar durante o precheck', async () => {
    const state = scenario();
    const checkedAccount = context('new-owner').account;
    const replacementAccount = context(state.other.accountId).account;
    const actor = { account: checkedAccount };
    const findActiveByAccountId = jest.fn<MembershipRepository['findActiveByAccountId']>(async (id) => {
      if (id === checkedAccount.id) {
        actor.account = replacementAccount;
        return null;
      }
      return state.other;
    });
    const memberships: MembershipRepository = { ...state.memberships, findActiveByAccountId };
    const result = await new BootstrapWorkspaceUseCase(memberships, state.workspaces).execute(actor);
    expect(actor.account).toBe(replacementAccount);
    expect(findActiveByAccountId).toHaveBeenCalledTimes(1);
    expect(findActiveByAccountId).toHaveBeenCalledWith(checkedAccount.id);
    expect(result.workspace.ownerAccountId).toBe(checkedAccount.id);
    expect(result.workspace.alertEmail).toBe(checkedAccount.email);
    expect(result.membership.accountId).toBe(checkedAccount.id);
    expect(result.membership.isOwner).toBe(true);
    expect(state.workspaces.saveWithOwner).toHaveBeenCalledWith(result.workspace, result.membership);
    expect(state.rows.get(state.other.id)).toBe(state.other);
  });
});

describe('AddWorkspaceMemberUseCase: ativação por contexto confiável interno', () => {
  it.each([MembershipRole.ADMINISTRATOR, MembershipRole.OPERATOR])(
    'administrador adiciona uma conta com papel permitido: %s',
    async (role) => {
      const state = scenario();
      const target = context('new-member');
      const created = await new AddWorkspaceMemberUseCase(state.memberships, state.workspaces)
        .execute(context('admin-a'), target, role);
      expect(created).toMatchObject({
        accountId: target.account.id,
        workspaceId: state.workspace.id,
        role,
        status: MembershipStatus.ACTIVE,
        isOwner: false,
      });
      expect(state.memberships.save).toHaveBeenCalledWith(created);
      expect(state.memberships.save).toHaveBeenCalledTimes(1);
      expect(target.account.email).toBe('new-member@example.test');
    },
  );

  it('rejeita adição se a conta já possui vínculo ativo em outro workspace', async () => {
    const state = scenario();
    await expect(new AddWorkspaceMemberUseCase(state.memberships, state.workspaces)
      .execute(context('admin-a'), context('operator-b'), MembershipRole.OPERATOR))
      .rejects.toMatchObject({ statusCode: 409, code: 'ACTIVE_MEMBERSHIP_EXISTS' });
    expect(state.memberships.save).not.toHaveBeenCalled();
    expect(state.rows.get(state.other.id)).toBe(state.other);
  });

  it('adiciona a conta checada, não a substituição do alias durante o precheck', async () => {
    const state = scenario();
    const checkedAccount = context('new-member').account;
    const replacementAccount = context(state.other.accountId).account;
    const target = { account: checkedAccount };
    const lookup = state.memberships.findActiveByAccountId;
    const findActiveByAccountId = jest.fn<MembershipRepository['findActiveByAccountId']>(async (id) => {
      if (id === checkedAccount.id) {
        target.account = replacementAccount;
        return null;
      }
      return lookup(id);
    });
    const memberships: MembershipRepository = { ...state.memberships, findActiveByAccountId };
    const created = await new AddWorkspaceMemberUseCase(memberships, state.workspaces)
      .execute(context(state.admin.accountId), target, MembershipRole.OPERATOR);
    expect(target.account).toBe(replacementAccount);
    expect(findActiveByAccountId).toHaveBeenCalledWith(checkedAccount.id);
    expect(created.accountId).toBe(checkedAccount.id);
    expect(created.workspaceId).toBe(state.workspace.id);
    expect(state.memberships.save).toHaveBeenCalledTimes(1);
    expect(state.memberships.save).toHaveBeenCalledWith(created);
    expect(state.rows.get(state.other.id)).toBe(state.other);
  });

  it('permite nova associação após encerramento em outro workspace sem apagar histórico ou conta', async () => {
    const previousSpace = space('workspace-old', 'owner-old');
    const target = context('returning-member');
    const oldActive = membership(previousSpace, target.account.id);
    const oldEnded = oldActive.end();
    const state = scenario();
    state.spaces.set(previousSpace.id, previousSpace);
    state.rows.set(oldEnded.id, oldEnded);
    const created = await new AddWorkspaceMemberUseCase(state.memberships, state.workspaces)
      .execute(context('admin-a'), target, MembershipRole.OPERATOR);
    expect(created.id).not.toBe(oldEnded.id);
    expect(created.accountId).toBe(oldEnded.accountId);
    expect(created.workspaceId).toBe(state.workspace.id);
    expect(created.isActive).toBe(true);
    expect(state.rows.get(oldEnded.id)).toBe(oldEnded);
    expect(oldEnded.status).toBe(MembershipStatus.ENDED);
    expect(oldActive.isActive).toBe(true);
    expect(target.account.id).toBe('returning-member');
    expect(target.account.email).toBe('returning-member@example.test');
  });

  it('não transforma sinalizadores de entrada em propriedade nem usa workspace ou papel do cliente', async () => {
    const state = scenario();
    const actor = {
      ...context('admin-a'),
      role: MembershipRole.OPERATOR,
      workspaceId: state.otherWorkspace.id,
    };
    const target = {
      ...context('new-member'),
      isOwner: true,
      role: 'OWNER',
      workspaceId: state.otherWorkspace.id,
    };
    const created = await new AddWorkspaceMemberUseCase(state.memberships, state.workspaces)
      .execute(actor, target, MembershipRole.OPERATOR);
    expect(created.workspaceId).toBe(state.workspace.id);
    expect(created.role).toBe(MembershipRole.OPERATOR);
    expect(created.isOwner).toBe(false);
  });

  it('não concede OWNER por string nem permite adicionar novamente a conta proprietária', async () => {
    const state = scenario();
    const useCase = new AddWorkspaceMemberUseCase(state.memberships, state.workspaces);
    await expect(useCase.execute(
      context('admin-a'), context('new-member'), 'OWNER' as MembershipRole,
    )).rejects.toThrow();
    await expect(useCase.execute(
      context('admin-a'), context('owner-a'), MembershipRole.ADMINISTRATOR,
    )).rejects.toThrow();
    expect(state.memberships.save).not.toHaveBeenCalled();
  });

  it.each(['operator-a', 'unknown-account'])('nega adição por ator sem autorização: %s', async (actor) => {
    const state = scenario();
    await expectForbidden(new AddWorkspaceMemberUseCase(state.memberships, state.workspaces)
      .execute(context(actor), context('new-member'), MembershipRole.OPERATOR));
    expect(state.memberships.save).not.toHaveBeenCalled();
  });
});

describe('ChangeMemberRoleUseCase', () => {
  it('altera papel por cópia com os mesmos identificadores e sem alterar o original', async () => {
    const state = scenario();
    const changed = await new ChangeMemberRoleUseCase(state.memberships, state.workspaces)
      .execute(context('admin-a'), {
        membershipId: state.operator.id, role: MembershipRole.ADMINISTRATOR,
      });
    expect(changed).not.toBe(state.operator);
    expect(changed).toMatchObject({
      id: state.operator.id,
      accountId: state.operator.accountId,
      workspaceId: state.operator.workspaceId,
      role: MembershipRole.ADMINISTRATOR,
      status: MembershipStatus.ACTIVE,
    });
    expect(state.operator.role).toBe(MembershipRole.OPERATOR);
    expect(state.memberships.save).toHaveBeenCalledWith(changed);
    expect(state.rows.get(changed.id)).toBe(changed);
  });

  it('nega promoção por operador mesmo com papel administrativo e workspace forjados no contexto', async () => {
    const state = scenario();
    const actor = {
      ...context('operator-a'),
      role: MembershipRole.ADMINISTRATOR,
      workspaceId: state.otherWorkspace.id,
      isOwner: true,
    };
    await expectForbidden(new ChangeMemberRoleUseCase(state.memberships, state.workspaces)
      .execute(actor, { membershipId: state.operator.id, role: MembershipRole.ADMINISTRATOR }));
    expect(state.memberships.save).not.toHaveBeenCalled();
  });

  it('nega alteração de papel em outro tenant', async () => {
    const state = scenario();
    await expectForbidden(new ChangeMemberRoleUseCase(state.memberships, state.workspaces)
      .execute(context('admin-a'), {
        membershipId: state.other.id, role: MembershipRole.ADMINISTRATOR,
      }));
    expect(state.rows.get(state.other.id)).toBe(state.other);
    expect(state.memberships.save).not.toHaveBeenCalled();
  });

  it.each(['owner-a', 'admin-a'])('protege proprietário de alteração por %s', async (actor) => {
    const state = scenario();
    await expect(new ChangeMemberRoleUseCase(state.memberships, state.workspaces)
      .execute(context(actor), { membershipId: state.owner.id, role: MembershipRole.OPERATOR }))
      .rejects.toThrow();
    expect(state.memberships.save).not.toHaveBeenCalled();
    expect(state.owner.role).toBe(MembershipRole.ADMINISTRATOR);
  });

  it('nega alteração de vínculo encerrado e papel OWNER em vínculo comum', async () => {
    const state = scenario();
    state.rows.set(state.operator.id, state.operator.end());
    const useCase = new ChangeMemberRoleUseCase(state.memberships, state.workspaces);
    await expect(useCase.execute(context('admin-a'), {
      membershipId: state.operator.id, role: MembershipRole.ADMINISTRATOR,
    })).rejects.toThrow();
    await expect(useCase.execute(context('owner-a'), {
      membershipId: state.admin.id, role: 'OWNER' as MembershipRole,
    })).rejects.toThrow();
    expect(state.memberships.save).not.toHaveBeenCalled();
  });
});

describe('EndMembershipUseCase', () => {
  it.each(['operator-a', 'admin-a'])('permite saída própria do não proprietário: %s', async (accountId) => {
    const state = scenario();
    const original = accountId === 'operator-a' ? state.operator : state.admin;
    const actor = context(accountId);
    const ended = await new EndMembershipUseCase(state.memberships, state.workspaces)
      .execute(actor, { membershipId: original.id });
    expect(ended).not.toBe(original);
    expect(ended).toMatchObject({
      id: original.id,
      accountId: actor.account.id,
      workspaceId: original.workspaceId,
      role: original.role,
      status: MembershipStatus.ENDED,
    });
    expect(ended.isActive).toBe(false);
    expect(original.isActive).toBe(true);
    expect(state.memberships.save).toHaveBeenCalledWith(ended);
    expect(state.rows.get(original.id)).toBe(ended);
    expect(actor.account.id).toBe(accountId);
    expect(actor.account.email).toBe(`${accountId}@example.test`);
    // As portas tipadas usadas pelo caso de uso não oferecem exclusão de conta.
  });

  it('permite administrador remover outro membro sem mudar a conta ou o vínculo original', async () => {
    const state = scenario();
    const ended = await new EndMembershipUseCase(state.memberships, state.workspaces)
      .execute(context('admin-a'), { membershipId: state.operator.id });
    expect(ended.accountId).toBe(state.operator.accountId);
    expect(ended.id).toBe(state.operator.id);
    expect(ended.status).toBe(MembershipStatus.ENDED);
    expect(state.operator.isActive).toBe(true);
    expect(state.rows.get(ended.id)).toBe(ended);
    expect(state.memberships.save).toHaveBeenCalledTimes(1);
  });

  it('não permite operador remover outro membro', async () => {
    const state = scenario();
    await expectForbidden(new EndMembershipUseCase(state.memberships, state.workspaces)
      .execute(context('operator-a'), { membershipId: state.admin.id }));
    expect(state.memberships.save).not.toHaveBeenCalled();
  });

  it('não confunde remoção com saída própria quando o alias da conta muda durante findById', async () => {
    const state = scenario();
    const actor = { account: context(state.operator.accountId).account };
    const replacementAccount = context(state.admin.accountId).account;
    const findById = jest.fn<MembershipRepository['findById']>(async () => {
      actor.account = replacementAccount;
      return state.admin;
    });
    const memberships: MembershipRepository = { ...state.memberships, findById };
    await expectForbidden(new EndMembershipUseCase(memberships, state.workspaces)
      .execute(actor, { membershipId: state.admin.id }));
    expect(findById).toHaveBeenCalledWith(state.admin.id);
    expect(actor.account).toBe(replacementAccount);
    expect(state.memberships.save).not.toHaveBeenCalled();
    expect(state.rows.get(state.admin.id)).toBe(state.admin);
    expect(state.admin.isActive).toBe(true);
  });

  it.each(['owner-a', 'admin-a'])('protege proprietário de saída/remoção por %s', async (actor) => {
    const state = scenario();
    await expect(new EndMembershipUseCase(state.memberships, state.workspaces)
      .execute(context(actor), { membershipId: state.owner.id })).rejects.toThrow();
    expect(state.memberships.save).not.toHaveBeenCalled();
    expect(state.owner.isActive).toBe(true);
  });

  it('nega remoção em outro tenant', async () => {
    const state = scenario();
    await expectForbidden(new EndMembershipUseCase(state.memberships, state.workspaces)
      .execute(context('admin-a'), { membershipId: state.other.id }));
    expect(state.memberships.save).not.toHaveBeenCalled();
    expect(state.other.isActive).toBe(true);
  });

  it('não encerra novamente um vínculo já encerrado', async () => {
    const state = scenario();
    const ended = state.operator.end();
    state.rows.set(ended.id, ended);
    await expect(new EndMembershipUseCase(state.memberships, state.workspaces)
      .execute(context('admin-a'), { membershipId: ended.id })).rejects.toThrow();
    expect(state.memberships.save).not.toHaveBeenCalled();
    expect(state.rows.get(ended.id)).toBe(ended);
  });
});

describe('resolução de autorização: estado atual das portas, nunca extras do cliente', () => {
  it('objetos devolvidos por autorização não permitem promoção nem alteração do proprietário sem save', async () => {
    const state = scenario();
    const useCase = new AuthorizeWorkspaceActionUseCase(state.memberships, state.workspaces);
    const actor = context(state.operator.accountId);
    const access = await useCase.execute(actor, WorkspaceAction.READ_INVENTORY);
    expect(Object.isFrozen(access.membership)).toBe(true);
    expect(Object.isFrozen(access.workspace)).toBe(true);
    expect(() => Object.assign(access.membership, {
      role: MembershipRole.ADMINISTRATOR,
    })).toThrow(TypeError);
    expect(Reflect.set(access.membership, 'isOwner', true)).toBe(false);
    expect(Reflect.set(access.membership, 'status', MembershipStatus.ENDED)).toBe(false);
    expect(Reflect.set(access.workspace, 'ownerAccountId', actor.account.id)).toBe(false);
    await expectForbidden(useCase.execute(actor, WorkspaceAction.INVITE_MEMBER));
    await expectForbidden(useCase.execute(context(state.owner.accountId), WorkspaceAction.LEAVE_WORKSPACE));
    expect(state.operator.role).toBe(MembershipRole.OPERATOR);
    expect(state.operator.isActive).toBe(true);
    expect(state.operator.isOwner).toBe(false);
    expect(state.workspace.ownerAccountId).toBe(state.owner.accountId);
    expect(state.memberships.save).not.toHaveBeenCalled();
    expect(state.workspaces.saveWithOwner).not.toHaveBeenCalled();
  });

  it('resolve a conta capturada antes do await mesmo se o alias do contexto apontar para outra', async () => {
    const state = scenario();
    const checkedAccount = context(state.operator.accountId).account;
    const replacementAccount = context(state.admin.accountId).account;
    const actor = { account: checkedAccount };
    const findActiveByAccountId = jest.fn<MembershipRepository['findActiveByAccountId']>(async () => {
      actor.account = replacementAccount;
      return state.operator;
    });
    const memberships: MembershipRepository = { ...state.memberships, findActiveByAccountId };
    const access = await new AuthorizeWorkspaceActionUseCase(memberships, state.workspaces)
      .execute(actor, WorkspaceAction.READ_INVENTORY);
    expect(findActiveByAccountId).toHaveBeenCalledTimes(1);
    expect(findActiveByAccountId).toHaveBeenCalledWith(checkedAccount.id);
    expect(actor.account).toBe(replacementAccount);
    expect(access.membership).toBe(state.operator);
    expect(access.membership.accountId).toBe(checkedAccount.id);
    expect(access.workspace).toBe(state.workspace);
    expect(state.memberships.save).not.toHaveBeenCalled();
  });

  it('o contexto interno contém uma conta; extras não comprovam autenticação nem verificação real de email', async () => {
    const state = scenario();
    const actor: TrustedAccountContext = context('operator-a');
    expect(actor.account).toBeInstanceOf(PersonalAccount);
    const supplied = {
      ...actor,
      role: MembershipRole.ADMINISTRATOR,
      workspaceId: state.otherWorkspace.id,
      isOwner: true,
      emailVerified: true,
    };
    const useCase = new AuthorizeWorkspaceActionUseCase(state.memberships, state.workspaces);
    const access = await useCase.execute(supplied, WorkspaceAction.READ_INVENTORY);
    expect(access.membership).toBe(state.operator);
    expect(access.workspace).toBe(state.workspace);
    await expectForbidden(useCase.execute(supplied, WorkspaceAction.INVITE_MEMBER));
  });

  it('consulta papel e workspace atuais em cada chamada, inclusive após rebaixamento', async () => {
    const state = scenario();
    const useCase = new AuthorizeWorkspaceActionUseCase(state.memberships, state.workspaces);
    const actor = context('admin-a');
    await expect(useCase.execute(actor, WorkspaceAction.CREATE_PRODUCT)).resolves.toMatchObject({
      workspace: state.workspace, membership: state.admin,
    });
    const demoted = state.admin.changeRole(MembershipRole.OPERATOR);
    state.rows.set(demoted.id, demoted);
    await expectForbidden(useCase.execute(actor, WorkspaceAction.CREATE_PRODUCT));
    await expect(useCase.execute(actor, WorkspaceAction.RECORD_STOCK_ENTRY)).resolves.toMatchObject({
      membership: demoted,
    });
    expect(state.memberships.findActiveByAccountId).toHaveBeenCalledTimes(3);
    expect(state.workspaces.findById).toHaveBeenCalledTimes(3);
    expect(state.memberships.save).not.toHaveBeenCalled();
  });

  it('nega ator sem vínculo e ator encerrado, inclusive mutações', async () => {
    const state = scenario();
    state.rows.set(state.admin.id, state.admin.end());
    const actor = context('admin-a');
    await expectForbidden(new AuthorizeWorkspaceActionUseCase(state.memberships, state.workspaces)
      .execute(context('unknown-account'), WorkspaceAction.READ_INVENTORY));
    await expectForbidden(new AuthorizeWorkspaceActionUseCase(state.memberships, state.workspaces)
      .execute(actor, WorkspaceAction.READ_INVENTORY));
    await expectForbidden(new AddWorkspaceMemberUseCase(state.memberships, state.workspaces)
      .execute(actor, context('new-member'), MembershipRole.OPERATOR));
    await expectForbidden(new ChangeMemberRoleUseCase(state.memberships, state.workspaces)
      .execute(actor, { membershipId: state.operator.id, role: MembershipRole.ADMINISTRATOR }));
    await expectForbidden(new EndMembershipUseCase(state.memberships, state.workspaces)
      .execute(actor, { membershipId: state.operator.id }));
    expect(state.memberships.save).not.toHaveBeenCalled();
  });

  it.each(['different-account', 'inactive', 'different-workspace', 'missing-workspace'] as const)(
    'falha fechado se adaptador retorna estado incoerente: %s',
    async (inconsistency) => {
      const state = scenario();
      const returned = inconsistency === 'different-account'
        ? state.admin
        : inconsistency === 'inactive' ? state.operator.end() : state.operator;
      const memberships: MembershipRepository = {
        ...state.memberships,
        findActiveByAccountId: async () => returned,
      };
      const workspaces: WorkspaceRepository = {
        ...state.workspaces,
        findById: async () => inconsistency === 'missing-workspace'
          ? null : inconsistency === 'different-workspace' ? state.otherWorkspace : state.workspace,
      };
      const result = new AuthorizeWorkspaceActionUseCase(memberships, workspaces)
        .execute(context('operator-a'), WorkspaceAction.READ_INVENTORY);
      if (inconsistency === 'missing-workspace') {
        // Ausência pode ser traduzida em 403 ou 404; em nenhum caso concede acesso.
        await expect(result).rejects.toBeInstanceOf(AppError);
      } else {
        await expectForbidden(result);
      }
      expect(state.memberships.save).not.toHaveBeenCalled();
    },
  );

  it.each(['authorize', 'end-self', 'change-as-actor', 'end-target', 'change-target'] as const)(
    'nega proprietário derivado de workspace obsoleto, apesar do mesmo workspaceId: %s',
    async (operation) => {
      const state = scenario();
      const staleWorkspace = space(state.workspace.id, 'stale-owner');
      const staleOwnerMembership = membership(
        staleWorkspace,
        state.owner.accountId,
        MembershipRole.ADMINISTRATOR,
        MembershipStatus.ACTIVE,
        state.owner.id,
      );
      // Mesmo ID de workspace, mas propriedade calculada usando outro proprietário.
      expect(staleOwnerMembership.workspaceId).toBe(state.workspace.id);
      expect(staleOwnerMembership.isOwner).toBe(false);
      expect(state.workspace.ownerAccountId).toBe(staleOwnerMembership.accountId);
      state.rows.set(staleOwnerMembership.id, staleOwnerMembership);

      const ownerContext = context(state.owner.accountId);
      const adminContext = context(state.admin.accountId);
      let result: Promise<unknown>;
      if (operation === 'authorize') {
        result = new AuthorizeWorkspaceActionUseCase(state.memberships, state.workspaces)
          .execute(ownerContext, WorkspaceAction.READ_INVENTORY);
      } else if (operation === 'end-self') {
        result = new EndMembershipUseCase(state.memberships, state.workspaces)
          .execute(ownerContext, { membershipId: staleOwnerMembership.id });
      } else if (operation === 'change-as-actor') {
        result = new ChangeMemberRoleUseCase(state.memberships, state.workspaces)
          .execute(ownerContext, {
            membershipId: state.operator.id, role: MembershipRole.ADMINISTRATOR,
          });
      } else if (operation === 'end-target') {
        result = new EndMembershipUseCase(state.memberships, state.workspaces)
          .execute(adminContext, { membershipId: staleOwnerMembership.id });
      } else {
        result = new ChangeMemberRoleUseCase(state.memberships, state.workspaces)
          .execute(adminContext, {
            membershipId: staleOwnerMembership.id, role: MembershipRole.OPERATOR,
          });
      }

      await expectForbidden(result);
      expect(state.memberships.save).not.toHaveBeenCalled();
      expect(state.rows.get(staleOwnerMembership.id)).toBe(staleOwnerMembership);
      expect(staleOwnerMembership.isActive).toBe(true);
      expect(staleOwnerMembership.role).toBe(MembershipRole.ADMINISTRATOR);
    },
  );

  it('não autoriza uma ação desconhecida', async () => {
    const state = scenario();
    await expect(new AuthorizeWorkspaceActionUseCase(state.memberships, state.workspaces)
      .execute(context('admin-a'), 'UNKNOWN' as WorkspaceAction)).rejects.toThrow();
    expect(state.memberships.save).not.toHaveBeenCalled();
  });
});
