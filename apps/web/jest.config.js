// web/jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@mindspace/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
    '^(\\./.*)\\.js$': '$1',
  },
};
