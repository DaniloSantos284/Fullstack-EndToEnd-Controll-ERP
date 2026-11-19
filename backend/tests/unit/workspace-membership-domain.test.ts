import { describe, expect, it } from '@jest/globals';
import { Membership } from '../../src/domain/entities/Membership';
import { PersonalAccount } from '../../src/domain/entities/PersonalAccount';
import { Workspace } from '../../src/domain/entities/Workspace';
import { MembershipRole } from '../../src/domain/enums/MembershipRole';
import { MembershipStatus } from '../../src/domain/enums/MembershipStatus';
import { WorkspaceAction } from '../../src/domain/enums/WorkspaceAction';
import { DomainError } from '../../src/domain/errors/DomainError';
import { assertWorkspaceAction } from '../../src/domain/policies/WorkspaceAuthorization';

const workspace = () => new Workspace({
  id: 'workspace-a',
  ownerAccountId: 'owner-a',
  alertEmail: 'alerts@example.test',
});

function member(
  role: MembershipRole = MembershipRole.OPERATOR,
  status: MembershipStatus = MembershipStatus.ACTIVE,
) {
  return new Membership({
    id: 'membership-a',
    accountId: 'member-a',
    role,
    status,
  }, workspace());
}

const sharedActions = [
  WorkspaceAction.READ_INVENTORY,
  WorkspaceAction.RECORD_STOCK_ENTRY,
  WorkspaceAction.RECORD_STOCK_EXIT,
];
const administratorActions = [
  WorkspaceAction.CREATE_PRODUCT,
  WorkspaceAction.EDIT_PRODUCT,
  WorkspaceAction.APPROVE_PRODUCT_PROPOSAL,
  WorkspaceAction.INVITE_MEMBER,
  WorkspaceAction.REMOVE_MEMBER,
  WorkspaceAction.CHANGE_MEMBER_ROLE,
  WorkspaceAction.DEACTIVATE_PRODUCT,
  WorkspaceAction.DELETE_PRODUCT,
  WorkspaceAction.MANAGE_ALERT_EMAIL,
];
const proposalActions = [
  WorkspaceAction.PROPOSE_PRODUCT_CREATION,
  WorkspaceAction.PROPOSE_PRODUCT_EDIT,
];

describe('contas pessoais e workspace: invariantes de domínio', () => {
  it('mantém identidade e email próprios, separados do email de alertas do workspace', () => {
    const account = new PersonalAccount({ id: 'owner-a', email: 'owner@example.test' });
    const space = workspace();
    expect(account.id).toBe('owner-a');
    expect(account.email).toBe('owner@example.test');
    expect(space.id).toBe('workspace-a');
    expect(space.ownerAccountId).toBe(account.id);
    expect(space.alertEmail).toBe('alerts@example.test');
    expect(account.email).not.toBe(space.alertEmail);
  });

  it('congela conta e workspace em runtime, não apenas nos tipos readonly', () => {
    const account = new PersonalAccount({ id: 'owner-a', email: 'owner@example.test' });
    const space = workspace();
    expect(Object.isFrozen(account)).toBe(true);
    expect(Object.isFrozen(space)).toBe(true);
    expect(() => Object.assign(account, { email: 'changed@example.test' })).toThrow(TypeError);
    expect(() => Object.assign(space, { ownerAccountId: 'member-a' })).toThrow(TypeError);
    for (const [key, value] of Object.entries({
      id: 'changed-account', email: 'changed@example.test',
    })) {
      expect(Reflect.set(account, key, value)).toBe(false);
    }
    for (const [key, value] of Object.entries({
      id: 'changed-workspace', ownerAccountId: 'member-a', alertEmail: 'changed@example.test',
    })) {
      expect(Reflect.set(space, key, value)).toBe(false);
    }
    expect(account).toMatchObject({ id: 'owner-a', email: 'owner@example.test' });
    expect(space).toMatchObject({
      id: 'workspace-a', ownerAccountId: 'owner-a', alertEmail: 'alerts@example.test',
    });
  });

  it('gera identificadores quando omitidos', () => {
    const account = new PersonalAccount({ email: 'new@example.test' });
    const space = new Workspace({ ownerAccountId: account.id, alertEmail: 'alerts@example.test' });
    const membership = new Membership({
      accountId: account.id,
      role: MembershipRole.ADMINISTRATOR,
    }, space);
    for (const entity of [account, space, membership]) {
      expect(typeof entity.id).toBe('string');
      expect(entity.id.trim().length).toBeGreaterThan(0);
    }
    expect(membership.status).toBe(MembershipStatus.ACTIVE);
    expect(membership.isOwner).toBe(true);
  });

  it.each(['', ' ', null, 7, {}])('rejeita identificadores inválidos: %p', (id) => {
    expect(() => new PersonalAccount({ id, email: 'member@example.test' })).toThrow(DomainError);
    expect(() => new Workspace({
      id, ownerAccountId: 'owner-a', alertEmail: 'alerts@example.test',
    })).toThrow(DomainError);
    expect(() => new Workspace({
      ownerAccountId: id, alertEmail: 'alerts@example.test',
    })).toThrow(DomainError);
    expect(() => new Membership({
      id, accountId: 'member-a', role: MembershipRole.OPERATOR,
    }, workspace())).toThrow(DomainError);
    expect(() => new Membership({
      accountId: id, role: MembershipRole.OPERATOR,
    }, workspace())).toThrow(DomainError);
  });

  it.each(['', ' ', 'not-an-email', 'missing-domain@', null, 7, {}])(
    'rejeita email inválido: %p',
    (email) => {
      expect(() => new PersonalAccount({ email })).toThrow(DomainError);
      expect(() => new Workspace({ ownerAccountId: 'owner-a', alertEmail: email })).toThrow(DomainError);
    },
  );
});

