import baseConfig from "@gravity-ui/eslint-config";
import importOrderConfig from "@gravity-ui/eslint-config/import-order";
import prettierConfig from "@gravity-ui/eslint-config/prettier";
import globals from "globals";

// The previous eslintrc setup disabled JSDoc validation (valid-jsdoc: off). Config 4.x enables
// eslint-plugin-jsdoc; keep JSDoc comments unvalidated to preserve that intent.
const jsdocRulesOff = Object.fromEntries(
  baseConfig
    .flatMap((config) => Object.keys(config.rules ?? {}))
    .filter((rule) => rule.startsWith("jsdoc/"))
    .map((rule) => [rule, "off"])
);

export default [
  {
    ignores: ["node_modules/", "storybook-static/"],
  },
  ...baseConfig,
  ...importOrderConfig,
  ...prettierConfig,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ...jsdocRulesOff,
      "@typescript-eslint/member-ordering": "off",
      "@typescript-eslint/no-shadow": "off",
      "@typescript-eslint/parameter-properties": "off",
      "guard-for-in": "off",
      "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
      "no-console": "off",
      "no-negated-condition": "off",
      "no-param-reassign": "off",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "lodash",
              message:
                "Import from lodash leads to bundle pollute. Use import from submodules, for example 'lodash/isEqual'.",
            },
          ],
        },
      ],
      "no-return-assign": "off",
    },
  },
  {
    files: ["**/*.ts", "**/*.mts", "**/*.cts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/explicit-member-accessibility": [
        "error",
        {
          accessibility: "explicit",
          overrides: {
            accessors: "explicit",
            constructors: "no-public",
            methods: "explicit",
            properties: "off",
            parameterProperties: "explicit",
          },
        },
      ],
      "no-bitwise": ["error", { int32Hint: true }],
    },
  },
];
