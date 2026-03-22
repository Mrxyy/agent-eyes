import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'packages/code-inspector-plugin/dist');
const targetDir = path.join(rootDir, 'dist');

async function main() {
  const sourceExists = await fs.pathExists(sourceDir);
  if (!sourceExists) {
    throw new Error(
      `Missing build output: ${sourceDir}. Run \`pnpm --filter ./packages/code-inspector-plugin build\` first.`
    );
  }

  await fs.remove(targetDir);
  await fs.ensureDir(targetDir);
  await fs.copy(sourceDir, targetDir, { overwrite: true, errorOnExist: false });

  console.log(`Synced root dist from ${sourceDir} -> ${targetDir}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
