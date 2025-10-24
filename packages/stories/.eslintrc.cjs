module.exports = {
  extends: "../../.eslintrc",
  parserOptions: {
    project: "./tsconfig.dev.json",
    tsconfigRootDir: __dirname,
  },
  rules: {
    "no-console": "off",
  },
};

