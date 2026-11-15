# Asset generation

The app includes all runtime JPEGs, thumbnails, registered material fields, public fonts and icons. A clone can preview the current app without the original Downloads folder or any generation step. Keep photo and icon credits and third-party licences with the assets. The private Pangram overlay is described in [development](development.md).

## Current List and Dock materials

The 0.6 runtime uses fifteen photographs. Each has a background, a thumbnail, a small panel backdrop and four full-stage material JPEGs. The runtime never generates blur or reads photo pixels. Generate selected materials with:

```sh
node scripts/build-materials.mjs summit,goldcoast,sydney,amber,mint,alpine
```

Omit the argument to regenerate every catalogue entry. Output goes to ignored `.local/materials/builder/`. Review it, then copy `*-panel.jpg` to `app/assets/wallpapers/` and the other four JPEGs to `app/assets/materials/`.

- `field-blur`: 28px blur, saturation .92, mirrored edge padding and highlight soft clipping.
- `field-frost`: the same registered crop with 42px blur.
- `field-clear`: 2px blur and saturation 1.06, with no baked veil.
- `study-soft`: the retained name for the reviewed Dock Soft recipe, including the lower scrim, 14px blur and compressed local variation. The original nine preserve their calibrated tint. New photos use a bounded tint selected from the dock band.

All fields use the centred 1920 x 1080 crop. The small panel backdrop comes from that same Frost field. The six new backgrounds use baseline sRGB JPEG at quality 90 with full chroma; thumbnails use quality 85. Their originals remain unchanged.

`app/assets/wallpapers/catalog.js` stores names and surface parameters; `app/assets/adaptive-ink.js` stores offline colour choices. New photographs need a rendered review of their List, Dock, clock, controls and all three materials before their metadata is accepted. An average image colour alone does not establish readable text.

## Art Mode source

The optional [Art Mode source](art-mode-wallpaper.md) has no offline contrast or registered material catalogue. It uses the original image texture, a fixed dark scrim and neutral surfaces. Do not construct gallery material URLs for a remote revision or run blur/pixel analysis on the TV. Owner photos live only in private runtime caches, never the source or exported widget.

## Icon metrics

`node scripts/build-icon-metrics.mjs` measures the SVGs in an aspect-preserved 240px viewport, matching the CSS mask renderer. Output is ignored `.local/materials/metrics.js`; review before copying it into `app/assets/icons/metrics.js`. The TV reads these bounds and does not scan icon pixels.

## New or replacement photographs

Full-size original photographs are local inputs and are not required for glass regeneration: the bundled 1920px JPEGs are the rendering inputs. To recreate JPEGs/thumbnails from the original supplied filenames on a Mac:

```sh
python3 scripts/prepare-wallpapers.py /path/to/originals --ids summit,goldcoast,sydney,amber,mint,alpine
```

The retained generator covers all fifteen filenames and writes `.local/materials/wallpapers/`. The original nine keep their macOS `sips` recipe. The new six require Pillow and use the reviewed centred crop and JPEG settings; Pillow is a development dependency only. Supply Golden Hour as `big-sur-golden-hour.jpg` in the originals folder. Install Pillow in a local Python environment when using the six newer photos.

For another photo, add its source/credit to `SOURCES.json`, prepare its background and thumbnail, add the gallery entry in `catalog.js`, generate the four registered materials and panel backdrop, then measure and review its foreground metadata. Keep the crop identical across all assets. Run source and browser checks before packaging.

Source pages and licence observations are recorded in [asset sources](asset-sources.md).
