import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const reactEntry = {
  types: "./build/react/index.d.ts",
  import: "./build/react/index.js",
  default: "./build/react/index.js",
};

/** Package contract of @gravity-ui/graph-elk. See scripts/package-contract/README.md. */
export default {
  exports: {
    ".": {
      types: "./build/index.d.ts",
      import: "./build/index.js",
      default: "./build/index.js",
    },
    "./react": reactEntry,
  },
  // Files named in `exports` (including build/react/*) are required and allowed by the runner.
  packedFiles: {
    forbiddenPatterns: [/(?:^|\/)(?:playwright|docs)(?:\/|$)/],
  },
  attw: [
    { entrypoint: ".", profile: "esm-only" },
    { entrypoint: "./react", profile: "esm-only" },
  ],
  workspaceDependencies: ["graph-playwright"],
  dependencies: ["elkjs", "react", "react-dom"],
  devDependencies: ["@types/react", "@types/react-dom"],
  // The hook needs React only; the ELK consumer works without the React package.
  mustNotResolve: ["@gravity-ui/graph-react"],
  probes: [
    {
      label: "Laying out a graph with the ELK entrypoints and the installed elkjs in Node ESM",
      source: `
        const { elkConverter } = await import("@gravity-ui/graph-elk");
        const { useElk } = await import("@gravity-ui/graph-elk/react");
        const { default: ELK } = await import("elkjs");
        if (typeof useElk !== "function") throw new Error("ELK React entrypoint does not export useElk.");
        const laidOut = await new ELK().layout({
          id: "root",
          layoutOptions: { "elk.algorithm": "layered", "elk.direction": "RIGHT" },
          children: [
            { id: "a", width: 100, height: 40 },
            { id: "b", width: 100, height: 40 },
          ],
          edges: [{ id: "a-b", sources: ["a"], targets: ["b"] }],
        });
        const { blocks, edges } = elkConverter(laidOut);
        if (!(blocks.b.x > blocks.a.x)) throw new Error("ELK result was not converted to block positions.");
        if (!(edges["a-b"].points.length >= 2)) throw new Error("ELK result was not converted to connection points.");
      `,
    },
  ],
  typecheckConfigs: ["app/tsconfig.json", "app/tsconfig.non-strict.json", "types/node-esm/tsconfig.json"],
  entryPoint: "app/app.tsx",

  async checkArtifact({ manifest, generatedFiles, readText }) {
    assert.deepEqual(Object.keys(manifest.peerDependencies).sort(), ["@gravity-ui/graph", "elkjs", "react"]);
    assert.deepEqual(manifest.peerDependenciesMeta, { react: { optional: true } });
    assert.equal(manifest.peerDependencies.elkjs, "^0.9.3");
    assert.deepEqual(manifest.dependencies ?? {}, {});
    assert.deepEqual(manifest.optionalDependencies ?? {}, {});
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies", "devDependencies"]) {
      assert.equal(
        manifest[field]?.["@gravity-ui/graph-react"],
        undefined,
        `ELK must not depend on graph-react (${field}).`
      );
    }
    assert.match(
      await readText("build/react/index.js"),
      /from\s*["']react["']/,
      "The /react entrypoint must import React."
    );
    for (const file of generatedFiles) {
      const contents = await readFile(file, "utf8");
      if (file.endsWith(".js")) {
        // elkjs and core are used for types only; the application creates the ELK instance.
        assert.doesNotMatch(contents, /["']elkjs(?:\/[^"']*)?["']/, `${file} must not import elkjs at runtime.`);
        assert.doesNotMatch(contents, /["']@gravity-ui\/graph["']/, `${file} must not import core at runtime.`);
      }
      if (!file.includes(`${path.sep}build${path.sep}react${path.sep}`)) {
        assert.doesNotMatch(contents, /["']react(?:-dom)?(?:\/[^"']*)?["']/, `${file} must not reference React.`);
      }
    }
  },
};
