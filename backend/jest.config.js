module.exports = {
  rootDir: __dirname,
  roots: ['<rootDir>', '<rootDir>/../api'],
  testEnvironment: 'node',
  // supertest and jest live in backend/node_modules; tests under ../api
  // resolve up to the repo root, so point module resolution back here.
  moduleDirectories: ['node_modules', '<rootDir>/node_modules'],
};
