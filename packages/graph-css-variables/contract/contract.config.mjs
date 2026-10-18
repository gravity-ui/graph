import assert from "node:assert/strict";

/** Package contract of @gravity-ui/graph-css-variables. See scripts/package-contract/README.md. */
export default {
  exports: {
    ".": {
      types: "./build/index.d.ts",
      import: "./build/index.js",
      default: "./build/index.js",
    },
  },
  packedFiles: { forbiddenPatterns: [/(?:^|\/)(?:playwright|docs)(?:\/|$)/] },
  // The browser scenario drives the graph through the published page objects.
  workspaceDependencies: ["graph-playwright"],
  mustNotResolve: ["react", "react-dom", "@gravity-ui/graph-react", "elkjs"],
  probes: [
    {
      label: "Importing the CSS variables entrypoint with Node ESM",
      source: `
        const { CSSVariablesLayer, mapCSSChangesToGraphColors } = await import("@gravity-ui/graph-css-variables");
        const { Layer } = await import("@gravity-ui/graph");
        if (Object.getPrototypeOf(CSSVariablesLayer.prototype) !== Layer.prototype) {
          throw new Error("CSSVariablesLayer has a second core Layer class.");
        }
        const { deepStrictEqual } = await import("node:assert/strict");
        deepStrictEqual(mapCSSChangesToGraphColors([{ name: "--graph-block-background", value: "red" }]), {
          block: { background: "red" },
        });
      `,
    },
  ],
  typecheckConfigs: [
    "app/tsconfig.json",
    "app/tsconfig.non-strict.json",
    "types/node-esm/tsconfig.json",
    "types/node-esm/tsconfig.non-strict.json",
  ],
  entryPoint: "app/app.ts",

  async checkArtifact({ manifest, assertMissing }) {
    assert.deepEqual(Object.keys(manifest.peerDependencies), ["@gravity-ui/graph"]);
    assert.deepEqual(Object.keys(manifest.dependencies ?? {}).sort(), ["lodash", "style-observer"]);
    assert.deepEqual(manifest.optionalDependencies ?? {}, {});
    await assertMissing("build/styles.css", "CSS variables must not ship a stylesheet.");
  },
};
