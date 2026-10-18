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
    "./playwright": {
      import: {
        types: "./build/playwright/index.d.ts",
        default: "./build/playwright/index.js",
      },
      require: {
        types: "./build/playwright/index.d.cts",
        default: "./build/playwright/index.cjs",
      },
      default: "./build/playwright/index.js",
    },
    "./styles.css": "./build/styles.css",
  },
  typesVersions: {
    "*": {
      playwright: ["build/playwright/index.d.ts"],
    },
  },
  packedFiles: {
    runtimeFiles: ["build/playwright/index.js", "build/playwright/index.cjs", "build/playwright/index.d.cts"],
    allowedPatterns: [/^build\/docs\/.+\.md$/],
    forbiddenPatterns: [/(?:^|\/)(?:react-components|plugins\/(?:minimap|devtools))(?:\/|$)/],
    requiredFiles: [
      "build/playwright/index.js",
      "build/playwright/index.d.ts",
      "build/playwright/index.cjs",
      "build/playwright/index.d.cts",
      "build/docs/INDEX.md",
    ],
  },
  attw: [
    { entrypoint: ".", profile: "esm-only" },
    { entrypoint: "./playwright", profile: "node16" },
  ],
  mustNotResolve: ["react", "react-dom", "@gravity-ui/graph-react", "elkjs"],
  probes: [
    {
      label: "Importing the root entrypoint with Node ESM",
      source: `
        const graph = await import("@gravity-ui/graph");
        if ("MiniMapLayer" in graph) throw new Error("Core still exports the extracted minimap.");
        if ("ConnectionLayer" in graph || "PortConnectionLayer" in graph) {
          throw new Error("Core still exports the extracted connection layers.");
        }
        if ("DevToolsLayer" in graph || "DEFAULT_DEVTOOLS_LAYER_PROPS" in graph) {
          throw new Error("Core still exports the extracted DevTools.");
        }
        if (typeof graph.Graph !== "function") throw new Error("Root entrypoint does not export Graph.");
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
      label: "Importing the Playwright entrypoint with Node ESM",
      source: `
        const playwright = await import("@gravity-ui/graph/playwright");
        if (typeof playwright.GraphPO !== "function") throw new Error("Playwright entrypoint does not export GraphPO.");
      `,
    },
    {
      label: "Requiring the Playwright entrypoint with Node CommonJS",
      type: "commonjs",
      source: `
        const playwright = require("@gravity-ui/graph/playwright");
        if (typeof playwright.GraphPO !== "function") {
          throw new Error("Playwright CommonJS entrypoint does not export GraphPO.");
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
  typecheckConfigs: [
    "app/tsconfig.json",
    "app/tsconfig.non-strict.json",
    "types/playwright-bundler/tsconfig.json",
    "types/node-cjs-playwright/tsconfig.json",
  ],
  entryPoint: "app/app.ts",

  async checkArtifact({ manifest, styles, generatedFiles, readText, assertMissing, otherWorkspacePackages }) {
    assert.equal(manifest.peerDependencies?.["@playwright/test"], ">=1.58.0");
    assert.equal(manifest.peerDependenciesMeta?.["@playwright/test"]?.optional, true);

    const forbidden = [...reactPackages, ...otherWorkspacePackages, "elkjs"];
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
    const entry = await readText("build/index.js");
    assert.doesNotMatch(entry, /graph-minimap/);
    assert.doesNotMatch(entry, /devtools-layer/);

    const forbiddenSpecifiers = ["react(?:-dom)?(?:/[^\"']*)?", ...otherWorkspacePackages.map(escape)].join("|");
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
