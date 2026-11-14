import { randomUUID } from 'node:crypto';
import { mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, linkSync, unlinkSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Publish complete immutable files atomically. Concurrent submissions cannot
// replace the first committed answer, and a crash leaves only an ignored temp file.
export class DiskStorage {
  constructor(directory) {
    this.directory = path.resolve(directory);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
  }
  file(id, kind) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid question ID.');
    return path.join(this.directory, `${id}.${kind}.json`);
  }
  read(id, kind) {
    const file = this.file(id, kind);
    try { return JSON.parse(readFileSync(file, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return null;
      throw new Error('Saved questionnaire data could not be read. It has been preserved; do not assume an answer.', { cause: error });
    }
  }
  publish(id, kind, value) {
    const target = this.file(id, kind), temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
    let fd;
    try {
      fd = openSync(temp, 'wx', 0o600);
      writeFileSync(fd, JSON.stringify(value)); fsyncSync(fd); closeSync(fd); fd = undefined;
      try { linkSync(temp, target); return true; }
      catch (error) { if (error.code === 'EEXIST') return false; throw error; }
    } finally {
      if (fd !== undefined) closeSync(fd);
      try { unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  ids() {
    return readdirSync(this.directory).filter(name => /^[0-9a-f-]{36}\.question\.json$/i.test(name)).map(name => name.slice(0, 36));
  }
  remove(id) {
    for (const kind of ['answer', 'question']) {
      try { unlinkSync(this.file(id, kind)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
}
