/**
 * Prueba de plugins en WebKit. Abre el editor publicado, importa un proyecto de prueba, lo exporta como un usuario y juega el juego exportado.
 * No necesita el código de VERB Studio: solo la web pública.
 *
 *   node run.mjs                 juega en WebKit
 *   node run.mjs --juego=chromium   juega en Chromium (para comprobar la propia prueba)
 *   node run.mjs --url=https://…    otro editor
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { chromium, webkit } from 'playwright';
import { startSala } from './sala.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const URL_EDITOR = arg('url') ?? 'https://studio.verb-engine.com';
const JUEGO = arg('juego') ?? 'webkit';
const START = '[data-verb-command="Game.NewGame"], [data-verb-command="newGame"]';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png' };

const results = [];
const check = (name, ok, detail = '', aviso = false) => {
  results.push({ name, ok, aviso });
  console.log(`${ok ? '✓' : aviso ? '!' : '✗'} ${name}${detail ? ` (${detail})` : ''}`);
};

const editor = await chromium.launch();
const analiza = await (await editor.newContext()).newPage();
const mirar = async (page) => {
  const b64 = (await page.screenshot()).toString('base64');
  return analiza.evaluate(async (data) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const t = new OffscreenCanvas(img.width, img.height);
    const g = t.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, t.width, t.height).data;
    const count = (f) => { let n = 0; for (let i = 0; i < d.length; i += 4) if (f(d[i], d[i + 1], d[i + 2])) n++; return n; };
    const c = g.getImageData(t.width >> 1, t.height >> 1, 1, 1).data;
    return {
      red: count((r, v, b) => r === 200 && v === 30 && b === 30), blue: count((r, v, b) => r === 30 && v === 30 && b === 200), mint: count((r, v, b) => r === 30 && v === 200 && b === 120),
      rig: count((r, v, b) => r < 40 && v > 140 && b < 40), sign: count((r, v, b) => r === 30 && v === 220 && b === 90), center: [c[0], c[1], c[2]],
    };
  }, b64);
};

/** Editor publicado: importa el proyecto y baja el juego como zip. */
async function exportar(proyecto) {
  const ctx = await editor.newContext({ viewport: { width: 1366, height: 768 }, locale: 'es-ES' });
  const page = await ctx.newPage();
  await page.goto(URL_EDITOR);
  await page.locator('input[type="file"][accept=".verbproj,.zip"]').waitFor({ state: 'attached', timeout: 60000 });
  await page.evaluate(() => {
    window.showSaveFilePicker = async (o) => {
      const root = await navigator.storage.getDirectory();
      window.__archivo = o.suggestedName;
      return root.getFileHandle(o.suggestedName, { create: true });
    };
  });
  await page.setInputFiles('input[type="file"][accept=".verbproj,.zip"]', join(HERE, proyecto));
  await page.locator('[data-tour="header"]').waitFor({ timeout: 60000 });
  await page.locator('[data-tour="publish"]').click();
  const exportBtn = page.getByRole('dialog').getByRole('button', { name: /^Exportar$/ });
  await exportBtn.waitFor({ timeout: 30000 });
  await exportBtn.click();
  await page.waitForFunction(() => !!window.__archivo, null, { timeout: 30000 });
  // Acabó cuando el botón vuelve a estar libre y el archivo tiene algo.
  const hasta = Date.now() + 300000;
  for (;;) {
    const size = await page.evaluate(async () => {
      const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => /^Exportar$/.test(x.textContent.trim()));
      if (!b || b.disabled) return 0;
      return (await (await (await navigator.storage.getDirectory()).getFileHandle(window.__archivo)).getFile()).size;
    }).catch(() => 0);
    if (size > 0) break;
    if (Date.now() > hasta) throw new Error('La exportación no acabó en 5 minutos');
    await page.waitForTimeout(500);
  }
  const b64 = await page.evaluate(async () => {
    const blob = await (await (await navigator.storage.getDirectory()).getFileHandle(window.__archivo)).getFile();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });
  await ctx.close();
  const zip = await JSZip.loadAsync(Buffer.from(b64, 'base64'));
  const dir = mkdtempSync(join(tmpdir(), 'verb-prueba-'));
  for (const [name, f] of Object.entries(zip.files)) {
    const to = join(dir, name);
    if (f.dir) { mkdirSync(to, { recursive: true }); continue; }
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, await f.async('nodebuffer'));
  }
  return dir;
}

