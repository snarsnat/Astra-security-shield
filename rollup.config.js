import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import replace from '@rollup/plugin-replace';
import { terser } from '@rollup/plugin-terser';
import babel from '@rollup/plugin-babel';
import postcss from 'rollup-plugin-postcss';

const production = !process.env.ROLLUP_WATCH;

export default [
  // ESM Build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/esm/index.js',
      format: 'esm',
      sourcemap: !production,
      exports: 'named'
    },
    plugins: [
      replace({
        preventAssignment: true,
        'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development')
      }),
      resolve({
        browser: true,
        preferBuiltins: false
      }),
      commonjs(),
      postcss({
        extract: 'astra-shield.css',
        minimize: production
      }),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        outDir: 'dist/esm'
      }),
      babel({
        babelHelpers: 'bundled',
        presets: [
          ['@babel/preset-env', {
            targets: {
              browsers: ['> 1%', 'not dead', 'not ie <= 11']
            }
          }]
        ],
        extensions: ['.js', '.ts']
      }),
      production && terser()
    ],
    external: []
  },

  // CJS Build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/cjs/index.js',
      format: 'cjs',
      sourcemap: !production,
      exports: 'named'
    },
    plugins: [
      replace({
        preventAssignment: true,
        'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development')
      }),
      resolve({
        browser: true,
        preferBuiltins: true
      }),
      commonjs(),
      postcss({
        inject: false,
        minimize: production
      }),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        outDir: 'dist/cjs'
      }),
      production && terser()
    ],
    external: ['react', 'vue', '@angular/core']
  },

  // React Integration
  {
    input: 'src/integrations/react.ts',
    output: {
      file: 'dist/esm/integrations/react.js',
      format: 'esm',
      sourcemap: !production
    },
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        outDir: 'dist/esm/integrations'
      })
    ],
    external: ['react']
  },

  // Vue Integration
  {
    input: 'src/integrations/vue.ts',
    output: {
      file: 'dist/esm/integrations/vue.js',
      format: 'esm',
      sourcemap: !production
    },
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        outDir: 'dist/esm/integrations'
      })
    ],
    external: ['vue']
  },

  // Angular Integration
  {
    input: 'src/integrations/angular.ts',
    output: {
      file: 'dist/esm/integrations/angular.js',
      format: 'esm',
      sourcemap: !production
    },
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        outDir: 'dist/esm/integrations'
      })
    ],
    external: ['@angular/core']
  },

  // UMD Build (standalone)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/astra-shield.umd.js',
      format: 'umd',
      name: 'ASTRAShield',
      sourcemap: !production,
      globals: {
        'react': 'React',
        'vue': 'Vue',
        '@angular/core': 'ng'
      }
    },
    plugins: [
      replace({
        preventAssignment: true,
        'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development')
      }),
      resolve({
        browser: true,
        preferBuiltins: false
      }),
      commonjs(),
      postcss({
        extract: 'astra-shield.standalone.css',
        minimize: production
      }),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        outDir: 'dist'
      }),
      production && terser()
    ]
  }
];
