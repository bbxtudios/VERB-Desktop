/**
 * Proceso principal de la carcasa. Carga el editor (https://studio.verb-engine.com) en una ventana segura y sirve el puente
 * `window.verbDesktop` v1 (ver `preload.ts` y el contrato en VERB Studio: `apps/studio/src/lib/desktop.ts`).
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type IpcMainInvokeEvent } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { autoUpdater } from 'electron-updater';

const EDITOR_URL = 'https://studio.verb-engine.com';
/** Solo sin empaquetar: apuntar a otro editor (p. ej. el servidor de desarrollo). */
const startUrl = !app.isPackaged && process.env.VERB_EDITOR_URL ? process.env.VERB_EDITOR_URL : EDITOR_URL;
const editorOrigin = new URL(startUrl).origin;
const MAX_FILE_BYTES = 512 * 1024 * 1024;

type OpenedFile = { name: string; kind: 'verbproj' | 'verbgame'; path: string; data: Uint8Array };

let win: BrowserWindow | null = null;
/** El editor ya pidió los pendientes en esta carga de página: los siguientes se le mandan directamente. */
let editorReady = false;
const pending: OpenedFile[] = [];

const isEditorUrl = (u: string): boolean => {
  try { return new URL(u).origin === editorOrigin; } catch { return false; }
};
const isHttp = (u: string): boolean => {
  try { const p = new URL(u).protocol; return p === 'http:' || p === 'https:'; } catch { return false; }
};
const fromEditor = (e: IpcMainInvokeEvent): boolean => !!e.senderFrame && e.senderFrame === e.sender.mainFrame && isEditorUrl(e.senderFrame.url);

function readOpened(file: string): OpenedFile | null {
  const ext = path.extname(file).toLowerCase();
  const kind = ext === '.verbproj' ? 'verbproj' : ext === '.verbgame' ? 'verbgame' : null;
  if (!kind) return null;
  try {
    const abs = path.resolve(file);
    const st = fs.statSync(abs);
    if (!st.isFile() || st.size > MAX_FILE_BYTES) return null;
    return { name: path.basename(abs), kind, path: abs, data: fs.readFileSync(abs) };
  } catch {
    return null;
  }
}

function deliver(files: string[]): void {
  for (const f of files) {
    const o = readOpened(f);
    if (!o) continue;
    if (editorReady && win && !win.isDestroyed()) win.webContents.send('verb:open-file', o);
    else pending.push(o);
  }
}

// --- puente (IPC): cada manejador comprueba que la llamada viene del editor ---
ipcMain.handle('verb:take-pending', (e) => {
  if (!fromEditor(e)) return [];
  editorReady = true;
  return pending.splice(0);
});
ipcMain.handle('verb:open-external', async (e, url: unknown) => {
  if (!fromEditor(e)) throw new Error('Origen no permitido');
  if (typeof url !== 'string' || !isHttp(url)) throw new Error('Solo se pueden abrir direcciones http o https');
  await shell.openExternal(url);
});

// --- estado de la ventana ---
const stateFile = (): string => path.join(app.getPath('userData'), 'window-state.json');
function loadState(): { width: number; height: number; x?: number; y?: number; maximized?: boolean } {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (Number.isFinite(s.width) && Number.isFinite(s.height)) return s;
  } catch { /* primera vez */ }
  return { width: 1440, height: 900 };
}
function saveState(w: BrowserWindow): void {
  try {
    const b = w.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: w.isMaximized() }));
  } catch { /* no es crítico */ }
}

const errorPage = (url: string): string => 'data:text/html;charset=utf-8,' + encodeURIComponent(
  `<!doctype html><meta charset="utf-8"><title>VERB Studio</title><body style="font:16px system-ui;background:#16161a;color:#eee;display:grid;place-items:center;height:100vh;margin:0">` +
  `<div style="text-align:center;max-width:32em"><h2>No se ha podido abrir el editor</h2><p>Comprueba tu conexión a internet. Si ya lo abriste antes en este equipo, también funciona sin conexión.</p>` +
  `<button onclick="location.href='${url}'" style="font:inherit;padding:.5em 1.2em">Reintentar</button></div>`);

