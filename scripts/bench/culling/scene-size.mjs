#!/usr/bin/env node
// scripts/bench/culling/scene-size.mjs
// M5: size of the lazily loaded WebGL scene backend (raw and gzip), its biggest inputs grouped by package, and the
// main chunk of SceneRendererLayer without the backend (the dynamic import must split).
import esbuild from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const source = path.join(repo, "packages/graph/src");
const common = {
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  metafile: true,
  write: false,
  tsconfig: path.join(repo, "packages/graph/tsconfig.json"),
  nodePaths: [path.join(repo, "packages/graph/node_modules"), path.join(repo, "node_modules")],
  logLevel: "error",
};
const gzip = (bytes) => zlib.gzipSync(bytes, { level: 9 }).length;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

function group(file) {
  const m = file.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/);
  if (!m) return "our code";
  const name = m[1];
  if (name.startsWith("@luma.gl/")) return "@luma.gl/*";
  if (name === "@mapbox/tiny-sdf") return "@mapbox/tiny-sdf";
  if (name.startsWith("@math.gl/")) return "@math.gl/*";
  if (name.startsWith("@probe.gl/")) return "@probe.gl/*";
  return `other (${name})`;
}

// 1. The backend alone.
const backend = await esbuild.build({
  ...common,
  entryPoints: [path.join(source, "lib/scene/webgl/WebGLSceneBackend.ts")],
  outfile: path.join(os.tmpdir(), "scene-size-backend.js"),
});
const [output] = backend.outputFiles;
const meta = Object.values(backend.metafile.outputs)[0];
console.log("WebGLSceneBackend.ts (minified ESM, everything bundled)");
console.log(`  raw   ${output.contents.length} bytes (${kb(output.contents.length)})`);
console.log(`  gzip  ${gzip(output.contents)} bytes (${kb(gzip(output.contents))})`);
const byGroup = new Map();
// Per-input bytes live in the output entry of the metafile.
const rows = Object.entries(meta.inputs)
  .map(([file, info]) => [file, info.bytesInOutput])
  .filter(([, bytes]) => bytes > 0);
for (const [file, bytes] of rows) byGroup.set(group(file), (byGroup.get(group(file)) ?? 0) + bytes);
const total = rows.reduce((sum, [, bytes]) => sum + bytes, 0);
console.log(`  bytes by group (sum of bytesInOutput = ${total}):`);
for (const [name, bytes] of [...byGroup].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${name.padEnd(28)} ${String(bytes).padStart(8)}  ${((bytes / total) * 100).toFixed(1)}%`);
}
console.log("  top 10 inputs by bytes in output:");
for (const [file, bytes] of rows.sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`    ${String(bytes).padStart(8)}  ${file}`);
}

// 2. The layer with the dynamic import split out.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scene-size-split-"));
const split = await esbuild.build({
  ...common,
  splitting: true,
  entryPoints: [path.join(source, "lib/scene/SceneRendererLayer.ts")],
  outdir: dir,
});
console.log("\nSceneRendererLayer.ts with splitting (minified ESM)");
for (const file of split.outputFiles) {
  const name = path.relative(dir, file.path);
  console.log(`  ${name.padEnd(36)} raw ${String(file.contents.length).padStart(8)}  gzip ${gzip(file.contents)}`);
}

// The main chunk (the entry output: layer plus core) must not contain luma; only the lazy chunks may.
const mainOutput = Object.entries(split.metafile.outputs).find(([, info]) => info.entryPoint !== undefined);
if (!mainOutput) {
  console.error("scene-size: no entry output found in the split build");
  process.exit(1);
}
const mainFile = split.outputFiles.find((file) => path.relative(dir, file.path) === path.basename(mainOutput[0]));
const lumaInMain = Object.entries(mainOutput[1].inputs).filter(
  ([file, info]) => file.includes("@luma.gl") && info.bytesInOutput > 0
);
console.log(
  `\nmain chunk (layer plus core): raw ${mainFile.contents.length}  gzip ${gzip(mainFile.contents)}  ` +
    `@luma.gl inputs in it: ${lumaInMain.length}`
);
if (lumaInMain.length > 0) {
  console.error("scene-size: FAIL: the main chunk contains @luma.gl inputs, the dynamic import does not split luma out:");
  for (const [file, info] of lumaInMain.slice(0, 10)) console.error(`  ${info.bytesInOutput}  ${file}`);
  process.exit(1);
}
console.log("scene-size: PASS: no @luma.gl in the main chunk");
