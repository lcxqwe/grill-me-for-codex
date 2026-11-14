import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function testDirectory(t) {
  const root = path.resolve(fileURLToPath(new URL('../work/grill-tests/', import.meta.url)));
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(path.join(root, 'case-'));
  t.after(() => {
    const relative = path.relative(root, path.resolve(directory));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe test cleanup path.');
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}
