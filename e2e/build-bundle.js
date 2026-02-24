const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

// Plugin to inject CSS into the bundle as a style tag
const cssPlugin = {
  name: "css",
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const css = await fs.promises.readFile(args.path, "utf8");
      const contents = `
        const style = document.createElement('style');
        style.textContent = ${JSON.stringify(css)};
        document.head.appendChild(style);
      `;
      return { contents, loader: "js" };
    });
  },
};

esbuild
  .build({
    entryPoints: [path.join(__dirname, "entry.ts")],
    bundle: true,
    outfile: path.join(__dirname, "dist/graph.bundle.js"),
    format: "iife",
    globalName: "GraphModule",
    platform: "browser",
    target: ["es2020"],
    sourcemap: true,
    plugins: [cssPlugin],
  })
  .then(() => {
    console.log("E2E bundle created successfully with CSS");
  })
  .catch((err) => {
    console.error("E2E bundle failed:", err);
    process.exit(1);
  });
