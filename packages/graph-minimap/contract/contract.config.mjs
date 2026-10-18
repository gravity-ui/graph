import assert from "node:assert/strict";

const addonExports = {
  ".": {
    types: "./build/index.d.ts",
    import: "./build/index.js",
    default: "./build/index.js",
  },
  "./styles.css": "./build/styles.css",
};

/** Package contract of @gravity-ui/graph-minimap. See scripts/package-contract/README.md. */
export default {
  exports: addonExports,
  packedFiles: { forbiddenPatterns: [/(?:^|\/)(?:playwright|docs)(?:\/|$)/] },
  mustNotResolve: ["react", "react-dom", "@gravity-ui/graph-react", "elkjs"],
  probes: [
    {
      label: "Importing the minimap entrypoint with Node ESM",
      source: `
        const { MiniMapLayer } = await import("@gravity-ui/graph-minimap");
        const { Layer } = await import("@gravity-ui/graph");
        if (Object.getPrototypeOf(MiniMapLayer.prototype) !== Layer.prototype) {
          throw new Error("Minimap has a second core Layer class.");
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

  checkArtifact({ manifest, styles }) {
    assert.deepEqual(Object.keys(manifest.peerDependencies), ["@gravity-ui/graph"]);
    assert.deepEqual(manifest.dependencies ?? {}, {});
    assert.deepEqual(manifest.optionalDependencies ?? {}, {});
    assert.match(styles, /\.graph-minimap/);
    assert.match(styles, /background:\s*lightgr[ae]y/);
  },
};