describe('Membership: proprietário derivado e transições imutáveis', () => {
  it('congela vínculo e preserva invariantes nas cópias que retêm o workspace', () => {
    const space = workspace();
    const original = new Membership({
      id: 'membership-a', accountId: 'member-a', role: MembershipRole.OPERATOR,
    }, space);
    expect(Object.isFrozen(original)).toBe(true);
    expect(() => Object.assign(original, { role: MembershipRole.ADMINISTRATOR })).toThrow(TypeError);
    for (const [key, value] of Object.entries({
      id: 'changed-membership',
      accountId: 'owner-a',
      workspaceId: 'workspace-b',
      role: MembershipRole.ADMINISTRATOR,
      status: MembershipStatus.ENDED,
      isOwner: true,
    })) {
      expect(Reflect.set(original, key, value)).toBe(false);
    }
    // O mesmo workspace é retido nas transições; mutá-lo não pode redefinir o proprietário.
    expect(Reflect.set(space, 'ownerAccountId', original.accountId)).toBe(false);
    const changed = original.changeRole(MembershipRole.ADMINISTRATOR);
    const ended = original.end();
    expect(Object.isFrozen(changed)).toBe(true);
    expect(Object.isFrozen(ended)).toBe(true);
    expect(changed.isOwner).toBe(false);
    expect(ended.isOwner).toBe(false);
    expect(original).toMatchObject({
      id: 'membership-a',
      accountId: 'member-a',
      workspaceId: 'workspace-a',
      role: MembershipRole.OPERATOR,
      status: MembershipStatus.ACTIVE,
      isOwner: false,
    });
    expect(space.ownerAccountId).toBe('owner-a');
  });

  it('deriva proprietário exclusivamente da conta proprietária do workspace', () => {
    const untrustedProps = {
      id: 'membership-a',
      accountId: 'member-a',
      role: MembershipRole.OPERATOR,
      isOwner: true,
    };
    const membership = new Membership(untrustedProps, workspace());
    const owner = new Membership({
      accountId: 'owner-a', role: MembershipRole.ADMINISTRATOR,
    }, workspace());
    expect(membership.isOwner).toBe(false);
    expect(membership.workspaceId).toBe('workspace-a');
    expect(owner.isOwner).toBe(true);
    expect(owner.isActive).toBe(true);
    expect(owner.role).toBe(MembershipRole.ADMINISTRATOR);
  });

  it.each([
    { role: MembershipRole.OPERATOR, status: MembershipStatus.ACTIVE },
    { role: MembershipRole.ADMINISTRATOR, status: MembershipStatus.ENDED },
  ])('rejeita estado inválido de proprietário: %p', ({ role, status }) => {
    expect(() => new Membership({ accountId: 'owner-a', role, status }, workspace())).toThrow(DomainError);
  });

  it('não permite encerrar ou mudar o papel do proprietário', () => {
    const owner = new Membership({
      accountId: 'owner-a', role: MembershipRole.ADMINISTRATOR,
    }, workspace());
    expect(() => owner.end()).toThrow(DomainError);
    expect(() => owner.changeRole(MembershipRole.OPERATOR)).toThrow(DomainError);
    expect(owner.isActive).toBe(true);
    expect(owner.role).toBe(MembershipRole.ADMINISTRATOR);
  });

  it.each(['OWNER', 'administrator-invalid', '', null, 1])('rejeita papel inválido: %p', (role) => {
    expect(() => new Membership({ accountId: 'member-a', role }, workspace())).toThrow(DomainError);
    expect(() => member().changeRole(role)).toThrow(DomainError);
  });

  it.each(['INVALID', '', null, 1])('rejeita status inválido: %p', (status) => {
    expect(() => new Membership({
      accountId: 'member-a', role: MembershipRole.OPERATOR, status,
    }, workspace())).toThrow(DomainError);
  });

  it('troca o papel em uma cópia preservando identidade, workspace e original', () => {
    const original = member();
    const changed = original.changeRole(MembershipRole.ADMINISTRATOR);
    expect(changed).not.toBe(original);
    expect(changed).toMatchObject({
      id: original.id,
      accountId: original.accountId,
      workspaceId: original.workspaceId,
      role: MembershipRole.ADMINISTRATOR,
      status: MembershipStatus.ACTIVE,
      isOwner: false,
    });
    expect(original.role).toBe(MembershipRole.OPERATOR);
    expect(original.isActive).toBe(true);
  });

  it('encerra uma cópia sem apagar identidade ou permitir reativação por transições', () => {
    const original = member();
    const ended = original.end();
    expect(ended).not.toBe(original);
    expect(ended).toMatchObject({
      id: original.id,
      accountId: original.accountId,
      workspaceId: original.workspaceId,
      role: original.role,
      status: MembershipStatus.ENDED,
    });
    expect(ended.isActive).toBe(false);
    expect(original.status).toBe(MembershipStatus.ACTIVE);
    expect(() => ended.end()).toThrow(DomainError);
    expect(() => ended.changeRole(MembershipRole.ADMINISTRATOR)).toThrow(DomainError);
  });
});

