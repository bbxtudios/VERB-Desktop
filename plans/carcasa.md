# Plan: carcasa Electron del editor y traída del Runner

Origen: `plans/escritorio-carcasa.md` en VERB Studio (contrato del puente en su sección «Contrato del puente»). Cada fase se hace con el visto bueno del usuario; nada de commits ni push sin que lo pida.

## Parte A · Carcasa Electron (`editor-shell/`)

**Fase 1 · Esqueleto con el puente v1** — HECHA (2026-10-30; `src/main.ts`, `src/preload.ts`, `test/smoke.mjs`). Ya incluye algo de la fase 2: argumentos de línea de comandos, `open-file` y `second-instance` entregan `.verbproj`/`.verbgame` al puente. Falta probarla contra el editor real desplegado.
- Proyecto Electron (TypeScript), ventana que carga `https://studio.verb-engine.com` (URL configurable por variable para desarrollo, p. ej. `http://localhost:…`).
- Seguridad: `contextIsolation`, `sandbox`, sin `nodeIntegration`; `will-navigate` / `setWindowOpenHandler` → navegador del sistema para todo lo que no sea el dominio del editor.
- `preload` con `contextBridge.exposeInMainWorld('verbDesktop', …)` solo si el origen es el permitido. Versión 1: `version`, `app {name, version, platform}`, `takePendingFiles()`, `onOpenFile(cb)`, `openExternal(url)` (solo http/https). `folders` queda fuera de momento (es opcional).
- Menú nativo básico, ventana que recuerda tamaño/posición, una sola instancia.
- No registrar otro service worker ni tocar la caché de Chromium. Probar que, tras cargar una vez, abre sin red.
- Prueba de humo (arranca y expone el puente) y comprobar contra `apps/studio/src/lib/desktop.ts` que la forma coincide.

**Fase 2 · Asociación de archivos `.verbproj`** (decidido 2026-10-30: **`.verbgame` NO se asocia a la carcasa**, ya lo abre el VERB Builder con doble clic)
- Registrar solo `.verbproj` en el instalador (Windows y Linux), `open-file` en macOS, `second-instance` para doble clic con la app abierta.
- Cola de archivos pendientes hasta que el editor llama a `takePendingFiles()`; después, `onOpenFile`. Lectura con límite de tamaño y validación.
- El `.verbproj` entra como proyecto nuevo (lo hace el editor). El puente sigue aceptando `.verbgame` si llega por línea de comandos o arrastrado (el editor solo avisa), pero la carcasa no se registra como su abridor.

*Avance 2026-10-30:* empaquetado hecho con `electron-builder` (`npm run dist:win|dist:mac|dist:linux`, config en `editor-shell/package.json`; icono de VERB en `build/icon.png`; asociación solo de `.verbproj`; `appId` provisional `com.verbengine.studio`) y workflow `.github/workflows/editor-shell.yml` (matriz de los tres sistemas; Release con etiqueta `editor-v*`). Instalador de Windows generado en local; **Mac y Linux sin probar** (solo se prueban al subir a GitHub). Sin firmar.

**Fase 3 · Carpetas reales (`folders`)**
- Implementar `folders` del contrato: `pick`, `list`, `read`, `write`, `remove` con ids opacos y rutas relativas, sin salir de la carpeta (anti `..`, enlaces simbólicos), escritura atómica.
- **Requiere trabajo en VERB Studio**: hoy el editor aún no llama a `folders`. Avisar al usuario antes de empezar.

**Fase 4 · Instalador y actualizador**
- `electron-builder`: NSIS (Windows), dmg (macOS, universal), AppImage + deb (Linux). Iconos compartidos.
- Actualizador (`electron-updater`) sobre las Releases de GitHub: solo actualiza la carcasa.
- Firma: Windows y notarización de Apple son decisión aparte (certificados como secretos de GitHub); mientras tanto, instaladores sin firmar y aviso en el README.

**Fase 5 · GitHub Actions**
- Workflow con matriz (windows-latest, macos-latest, ubuntu-latest): instalar, probar, compilar, subir artefactos; en una etiqueta `editor-v*`, crear la Release.
- Secretos de GitHub: certificados de firma y, para el Runner, la clave. Nunca en el repo.

## Parte B · Traer el VERB Runner

**Qué se mueve desde VERB Studio**
- `crates/verbpack` (lectura/descifrado, `.verbsave`) y `apps/runner` (Tauri v2), con sus pruebas y los `fixtures` de paquetes de ejemplo (`crates/verbpack/tests/fixtures`, que genera `packages/schema`).
- `Cargo.toml` del workspace, `THIRD-PARTY-NOTICES` del Runner, icono genérico, `runner-prebuilt` (ya no hará falta a mano: lo hacen las Actions).
- **No se mueve**: `apps/builder` (se queda en VERB Studio; es la herramienta del autor), `packages/schema` (define el formato), `scripts/runner-*.mjs` que generan claves o fixtures.

**Pasos**
1. Mover el código con su historial si se puede (o copiar y anotar el origen) y comprobar que `cargo test` pasa con los fixtures.
2. Los fixtures: script en VERB Studio que los regenere y los copie aquí (contrato: formato `exportPack.ts`).
3. Clave del Runner como secreto de GitHub; el workflow la inyecta al compilar (hoy sale de `.secrets/` y de `build.rs`). Revisar que no acabe en logs ni en artefactos que no sean el binario.
4. Actions: compilar el Runner para Windows x64, macOS (universal, `lipo`) y Linux; publicar en una Release (`runner-v*`) con nombres fijos por sistema y su SHA-256.
5. Probar por primera vez en Mac y Linux (hoy sin compilar ni probar allí).

**Qué cambia en VERB Studio** (avisar al usuario antes de tocarlo allí)
- El Builder toma los Runners de las Releases de este repo en vez de `apps/runner/prebuilt/` (`build.rs`/`prebuilt.rs`, `release:builder`).
- Se quitan `apps/runner`, `crates/verbpack` (o queda solo lo que use el Builder: compartirlo como dependencia por git/versión o duplicarlo con fixtures de prueba), `pnpm runner:*`, y se actualizan `CLAUDE.md`, `plans/verb-builder.md`, `plans/escritorio-carcasa.md` y los avisos de terceros.
- Si el Builder sigue usando `verbpack` para validar paquetes, decidir antes cómo se comparte el crate (dependencia por git a este repo público, o publicarlo).
- Orden recomendado (el del plan original): la carcasa y el Runner son independientes; por el valor al usuario, primero la carcasa (Parte A, fases 1–2) y el Runner después.

## Preguntas abiertas
- Licencia del repo (público).
- Nombre de la aplicación, ID de app (`com.…`), iconos.
- Firma de Windows/macOS: cuándo y con qué.
