import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    crx({ manifest: manifest as any }),
  ],

  build: {
    // Output to dist/
    outDir: 'dist',
    emptyOutDir: true,

    // Keep readable output in dev
    minify: false,

    rollupOptions: {
      output: {
        // Consistent chunk naming
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },

  resolve: {
    alias: {
      // Allows clean imports: import { logger } from '@shared/logger'
      '@shared': '/src/shared',
      '@perception': '/src/perception',
      '@privacy': '/src/privacy',
      '@agent': '/src/agent',
      '@profile': '/src/profile',
      '@ui': '/src/ui',
    },
  },

  // Expose dev/prod to source via import.meta.env
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },

  // Optimize dependencies — exclude large WASM libs from pre-bundling
  optimizeDeps: {
    exclude: ['tesseract.js', 'onnxruntime-web', 'face-api.js'],
  },

  // WASM support (needed from Phase 7 onward)
  assetsInclude: ['**/*.wasm', '**/*.traineddata', '**/*.onnx'],
});
