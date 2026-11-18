import { readFileSync, writeFileSync } from 'node:fs';
const page = readFileSync('src/page.html', 'utf8');
const js = readFileSync('dist/game.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const out = page + '\n<script>\n' + js + '\n</script>\n';
writeFileSync('dist/dribbler.html', out);
// yerel test için yayın iskeletinin benzeri
writeFileSync('dist/test.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>' + out + '</body></html>');
console.log('dist/dribbler.html', (out.length / 1024).toFixed(0) + ' KB');
