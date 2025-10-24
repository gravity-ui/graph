module.exports = {
  extends: "../../.eslintrc",
  parserOptions: {
    project: "./tsconfig.dev.json",
    tsconfigRootDir: __dirname,
  },
  overrides: [
    {
      files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "import/no-extraneous-dependencies": "off",
      },
    },
  ],
};

