import assert from "node:assert/strict";

/** Package contract of @gravity-ui/graph-duplicate-block. See scripts/package-contract/README.md. */
export default {
  // No ./styles.css export: the package publishes no stylesheet, so none may be packed.
  exports: {
    ".": {
      types: "./build/index.d.ts",
      import: "./build/index.js",
      default: "./build/index.js",
    },
  },
  packedFiles: { forbiddenPatterns: [/(?:^|\/)(?:playwright|docs)(?:\/|$)/] },
  mustNotResolve: ["react", "react-dom", "@gravity-ui/graph-react", "elkjs"],
  probes: [
    {
      label: "Importing the duplicate block entrypoint with Node ESM",
      source: `
        const { DuplicateBlockLayer } = await import("@gravity-ui/graph-duplicate-block");
        const core = await import("@gravity-ui/graph");
        if (Object.getPrototypeOf(DuplicateBlockLayer.prototype) !== core.Layer.prototype) {
          throw new Error("Duplicate block package has a second core Layer class.");
        }
        if ("NewBlockLayer" in core || "DuplicateBlockLayer" in core) {
          throw new Error("Core still exports the extracted block duplication layer.");
        }
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
    assert.deepEqual(manifest.dependencies ?? {}, {});
    assert.deepEqual(manifest.optionalDependencies ?? {}, {});
    await assertMissing("build/styles.css", "The package ships an unused stylesheet.");
  },
};
