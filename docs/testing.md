# Validation

## Offline app changes

```sh
npm ci
npm run check
npx playwright install chromium
npm run check:browser
```

`check` runs ES5/static lint, validates package identity/version, app/icon catalogue and bundled resources, and runs the offline Python regression tests. These include staging/history credential checks and archive exclusion checks. It does not contact a TV. `check:browser` uses a fresh Playwright Chromium profile and its own loopback preview. It checks List and Dock navigation, single focus, Home controls, grouped Settings, explicit OK application, applied checkmarks, pending-load cancellation, retries, persistence, all fifteen wallpaper bundles, available fonts, 720p scaling, migrations, the Home editor and honest browser-only launch errors. Reports and screenshots are in ignored `.local/qa/`. A failed assertion exits with a nonzero status.

For public-source validation, set `CLEANFRAME_PUBLIC_FONTS=1` when running `check:browser`; the preview helper then excludes the local proprietary overlay. Run `npm run check:public` for the bounded source/history checks and `npm run export:public` for a widget that always excludes private fonts. The GitHub Actions workflow uses this public path. Browser/package checks do not clear third-party asset rights or validate TV behaviour.

If the default browser/cache location is unavailable, use a writable local path for both commands:

```sh
PLAYWRIGHT_BROWSERS_PATH="$PWD/.local/playwright" npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH="$PWD/.local/playwright" npm run check:browser
```

For manual review, use `npm run dev` and open `/home/`. Use the arrow keys, Enter and Escape. Check the changed flow in List and Dock, on Photo, Light and Dark backgrounds. Check a single app and all nine apps when changing app layout. In Settings, browse without applying, apply with OK, return with both Back routes, and cancel a pending resource load. Check editor placement/undo, wallpaper rotation pausing during panels/background time, and restored focus on return when those flows change. Browser preferences are separate from TV preferences.

## Performance comparisons

Run `CLEANFRAME_PUBLIC_FONTS=1 npm run check:performance` after rendering changes.
The harness measures navigation under 4× CPU throttling, repeated wallpaper
cycles, DOM retention and post-GC JavaScript heap growth. Its budgets are a
browser regression screen, not a simulation of the TV. Results are written to
ignored `.local/qa/performance/`. Avoid exact timing assertions on shared CI
runners; compare behavior and bounded growth as well as latency.

See [code quality](code-quality.md) for the maintained rules and review criteria.

## Physical TV checks

Run these only under a task that includes TV testing. Announce any installation or launch first, then follow `development.md`. SDK success alone is not a visible result. Ask Nathan to confirm the normal remote behaviour and record the version, firmware, result and any open checks in `tv-status.md`.

1. Move in both directions through each layout and Settings; check focus, response and readable labels from the sofa.
2. Launch Netflix/YouTube, press Home to return, and check the selected app. Treat streaming apps' own Back handling separately.
3. Check Art Mode, Other apps, TV settings and Settings → Samsung → Samsung Home; verify the actual visible destinations.
4. Check saved appearance/app order/wallpaper after relaunch. Check timed rotation pauses while a panel is open or the app is hidden.
5. Test normal power-on after a streaming app and the usual Art Mode routine only when that work is included. Preserve the native Home recovery baseline and restore it before any uninstall/identity change.

The current pending results are listed at the top of `tv-status.md`. Browser CPU throttling is a development comparison, not a TV performance measurement.
