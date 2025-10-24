import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import copy from "rollup-plugin-copy";
import postcss from "rollup-plugin-postcss";

export default {
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "esm",
    preserveModules: true,
    preserveModulesRoot: "src",
    sourcemap: true,
  },
  external: (id) => {
    return (
      /^react/.test(id) ||
      /^@gravity-ui\/graph/.test(id) ||
      /^@preact/.test(id) ||
      ["elkjs", "lodash", "intersects"].includes(id)
    );
  },
  plugins: [
    resolve({
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    }),
    typescript({
      tsconfig: "./tsconfig.json",
      declaration: false,
    }),
    commonjs(),
    postcss({
      extract: false,
      inject: false,
      modules: false,
    }),
    copy({
      targets: [
        {
          src: "src/**/*.css",
          dest: "dist",
          rename: (name, extension, fullPath) => {
            // Remove the 'src/' prefix from the path
            const relativePath = fullPath.replace(/^src\//, "");
            return relativePath;
          },
        },
      ],
    }),
  ],
  watch: {
    include: "src/**",
    exclude: "node_modules/**",
  },
};