async function servir(dir) {
  const root = resolve(dir);
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = resolve(root, `.${p}`);
    if (!f.startsWith(root + sep) || !existsSync(f) || statSync(f).isDirectory()) return void res.writeHead(404).end();
    const body = readFileSync(f);
    const type = { 'Content-Type': MIME[extname(f)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes' };
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    if (range) {
      const start = Number(range[1]);
      const end = Math.min(range[2] ? Number(range[2]) : body.length - 1, body.length - 1);
      res.writeHead(206, { ...type, 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': end - start + 1 });
      return void res.end(body.subarray(start, end + 1));
    }
    res.writeHead(200, type);
    res.end(body);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => (server.closeAllConnections?.(), server.close()) };
}

const until = async (page, test, ms = 15000) => {
  const end = Date.now() + ms;
  let last = null;
  while (Date.now() < end) {
    last = await mirar(page);
    if (test(last)) return { ok: true, last };
    await page.waitForTimeout(200);
  }
  return { ok: false, last };
};

const hasOffscreen = (page) => page.evaluate(() => new Promise((r) => {
  const w = new Worker(URL.createObjectURL(new Blob(["postMessage([typeof OffscreenCanvas !== 'undefined', navigator.userAgent])"], { type: 'text/javascript' })));
  w.onmessage = (e) => r(e.data);
  w.onerror = () => r([false, 'worker falló']);
}));

async function paridad(browser) {
  const srv = await servir(await exportar('paridad.verbproj'));
  const received = [];
  const sala = await startSala(8787, (m) => received.push(m));
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'es-ES' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  try {
    await page.goto(srv.url);
    const [off, ua] = await hasOffscreen(page);
    console.log(`  navegador: ${ua}`);
    console.log(`  OffscreenCanvas en worker: ${off}`);
    await page.locator('[data-verb-network-answer="allow"]').click({ timeout: 60000 });
    if (!off) {
      const start = page.locator(START).first();
      const shown = await start.waitFor({ timeout: 20000 }).then(() => true, () => false);
      check('Sin OffscreenCanvas sale el menú del motor', shown);
      check('Superficies disponibles en este sistema', false, 'no hay OffscreenCanvas: los plugins no pueden pintar', true);
      return;
    }
    const menu = await until(page, (p) => p.red > 50, 30000);
    check('Sale el menú principal del plugin', menu.ok, JSON.stringify(menu.last));
    await page.keyboard.press('Enter');
    const juego = await until(page, (p) => p.red === 0 && p.rig > 20, 20000);
    check('Empieza la partida y se ve el rig del plugin', juego.ok, JSON.stringify(juego.last));
    const burger = await page.evaluate(() => { const b = document.querySelector('.verb-btn-menu'); return b ? getComputedStyle(b).visibility : 'no'; });
    check('El botón ☰ queda oculto', burger === 'hidden', burger);
    let saved = false;
    const limit = Date.now() + 30000;
    while (!saved && Date.now() < limit) {
      await page.keyboard.press('Escape');
      await until(page, (p) => p.blue > 50 || p.mint > 50, 5000);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
      saved = (await mirar(page)).mint > 50;
      if (!saved) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1500);
      }
    }
    check('Pausa del plugin y guardar', saved);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    check('Salir vuelve al menú del plugin', (await until(page, (p) => p.red > 50)).ok);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    check('Continuar retoma la partida', (await until(page, (p) => p.red === 0 && p.rig > 20)).ok);
    const seen = Date.now() + 10000;
    while (!received.length && Date.now() < seen) await page.waitForTimeout(100);
    check('El plugin manda por WebSocket', received.length > 0);
    if (received.length) {
      const peer = new WebSocket('ws://localhost:8787');
      await new Promise((r) => (peer.onopen = r));
      const first = JSON.parse(received[0]);
      const beat = setInterval(() => peer.send(JSON.stringify({ id: 'otro', x: first.x, y: first.y, sceneId: first.sceneId })), 100);
      check('Otro jugador llega y se pinta en la marca de escena', (await until(page, (p) => p.sign > 50)).ok);
      clearInterval(beat);
      peer.close();
    }
    check('Sin errores en la página', !errors.length, errors.slice(0, 2).join(' · '));
  } finally {
    await ctx.close();
    sala.close();
    srv.close();
  }
}

async function tres(browser) {
  const srv = await servir(await exportar('tres.verbproj'));
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'es-ES' });
  const page = await ctx.newPage();
  try {
    await page.goto(srv.url);
    const [off] = await hasOffscreen(page);
    if (!off) return;
    await page.waitForTimeout(8000);
    const p = await mirar(page);
    // Estas máquinas no tienen tarjeta gráfica: si WebGL no arranca es aviso, no fallo del plugin.
    const cubo = p.center[0] > 200 && p.center[1] < 40;
    check('WebGL de un plugin: se ve el cubo 3D', cubo, String(p.center), true);
    if (!cubo) {
      const menu = await page.locator(START).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
      check('Sin WebGL no se queda en negro: vuelve el menú del motor', menu || p.center.some((c) => c > 0), String(p.center));
    }
  } finally {
    await ctx.close();
    srv.close();
  }
}

const juego = JUEGO === 'chromium' ? editor : await webkit.launch();
try {
  await paridad(juego);
  await tres(juego);
} catch (e) {
  check('La prueba llegó al final', false, String(e.message).split('\n')[0]);
}
await juego.close().catch(() => {});
await editor.close().catch(() => {});
const failed = results.filter((r) => !r.ok && !r.aviso).length;
console.log(`\n${results.filter((r) => r.ok).length} bien, ${results.filter((r) => !r.ok && r.aviso).length} avisos, ${failed} fallos`);
process.exit(failed ? 1 : 0);
