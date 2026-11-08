// After `vite build`, produce dist/last-touch.html: one self-contained file
// (JS + CSS inlined) that can be opened directly or shared as a single page.
import fs from 'node:fs';
import path from 'node:path';
const dist = path.resolve('dist');
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, (_, src) => {
  const js = fs.readFileSync(path.join(dist, src), 'utf8').replace(/<\/script/g, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/g, (_, href) => `<style>${fs.readFileSync(path.join(dist, href), 'utf8')}</style>`);
fs.writeFileSync(path.join(dist, 'last-touch.html'), html);
console.log('wrote dist/last-touch.html', (html.length / 1024).toFixed(0) + ' KB');
