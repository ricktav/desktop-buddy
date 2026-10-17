import { contextBridge, ipcRenderer } from 'electron';
import type { BuddyManifest, DisplayInfo, WorldSnapshot } from '../shared/types';
import type { BuddyBridge } from '../shared/bridge';

const bridge: BuddyBridge = {
  onDisplay: (cb) => ipcRenderer.on('display', (_e, d: DisplayInfo) => cb(d)),
  onSnapshot: (cb) => ipcRenderer.on('snapshot', (_e, s: WorldSnapshot) => cb(s)),
  onPacks: (cb) => ipcRenderer.on('packs', (_e, p: Record<string, BuddyManifest>) => cb(p)),
  setIgnoreMouse: (ignore) => ipcRenderer.send('ignore-mouse', ignore),
  dragStart: (id) => ipcRenderer.send('drag-start', id),
  dragEnd: (id) => ipcRenderer.send('drag-end', id),
  pet: (id) => ipcRenderer.send('pet', id),
  dismiss: (id) => ipcRenderer.send('dismiss', id),
  contextMenu: (id) => ipcRenderer.send('context-menu', id),
};

contextBridge.exposeInMainWorld('buddy', bridge);
