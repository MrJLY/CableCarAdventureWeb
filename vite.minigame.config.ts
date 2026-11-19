import { defineConfig } from 'vite';

// 微信小游戏构建：单文件 IIFE，入口 src/minigame.ts，产物为 dist-minigame/game.js
export default defineConfig({
  build: {
    target: 'es2017',
    outDir: 'dist-minigame',
    emptyOutDir: true,
    minify: 'esbuild',
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: {
      input: 'src/minigame.ts',
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'game.js',
        name: 'SkywireGame',
      },
    },
  },
});
