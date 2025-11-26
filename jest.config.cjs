const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './'
});

/** @type {import('jest').Config} */
const customJestConfig = {
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(test).[jt]s?(x)']
};

module.exports = createJestConfig(customJestConfig);

