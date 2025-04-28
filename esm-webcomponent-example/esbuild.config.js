import * as esbuild from "esbuild";

// Run the build
esbuild
  .build({
    entryPoints: ["graph-editor.js"],
    bundle: true,
    outfile: "dist/graph-editor.js",
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    minify: true,
    sourcemap: true,
    // Handle the peer dependencies of @gravity-ui/graph
    external: ["react", "react-dom"],
    loader: {
      ".js": "js",
      ".css": "css",
      ".json": "json",
    },
  })
  .catch(() => process.exit(1));
