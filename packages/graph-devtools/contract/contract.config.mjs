import assert from "node:assert/strict";

const addonExports = {
  ".": {
    types: "./build/index.d.ts",
    import: "./build/index.js",
    default: "./build/index.js",
  },
  "./styles.css": "./build/styles.css",
};

/** Package contract of @gravity-ui/graph-devtools. See scripts/package-contract/README.md. */
export default {
  exports: addonExports,
  packedFiles: { forbiddenPatterns: [/(?:^|\/)(?:playwright|docs)(?:\/|$)/] },
  // The browser scenario drives the graph through the published page objects.
  workspaceDependencies: ["graph-playwright"],
  mustNotResolve: ["react", "react-dom", "@gravity-ui/graph-react", "elkjs"],
  probes: [
    {
      label: "Importing the DevTools entrypoint with Node ESM",
      source: `
        const { DevToolsLayer, DEFAULT_DEVTOOLS_LAYER_PROPS } = await import("@gravity-ui/graph-devtools");
        const { Layer } = await import("@gravity-ui/graph");
        if (Object.getPrototypeOf(DevToolsLayer.prototype) !== Layer.prototype) {
          throw new Error("DevTools has a second core Layer class.");
        }
        if (DEFAULT_DEVTOOLS_LAYER_PROPS.rulerSize !== 25) throw new Error("DevTools defaults are missing or changed.");
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
    assert.match(styles, /\.devtools-ruler-bg-h\b/);
    assert.match(styles, /\.devtools-ruler-bg-v\b/);
    assert.doesNotMatch(styles, /\.(?:layer|graph-wrapper|graph-block-container|graph-block-anchor)\b/);
  },
};
