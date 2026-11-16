# Assets in this personal fork

Home always uses the current uploaded Art Mode photo from the [local bridge](art-mode-wallpaper.md). The earlier bundled photographs, generated materials, their credits and the gallery tools remain only in Git history.

## Art Mode surfaces

Home uses the original image texture with the calibrated Art look, outlined text and static frosted focus. Sheets and the dock use a frosted copy made once per photo (`frostSheet` in `app/main.js`): 480×270 with a one-time canvas blur, stored across launches, never made on navigation. A small stored preview shows the photo at launch. The no-cache fallback is a tiny inline neutral SVG. Never run live blur or pixel analysis on the TV during navigation. Owner photos stay in private runtime caches and never enter the source or exported widget. Atomic bundles swap the photo, dock mat and sheet backdrop together after readiness and preference-write checks.

## Icons

`app/assets/icons/espn.png` is a transparent white PNG rendered from the original ESPN wordmark geometry. The retained white SVG input is `scripts/assets/espn.svg`; its Wikimedia Commons provenance and original-source hash are in `app/assets/icons/ADDITIONAL-SOURCES.json`. Respect trademark rights and keep third-party notices. `livetv.svg` is an original TV receiver outline. `app/icon.png` is the original Home outline on a plain dark background; changing this image does not change the package/application identity or native Home assignment.

Rebuild the ESPN PNG, installed Home icon, optical metrics for ESPN/Live TV, and tiny synthetic JPEG test fixture offline with:

```sh
node scripts/build-home-icons.mjs
```

This uses development-only Playwright rasterisation, not AI-generated brand geometry. `app/assets/icons/metrics.js` stores measured ink bounds; runtime navigation never scans icon pixels. Existing service marks retain their original provenance and licences. The small JPEG under `scripts/fixtures/` is generated test data and is outside `app/`, so it is not packaged as a wallpaper.
