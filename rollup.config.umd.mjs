import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import postcss from "rollup-plugin-postcss";

const createConfig = (minify = false) => ({
  input: "packages/graph/src/index.umd.ts",
  output: {
    file: minify ? "packages/graph/dist/graph.umd.min.js" : "packages/graph/dist/graph.umd.js",
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
      tsconfig: "packages/graph/tsconfig.json",
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
              // Нужно уточнить, нужно ли Добавить copyright лицензию
              comments: false,
            },
          }),
        ]
      : []),
  ],
});

export default [createConfig(false), createConfig(true)];
