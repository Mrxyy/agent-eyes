import path from 'path';
import fs from 'fs';
import type { RecordInfo } from './type';
import { hasWritePermission } from './utils';

const RecordCache: { [key: string]: Partial<RecordInfo> } = {};

function getRecordProjectDir() {
  try {
    // Avoid static server-only imports because this module is also bundled for browser use.
    const runtimeRequire = new Function('return require')();
    const { execSync } = runtimeRequire('child_process') as typeof import('child_process');
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return gitRoot || process.cwd();
  } catch {
    return process.cwd();
  }
}

function getRecordFileContent(recordFilePath: string): {
  [key: string]: Partial<RecordInfo>;
} {
  if (!hasWritePermission(recordFilePath)) {
    return RecordCache;
  }
  if (fs.existsSync(recordFilePath)) {
    try {
      return JSON.parse(fs.readFileSync(recordFilePath, 'utf-8'));
    } catch (error) {
      return {};
    }
  }
  return {};
}

function ensureRecordOutputDir(output: string) {
  try {
    fs.mkdirSync(output, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export const resetFileRecord = (output: string) => {
  const recordFilePath = path.resolve(output, './record.json');
  const projectDir = getRecordProjectDir();
  ensureRecordOutputDir(output);
  const content = getRecordFileContent(recordFilePath);
  const EmptyRecord: Partial<RecordInfo> = {
    previousPort: content[projectDir]?.port,
    port: 0,
    entry: '',
  };
  content[projectDir] = EmptyRecord;
  if (hasWritePermission(recordFilePath)) {
    fs.writeFileSync(recordFilePath, JSON.stringify(content, null, 2), 'utf-8');
  } else {
    RecordCache[projectDir] = EmptyRecord;
  }
};

export const getProjectRecord = (record: RecordInfo) => {
  const recordFilePath = path.resolve(record.output, './record.json');
  const content = getRecordFileContent(recordFilePath);
  const projectDir = getRecordProjectDir();
  if (hasWritePermission(recordFilePath)) {
    return content[projectDir];
  } else {
    return RecordCache[projectDir];
  }
};

export const setProjectRecord = (
  record: RecordInfo,
  key: keyof RecordInfo,
  value: RecordInfo[keyof RecordInfo]
) => {
  const recordFilePath = path.resolve(record.output, './record.json');
  ensureRecordOutputDir(record.output);
  const content = getRecordFileContent(recordFilePath);
  const projectDir = getRecordProjectDir();
  if (!content[projectDir]) {
    content[projectDir] = {};
  }
  // @ts-ignore
  content[projectDir][key] = value;
  if (hasWritePermission(recordFilePath)) {
    fs.writeFileSync(recordFilePath, JSON.stringify(content, null, 2), 'utf-8');
  } else {
    RecordCache[projectDir] = content[projectDir];
  }
};

export const findPort = async (record: RecordInfo): Promise<number> => {
  const recordFilePath = path.resolve(record.output, './record.json');
  const content = getRecordFileContent(recordFilePath);
  const projectDir = getRecordProjectDir();
  if (content[projectDir]?.port) {
    return content[projectDir].port as number;
  } else if (RecordCache[projectDir]?.port) {
    return RecordCache[projectDir]?.port as number;
  }
  return new Promise((resolve) => {
    setTimeout(async () => {
      const port = await findPort(record);
      resolve(port);
    });
  });
};
