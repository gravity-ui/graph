import assert from "node:assert/strict";

/** Package contract of @gravity-ui/graph-connection-editing. See scripts/package-contract/README.md. */
export default {
  // No stylesheet: the package only exports its entrypoint.
  exports: {
    ".": {
      types: "./build/index.d.ts",
      import: "./build/index.js",
      default: "./build/index.js",
    },
  },
  packedFiles: { forbiddenPatterns: [/(?:^|\/)(?:playwright|docs)(?:\/|$)/] },
  workspaceDependencies: ["graph-playwright"],
  mustNotResolve: ["react", "react-dom", "@gravity-ui/graph-react", "elkjs"],
  probes: [
    {
      label: "Importing the connection editing entrypoint with Node ESM",
      source: `
        const { ConnectionEditingLayer } = await import("@gravity-ui/graph-connection-editing");
        const { Layer } = await import("@gravity-ui/graph");
        if (Object.getPrototypeOf(ConnectionEditingLayer.prototype) !== Layer.prototype) {
          throw new Error("ConnectionEditingLayer has a second core Layer class.");
        }
        if (ConnectionEditingLayer.PortMetaKey !== Symbol.for("PortConnectionLayer.PortMeta")) {
          throw new Error("ConnectionEditingLayer port meta key changed.");
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
    // rbush is the package's own runtime dependency, not resolved through core.
    assert.deepEqual(Object.keys(manifest.dependencies ?? {}), ["rbush"]);
    assert.deepEqual(manifest.optionalDependencies ?? {}, {});
    await assertMissing("build/styles.css", "Connection editing ships no styles.");
  },
};
