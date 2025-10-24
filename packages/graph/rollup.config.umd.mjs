import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import postcss from "rollup-plugin-postcss";

const createConfig = (minify = false) => ({
  input: "src/index.umd.ts",
  output: {
    file: minify ? "dist/graph.umd.min.js" : "dist/graph.umd.js",
    format: "umd",
    name: "GravityGraph",
    sourcemap: true,
  },
  plugins: [
    resolve({
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
      browser: true,
    }),
    typescript({
      tsconfig: "./tsconfig.json",
      declaration: false,
    }),
    commonjs(),
    postcss({
      extract: false,
      inject: true,
      modules: false,
    }),
    ...(minify
      ? [
          terser({
            compress: {
              drop_console: false,
              drop_debugger: true,
              pure_funcs: [],
              ecma: 2015,
            },
            format: {
              comments: false,
            },
          }),
        ]
      : []),
  ],
});

export default [createConfig(false), createConfig(true)];
