import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const pluginPkgPath = path.resolve(
  rootDir,
  'packages/core/package.json'
);
const rootPkgPath = path.resolve(rootDir, 'package.json');

const pluginPkg = JSON.parse(fs.readFileSync(pluginPkgPath, 'utf8'));
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));

rootPkg.dependencies = Object.fromEntries(
  Object.entries(pluginPkg.dependencies || {}).sort(([a], [b]) =>
    a.localeCompare(b)
  )
);

fs.writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`);
console.log('[root] synced runtime deps from packages/core/package.json');
