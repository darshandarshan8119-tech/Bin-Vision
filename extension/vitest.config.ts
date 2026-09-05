import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './src/shared'),
      '@perception': path.resolve(__dirname, './src/perception'),
      '@privacy': path.resolve(__dirname, './src/privacy'),
      '@agent': path.resolve(__dirname, './src/agent'),
      '@profile': path.resolve(__dirname, './src/profile'),
      '@ui': path.resolve(__dirname, './src/ui'),
    },
  },
});
