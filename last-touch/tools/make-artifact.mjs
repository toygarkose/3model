// Produce dist/artifact.html: the single-file build without the <html>/<head>/<body>
// wrapper, for hosting as a shareable page.
import fs from 'node:fs';
let html = fs.readFileSync('dist/last-touch.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>/, '').replace(/<meta name="viewport"[^>]*>/, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
fs.writeFileSync('dist/artifact.html', head.trim() + '\n' + body.trim() + '\n');
console.log('wrote dist/artifact.html');
