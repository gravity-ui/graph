import assert from "node:assert/strict";
import path from "node:path";

/** Package contract of @gravity-ui/graph-layered. See scripts/package-contract/README.md. */
export default {
  exports: {
    ".": {
      types: "./build/index.d.ts",
      import: "./build/index.js",
      default: "./build/index.js",
    },
    "./react": {
      types: "./build/react/index.d.ts",
      import: "./build/react/index.js",
      default: "./build/react/index.js",
    },
  },
  styles: false,
  packedFiles: {
    runtimeFiles: ["build/react/index.js"],
    requiredFiles: ["build/react/index.js", "build/react/index.d.ts"],
    forbiddenPatterns: [/(?:^|\/)(?:playwright|docs)(?:\/|$)/],
  },
  attw: [
    { entrypoint: ".", profile: "esm-only" },
    { entrypoint: "./react", profile: "esm-only" },
  ],
  // The hook needs React, but neither React DOM nor @gravity-ui/graph-react.
  dependencies: ["react"],
  devDependencies: ["@types/react"],
  mustNotResolve: ["react-dom", "@gravity-ui/graph-react", "elkjs"],
  probes: [
    {
      label: "Running the layered layout with Node ESM",
      source: `
        const { computeLevels, layoutGraph, layeredConverter } = await import("@gravity-ui/graph-layered");
        const levels = computeLevels(["a", "b"], [{ sourceBlockId: "a", targetBlockId: "b" }]);
        if (levels.get("b") !== 1) throw new Error("computeLevels did not assign the successor to level 1.");
        const layout = await layoutGraph({ nodes: [{ id: "a", level: 0 }, { id: "b", level: 1 }], edges: [{ from: "a", to: "b" }] });
        const result = layeredConverter({
          layoutResult: layout,
          connections: [{ id: "edge", sourceBlockId: "a", targetBlockId: "b" }],
          blockSizes: new Map(),
        });
        if (!(result.blocks.b.x > result.blocks.a.x)) throw new Error("Layered layout did not place levels left to right.");
        if (result.edges.edge?.points.length !== 2) throw new Error("Layered converter did not return connection points.");
      `,
    },
    {
      label: "Importing the layered React entrypoint with Node ESM",
      source: `
        const { useLayeredLayout } = await import("@gravity-ui/graph-layered/react");
        if (typeof useLayeredLayout !== "function") throw new Error("Layered React entrypoint does not export useLayeredLayout.");
      `,
    },
  ],
  typecheckConfigs: [
    "app/tsconfig.json",
    "app/tsconfig.non-strict.json",
    "types/node-esm/tsconfig.json",
    "types/node-esm/tsconfig.non-strict.json",
    "types/react-node-esm/tsconfig.json",
    "types/react-node-esm/tsconfig.non-strict.json",
  ],
  entryPoint: "app/app.ts",

  // Core is a type-only peer and React is optional: only the ./react entry may load React, and nothing loads core.
  async checkArtifact({ manifest, installedRoot, generatedFiles, readText, assertMissing }) {
    assert.deepEqual(Object.keys(manifest.peerDependencies).sort(), ["@gravity-ui/graph", "react"]);
    assert.equal(manifest.peerDependencies.react, "^18.0.0");
    assert.deepEqual(manifest.peerDependenciesMeta, { react: { optional: true } });
    assert.deepEqual(manifest.dependencies ?? {}, {});
    assert.deepEqual(manifest.optionalDependencies ?? {}, {});
    await assertMissing("build/styles.css", "Layered must not ship styles.");
    for (const file of generatedFiles.filter((generated) => generated.endsWith(".js"))) {
      const relativePath = path.relative(installedRoot, file);
      const contents = await readText(relativePath);
      assert.doesNotMatch(contents, /["']@gravity-ui\/graph["']/, `Layered runtime file ${file} must not import core.`);
      if (relativePath !== path.join("build", "react", "index.js")) {
        assert.doesNotMatch(contents, /["']react(?:-dom)?(?:\/[^"']*)?["']/, `Layered file ${file} must not import React.`);
      }
    }
  },
};
