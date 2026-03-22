import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const packageDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const repoRoot = path.resolve(packageDir, '..', '..');

fs.rmSync(path.join(packageDir, 'dist'), { recursive: true, force: true });
fs.rmSync(path.join(packageDir, 'types'), { recursive: true, force: true });

const tscPath = require.resolve('typescript/lib/tsc', { paths: [repoRoot] });
const vitePackageJson = require.resolve('vite/package.json', { paths: [repoRoot] });
const viteCliPath = path.join(path.dirname(vitePackageJson), 'bin', 'vite.js');

execFileSync(process.execPath, [tscPath], {
  cwd: packageDir,
  stdio: 'inherit',
});

execFileSync(process.execPath, [viteCliPath, 'build'], {
  cwd: packageDir,
  stdio: 'inherit',
});
