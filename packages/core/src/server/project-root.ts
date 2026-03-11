import path from 'path';
import { execSync } from 'child_process';

export function getProjectRoot(): string {
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return gitRoot;
  } catch {
    return '';
  }
}

export const ProjectRootPath = getProjectRoot();

export function resolveProjectFile(file: string): string {
  if (!file) {
    return file;
  }
  if (ProjectRootPath && !path.isAbsolute(file)) {
    return `${ProjectRootPath}/${file}`;
  }
  return file;
}

export function isFileUnderProjectRoot(file: string): boolean {
  if (!ProjectRootPath) {
    return true;
  }
  const resolved = path.resolve(file);
  const root = path.resolve(ProjectRootPath);
  return resolved === root || resolved.startsWith(root + path.sep);
}

