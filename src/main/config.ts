import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CONFIG, type AppConfig } from '../shared/types';

export function configDir(): string {
  return app.getPath('userData');
}

export function configPath(): string {
  return join(configDir(), 'config.json');
}

export function userBuddiesDir(): string {
  return join(configDir(), 'buddies');
}

function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override)) {
    const cur = out[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) {
      out[k] = deepMerge(cur as object, v as object);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

export function loadConfig(): AppConfig {
  mkdirSync(configDir(), { recursive: true });
  mkdirSync(userBuddiesDir(), { recursive: true });
  const p = configPath();
  if (!existsSync(p)) {
    writeFileSync(p, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
    return structuredClone(DEFAULT_CONFIG);
  }
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<AppConfig>;
    return deepMerge(structuredClone(DEFAULT_CONFIG), raw);
  } catch (err) {
    console.error(`Could not parse ${p}, using defaults:`, err);
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function saveConfig(cfg: AppConfig): void {
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + '\n');
}
