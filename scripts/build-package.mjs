import { spawn } from "node:child_process";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";
import { validateStyleEntry } from "./css-assets.mjs";

export async function buildPackage({
  packageRoot,
  cjs = false,
  docs = false,
  styles = true,
  entries = { index: "src/index.ts" },
}) {
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
        const inputPath = path.resolve(packageRoot, input);
        const allowedRoots = [
          path.join(packageRoot, "src"),
        ];
        if (!allowedRoots.some((allowedRoot) => inputPath.startsWith(`${allowedRoot}${path.sep}`))) {
          throw new Error(`Production bundle includes a source outside ${manifest.name}: ${input}`);
        }
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

  // A CommonJS declaration may type-import an ESM-only package only with an explicit resolution mode.
  async function findEsmOnlyExternals() {
    const esmOnly = new Set();

    for (const name of externalPackages) {
      const externalManifest = JSON.parse(
        await readFile(path.join(packageRoot, "node_modules", ...name.split("/"), "package.json"), "utf8")
      );
      const rootExport = externalManifest.exports?.["."] ?? externalManifest.exports;
      const hasRequireCondition = typeof rootExport === "object" && rootExport !== null && "require" in rootExport;

      if (externalManifest.type === "module" && !hasRequireCondition) {
        esmOnly.add(name);
      }
    }

    return esmOnly;
  }

  async function createCjsDeclarations() {
    const entryDeclaration = path.join(buildDirectory, "index.d.ts");
    const esmOnlyExternals = await findEsmOnlyExternals();
    const typeImportPattern = /^(import type [^;]+ from (["'])([^"'.][^"']*)\2);$/gm;
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
      contents = contents.replace(typeImportPattern, (match, statement, _quote, specifier) => {
        const packageName = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];

        return esmOnlyExternals.has(packageName) ? `${statement} with { "resolution-mode": "import" };` : match;
      });

      for (const line of contents.split("\n")) {
        const unresolvedExternal = [...esmOnlyExternals].find((name) =>
          new RegExp(`["']${name.replace(/[/.]/g, "\\$&")}(?:/[^"']*)?["']`).test(line)
        );

        if (unresolvedExternal && !line.includes("resolution-mode")) {
          throw new Error(
            `${path.relative(packageRoot, declarationFile)}: CommonJS declarations reference the ESM-only ` +
              `${unresolvedExternal} without a resolution mode; use a single-line \`import type\`: ${line.trim()}`
          );
        }
      }

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

  const buildResults = await Promise.all([
    // Node-only packages with a CommonJS twin get a single-file ESM bundle for the same platform.
    cjs
      ? build({
          ...sharedOptions,
          entryPoints: ["src/index.ts"],
          format: "esm",
          outfile: path.join(buildDirectory, "index.js"),
          platform: "node",
        })
      : build({
          ...sharedOptions,
          chunkNames: "chunks/[name]-[hash]",
          entryNames: "[dir]/[name]",
          entryPoints: entries,
          format: "esm",
          loader: { ".css": "empty" },
          outdir: buildDirectory,
          platform: "neutral",
          splitting: true,
        }),
    cjs &&
      build({
        ...sharedOptions,
        entryPoints: ["src/index.ts"],
        format: "cjs",
        outfile: path.join(buildDirectory, "index.cjs"),
        platform: "node",
      }),
    styles &&
      build({
        ...sharedOptions,
        entryPoints: ["src/styles.css"],
        logLevel: "info",
        outfile: path.join(buildDirectory, "styles.css"),
        platform: "browser",
      }),
  ]);

  assertNoBundledPackages(buildResults.filter(Boolean));
  await validateStyleEntry(packageRoot, manifest, styles);

  const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  await run(pnpmCommand, ["exec", "tsc", "-p", "tsconfig.publish.json"]);
  await rewriteDeclarationSpecifiersForNodeEsm();
  if (cjs) await createCjsDeclarations();
  if (docs) await import(pathToFileURL(path.join(packageRoot, "scripts/build-docs.mjs")).href);
}