function createWindow(): void {
  const st = loadState();
  win = new BrowserWindow({
    width: st.width, height: st.height, x: st.x, y: st.y, minWidth: 900, minHeight: 600,
    title: 'VERB Studio', icon: path.join(__dirname, '..', 'build', 'icon.png'), backgroundColor: '#16161a', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      additionalArguments: [`--verb-origin=${editorOrigin}`, `--verb-app-name=${app.getName()}`, `--verb-app-version=${app.getVersion()}`],
    },
  });
  if (st.maximized) win.maximize();
  win.once('ready-to-show', () => win?.show());
  win.on('close', () => { if (win) saveState(win); });
  win.on('closed', () => { win = null; });

  const wc = win.webContents;
  // El título de la ventana es el de la página (la versión de la app la enseña el editor, con window.verbDesktop.app.version).
  wc.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F11') { win?.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (!app.isPackaged && i.key === 'F12') { wc.toggleDevTools(); e.preventDefault(); }
    else if (!app.isPackaged && i.key === 'F5') { wc.reload(); e.preventDefault(); }
  });
  wc.on('did-start-navigation', (_e, _url, _inPlace, isMainFrame) => { if (isMainFrame) editorReady = false; });
  wc.setWindowOpenHandler(({ url }) => {
    if (isHttp(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (isEditorUrl(url) || url.startsWith('data:text/html')) return;
    e.preventDefault();
    if (isHttp(url)) void shell.openExternal(url);
  });
  wc.on('did-fail-load', (_e, code, _d, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && isEditorUrl(url)) void win?.loadURL(errorPage(startUrl));
  });
  // 'fileSystem' = File System Access API (elegir y guardar en carpetas reales con showDirectoryPicker): el editor lo usa en Chrome.
  const allowed = ['fullscreen', 'clipboard-sanitized-write', 'clipboard-read', 'fileSystem'];
  wc.session.setPermissionRequestHandler((contents, permission, cb) => cb(isEditorUrl(contents.getURL()) && allowed.includes(permission)));
  wc.session.setPermissionCheckHandler((contents, permission, origin) => isEditorUrl(contents ? contents.getURL() : origin) && allowed.includes(permission));
  void win.loadURL(startUrl);
}

/**
 * Actualizador de la carcasa (no del editor, que se actualiza solo desde la web). Mira la última Release «editor-v*» de GitHub
 * (releases/latest/download/latest*.yml), descarga en segundo plano y se instala al cerrar la app. Solo en la app instalada.
 * En macOS queda apagado mientras la app no esté firmada (Squirrel.Mac lo exige).
 */
function startUpdater(): void {
  if (!app.isPackaged || process.platform === 'darwin' || process.env.VERB_NO_UPDATE) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', () => { /* sin conexión o sin Release: se reintenta más tarde */ });
  autoUpdater.on('update-downloaded', (info) => {
    const w = win && !win.isDestroyed() ? win : undefined;
    const opts = {
      type: 'info' as const, title: 'VERB Studio', buttons: ['Reiniciar ahora', 'Más tarde'], defaultId: 0, cancelId: 1,
      message: `Hay una versión nueva de VERB Studio (v${info.version}).`,
      detail: 'Reinicia la aplicación para actualizarla. Si eliges «Más tarde», se instalará al cerrarla.',
    };
    void (w ? dialog.showMessageBox(w, opts) : dialog.showMessageBox(opts)).then((r) => { if (r.response === 0) autoUpdater.quitAndInstall(); });
  });
  const check = () => void autoUpdater.checkForUpdates().catch(() => undefined);
  check();
  setInterval(check, 4 * 60 * 60 * 1000); // también con la app abierta mucho tiempo
}

/** Sin barra de menús en Windows y Linux (la web ya lo trae todo). En macOS hace falta un menú mínimo para Salir, copiar y pegar. */
function buildMenu(): void {
  if (process.platform !== 'darwin') { Menu.setApplicationMenu(null); return; }
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
}

// Sin empaquetar (npm run dev / pruebas) la app usa sus propios datos: así no comparte el bloqueo de instancia única ni los datos con la
// app instalada, y las pruebas no le abren archivos a la app real del usuario.
if (!app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'VERB Studio (dev)'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    deliver(argv);
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.on('open-file', (e, file) => { e.preventDefault(); deliver([file]); }); // macOS
  void app.whenReady().then(() => {
    buildMenu();
    deliver(process.argv.slice(1));
    createWindow();
    startUpdater();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
