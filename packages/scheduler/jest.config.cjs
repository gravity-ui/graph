module.exports = {
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "/build/"],
  transformIgnorePatterns: [],
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
};
