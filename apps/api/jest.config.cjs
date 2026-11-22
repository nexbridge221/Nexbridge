/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  transform: {
    "^.+\\.(t|j)sx?$": ["@swc/jest", { jsc: { target: "es2022", parser: { syntax: "typescript" } }, module: { type: "commonjs" } }],
  },
  transformIgnorePatterns: ["/node_modules/(?!@nexbridge)"],
  setupFiles: ["<rootDir>/src/test/env.ts"],
  testTimeout: 30000,
};
