import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/** Package contract of @gravity-ui/graph-playwright. See scripts/package-contract/README.md. */
export default {
  exports: {
    ".": {
      import: {
        types: "./build/index.d.ts",
        default: "./build/index.js",
      },
      require: {
        types: "./build/index.d.cts",
        default: "./build/index.cjs",
      },
      default: "./build/index.js",
    },
  },
  packedFiles: {
    // Node-only single-file bundles: no chunks, no nested declarations.
    forbiddenPatterns: [/^build\/chunks\//, /^build\/.+\/.+\.d\.c?ts$/, /(?:^|\/)docs(?:\/|$)/],
  },
  attw: [{ entrypoint: ".", profile: "node16" }],
  mustNotResolve: ["react", "react-dom", "@gravity-ui/graph-react", "elkjs"],
  probes: [
    {
      label: "Importing the Playwright package with Node ESM",
      source: `
        const playwright = await import("@gravity-ui/graph-playwright");
        if (typeof playwright.GraphPO !== "function") throw new Error("Playwright package does not export GraphPO.");
      `,
    },
    {
      label: "Requiring the Playwright package with Node CommonJS",
      type: "commonjs",
      source: `
        const playwright = require("@gravity-ui/graph-playwright");
        if (typeof playwright.GraphPO !== "function") {
          throw new Error("Playwright CommonJS entrypoint does not export GraphPO.");
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

  async checkArtifact({ manifest, generatedFiles, assertMissing }) {
    assert.deepEqual(Object.keys(manifest.peerDependencies).sort(), ["@gravity-ui/graph", "@playwright/test"]);
    assert.equal(manifest.peerDependencies["@playwright/test"], ">=1.58.0");
    assert.equal(manifest.peerDependenciesMeta, undefined);
    assert.deepEqual(manifest.dependencies ?? {}, {});
    assert.deepEqual(manifest.optionalDependencies ?? {}, {});
    await assertMissing("build/styles.css", "The Playwright package ships styles.");

    const declared = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies)]);
    const bareSpecifier =
      /(?<!["'])(?:from\s*|import\s*\(?\s*|require\s*\(\s*|declare\s+module\s+|reference\s+types\s*=\s*)["']([^"'./\s][^"'\s]*)["']/g;
    for (const file of generatedFiles) {
      const runtime = /\.c?js$/.test(file);
      for (const [, specifier] of (await readFile(file, "utf8")).matchAll(bareSpecifier)) {
        const packageName = specifier.startsWith("@")
          ? specifier.split("/").slice(0, 2).join("/")
          : specifier.split("/")[0];
        assert.ok(declared.has(packageName), `${file} imports undeclared package ${specifier}.`);
        assert.equal(specifier, packageName, `${file} uses a deep import ${specifier}.`);
        // The page objects run in Node and use core for types only.
        assert.ok(!runtime || packageName !== "@gravity-ui/graph", `${file} loads the core runtime in Node.`);
      }
    }
  },
};
