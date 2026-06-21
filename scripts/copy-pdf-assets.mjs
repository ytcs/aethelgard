// Copy pdf.js's cMap and standard-font data into public/ so they ship with the
// build. pdf.js needs these to render PDFs whose fonts aren't embedded (or use
// CID/CJK encodings); without them it falls back to platform fonts, which look
// correct on some OSes but warped/mis-kerned on others (e.g. iPad). Run from the
// build/dev scripts; outputs are gitignored and regenerated from node_modules.
import { cpSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/pdfjs-dist');
const pub = resolve(root, 'public');

for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(resolve(src, dir), resolve(pub, dir), { recursive: true });
  console.log(`[copy-pdf-assets] public/${dir}`);
}
