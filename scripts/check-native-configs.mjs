import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECTS } from "./strict-diagnostics.mjs";
import { validateCssImports } from "./css-assets.mjs";

const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), "..");
const VERSION = "7.0.2";
export function assertNativeResult(result, label, expectedOutput = "") {
  if (
    result.error ||
    result.signal ||
    result.status !== 0 ||
    (result.stdout ?? "").trim() !== expectedOutput ||
    (result.stderr ?? "").trim() !== ""
  )
    throw new Error(
      `Native check failed for ${label}: ${result.error?.message ?? result.signal ?? result.status}\n${result.stdout ?? ""}${result.stderr ?? ""}`
    );
}

async function main() {
  const requireNative = createRequire(path.join(root, "tools/typescript-native/package.json"));
  const manifestPath = requireNative.resolve("typescript/package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.version !== VERSION)
    throw new Error(`Expected native TypeScript ${VERSION}, received ${manifest.version}`);
  const compiler = path.join(path.dirname(manifestPath), manifest.bin.tsc);
  const version = spawnSync(process.execPath, [compiler, "--version"], { encoding: "utf8", timeout: 30_000 });
  assertNativeResult(version, "version", `Version ${VERSION}`);
  if (version.stdout.trim() !== `Version ${VERSION}`)
    throw new Error(`Unexpected native CLI version: ${version.stdout}`);
  const configs = [
    ...PROJECTS,
    ...PROJECTS.filter((project) => project.startsWith("packages/")).map((project) =>
      project.replace("tsconfig.json", "tsconfig.publish.json")
    ),
  ];
  for (const project of configs) {
    const configPath = path.join(root, project);
    await validateCssImports(configPath);
    const result = spawnSync(process.execPath, [compiler, "-p", configPath, "--noEmit", "--pretty", "false"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
    });
    assertNativeResult(result, project);
    console.log(`Native TypeScript ${VERSION}: ${project} passed`);
  }
}
if (process.argv[1] && process.argv[1] !== "-" && realpathSync(process.argv[1]) === script) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
