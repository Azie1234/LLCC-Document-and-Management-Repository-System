import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const STORAGE_DIR = path.resolve(process.cwd(), 'storage');
const FILES_DIR = path.join(STORAGE_DIR, 'files');

export function ensureFileStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
  if (!fs.existsSync(FILES_DIR)) {
    fs.mkdirSync(FILES_DIR, { recursive: true });
  }
}

export function saveFileBuffer(
  fileName: string,
  buffer: Buffer
): { storageKey: string; checksum: string; sizeBytes: number } {
  ensureFileStorageDir();
  const safeBase = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageKey = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeBase}`;
  const filePath = path.join(FILES_DIR, storageKey);
  fs.writeFileSync(filePath, buffer);
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  return {
    storageKey,
    checksum,
    sizeBytes: buffer.length,
  };
}

export function getStoredFilePath(storageKey: string): string {
  ensureFileStorageDir();
  return path.join(FILES_DIR, path.basename(storageKey));
}

export function deleteStoredFile(storageKey: string): void {
  const filePath = getStoredFilePath(storageKey);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
