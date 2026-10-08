// Runs the TypeScript CLI (never the compiler API) over tsconfig projects so the same
// checks work with the classic compiler and with the native TypeScript 7 compiler.
//
// Usage: node scripts/tsc-projects.mjs --compiler=<classic|native> <tsconfig.json | directory>...
//
// - classic: the workspace `typescript` package (pnpm catalog default).
// - native:  the isolated `typescript` package installed in tools/typescript-native.
// Paths are relative to the current directory; a directory expands to every tsconfig*.json below it.
// Publish configs (tsconfig.publish.json) emit declarations into a temporary directory;
// every other project runs with --noEmit.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPILERS = {
  classic: "package.json",
  native: "tools/typescript-native/package.json",
};

function resolveCompiler(name) {
  const anchor = COMPILERS[name];
  if (!anchor) throw new Error(`Unknown compiler "${name}". Expected one of: ${Object.keys(COMPILERS).join(", ")}`);
  const manifestPath = createRequire(path.join(root, anchor)).resolve("typescript/package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin.tsc;
  return { version: manifest.version, tsc: path.join(path.dirname(manifestPath), bin) };
}

function collectProjects(target) {
  const absolute = path.resolve(target);
  if (!statSync(absolute).isDirectory()) return [absolute];
  return readdirSync(absolute, { recursive: true })
    .filter((entry) => /^tsconfig.*\.json$/.test(path.basename(entry)))
    .map((entry) => path.join(absolute, entry))
    .sort();
}

function main(args) {
  const compilerArg = args.find((arg) => arg.startsWith("--compiler="));
  const targets = args.filter((arg) => !arg.startsWith("--"));
  if (!compilerArg || !targets.length || args.some((arg) => arg.startsWith("--") && arg !== compilerArg)) {
    throw new Error("Usage: tsc-projects.mjs --compiler=<classic|native> <tsconfig.json | directory>...");
  }
  const compiler = resolveCompiler(compilerArg.slice("--compiler=".length));
  const version = spawnSync(process.execPath, [compiler.tsc, "--version"], { encoding: "utf8" });
  if (version.status !== 0) throw new Error(`Cannot start ${compiler.tsc}: ${version.stderr || version.error}`);
  console.log(`Using ${version.stdout.trim()} (typescript@${compiler.version}) from ${path.relative(root, compiler.tsc)}`);

  const projects = targets.flatMap(collectProjects);
  const failures = [];
  for (const project of projects) {
    const label = path.relative(root, project);
    const emitDirectory =
      path.basename(project) === "tsconfig.publish.json" ? mkdtempSync(path.join(tmpdir(), "tsc-projects-")) : null;
    const emitArgs = emitDirectory ? ["--outDir", emitDirectory] : ["--noEmit"];
    try {
      const result = spawnSync(process.execPath, [compiler.tsc, "-p", project, ...emitArgs, "--pretty", "false"], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
      if (result.status !== 0 || result.signal || result.error || output) {
        failures.push(label);
        console.error(`FAIL ${label}${emitDirectory ? " (declaration emit)" : ""}\n${output || result.error || result.signal}`);
      } else {
        console.log(`ok   ${label}${emitDirectory ? " (declaration emit)" : ""}`);
      }
    } finally {
      if (emitDirectory) rmSync(emitDirectory, { recursive: true, force: true });
    }
  }
  if (failures.length) throw new Error(`${failures.length} of ${projects.length} projects failed`);
  console.log(`All ${projects.length} projects passed with TypeScript ${compiler.version}.`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
