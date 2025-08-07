import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';

const isProduction = process.env.NODE_ENV === 'production';

const baseConfig = {
  input: 'src/index.ts',
  external: [],
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: './dist'
    })
  ]
};

const configs = [
  // UMD build
  {
    ...baseConfig,
    output: {
      file: 'dist/index.umd.js',
      format: 'umd',
      name: 'Monitor',
      sourcemap: true,
      globals: {}
    },
    plugins: [
      ...baseConfig.plugins,
      ...(isProduction ? [terser()] : [])
    ]
  },
  
  // ESM build
  {
    ...baseConfig,
    output: {
      file: 'dist/index.esm.js',
      format: 'esm',
      sourcemap: true
    }
  },
  
  // CommonJS build
  {
    ...baseConfig,
    output: {
      file: 'dist/index.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'auto'
    }
  }
];

// 生产环境额外构建压缩版本
if (isProduction) {
  configs.push({
    ...baseConfig,
    output: {
      file: 'dist/index.min.js',
      format: 'umd',
      name: 'Monitor',
      sourcemap: true
    },
    plugins: [
      ...baseConfig.plugins,
      terser({
        compress: {
          drop_console: true,
          drop_debugger: true
        },
        mangle: {
          reserved: ['Monitor']
        }
      })
    ]
  });
}

export default configs;