import { defineConfig } from 'vite';

export default defineConfig({
  // 部署子路径（laijiacheng.com/game）的命根子，绝对不可改
  base: './',
  build: {
    outDir: 'dist'
  }
});
