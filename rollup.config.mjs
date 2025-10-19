import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import copy from "rollup-plugin-copy";
import postcss from "rollup-plugin-postcss";

const packageConfigs = [
  {
    name: "graph",
    input: "packages/graph/src/index.ts",
    external: (id) => {
      return /^lodash/.test(id) || /^@preact/.test(id) || ["intersects", "rbush"].includes(id);
    },
  },
  {
    name: "react",
    input: "packages/react/src/index.ts",
    external: (id) => {
      return /^react/.test(id) || /^@gravity-ui\/graph/.test(id) || /^@preact/.test(id);
    },
  },
];

export default packageConfigs.map(({ name, input, external }) => ({
  input,
  output: {
    dir: `packages/${name}/dist`,
    format: "esm",
    preserveModules: true,
    preserveModulesRoot: `packages/${name}/src`,
    sourcemap: true,
  },
  external,
  plugins: [
    resolve(),
    commonjs(),
    typescript({
      tsconfig: `packages/${name}/tsconfig.json`,
      declaration: true,
      declarationDir: `packages/${name}/dist`,
      outDir: `packages/${name}/dist`,
    }),
    postcss({
      extract: false,
      inject: false,
      modules: false,
    }),
    copy({
      targets: [
        {
          src: `packages/${name}/src/**/*.css`,
          dest: `packages/${name}/dist`,
          rename: (name, extension, fullPath) => {
            // Remove the 'packages/{name}/src/' prefix from the path
            const relativePath = fullPath.replace(new RegExp(`packages/${name}/src/`), "");
            return relativePath;
          },
        },
      ],
    }),
  ],
  watch: {
    include: `packages/${name}/src/**`,
    exclude: "node_modules/**",
  },
}));
