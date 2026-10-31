# VERB-Desktop

Apps de escritorio de [VERB Studio](https://studio.verb-engine.com), el editor de aventuras gráficas.

## Qué hay aquí

- **VERB Studio para escritorio** (`editor-shell/`, Electron): una ventana que carga el editor desde la web, funciona sin conexión (gracias a la PWA del editor) y abre las copias de proyecto `.verbproj` con doble clic. No contiene el código del editor: se actualiza solo.
- **Compilación del VERB Runner**: el Runner es el ejecutable que reproduce los juegos exportados. Su código no está en este repo; aquí solo se compila para Windows, macOS y Linux y se publican los binarios en las Releases `runner-v…`.

## Descargar

Siempre la última versión de la carcasa del editor:

- [Windows (`VERB-Studio-Setup.exe`)](https://github.com/bbxtudios/VERB-Desktop/releases/latest/download/VERB-Studio-Setup.exe)
- [macOS (`VERB-Studio-mac.dmg`)](https://github.com/bbxtudios/VERB-Desktop/releases/latest/download/VERB-Studio-mac.dmg)
- [Linux (`VERB-Studio-linux.AppImage`)](https://github.com/bbxtudios/VERB-Desktop/releases/latest/download/VERB-Studio-linux.AppImage)

Los instaladores aún no van firmados: Windows mostrará el aviso de SmartScreen y, en macOS, hay que abrir la app con clic derecho → Abrir.

## Compilar la carcasa

```bash
cd editor-shell
npm install
npm run dev      # abre el editor en Electron
npm test         # prueba de humo del puente con el editor
npm run dist:win # instalador (dist:mac / dist:linux en su sistema)
```

Las GitHub Actions compilan los tres sistemas; con una etiqueta `editor-v…` publican una Release.

## Licencia

VERB es gratis de usar, pero **no es código abierto**: licencia propietaria, todos los derechos reservados. Puedes usar las aplicaciones y repartir el Runner (sin modificar) con los juegos que crees; no se permite copiar, modificar ni redistribuir el código de este repositorio. Los componentes de terceros (Electron, etc.) mantienen sus propias licencias. Texto completo en [LICENSE](LICENSE).
