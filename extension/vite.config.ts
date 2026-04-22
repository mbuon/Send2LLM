import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

const browser = (process.env.BROWSER ?? 'chrome') as 'chrome' | 'firefox' | 'edge';
const isFirefox = browser === 'firefox';
const outDir = resolve(__dirname, `dist/${browser}`);

export default defineConfig({
  resolve: {
    alias: {
      // Point platform/index to the correct implementation at build time
      './platform/index.js': resolve(__dirname, `src/platform/${isFirefox ? 'mv2' : 'mv3'}.ts`),
      '../platform/index.js': resolve(__dirname, `src/platform/${isFirefox ? 'mv2' : 'mv3'}.ts`),
    },
  },
  define: {
    __BROWSER__: JSON.stringify(browser),
  },
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'background/index': resolve(__dirname, 'src/background/index.ts'),
        'content/index': resolve(__dirname, 'src/content/index.ts'),
        'offscreen/index': resolve(__dirname, 'src/offscreen/index.ts'),
        'popup/popup': resolve(__dirname, 'src/popup/popup.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name][extname]',
        format: 'esm',
      },
    },
  },
  plugins: [
    {
      name: 'copy-extension-assets',
      closeBundle() {
        // Copy manifest
        copyFileSync(
          resolve(__dirname, `manifests/manifest.${browser}.json`),
          resolve(outDir, 'manifest.json'),
        );

        // Copy popup.html
        const popupDir = resolve(outDir, 'popup');
        if (!existsSync(popupDir)) mkdirSync(popupDir, { recursive: true });
        copyFileSync(
          resolve(__dirname, 'src/popup/popup.html'),
          resolve(popupDir, 'popup.html'),
        );

        // Copy offscreen.html to dist root
        copyFileSync(
          resolve(__dirname, 'src/offscreen/offscreen.html'),
          resolve(outDir, 'offscreen.html'),
        );

        // Copy sidebar.css preserving path structure: content/sidebar/sidebar.css
        const sidebarDir = resolve(outDir, 'content/sidebar');
        if (!existsSync(sidebarDir)) mkdirSync(sidebarDir, { recursive: true });
        copyFileSync(
          resolve(__dirname, 'src/content/sidebar/sidebar.css'),
          resolve(sidebarDir, 'sidebar.css'),
        );
      },
    },
  ],
});
