// Start at login on Windows: a small VBScript in the user's Startup folder that launches
// the app with no console window. Pure file operations so the CLI and the tray share it.
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function windowsStartupDir(): string {
  return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

export function windowsStartupFile(): string {
  return join(windowsStartupDir(), 'DesktopBuddy.vbs');
}

const vbsQuote = (s: string) => s.replace(/"/g, '""');

/** exe: the Electron or app executable; appDir: the project folder when running from source, else null. */
export function buildStartupVbs(exe: string, appDir: string | null): string {
  const cmd = `"${vbsQuote(exe)}"` + (appDir ? ` "${vbsQuote(appDir)}"` : '');
  return [
    `' Desktop Buddy: starts at login without a console window. Delete this file to stop.`,
    `Set sh = CreateObject("WScript.Shell")`,
    `sh.Run "${cmd.replace(/"/g, '""')}", 0, False`,
    '',
  ].join('\r\n');
}

export function isStartupInstalled(file = windowsStartupFile()): boolean {
  return existsSync(file);
}

export function installStartup(exe: string, appDir: string | null, file = windowsStartupFile()): string {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, buildStartupVbs(exe, appDir), 'utf8');
  return file;
}

export function removeStartup(file = windowsStartupFile()): boolean {
  if (!existsSync(file)) return false;
  unlinkSync(file);
  return true;
}
