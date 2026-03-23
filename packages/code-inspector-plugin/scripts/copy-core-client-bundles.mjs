import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pluginRoot = path.resolve(__dirname, '..');
const coreDist = path.resolve(pluginRoot, '../core/dist');
const pluginDist = path.resolve(pluginRoot, 'dist');

const files = ['client.umd.js', 'client.iife.js'];

if (!fs.existsSync(pluginDist)) {
  throw new Error(`[code-inspector-plugin] dist not found: ${pluginDist}`);
}

for (const file of files) {
  const src = path.resolve(coreDist, file);
  const dest = path.resolve(pluginDist, file);

  if (!fs.existsSync(src)) {
    throw new Error(
      `[code-inspector-plugin] missing ${file} in core dist: ${src}. Build @code-inspector/core first.`
    );
  }

  fs.copyFileSync(src, dest);
  console.log(`[code-inspector-plugin] copied ${file} -> dist`);
}
