import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import postcss from 'rollup-plugin-postcss';
import dts from 'rollup-plugin-dts';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  'react/jsx-runtime'
];

export default [
  // ESM and CJS builds
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'build/index.js',
        format: 'es',
        sourcemap: true
      },
      {
        file: 'build/index.cjs',
        format: 'cjs',
        sourcemap: true,
        exports: 'named'
      }
    ],
    external,
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false,
        extensions: ['.ts', '.tsx', '.js', '.jsx']
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        sourceMap: true
      }),
      postcss({
        extract: 'build/styles/index.css',
        minimize: true,
        sourceMap: true,
        modules: false
      })
    ]
  },
  // Type definitions
  {
    input: 'src/index.ts',
    output: {
      file: 'build/index.d.ts',
      format: 'es'
    },
    external: [...external, /\.css$/, 'elkjs'],
    plugins: [
      postcss({
        extract: false,
        inject: false
      }),
      dts({ respectExternal: true })
    ]
  }
];