describe('WorkspaceAuthorization: matriz de capacidades', () => {
  it.each([MembershipRole.ADMINISTRATOR, MembershipRole.OPERATOR])(
    'permite leitura, movimentação de estoque e saída do não proprietário: %s',
    (role) => {
      for (const action of [...sharedActions, WorkspaceAction.LEAVE_WORKSPACE]) {
        expect(() => assertWorkspaceAction(member(role), workspace(), action)).not.toThrow();
      }
    },
  );

  it.each(administratorActions)('permite capacidade administrativa confirmada: %s', (action) => {
    expect(() => assertWorkspaceAction(
      member(MembershipRole.ADMINISTRATOR), workspace(), action,
    )).not.toThrow();
  });

  it.each(administratorActions)('nega capacidade administrativa ao operador: %s', (action) => {
    expect(() => assertWorkspaceAction(member(), workspace(), action)).toThrow(DomainError);
  });

  it.each(proposalActions)('permite proposta ao operador: %s', (action) => {
    expect(() => assertWorkspaceAction(member(), workspace(), action)).not.toThrow();
  });

  it('nega saída ao proprietário, mas permite suas capacidades administrativas', () => {
    const owner = new Membership({
      accountId: 'owner-a', role: MembershipRole.ADMINISTRATOR,
    }, workspace());
    expect(() => assertWorkspaceAction(owner, workspace(), WorkspaceAction.LEAVE_WORKSPACE)).toThrow(DomainError);
    for (const action of [...sharedActions, ...administratorActions]) {
      expect(() => assertWorkspaceAction(owner, workspace(), action)).not.toThrow();
    }
  });

  it.each([MembershipRole.ADMINISTRATOR, MembershipRole.OPERATOR])(
    'nega todas as ações ao vínculo encerrado: %s',
    (role) => {
      for (const action of Object.values(WorkspaceAction)) {
        expect(() => assertWorkspaceAction(
          member(role, MembershipStatus.ENDED), workspace(), action,
        )).toThrow(DomainError);
      }
    },
  );

  it('falha fechado em workspace divergente, ação desconhecida ou papel corrompido', () => {
    const other = new Workspace({
      id: 'workspace-b', ownerAccountId: 'owner-b', alertEmail: 'other@example.test',
    });
    expect(() => assertWorkspaceAction(
      member(), other, WorkspaceAction.READ_INVENTORY,
    )).toThrow(DomainError);
    expect(() => assertWorkspaceAction(
      member(), workspace(), 'UNKNOWN' as WorkspaceAction,
    )).toThrow(DomainError);
    // Simula uma instância corrompida devolvida por um adaptador, não um papel aceito pelo construtor.
    const corrupted = Object.assign(Object.create(Membership.prototype) as Membership, member(), {
      role: 'OWNER',
    });
    expect(() => assertWorkspaceAction(
      corrupted, workspace(), WorkspaceAction.READ_INVENTORY,
    )).toThrow(DomainError);
  });
});
