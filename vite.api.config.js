// Builds the engine as a single ES module for the public API:
// dist/api/v1/lsp-engine.js (see src/api/engine.js and docs/API.md).
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/api/v1',
    emptyOutDir: false,
    copyPublicDir: false,
    lib: { entry: 'src/api/engine.js', formats: ['es'], fileName: () => 'lsp-engine.js' },
    minify: true,
  },
});
