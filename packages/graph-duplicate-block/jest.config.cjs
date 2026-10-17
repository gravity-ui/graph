module.exports = {
  testPathIgnorePatterns: ["/node_modules/", "/build/"],
  testEnvironment: "node",
  transform: { "^.+\\.(t|j)sx?$": "@swc/jest" },
};
