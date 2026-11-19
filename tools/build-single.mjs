// 프로토타입을 HTML 파일 하나로 묶어요 (메일 첨부·USB·오프라인 배포용).
//   node tools/build-single.mjs                      → dist/bluevoxel.html
//   node tools/build-single.mjs --fragment --out X   → <html>/<head>/<body> 껍데기 없이 X 에 저장 (웹 게시용)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'prototype');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');

let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="css/style.css">', () =>
  '<style>\n' + fs.readFileSync(path.join(src, 'css', 'style.css'), 'utf8') + '\n</style>');
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, file) =>
  '<script>\n' + fs.readFileSync(path.join(src, file), 'utf8').replace(/<\/script/gi, '<\\/script') + '\n</script>');

if (fragment) {
  html = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<html[^>]*>\s*/i, '')
    .replace(/<\/html>\s*/i, '')
    .replace(/<head>\s*/i, '')
    .replace(/<\/head>\s*/i, '')
    .replace(/<body>\s*/i, '')
    .replace(/<\/body>\s*/i, '')
    .replace(/<meta charset="utf-8">\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '');
}

const at = args.indexOf('--out');
const out = at >= 0 ? path.resolve(args[at + 1]) : path.join(root, 'dist', fragment ? 'bluevoxel.fragment.html' : 'bluevoxel.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('wrote', path.relative(process.cwd(), out) || out, `${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
