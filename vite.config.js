import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

// vite-plugin-cesium adds the CesiumJS <script> and stylesheet to every page.
// Only the expert planner uses CesiumJS, so keep the guided page light.
const cesiumPlugin = cesium();
const injectCesium = cesiumPlugin.transformIndexHtml;
cesiumPlugin.transformIndexHtml = function (html, ctx) {
  const page = ctx?.filename || ctx?.path || '';
  return page.endsWith('planner.html') ? injectCesium.call(this, html, ctx) : undefined;
};

// BASE_PATH lets the GitHub Pages build serve the app from /<repository-name>/.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [cesiumPlugin],
  server: { port: 5174, host: true },
  preview: { port: 4174 },
  build: {
    chunkSizeWarningLimit: 800, // three.js on its own is ~750 kB (193 kB gzipped)
    // Two pages: the guided beginner flow (index.html) and the expert planner.
    // Big libraries get their own chunks, so they stay cached between updates.
    rollupOptions: {
      input: { main: 'index.html', planner: 'planner.html' },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/astronomy-engine')) return 'astronomy';
          if (id.includes('/src/data/')) return 'site-data';
          return undefined;
        },
      },
    },
  },
});
