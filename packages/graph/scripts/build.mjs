import { spawn } from "node:child_process";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDirectory = path.join(packageRoot, "build");
const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
const externalPackages = [
  ...new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})]),
];

// lodash does not expose extensionless subpaths through an exports map, so
// native Node ESM needs the real .js filename. Keep source imports idiomatic
// and normalize only the external specifiers emitted by the production build.
const resolveLodashSubpathsForNodeEsm = {
  name: "resolve-lodash-subpaths-for-node-esm",
  setup(buildContext) {
    buildContext.onResolve({ filter: /^lodash\/[^.]+$/ }, ({ path: importPath }) => ({
      path: `${importPath}.js`,
      external: true,
    }));
  },
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: packageRoot,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${command} ${args.join(" ")} was terminated by ${signal}`
            : `${command} ${args.join(" ")} exited with code ${code}`
        )
      );
    });
  });
}

function assertNoBundledPackages(results) {
  const bundledPackages = new Set();

  for (const result of results) {
    for (const input of Object.keys(result.metafile.inputs)) {
      const normalizedInput = input.split(path.sep).join("/");
      const nodeModulesMarker = "node_modules/";
      const markerIndex = normalizedInput.lastIndexOf(nodeModulesMarker);

      if (markerIndex !== -1) {
        const packagePath = normalizedInput.slice(markerIndex + nodeModulesMarker.length);
        const [firstSegment, secondSegment] = packagePath.split("/");
        const packageName = firstSegment.startsWith("@") ? `${firstSegment}/${secondSegment}` : firstSegment;

        bundledPackages.add(packageName);
      }
    }
  }

  if (bundledPackages.size > 0) {
    throw new Error(
      `Production bundles unexpectedly contain npm packages:\n${[...bundledPackages]
        .sort()
        .map((dependency) => `- ${dependency}`)
        .join("\n")}`
    );
  }
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function collectDeclarationFiles(directory) {
  const declarationFiles = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      declarationFiles.push(...(await collectDeclarationFiles(entryPath)));
    } else if (entry.name.endsWith(".d.ts")) {
      declarationFiles.push(entryPath);
    }
  }

  return declarationFiles;
}

async function rewriteDeclarationSpecifiersForNodeEsm() {
  const relativeSpecifierPattern = /(["'])(\.{1,2}(?:\/[^"'?#]+)?)\1/g;

  for (const declarationFile of await collectDeclarationFiles(buildDirectory)) {
    let contents = await readFile(declarationFile, "utf8");

    // CSS is published through the explicit styles.css entrypoint. Keeping source-side
    // CSS imports in declarations would make type-only Node resolution look for files
    // that are intentionally not part of the declaration graph.
    contents = contents.replace(/^\s*import\s+["']\.{1,2}\/[^"']+\.css["'];\s*\n?/gm, "");

    const replacements = new Map();

    for (const [, , specifier] of contents.matchAll(relativeSpecifierPattern)) {
      if (replacements.has(specifier)) {
        continue;
      }

      const declarationDirectory = path.dirname(declarationFile);
      const directDeclaration = path.resolve(declarationDirectory, `${specifier}.d.ts`);
      const indexDeclaration = path.resolve(declarationDirectory, specifier, "index.d.ts");

      if (await pathExists(directDeclaration)) {
        replacements.set(specifier, `${specifier}.js`);
      } else if (await pathExists(indexDeclaration)) {
        replacements.set(specifier, `${specifier.replace(/\/$/, "")}/index.js`);
      }
    }

    contents = contents.replace(relativeSpecifierPattern, (match, quote, specifier) => {
      const replacement = replacements.get(specifier);

      return replacement ? `${quote}${replacement}${quote}` : match;
    });

    await writeFile(declarationFile, contents);
  }
}

async function createPlaywrightCjsDeclarations() {
  const entryDeclaration = path.join(buildDirectory, "playwright/index.d.ts");
  const pendingDeclarations = [entryDeclaration];
  const processedDeclarations = new Set();
  const relativeSpecifierPattern = /(["'])(\.{1,2}(?:\/[^"'?#]+)?)\1/g;

  while (pendingDeclarations.length > 0) {
    const declarationFile = pendingDeclarations.pop();

    if (!declarationFile || processedDeclarations.has(declarationFile)) {
      continue;
    }

    processedDeclarations.add(declarationFile);
    let contents = await readFile(declarationFile, "utf8");
    const replacements = new Map();

    for (const [, , specifier] of contents.matchAll(relativeSpecifierPattern)) {
      if (!specifier.endsWith(".js") || replacements.has(specifier)) {
        continue;
      }

      const referencedDeclaration = path.resolve(
        path.dirname(declarationFile),
        `${specifier.slice(0, -".js".length)}.d.ts`
      );

      if (await pathExists(referencedDeclaration)) {
        replacements.set(specifier, `${specifier.slice(0, -".js".length)}.cjs`);
        pendingDeclarations.push(referencedDeclaration);
      }
    }

    contents = contents.replace(relativeSpecifierPattern, (match, quote, specifier) => {
      const replacement = replacements.get(specifier);

      return replacement ? `${quote}${replacement}${quote}` : match;
    });

    await writeFile(declarationFile.replace(/\.d\.ts$/, ".d.cts"), contents);
  }
}

await rm(buildDirectory, { recursive: true, force: true });
await mkdir(buildDirectory, { recursive: true });

const sharedOptions = {
  absWorkingDir: packageRoot,
  bundle: true,
  charset: "utf8",
  external: externalPackages,
  legalComments: "none",
  logLevel: "info",
  metafile: true,
  plugins: [resolveLodashSubpathsForNodeEsm],
  sourcemap: false,
  target: "es2020",
};

const [browserResult, playwrightEsmResult, playwrightCjsResult, stylesResult] = await Promise.all([
  build({
    ...sharedOptions,
    chunkNames: "chunks/[name]-[hash]",
    entryNames: "[dir]/[name]",
    entryPoints: {
      index: "src/index.ts",
      "react-components/index": "src/react-components/index.ts",
    },
    format: "esm",
    loader: { ".css": "empty" },
    outdir: buildDirectory,
    platform: "neutral",
    splitting: true,
  }),
  build({
    ...sharedOptions,
    entryPoints: ["src/playwright/index.ts"],
    format: "esm",
    outfile: path.join(buildDirectory, "playwright/index.js"),
    platform: "node",
  }),
  build({
    ...sharedOptions,
    entryPoints: ["src/playwright/index.ts"],
    format: "cjs",
    outfile: path.join(buildDirectory, "playwright/index.cjs"),
    platform: "node",
  }),
  build({
    ...sharedOptions,
    entryPoints: ["src/styles.css"],
    logLevel: "info",
    outfile: path.join(buildDirectory, "styles.css"),
    platform: "browser",
  }),
]);

assertNoBundledPackages([browserResult, playwrightEsmResult, playwrightCjsResult, stylesResult]);

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
await run(pnpmCommand, ["exec", "tsc", "-p", "tsconfig.publish.json"]);
await rewriteDeclarationSpecifiersForNodeEsm();
await createPlaywrightCjsDeclarations();
await import(`./build-docs.mjs?build=${Date.now()}`);
