import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import { build } from "esbuild";

// A consumer can subclass a retained component and mistakenly implement a frame hook.
function mountRetained({ Component, CoreComponent }) {
  class Retained extends Component {
    static mode = "retained";
    render() {}
  }
  class Parent extends Component {
    updateChildren() {
      return [Retained.create({})];
    }
  }
  const root = CoreComponent.mount(Parent);
  CoreComponent.update(root);
  CoreComponent.unmount(root);
}

const frameWarning = "the frame never calls its";
const devMessages = [
  frameWarning,
  "a level method read",
  "BlockConnection no longer calls",
  "so it never creates their anchors",
  "defineConnectionEffect() or clone() is called",
  "distinct parts; the limit",
  "a style's cameraAware: true",
  "A style rule sets a { px } width",
  "levelRuns",
  "writeMs",
];

async function checkBrowser(mode) {
  const { outputFiles } = await build({
    stdin: { contents: 'export * from "@gravity-ui/graph";', resolveDir: process.cwd() },
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "GraphPackage",
    minify: true,
    define: { "process.env.NODE_ENV": JSON.stringify(mode) },
    write: false,
  });
  const code = outputFiles[0].text;
  for (const message of devMessages) {
    assert.equal(code.includes(message), mode === "development", `${mode} bundle: ${message}`);
  }
  assert.ok(code.includes("is not in the scene"), "An invalid scene parent must still be reported.");
  assert.ok(
    code.includes("the scene element keeps its last primitives"),
    "A failing level hook must still be reported."
  );

  const warnings = [];
  const scope = {
    performance,
    Event,
    EventTarget,
    CustomEvent,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    console: { ...console, warn: (message) => warnings.push(message) },
  };
  scope.global = scope;
  runInNewContext(code, scope);
  mountRetained(scope.GraphPackage);
  assert.equal(
    warnings.some((message) => message.includes(frameWarning)),
    mode === "development"
  );
}

// A fresh module graph for each case also exercises module initialization without a process global.
const mode = process.argv[2];
if (mode === "unset" || mode === "production" || mode === "bare") {
  if (mode === "unset") delete process.env.NODE_ENV;
  if (mode === "production") process.env.NODE_ENV = "production";
  if (mode === "bare") delete globalThis.process;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  mountRetained(await import("@gravity-ui/graph"));
  assert.equal(
    warnings.some((message) => message.includes(frameWarning)),
    mode === "unset"
  );
} else {
  for (const nativeMode of ["unset", "production", "bare"]) {
    execFileSync(process.execPath, [fileURLToPath(import.meta.url), nativeMode], { stdio: "inherit" });
  }
  await checkBrowser("development");
  await checkBrowser("production");
}
