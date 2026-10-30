# VERB-Desktop

Apps de escritorio de [VERB Studio](https://studio.verb-engine.com), el editor de aventuras gráficas.

- **Editor de escritorio** (`editor-shell/`, Electron): una ventana que carga el editor desde la web, funciona sin conexión (gracias a la PWA del editor) y añade abrir `.verbproj`/`.verbgame` con doble clic, carpetas reales y menús nativos. No contiene el código del editor: se actualiza solo.
- **VERB Runner** (`runner/`, Tauri; próximamente): el ejecutable que reproduce los juegos exportados desde VERB Studio.

> Estado: esqueleto de la carcasa hecho (fase 1); el plan está en [`plans/carcasa.md`](plans/carcasa.md).

## Compilar

```bash
cd editor-shell
npm install
npm run dev      # abre el editor en Electron
npm run build    # instaladores para tu sistema
```

Los instaladores para Windows, macOS y Linux los generan las GitHub Actions y se publican en *Releases*.

## Licencia

Por decidir.
