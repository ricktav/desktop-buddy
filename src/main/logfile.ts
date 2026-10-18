import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { format } from 'node:util';

/**
 * Mirrors console output into <dir>/buddy.log (rotated at ~1.5 MB). Windows and Linux
 * launches have no terminal to read, so this is where to look when something misbehaves.
 */
export function installFileLog(dir: string, maxBytes = 1_500_000): string {
  const file = join(dir, 'buddy.log');
  try {
    mkdirSync(dir, { recursive: true });
    if (existsSync(file) && statSync(file).size > maxBytes) renameSync(file, `${file}.1`);
  } catch {
    /* logging must never stop the app */
  }
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      try {
        appendFileSync(file, `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${format(...args)}\n`);
      } catch {
        /* ignore */
      }
    };
  }
  return file;
}
