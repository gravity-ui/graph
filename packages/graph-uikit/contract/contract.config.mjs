import assert from "node:assert/strict";

/** Package contract of @gravity-ui/graph-uikit. See scripts/package-contract/README.md. */
export default {
  exports: {
    ".": {
      types: "./build/index.d.ts",
      import: "./build/index.js",
      default: "./build/index.js",
    },
    "./styles.css": "./build/styles.css",
  },
  packedFiles: { forbiddenPatterns: [/(?:^|\/)(?:playwright|docs|test-utils)(?:\/|$)/] },
  // The browser scenario drives the graph through the published page objects.
  workspaceDependencies: ["graph-react", "graph-connection-editing", "graph-playwright"],
  dependencies: ["react", "react-dom", "@gravity-ui/uikit"],
  devDependencies: ["@types/react", "@types/react-dom"],
  mustNotResolve: ["elkjs", "@gravity-ui/graph-layered"],
  // No Node runtime probe: uikit's ESM build imports .css files, which plain Node cannot load.
  probes: [],
  // No Node16 (types/node-esm) fixture: the shared tsconfig checks library declarations (skipLibCheck: false), and
  // under Node16 resolution @gravity-ui/uikit's own declarations fail to compile: components/Slider/types.d.ts
  // (TS2307 "rc-slider/lib/Handles/Handle") and components/utils/common.d.ts (TS2307 "..", a directory import).
  // Node16 resolution of this package's own entrypoint is covered by ATTW (esm-only) on the tarball.
  typecheckConfigs: ["app/tsconfig.json", "app/tsconfig.non-strict.json"],
  entryPoint: "app/app.tsx",

  async checkArtifact({ manifest, styles }) {
    assert.deepEqual(Object.keys(manifest.peerDependencies).sort(), [
      "@gravity-ui/graph",
      "@gravity-ui/graph-connection-editing",
      "@gravity-ui/graph-react",
      "@gravity-ui/uikit",
      "react",
      "react-dom",
    ]);
    assert.deepEqual(Object.keys(manifest.dependencies ?? {}), ["@preact/signals-core"]);
    assert.deepEqual(manifest.optionalDependencies ?? {}, {});
    assert.match(styles, /\.graph-uikit-block__surface\b/);
    assert.match(styles, /\.graph-uikit-tooltip\b/);
  },
};
