// Custom pdf.js worker entry: install the Map.getOrInsertComputed polyfill in
// the worker's global scope BEFORE the real pdf.js worker code runs, so it works
// on WebKit/iOS (which lacks that method). Vite bundles this entry and its
// imports into a single worker file, polyfill first.
import './lib/mapPolyfill';
import 'pdfjs-dist/build/pdf.worker.min.mjs';
