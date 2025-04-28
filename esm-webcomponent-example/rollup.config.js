import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import postcss from "rollup-plugin-postcss";

export default {
  input: "graph-editor.js",
  output: {
    file: "dist/graph-editor.js",
    format: "es",
    sourcemap: true,
  },
  plugins: [
    nodeResolve({
      browser: true,
      // Specify extensions to resolve
      extensions: [".mjs", ".js", ".jsx", ".ts", ".tsx", ".json", ".css"],
    }),
    commonjs({
      // Include node_modules
      include: "node_modules/**",
      // Optional: if there are named exports you need to handle
      namedExports: {
        "@gravity-ui/graph": ["Graph"],
      },
    }),
    json(), // Handle JSON files
    postcss({
      // Handle CSS files
      extensions: [".css"],
      minimize: true,
      inject: false,
      extract: false,
    }),
    terser(), // Minify the output
  ],
};
