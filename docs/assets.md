# Assets in this personal fork

Home uses the current uploaded Art Mode photo from the [local bridge](art-mode-wallpaper.md), or a Light/Dark background. The fifteen bundled photographs, thumbnails, panel backdrops, generated material fields and gallery-generation tools have been removed from this fork's current tree. Their original credits remain in [gallery-sources.json](gallery-sources.json), [the historical source register](asset-sources.md), third-party notices and Git history. This reduces the packaged asset payload by roughly 15 MiB; Git history still retains the old files.

## Art Mode surfaces

Unknown Art photos have no calibrated gallery contrast or material catalogue. Home uses the original image texture, a fixed dark scrim and neutral surfaces. The no-cache fallback is a tiny inline neutral SVG. Never construct gallery material URLs for an Art revision, or run blur/pixel analysis on the TV. Owner photos stay in private runtime caches and never enter the source or exported widget. Atomic bundles still swap every image slot together after readiness and preference-write checks.

## Icons

`app/assets/icons/espn.png` is a transparent white PNG rendered from the original ESPN wordmark geometry. The retained white SVG input is `scripts/assets/espn.svg`; its Wikimedia Commons provenance and original-source hash are in `app/assets/icons/ADDITIONAL-SOURCES.json`. Respect trademark rights and keep third-party notices. `livetv.svg` is an original TV receiver outline. `app/icon.png` is the original Home outline on a plain dark background; changing this image does not change the package/application identity or native Home assignment.

Rebuild the ESPN PNG, installed Home icon, optical metrics for ESPN/Live TV, and tiny synthetic JPEG test fixture offline with:

```sh
node scripts/build-home-icons.mjs
```

This uses development-only Playwright rasterisation, not AI-generated brand geometry. `app/assets/icons/metrics.js` stores measured ink bounds; runtime navigation never scans icon pixels. Existing service marks retain their original provenance and licences. The small JPEG under `scripts/fixtures/` is generated test data and is outside `app/`, so it is not packaged as a wallpaper.
