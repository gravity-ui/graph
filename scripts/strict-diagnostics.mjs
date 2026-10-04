import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const COMPILER = "5.9.2";
export const PROJECTS = [
  "packages/graph/tsconfig.json",
  "packages/graph-react/tsconfig.json",
  "packages/graph-minimap/tsconfig.json",
  "packages/graph-devtools/tsconfig.json",
  "apps/storybook/tsconfig.json",
  "apps/e2e/tsconfig.json",
];
export const RESOLVED_CONFIGURATION_FILES = [
  "packages/graph/src/graphConfig.ts",
  "packages/graph/src/store/settings.ts",
  "packages/graph/src/graphEvents.ts",
  "packages/graph/src/utils/functions/mergeDefined.ts",
];
export const NULLABLE_LOOKUP_FILES = [
  "packages/graph/src/store/block/selectors.ts",
  "packages/graph/src/store/connection/selectors.ts",
  "packages/graph-react/src/hooks/useBlockState.ts",
  "packages/graph-react/src/hooks/useBlockAnchorState.ts",
];
const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), "..");
const baselinePath = path.join(root, "docs/audits/strict-typescript-baseline.json");
const identity = ({ project, file, code, message }) => JSON.stringify([project, file, code, message]);
const snapshot = (diagnostics) => ({ schemaVersion: 1, compiler: COMPILER, projects: PROJECTS, diagnostics });

export function validateSnapshot(value) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.compiler !== COMPILER ||
    JSON.stringify(value.projects) !== JSON.stringify(PROJECTS) ||
    !Array.isArray(value.diagnostics)
  ) {
    throw new Error("Invalid strict diagnostic snapshot metadata");
  }
  const seen = new Set();
  for (const diagnostic of value.diagnostics) {
    if (
      !diagnostic ||
      !PROJECTS.includes(diagnostic.project) ||
      typeof diagnostic.file !== "string" ||
      !diagnostic.file ||
      path.isAbsolute(diagnostic.file) ||
      diagnostic.file.split("/").includes("..") ||
      diagnostic.file.includes("\\") ||
      !Number.isSafeInteger(diagnostic.code) ||
      diagnostic.code <= 0 ||
      typeof diagnostic.message !== "string" ||
      !diagnostic.message ||
      !Number.isSafeInteger(diagnostic.count) ||
      diagnostic.count <= 0
    ) {
      throw new Error("Invalid strict diagnostic record");
    }
    if (diagnostic.file.startsWith("packages/graph/src/lib/Scheduler/")) {
      throw new Error(`Scheduler must have zero strict diagnostics: ${identity(diagnostic)}`);
    }
    if (RESOLVED_CONFIGURATION_FILES.includes(diagnostic.file)) {
      throw new Error(`Resolved configuration must have zero strict diagnostics: ${identity(diagnostic)}`);
    }
    if (NULLABLE_LOOKUP_FILES.includes(diagnostic.file)) {
      throw new Error(`Nullable lookups must have zero strict diagnostics: ${identity(diagnostic)}`);
    }
    const key = identity(diagnostic);
    if (seen.has(key)) throw new Error(`Duplicate diagnostic identity: ${key}`);
    seen.add(key);
  }
  return value;
}

export function compareDiagnostics(actual, baseline) {
  validateSnapshot(actual);
  validateSnapshot(baseline);
  const allowed = new Map(baseline.diagnostics.map((diagnostic) => [identity(diagnostic), diagnostic.count]));
  return actual.diagnostics.filter((diagnostic) => diagnostic.count > (allowed.get(identity(diagnostic)) ?? 0));
}

export function decodeCompilerResult(result, project) {
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(
      `Strict compiler process failed for ${project}: ${result.error?.message ?? result.signal ?? result.status}\n${result.stderr ?? ""}`
    );
  }
  let value;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Malformed strict compiler result for ${project}`);
  }
  validateSnapshot(value);
  if (value.diagnostics.some((diagnostic) => diagnostic.project !== project))
    throw new Error("Compiler result project mismatch");
  return value.diagnostics;
}

async function measureProject(project) {
  if (!PROJECTS.includes(project)) throw new Error(`Unknown project ${project}`);
  const { default: ts } = await import("typescript");
  if (ts.version !== COMPILER) throw new Error(`Expected TypeScript ${COMPILER}, received ${ts.version}`);
  const configPath = path.join(root, project);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(configPath),
    { strict: true, noEmit: true, incremental: false, composite: false },
    configPath
  );
  if (parsed.errors.length || !parsed.fileNames.length) {
    throw new Error(
      `Invalid or empty project ${project}: ${parsed.errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")).join("\n")}`
    );
  }
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const records = new Map();
  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
    const message = ts
      .flattenDiagnosticMessageText(diagnostic.messageText, "\n")
      .replaceAll(`${root}${path.sep}`, "<repo>/")
      .replaceAll(`${root.split(path.sep).join("/")}/`, "<repo>/");
    // Configuration/global errors are failures, never allowlisted source debt.
    if (!diagnostic.file) throw new Error(`Compiler error TS${diagnostic.code}: ${message}`);
    const file = path.relative(root, diagnostic.file.fileName).split(path.sep).join("/");
    const record = { project, file, code: diagnostic.code, message, count: 0 };
    const key = identity(record);
    const existing = records.get(key) ?? record;
    existing.count += 1;
    records.set(key, existing);
  }
  return snapshot([...records.values()].sort((a, b) => identity(a).localeCompare(identity(b), "en")));
}

function measureAll() {
  const diagnostics = PROJECTS.flatMap((project) =>
    decodeCompilerResult(
      spawnSync(process.execPath, [script, "--project", project], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        timeout: 120_000,
      }),
      project
    )
  );
  return validateSnapshot(snapshot(diagnostics));
}

async function main(args) {
  if (args[0] === "--project" && args.length === 2) {
    process.stdout.write(JSON.stringify(await measureProject(args[1])));
    return;
  }
  if (args.length && (args.length !== 1 || args[0] !== "--write-baseline"))
    throw new Error("Usage: strict-diagnostics.mjs [--write-baseline]");
  const actual = measureAll();
  if (args[0] === "--write-baseline") {
    writeFileSync(baselinePath, JSON.stringify(actual, null, 2) + "\n");
    console.log("Baseline written explicitly; review the diagnostic diff before committing.");
  } else {
    const baseline = validateSnapshot(JSON.parse(readFileSync(baselinePath, "utf8")));
    const regressions = compareDiagnostics(actual, baseline);
    if (regressions.length)
      throw new Error(`New or increased strict diagnostics:\n${JSON.stringify(regressions, null, 2)}`);
  }
  for (const project of PROJECTS) {
    console.log(
      `${project}: ${actual.diagnostics.filter((diagnostic) => diagnostic.project === project).reduce((total, diagnostic) => total + diagnostic.count, 0)} existing diagnostics`
    );
  }
  console.log("Scheduler: zero strict diagnostics (full projects checked).");
  console.log("Resolved configuration boundaries: zero strict diagnostics.");
  console.log("Nullable lookup boundaries: zero strict diagnostics.");
}

if (process.argv[1] && process.argv[1] !== "-" && realpathSync(process.argv[1]) === script) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
