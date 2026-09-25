/**
 * Copy Faceplugin ONNX models + onnxruntime-web WASM files to public/
 * Run after `npm install`:
 *   node scripts/copy-faceplugin-models.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const COPY = [
  // Faceplugin models
  { src: "node_modules/faceplugin-face-recognition-js/model", dest: "public/models/faceplugin" },
  // onnxruntime-web WASM runtime files
  { src: "node_modules/onnxruntime-web/dist", dest: "public", pattern: /ort-wasm-simd-threaded\./ },
  // OpenCV.js (kept for reference, not used by our wrapper)
  { src: "node_modules/faceplugin-face-recognition-js/js", dest: "public/js" },
];

for (const { src, dest, pattern } of COPY) {
  const srcDir = path.resolve(ROOT, src);
  const destDir = path.resolve(ROOT, dest);
  if (!fs.existsSync(srcDir)) {
    console.warn(`Source not found: ${srcDir}`);
    continue;
  }
  fs.mkdirSync(destDir, { recursive: true });
  const files = fs.readdirSync(srcDir);
  for (const f of files) {
    if (pattern && !pattern.test(f)) continue;
    fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f));
  }
  console.log(`Copied ${files.filter(f => !pattern || pattern.test(f)).length} files to ${dest}`);
}

console.log("Done.");
