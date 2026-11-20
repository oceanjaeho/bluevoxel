// 게임을 HTML 파일 하나로 묶어요 (메일 첨부·USB·오프라인 배포용).
//   node tools/build-single.mjs                          → dist/gaetbeol.html (갯벌 수호대)
//   node tools/build-single.mjs --src prototype          → dist/bluevoxel.html (전략 프로토타입)
//   node tools/build-single.mjs --fragment --out X       → <html>/<head>/<body> 껍데기 없이 X 에 저장 (웹 게시용)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const srcName = opt('--src') || 'game';
const src = path.join(root, srcName);
const fragment = args.includes('--fragment');

let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, file) =>
  '<style>\n' + fs.readFileSync(path.join(src, file), 'utf8') + '\n</style>');
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, file) =>
  '<script>\n' + fs.readFileSync(path.join(src, file), 'utf8').replace(/<\/script/gi, '<\\/script') + '\n</script>');

if (fragment) {
  html = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<html[^>]*>\s*/i, '')
    .replace(/<\/html>\s*/i, '')
    .replace(/<head>\s*/i, '')
    .replace(/<\/head>\s*/i, '')
    .replace(/<body[^>]*>\s*/i, '')
    .replace(/<\/body>\s*/i, '')
    .replace(/<meta charset="utf-8">\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '');
}

const base = srcName === 'game' ? 'gaetbeol' : 'bluevoxel';
const out = opt('--out') ? path.resolve(opt('--out')) : path.join(root, 'dist', base + (fragment ? '.fragment' : '') + '.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('wrote', path.relative(process.cwd(), out) || out, `${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
