# VERB-Desktop

Repo **público** de las apps de escritorio de VERB. Habla con el usuario en **español**.

## Qué es

- **Carcasa del editor** (`editor-shell/`, Electron): una ventana que carga `https://studio.verb-engine.com` (VERB Studio, el editor web de aventuras gráficas). **No lleva el código del editor**: se actualiza solo al desplegar la web. Añade lo propio del escritorio por un puente (`window.verbDesktop`): abrir `.verbproj`/`.verbgame` con doble clic, carpetas reales, menús, abrir enlaces en el navegador del sistema.
- **VERB Runner** (`runner/` + `crates/verbpack`, Tauri v2; **aún no está aquí**, hoy vive en VERB Studio): el ejecutable genérico de cada juego exportado. Más adelante se mueve a este repo (ver `plans/carcasa.md`).
- Asociaciones de archivo: la carcasa se registra solo para `.verbproj`; `.verbgame` lo abre el VERB Builder (no registrarlo aquí).
- Por qué Electron para el editor: lleva Chromium igual en Windows, macOS y Linux (el editor usa File System Access, Web Locks, OPFS, PixiJS…). Por qué Tauri para el Runner: pesa pocos MB y el motor del juego no necesita lo exclusivo de Chrome.

## Estructura (propuesta)

```
editor-shell/        Electron: main, preload (contextBridge), electron-builder
runner/              Tauri v2: el VERB Runner (pendiente de traer)
crates/verbpack/     Rust: leer/descifrar paquetes (.dat), partidas .verbsave (pendiente de traer)
.github/workflows/   Actions: compilar Windows, macOS y Linux
plans/               Planes (carcasa.md)
```

## Comandos

Carcasa (fase 1 hecha; en `editor-shell/`):

- `npm install` · `npm run dev` (compila y abre Electron cargando el editor; `VERB_EDITOR_URL=http://localhost:…` para apuntar a otro editor, solo sin empaquetar) · `npm run typecheck` · `npm test` (prueba de humo: el puente v1 y un `.verbproj` pendiente). `npm run dist:win` (o `dist:mac` / `dist:linux`, cada uno en su sistema) genera el instalador en `editor-shell/release/`; las Actions lo hacen para los tres.
- Runner (cuando llegue): `cargo test` en la raíz del workspace, `cargo tauri build` en `runner/`.

## Reglas

- Idioma: español en conversación, comentarios y documentación.
- **No hacer commit ni push salvo que el usuario lo pida.** Se trabaja en `main`.
- **GitHub Actions SÍ en este repo** (público = gratis): compilan Windows, macOS y Linux y publican releases. El repo del editor sigue privado y sin CI.
- **La clave del Runner NUNCA en el repo** (ni en `.secrets/`, ni en ejemplos, ni en logs): solo como **secreto de GitHub**, inyectada al compilar. Lo mismo para certificados de firma (Windows, notarización de Apple) y tokens.
- Modo ligero: cambios directos y explicados, sin baterías de pruebas pesadas ni prediseños largos salvo que el usuario los pida.
- No implementar una fase del plan sin el visto bueno del usuario.

## Seguridad de la carcasa

- `contextIsolation: true`, `sandbox: true`, **sin** `nodeIntegration`.
- El puente se expone en el `preload` con `contextBridge.exposeInMainWorld('verbDesktop', …)` **solo si el origen de la página es `studio.verb-engine.com`** (o el de desarrollo configurado); cada método valida sus argumentos; `kind` de un archivo abierto se deduce de la extensión; el editor nunca ve rutas absolutas de carpetas (ids opacos).
- Navegación fuera del dominio del editor → **navegador del sistema** (`openExternal` solo `http`/`https`); `window.open` y `will-navigate` controlados.
- La carcasa **no registra otro service worker ni vacía la caché de Chromium** al actualizarse: el editor funciona sin conexión gracias a su PWA (`sw.js` en la raíz del dominio).
- Los datos de la app de escritorio (IndexedDB/OPFS) van aparte de los del navegador; se pasan con exportar/importar.

## Repo hermano: VERB Studio

`F:\Proyectos\webs\adventuregenerator` (privado, sin CI; el editor, el motor, el esquema y la documentación). Se trabaja en **su propia sesión de Claude**, con su CLAUDE.md, que a su vez apunta a este repo. Plan de origen: `plans/escritorio-carcasa.md` (contrato del puente) y `plans/verb-builder.md` (Runner y Builder) allí.

Ambos repos dependen por **contratos compartidos**:

| Contrato | Dónde está en VERB Studio | Qué lo usa aquí |
| --- | --- | --- |
| **Formato de exportación** (`.verbgame`, contenedor cifrado, `data/*.dat`, manifiesto) | `packages/schema/src/exportPack.ts` | El Runner (`crates/verbpack`) lo lee |
| **Partidas del escritorio** (`.verbsave`, `setSaveStorage`) | `player/nativeSaves.ts`, `packages/engine/src/state.ts` | El Runner (`verbpack::saves`, `__verbNative.saves`) |
| **Puente `window.verbDesktop`, versión 1** (`app`, `takePendingFiles`, `onOpenFile`, `openExternal`; opcional `folders`) | `apps/studio/src/lib/desktop.ts` (`DESKTOP_BRIDGE_VERSION`) | El `preload` de la carcasa |
| **PWA del editor** (service worker `sw.js`, manifiesto, `CACHE = verb-editor-<huella>`) | `apps/studio/scripts/editorSw.mjs`, `src/lib/pwa.ts` | La carcasa depende de ella para el modo sin conexión |
| **Direcciones**: `studio.verb-engine.com`, `/docs/downloads/…`, `homepage` del `package.json` | `package.json` raíz, `apps/docs/public/downloads/` | Carcasa (URL a cargar) y avisos de versión |
| **Clave del Runner** (clave base `r1`, versionada en el manifiesto) | `.secrets/` (local) y parte pública en `packages/schema/src/runnerKeys.ts` | Secreto de GitHub al compilar el Runner |
| **Enlaces de descarga fijos** de la carcasa: `https://github.com/bbxtudios/VERB-Desktop/releases/latest/download/` + `VERB-Studio-Setup.exe` / `VERB-Studio-mac.dmg` / `VERB-Studio-linux.AppImage` (nombres sin versión; solo las Releases `editor-v*` son `latest`) | Documentación y landing (`verb-engine.com`) | Los publican las Actions |
| **Releases de este repo** (nombres de los Runners por sistema) | `apps/builder` (el Builder las descargará, tras la migración) | Los publican las Actions |

**Regla:** si aquí cambia algo de esa lista (nombre o forma de un método del puente, versión del contrato, nombres de artefactos de release, URL cargada, formato que lee el Runner, clave), **avisa al usuario de que hay que tocar VERB Studio** y apúntalo para esa sesión. VERB Studio avisa a su vez cuando es él quien cambia algo. Un cambio incompatible del puente sube `DESKTOP_BRIDGE_VERSION` en ambos lados; añadir métodos opcionales no la sube. Si cambia el formato de `exportPack.ts`, hace falta un Runner nuevo.

Solo lectura del otro repo salvo que el usuario diga lo contrario.

## CodeGraph

Si existe `.codegraph/` en la raíz, úsalo antes de grep/find; si no, no lo crees (indexar es decisión del usuario).
