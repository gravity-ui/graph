import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const reactPackages = ["react", "react-dom", "@types/react", "@types/react-dom"];
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Package contract of @gravity-ui/graph. See scripts/package-contract/README.md. */
export default {
  exports: {
    ".": {
      types: "./build/index.d.ts",
      import: "./build/index.js",
      default: "./build/index.js",
    },
    "./styles.css": "./build/styles.css",
  },
  packedFiles: {
    allowedPatterns: [/^build\/docs\/.+\.md$/],
    forbiddenPatterns: [/(?:^|\/)(?:react-components|playwright|plugins\/(?:minimap|devtools|layered|cssVariables))(?:\/|$)/, /\.d\.cts$/],
    requiredFiles: ["build/docs/INDEX.md"],
  },
  // The browser scenario drives the graph through the published page objects.
  workspaceDependencies: ["graph-playwright"],
  mustNotResolve: ["react", "react-dom", "@gravity-ui/graph-react", "elkjs"],
  probes: [
    {
      label: "Importing the root entrypoint with Node ESM",
      source: `
        const graph = await import("@gravity-ui/graph");
        if ("MiniMapLayer" in graph) throw new Error("Core still exports the extracted minimap.");
        if ("DevToolsLayer" in graph || "DEFAULT_DEVTOOLS_LAYER_PROPS" in graph) {
          throw new Error("Core still exports the extracted DevTools.");
        }
        if (["layoutGraph", "layeredConverter", "computeLevels"].some((name) => name in graph)) {
          throw new Error("Core still exports the extracted layered layout.");
        }
        if ("CSSVariablesLayer" in graph || "CSS_VARIABLE_MAPPINGS" in graph) {
          throw new Error("Core still exports the extracted CSS variables layer.");
        }
        if (typeof graph.Graph !== "function") throw new Error("Root entrypoint does not export Graph.");
        if (graph.GRAPH_INSTANCE_SYMBOL_KEY !== "@gravity-ui/graph/instance") {
          throw new Error("Root entrypoint does not export the public graph instance key.");
        }
        if (graph.ESchedulerPriority?.LOWEST !== 4) {
          throw new Error("Root entrypoint does not export ESchedulerPriority.");
        }
        for (const schedulerFunction of ["schedule", "debounce", "throttle"]) {
          if (typeof graph[schedulerFunction] !== "function") {
            throw new Error(\`Root entrypoint does not export \${schedulerFunction}.\`);
          }
        }
        const { deepStrictEqual } = await import("node:assert/strict");
        deepStrictEqual(graph.Point(-1.5, 0), { x: -1.5, y: 0 });
        deepStrictEqual(graph.Rect(-1.5, 0, 300, 200.5), { x: -1.5, y: 0, width: 300, height: 200.5 });
      `,
    },
    {
      label: "Confirming the removed React subpath is not exported",
      source: `
        try {
          await import("@gravity-ui/graph/react");
          throw new Error("The removed React subpath is still exported.");
        } catch (error) {
          if (error?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
        }
      `,
    },
    {
      label: "Confirming the removed Playwright subpath is not exported",
      source: `
        try {
          await import("@gravity-ui/graph/playwright");
          throw new Error("The removed Playwright subpath is still exported; use @gravity-ui/graph-playwright.");
        } catch (error) {
          if (error?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
        }
      `,
    },
    {
      label: "Verifying consumer-side @preact/signals-core interoperability",
      source: `
        const [{ SingleSelectionBucket }, { effect }] = await Promise.all([
          import("@gravity-ui/graph"),
          import("@preact/signals-core"),
        ]);
        const bucket = new SingleSelectionBucket("blocks");
        let runs = 0;
        const dispose = effect(() => {
          bucket.$selected.value;
          runs += 1;
        });
        bucket.select(["block-1"]);
        dispose();
        if (runs !== 2) {
          throw new Error(
            \`Graph signals and the consumer's @preact/signals-core runtime are disconnected (effect ran \${runs} times).\`,
          );
        }
      `,
    },
  ],
  typecheckConfigs: ["app/tsconfig.json", "app/tsconfig.non-strict.json"],
  entryPoint: "app/app.ts",

  async checkArtifact({ manifest, styles, generatedFiles, readText, assertMissing, otherWorkspacePackages }) {
    assert.equal(manifest.peerDependencies, undefined);
    assert.equal(manifest.peerDependenciesMeta, undefined);
    await assertMissing("build/playwright", "Core still ships the Playwright page objects.");

    const forbidden = [...reactPackages, ...otherWorkspacePackages, "@playwright/test", "elkjs", "style-observer"];
    for (const field of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "peerDependenciesMeta",
      "optionalDependencies",
    ]) {
      for (const name of forbidden) {
        assert.equal(manifest[field]?.[name], undefined, `Core must not depend on ${name} through ${field}.`);
      }
    }

    assert.match(styles, /\.layer\b/);
    assert.doesNotMatch(styles, /\.devtools-ruler-bg\b/);
    assert.doesNotMatch(styles, /\.(?:graph-wrapper|graph-block-container|graph-block-anchor)\b/);
    await assertMissing("build/plugins/minimap", "Core still ships minimap declarations.");
    await assertMissing("build/plugins/devtools", "Core still ships DevTools declarations.");
    await assertMissing("build/plugins/layered", "Core still ships layered layout declarations.");
    await assertMissing("build/plugins/cssVariables", "Core still ships CSS variables declarations.");
    const entry = await readText("build/index.js");
    assert.doesNotMatch(entry, /graph-minimap/);
    assert.doesNotMatch(entry, /devtools-layer/);

    const forbiddenSpecifiers = [
      "react(?:-dom)?(?:/[^\"']*)?",
      escape("@playwright/test"),
      "style-observer",
      ...otherWorkspacePackages.map(escape),
    ].join("|");
    const importCall = "(?:from\\s+|import\\s*\\(|require\\s*\\()";
    const importedPackage = new RegExp(`${importCall}["'](?:${forbiddenSpecifiers})["']`);
    for (const file of generatedFiles) {
      assert.doesNotMatch(
        await readFile(file, "utf8"),
        importedPackage,
        `${file} imports a package core must not use.`
      );
    }
  },
};
