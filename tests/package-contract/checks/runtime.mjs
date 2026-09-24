import { run } from "../utils.mjs";

const nativeImportProbes = {
  root: `
    const graph = await import("@gravity-ui/graph");
    if ("MiniMapLayer" in graph) throw new Error("Core still exports the extracted minimap.");
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
  `,
  react: `
    const react = await import("@gravity-ui/graph-react");
    const core = await import("@gravity-ui/graph");
    if (react.MultipointConnection !== core.MultipointConnection) throw new Error("React has a second core connection class.");
    if (typeof react.GraphCanvas !== "function") throw new Error("React entrypoint does not export GraphCanvas.");
  `,
  minimap: `
    const { MiniMapLayer } = await import("@gravity-ui/graph-minimap");
    const { Layer } = await import("@gravity-ui/graph");
    if (Object.getPrototypeOf(MiniMapLayer.prototype) !== Layer.prototype) {
      throw new Error("Minimap has a second core Layer class.");
    }
  `,
  devtools: `
    const { DevToolsLayer, DEFAULT_DEVTOOLS_LAYER_PROPS } = await import("@gravity-ui/graph-devtools");
    const { Layer } = await import("@gravity-ui/graph");
    if (Object.getPrototypeOf(DevToolsLayer.prototype) !== Layer.prototype) {
      throw new Error("DevTools has a second core Layer class.");
    }
    if (DEFAULT_DEVTOOLS_LAYER_PROPS.rulerSize !== 25) throw new Error("DevTools defaults are missing or changed.");
  `,
  playwright: `
    const playwright = await import("@gravity-ui/graph/playwright");
    if (typeof playwright.GraphPO !== "function") throw new Error("Playwright entrypoint does not export GraphPO.");
  `,
};

async function checkNativeImports(consumerDirectory, entrypoints) {
  for (const entrypoint of entrypoints) {
    console.log(`\n[package-contract] Importing the ${entrypoint} entrypoint directly with Node ESM...`);
    await run(process.execPath, ["--input-type=module", "--eval", nativeImportProbes[entrypoint]], {
      cwd: consumerDirectory,
    });
  }

  console.log("\n[package-contract] Requiring the Playwright entrypoint directly with Node CommonJS...");
  await run(
    process.execPath,
    [
      "--input-type=commonjs",
      "--eval",
      `
        const playwright = require("@gravity-ui/graph/playwright");
        if (typeof playwright.GraphPO !== "function") {
          throw new Error("Playwright CommonJS entrypoint does not export GraphPO.");
        }
      `,
    ],
    { cwd: consumerDirectory }
  );
}

async function checkSignalInterop(consumerDirectory) {
  const probe = `
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
  `;

  console.log("\n[package-contract] Verifying consumer-side @preact/signals-core interoperability...");
  await run(process.execPath, ["--input-type=module", "--eval", probe], { cwd: consumerDirectory });
}

async function checkReactIsAbsent(consumerDirectory) {
  const probe = `
    for (const specifier of ["react", "react-dom", "@gravity-ui/graph-react", "elkjs"]) {
      try {
        await import(specifier);
      } catch (error) {
        if (error?.code === "ERR_MODULE_NOT_FOUND") continue;
        throw error;
      }
      throw new Error("The vanilla consumer unexpectedly resolves " + specifier);
    }
    try {
      await import("@gravity-ui/graph/react");
      throw new Error("The removed React subpath is still exported.");
    } catch (error) {
      if (error?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
    }
  `;

  console.log("\n[package-contract] Confirming React is absent from the vanilla project...");
  await run(process.execPath, ["--input-type=module", "--eval", probe], { cwd: consumerDirectory });
}

export async function checkRuntimeConsumer({
  consumerDirectory,
  entrypoints,
  expectNoReact = false,
  verifySignalInterop = false,
}) {
  if (expectNoReact) {
    await checkReactIsAbsent(consumerDirectory);
  }

  await checkNativeImports(consumerDirectory, entrypoints);

  if (verifySignalInterop) {
    await checkSignalInterop(consumerDirectory);
  }
}
