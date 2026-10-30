// Prueba de humo: arranca Electron contra una página local, comprueba que `window.verbDesktop` v1 existe con la forma del contrato
// y que un .verbproj pasado por línea de comandos llega por takePendingFiles. Uso: npm test
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const electron = createRequire(import.meta.url)('electron');
const dir = mkdtempSync(join(tmpdir(), 'verb-shell-'));
const proj = join(dir, 'demo.verbproj');
writeFileSync(proj, Buffer.from('PK-demo'));

const page = `<!doctype html><title>t</title><script>
(async () => {
  const b = window.verbDesktop;
  const r = { has: !!b, picker: 'showDirectoryPicker' in window, openPicker: 'showOpenFilePicker' in window, secure: isSecureContext };
  if (b) {
    r.version = b.version; r.app = b.app;
    r.fns = ['takePendingFiles', 'onOpenFile', 'openExternal'].every((k) => typeof b[k] === 'function');
    const files = await b.takePendingFiles();
    r.files = files.map((f) => ({ name: f.name, kind: f.kind, bytes: f.data.byteLength, isAB: f.data instanceof ArrayBuffer }));
    r.again = (await b.takePendingFiles()).length;
    r.badExternal = await b.openExternal('file:///etc/passwd').then(() => 'ACEPTADO', () => 'rechazado');
  }
  await fetch('/report', { method: 'POST', body: JSON.stringify(r) });
})();
</script>`;

const result = await new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    if (req.method === 'POST') {
      let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => { res.end('ok'); resolve(JSON.parse(s)); });
    } else { res.setHeader('content-type', 'text/html'); res.end(page); }
  }).listen(0, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}`;
    const p = spawn(electron, ['.', ...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []), proj], { env: { ...process.env, VERB_EDITOR_URL: url }, stdio: 'ignore' });
    const t = setTimeout(() => { p.kill(); reject(new Error('tiempo agotado')); }, 30000);
    p.on('exit', () => clearTimeout(t));
    server.on('close', () => p.kill());
    globalThis.__kill = () => { p.kill(); server.close(); };
  });
});
globalThis.__kill();

const checks = [
  ['puente presente', result.has],
  ['showDirectoryPicker disponible (carpetas reales)', result.picker],
  ['versión 1', result.version === 1],
  ['métodos', result.fns],
  ['plataforma', ['win32', 'darwin', 'linux'].includes(result.app?.platform)],
  ['archivo pendiente entregado', result.files?.length === 1 && result.files[0].name === 'demo.verbproj' && result.files[0].kind === 'verbproj' && result.files[0].bytes === 7 && result.files[0].isAB],
  ['entrega única', result.again === 0],
  ['openExternal rechaza file://', result.badExternal === 'rechazado'],
];
let ok = true;
for (const [n, v] of checks) { console.log(v ? 'ok  ' : 'FALLA', n); ok &&= !!v; }
process.exit(ok ? 0 : 1);
