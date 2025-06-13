export default {
  preset: 'default',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.mjs'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  testMatch: [
    '**/tests/**/*.test.mjs',
    '**/__tests__/**/*.mjs',
    '**/?(*.)+(spec|test).mjs'
  ],
  collectCoverageFrom: [
    'src/**/*.mjs',
    '!src/tests/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  transform: {}
};