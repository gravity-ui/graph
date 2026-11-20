import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
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
  "defineSceneEffect() or clone() is called",
  "distinct parts; the limit",
  "a style's cameraAware: true",
  "A style rule sets a { px } width",
  "levelRuns",
  "writeMs",
];

async function checkBrowser(browser, mode) {
  const development = mode === "development";
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
    assert.equal(code.includes(message), development, `${mode} bundle: ${message}`);
  }
  assert.equal(/\brenderAnchor\b/.test(code), development, `${mode} bundle: deprecated anchor hook`);
  assert.ok(code.includes("is not in the scene"), "An invalid scene parent must still be reported.");
  assert.ok(
    code.includes("the scene element keeps its last primitives"),
    "A failing level hook must still be reported."
  );

  const page = await browser.newPage();
  try {
    const warnings = [];
    page.on("console", (message) => {
      if (message.type() === "warning") warnings.push(message.text());
    });
    await page.setContent('<div id="graph" style="width: 400px; height: 300px"></div>');
    await page.addScriptTag({ content: code });
    await page.evaluate(`(${mountRetained.toString()})(GraphPackage)`);
    const mounted = await page.evaluate(() => {
      const { CanvasBlock, Graph } = globalThis.GraphPackage;
      class OldAnchorBlock extends CanvasBlock {
        renderAnchor() {}
      }
      const graph = new Graph(
        {
          blocks: [{ id: "legacy", is: "Legacy", name: "Legacy", x: 10, y: 10, width: 80, height: 40 }],
          settings: { blockComponents: { Legacy: OldAnchorBlock } },
        },
        document.getElementById("graph")
      );
      try {
        graph.start();
        graph.scheduler.performUpdate();
        return graph.rootStore.blocksList.getBlockState("legacy")?.getViewComponent() instanceof OldAnchorBlock;
      } finally {
        graph.unmount();
      }
    });
    assert.ok(mounted, "The installed package mounted the block with a deprecated hook");
    assert.equal(
      warnings.some((message) => message.includes(frameWarning)),
      development
    );
    const anchorWarnings = warnings.filter((message) => /\brenderAnchor\b/.test(message));
    assert.equal(anchorWarnings.length, development ? 1 : 0, `${mode}: renderAnchor warning`);
    if (development) assert.match(anchorWarnings[0], /\bgetAnchorClass\b/);
  } finally {
    await page.close();
  }
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
  const browser = await chromium.launch();
  try {
    await checkBrowser(browser, "development");
    await checkBrowser(browser, "production");
  } finally {
    await browser.close();
  }
}
