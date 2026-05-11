import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^ioredis$': '<rootDir>/node_modules/ioredis-mock',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};

export default config;
