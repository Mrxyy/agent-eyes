import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pluginRoot = path.resolve(__dirname, '..');
const pluginDist = path.resolve(pluginRoot, 'dist');

const copyPackages = [
  'core',
  'vite',
  'webpack',
  'esbuild',
  'turbopack',
  'mako',
];

if (!fs.existsSync(pluginDist)) {
  throw new Error(`[code-inspector-plugin] dist not found: ${pluginDist}`);
}

function copyDirRecursive(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.resolve(srcDir, entry.name);
    const dest = path.resolve(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(src, dest);
      continue;
    }

    fs.copyFileSync(src, dest);
  }
}

for (const packageName of copyPackages) {
  const src = path.resolve(pluginRoot, `../${packageName}/dist`);
  const dest = path.resolve(pluginDist, packageName, 'dist');

  if (!fs.existsSync(src)) {
    throw new Error(
      `[code-inspector-plugin] missing dist: ${src}. Build the source package first.`
    );
  }

  copyDirRecursive(src, dest);
  console.log(`[code-inspector-plugin] copied ${packageName}/dist -> dist/${packageName}/dist`);
}
