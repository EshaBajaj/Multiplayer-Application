export default {
  rootDir: '../',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testEnvironment: 'node',
  moduleDirectories: ['node_modules', '<rootDir>/backend/node_modules'],
  transform: {},
  verbose: true,
  testTimeout: 30000,
};
