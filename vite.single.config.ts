import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Her şeyi içeren tek HTML dosyası üretir: dist-single/index.html
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2022', outDir: 'dist-single', chunkSizeWarningLimit: 2000 },
});
