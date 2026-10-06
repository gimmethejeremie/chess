import { defineConfig } from 'vite';

export default defineConfig({
  // Vite base set to the repo name for GitHub Pages
  base: process.env.NODE_ENV === 'production' ? '/life-os-bot/' : '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  test: {
    include: ['test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}', 'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}']
  }
});
