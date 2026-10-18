import assert from "node:assert/strict";

const addonExports = {
  ".": {
    types: "./build/index.d.ts",
    import: "./build/index.js",
    default: "./build/index.js",
  },
  "./styles.css": "./build/styles.css",
};

/** Package contract of @gravity-ui/graph-react. See scripts/package-contract/README.md. */
export default {
  exports: addonExports,
  packedFiles: { forbiddenPatterns: [/(?:^|\/)(?:playwright|docs)(?:\/|$)/] },
  dependencies: ["react", "react-dom"],
  devDependencies: ["@types/react", "@types/react-dom"],
  probes: [
    {
      label: "Importing the React entrypoint with Node ESM",
      source: `
        const react = await import("@gravity-ui/graph-react");
        const core = await import("@gravity-ui/graph");
        if (react.MultipointConnection !== core.MultipointConnection) throw new Error("React has a second core connection class.");
        if (typeof react.GraphCanvas !== "function") throw new Error("React entrypoint does not export GraphCanvas.");
        if ("useLayeredLayout" in react) throw new Error("React still exports the extracted layered hook.");
      `,
    },
  ],
  typecheckConfigs: ["app/tsconfig.json", "app/tsconfig.non-strict.json", "types/node-esm/tsconfig.json"],
  entryPoint: "app/app.tsx",

  async checkArtifact({ manifest, styles, assertMissing }) {
    assert.equal(manifest.peerDependencies?.react, "^18.0.0");
    assert.equal(manifest.peerDependencies?.["react-dom"], "^18.0.0");
    assert.equal(manifest.peerDependenciesMeta?.react?.optional, undefined);
    assert.equal(manifest.peerDependenciesMeta?.["react-dom"]?.optional, undefined);
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      assert.equal(manifest[field]?.["@gravity-ui/graph-layered"], undefined, "React must not depend on layered.");
    }
    await assertMissing("build/layered", "React still ships the layered hook.");
    assert.match(styles, /\.graph-wrapper\b/);
    assert.match(styles, /\.graph-block-container\b/);
    assert.match(styles, /\.graph-block-anchor\b/);
    assert.doesNotMatch(styles, /\.devtools-ruler-bg\b/);
  },
};
