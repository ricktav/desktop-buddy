import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'dist', 'renderer'), { recursive: true });
mkdirSync(join(root, 'dist', 'assets'), { recursive: true });
for (const f of ['index.html', 'style.css']) {
  cpSync(join(root, 'src', 'renderer', f), join(root, 'dist', 'renderer', f));
}
cpSync(join(root, 'assets'), join(root, 'dist', 'assets'), { recursive: true });
