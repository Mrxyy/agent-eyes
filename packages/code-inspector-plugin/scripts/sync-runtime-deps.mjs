import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pluginRoot = path.resolve(__dirname, '..');
const corePkgPath = path.resolve(pluginRoot, '../core/package.json');
const pluginPkgPath = path.resolve(pluginRoot, 'package.json');

const runtimeDeps = [
  '@floating-ui/dom',
  '@mcpc-tech/acp-ai-provider',
  '@vue/compiler-dom',
  'ai',
  'dotenv',
  'launch-ide',
  'portfinder',
];

const corePkg = JSON.parse(fs.readFileSync(corePkgPath, 'utf8'));
const pluginPkg = JSON.parse(fs.readFileSync(pluginPkgPath, 'utf8'));

const nextDependencies = {
  ...(pluginPkg.dependencies || {}),
};

for (const depName of runtimeDeps) {
  const version = corePkg.dependencies?.[depName];
  if (!version) {
    throw new Error(
      `[code-inspector-plugin] missing "${depName}" in ${corePkgPath}`
    );
  }
  nextDependencies[depName] = version;
}

pluginPkg.dependencies = Object.fromEntries(
  Object.entries(nextDependencies).sort(([a], [b]) => a.localeCompare(b))
);

fs.writeFileSync(pluginPkgPath, `${JSON.stringify(pluginPkg, null, 2)}\n`);
console.log('[code-inspector-plugin] synced runtime deps from core/package.json');
