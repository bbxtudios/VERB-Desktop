/**
 * Preload (sandbox): expone `window.verbDesktop` v1 SOLO si la página es la del editor. Contrato en VERB Studio:
 * `apps/studio/src/lib/desktop.ts` (`DESKTOP_BRIDGE_VERSION = 1`). Un preload con sandbox no puede cargar otros módulos locales.
 */
import { contextBridge, ipcRenderer } from 'electron';

const arg = (k: string): string => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? '';

type RawFile = { name: string; kind: 'verbproj' | 'verbgame'; path: string; data: Uint8Array };
const toFile = (f: RawFile) => ({
  name: f.name, kind: f.kind, path: f.path,
  data: f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength) as ArrayBuffer,
});

if (location.origin === arg('verb-origin')) {
  contextBridge.exposeInMainWorld('verbDesktop', {
    version: 1,
    app: { name: arg('verb-app-name') || 'VERB Studio', version: arg('verb-app-version'), platform: process.platform as 'win32' | 'darwin' | 'linux' },
    takePendingFiles: async () => ((await ipcRenderer.invoke('verb:take-pending')) as RawFile[]).map(toFile),
    onOpenFile: (cb: (f: ReturnType<typeof toFile>) => void) => {
      if (typeof cb !== 'function') throw new TypeError('onOpenFile necesita una función');
      const h = (_e: unknown, f: RawFile) => cb(toFile(f));
      ipcRenderer.on('verb:open-file', h);
      return () => { ipcRenderer.removeListener('verb:open-file', h); };
    },
    openExternal: (url: string) => ipcRenderer.invoke('verb:open-external', String(url)) as Promise<void>,
  });
}
