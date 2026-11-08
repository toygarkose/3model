// After vite build: produce dist/striker.html (single file) and dist/artifact.html
// (same page without the <html>/<head>/<body> wrapper, for hosted sharing).
import fs from 'node:fs';
import path from 'node:path';
const dist = path.resolve('dist');
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, (_, s) => `<script type="module">${fs.readFileSync(path.join(dist, s), 'utf8').replace(/<\/script/g, '<\\/script')}</script>`);
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/g, (_, h) => `<style>${fs.readFileSync(path.join(dist, h), 'utf8')}</style>`);
fs.writeFileSync(path.join(dist, 'striker.html'), html);
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>/, '').replace(/<meta name="viewport"[^>]*>/, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
fs.writeFileSync(path.join(dist, 'artifact.html'), head.trim() + '\n' + body.trim() + '\n');
console.log('wrote dist/striker.html + dist/artifact.html', (html.length / 1024).toFixed(0) + ' KB');
