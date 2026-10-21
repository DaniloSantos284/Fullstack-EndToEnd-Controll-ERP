const { createDefaultPreset } = require('ts-jest');

// Define o fuso antes de o Jest iniciar seus workers.
process.env.TZ = 'UTC';

/** @type {import('jest').Config} */
module.exports = {
  ...createDefaultPreset({
    tsconfig: '<rootDir>/tsconfig.test.json',
  }),
  rootDir: __dirname,
  cacheDirectory: '<rootDir>/.jest-cache',
  testEnvironment: 'node',
  injectGlobals: false,
  roots: ['<rootDir>/tests'],
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.ts',
    '<rootDir>/tests/unit/**/*.spec.ts',
    '<rootDir>/tests/http/**/*.test.ts',
    '<rootDir>/tests/http/**/*.spec.ts',
  ],
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup-jest.ts'],
  clearMocks: true,
  restoreMocks: true,
  coverageProvider: 'v8',
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/**/*.d.ts',
    '!<rootDir>/src/server.ts',
  ],
};
