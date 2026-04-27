import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

type BrowserTarget = 'chrome' | 'firefox' | 'edge' | 'opera';
const browser = (process.env.BROWSER ?? 'chrome') as BrowserTarget;
const isFirefox = browser === 'firefox';
// Opera, Brave, Vivaldi all run Chromium MV3 — they accept the Chrome
// manifest verbatim. We still emit a separate dist/opera/ folder so the
// user can load-unpacked from a recognisable path, but the manifest is
// chrome's.
const manifestSource = browser === 'opera' ? 'chrome' : browser;
// When ENTRY=content, build only the content script as a self-contained IIFE
// (classic script). Other entries build as ESM modules.
const entry = (process.env.ENTRY ?? 'main') as 'main' | 'content';
const outDir = resolve(__dirname, `dist/${browser}`);

const mainInputs = {
  'background/index': resolve(__dirname, 'src/background/index.ts'),
  'offscreen/index': resolve(__dirname, 'src/offscreen/index.ts'),
  'popup/popup': resolve(__dirname, 'src/popup/popup.ts'),
};

const contentInput = {
  'content/index': resolve(__dirname, 'src/content/index.ts'),
};

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
    // The content-script pass runs after the main pass; keep its output.
    emptyOutDir: entry === 'main',
    rollupOptions: entry === 'content' ? {
      input: contentInput,
      output: {
        entryFileNames: '[name].js',
        assetFileNames: '[name][extname]',
        format: 'iife',
        inlineDynamicImports: true,
      },
    } : {
      input: mainInputs,
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
        // Assets are only copied on the main pass; content pass skips this.
        if (entry !== 'main') return;

        copyFileSync(
          resolve(__dirname, `manifests/manifest.${manifestSource}.json`),
          resolve(outDir, 'manifest.json'),
        );

        const popupDir = resolve(outDir, 'popup');
        if (!existsSync(popupDir)) mkdirSync(popupDir, { recursive: true });
        copyFileSync(
          resolve(__dirname, 'src/popup/popup.html'),
          resolve(popupDir, 'popup.html'),
        );

        copyFileSync(
          resolve(__dirname, 'src/offscreen/offscreen.html'),
          resolve(outDir, 'offscreen.html'),
        );

        const sidebarDir = resolve(outDir, 'content/sidebar');
        if (!existsSync(sidebarDir)) mkdirSync(sidebarDir, { recursive: true });
        copyFileSync(
          resolve(__dirname, 'src/content/sidebar/sidebar.css'),
          resolve(sidebarDir, 'sidebar.css'),
        );

        // Copy toolbar / install icons referenced by every manifest.
        const iconsDir = resolve(outDir, 'icons');
        if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
        for (const f of ['icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-128.png']) {
          copyFileSync(
            resolve(__dirname, 'assets/icons', f),
            resolve(iconsDir, f),
          );
        }
      },
    },
  ],
});
