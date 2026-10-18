import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
  // The browser scenario drives the graph through the published page objects.
  workspaceDependencies: ["graph-playwright"],
  dependencies: ["react", "react-dom"],
  devDependencies: ["@types/react", "@types/react-dom"],
  probes: [
    {
      label: "Importing the React entrypoint with Node ESM",
      source: `
        const react = await import("@gravity-ui/graph-react");
        for (const extracted of ["useElk", "MultipointConnection"]) {
          if (extracted in react) throw new Error(\`React still exports the extracted \${extracted}.\`);
        }
        if (typeof react.GraphCanvas !== "function") throw new Error("React entrypoint does not export GraphCanvas.");
      `,
    },
  ],
  typecheckConfigs: ["app/tsconfig.json", "app/tsconfig.non-strict.json", "types/node-esm/tsconfig.json"],
  entryPoint: "app/app.tsx",

  async checkArtifact({ manifest, styles, generatedFiles }) {
    assert.equal(manifest.peerDependencies?.react, "^18.0.0");
    assert.equal(manifest.peerDependencies?.["react-dom"], "^18.0.0");
    assert.equal(manifest.peerDependenciesMeta?.react?.optional, undefined);
    assert.equal(manifest.peerDependenciesMeta?.["react-dom"]?.optional, undefined);
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      assert.equal(manifest[field]?.elkjs, undefined, `React must not depend on elkjs through ${field}.`);
    }
    for (const file of generatedFiles) {
      assert.doesNotMatch(await readFile(file, "utf8"), /elkjs|useElk/, `React artifact ${file} still references ELK.`);
    }
    assert.match(styles, /\.graph-wrapper\b/);
    assert.match(styles, /\.graph-block-container\b/);
    assert.match(styles, /\.graph-block-anchor\b/);
    assert.doesNotMatch(styles, /\.devtools-ruler-bg\b/);
  },
};
