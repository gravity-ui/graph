module.exports = {
  testPathIgnorePatterns: ["/node_modules/", "/build/"],
  testEnvironment: "jsdom",
  transform: { "^.+\\.(t|j)sx?$": "@swc/jest" },
};
