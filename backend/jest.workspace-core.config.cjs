const base = require('./jest.config.cjs');

// Isolated core tests: no application bootstrap, dotenv setup, database or JWT.
module.exports = {
  ...base,
  setupFiles: [],
  setupFilesAfterEnv: [],
  testMatch: ['<rootDir>/tests/unit/workspace-membership-*.test.ts'],
  cache: false,
  collectCoverageFrom: [
    '<rootDir>/src/domain/entities/PersonalAccount.ts',
    '<rootDir>/src/domain/entities/Workspace.ts',
    '<rootDir>/src/domain/entities/Membership.ts',
    '<rootDir>/src/domain/enums/MembershipRole.ts',
    '<rootDir>/src/domain/enums/MembershipStatus.ts',
    '<rootDir>/src/domain/enums/WorkspaceAction.ts',
    '<rootDir>/src/domain/policies/WorkspaceAuthorization.ts',
    '<rootDir>/src/domain/validation/WorkspaceValidation.ts',
    '<rootDir>/src/application/security/TrustedAccountContext.ts',
    '<rootDir>/src/application/security/WorkspaceAccess.ts',
    '<rootDir>/src/application/use-cases/BootstrapWorkspaceUseCase.ts',
    '<rootDir>/src/application/use-cases/AddWorkspaceMemberUseCase.ts',
    '<rootDir>/src/application/use-cases/ChangeMemberRoleUseCase.ts',
    '<rootDir>/src/application/use-cases/EndMembershipUseCase.ts',
    '<rootDir>/src/application/use-cases/AuthorizeWorkspaceActionUseCase.ts',
  ],
};
