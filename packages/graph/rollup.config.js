import { readFileSync } from "fs";

import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";
import postcss from "rollup-plugin-postcss";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  "react/jsx-runtime",
];

const browserExternal = [...Object.keys(pkg.peerDependencies || {}), "react/jsx-runtime"];

export default [
  // ESM and CJS builds
  {
    input: "src/index.ts",
    output: [
      {
        file: "build/index.js",
        format: "es",
        sourcemap: true,
        preserveModules: false,
      },
      {
        file: "build/index.cjs",
        format: "cjs",
        sourcemap: true,
        preserveModules: false,
        exports: "named",
      },
    ],
    external,
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false,
        extensions: [".ts", ".tsx", ".js", ".jsx"],
      }),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: false,
        declarationMap: false,
        sourceMap: true,
      }),
      postcss({
        extract: "build/styles.css",
        minimize: true,
        sourceMap: true,
        modules: false,
      }),
      terser({
        compress: {
          passes: 2,
          drop_console: false,
        },
        mangle: {
          reserved: [],
        },
      }),
    ],
  },
  // Standalone browser bundle (IIFE) with all dependencies bundled
  // Used for browser environments without a bundler (e.g. e2e tests)
  {
    input: "src/index.ts",
    output: {
      file: "build/graph.standalone.js",
      format: "iife",
      name: "GraphModule",
      sourcemap: true,
    },
    external: browserExternal,
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false,
        extensions: [".ts", ".tsx", ".js", ".jsx"],
      }),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: false,
        declarationMap: false,
        sourceMap: true,
      }),
      postcss({
        inject: true,
        minimize: true,
        modules: false,
      }),
      terser({
        compress: {
          passes: 2,
          drop_console: false,
        },
        mangle: {
          reserved: [],
        },
      }),
    ],
  },
  // Type definitions
  {
    input: "src/index.ts",
    output: {
      file: "build/index.d.ts",
      format: "es",
    },
    external: [...external, /\.css$/],
    plugins: [
      postcss({
        extract: false,
        inject: false,
      }),
      dts({
        respectExternal: true,
      }),
    ],
  },
];
