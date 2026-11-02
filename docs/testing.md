# Validation

## Offline app changes

```sh
npm ci
npm run check
npm run check:tools
npx playwright install chromium
npm run check:browser
```

`check` runs ES5 runtime lint, validates package identity/version and bundled resources, then tests the production device adapter with a synthetic API/clock. `check:device` is the synthetic adapter test included in this command, despite its name. Neither command contacts a TV. `check:browser` uses a fresh Playwright Chromium profile and its own loopback preview. It checks List and Dock navigation, single focus, Home controls, grouped Settings, explicit OK application, applied checkmarks, pending-load cancellation, retries, persistence, all fifteen wallpaper bundles, available fonts, 720p scaling, migrations, the Home editor and honest browser-only launch errors. Reports and screenshots are in ignored `.local/qa/`. A failed assertion exits with a nonzero status.

For public-source validation, set `CLEANFRAME_PUBLIC_FONTS=1` when running `check:browser`; the preview helper then excludes the local proprietary overlay. Run `npm run check:public` for the bounded source/history checks and `npm run export:public` for a widget that always excludes private fonts. The GitHub Actions workflow uses this public path. Browser/package checks do not clear third-party asset rights or validate TV behaviour.

`check:tools` uses synthetic credentials and a fake SDK in isolated temporary folders. It checks local configuration, identity overlays, owner-only password files, both signing modes, failed-build handling, private-file rejection, public signature metadata and real Git index/history blobs. It contacts no TV and reads no real signing credentials. Temporary fixtures are retained for inspection instead of permanently deleted.

`check:public` checks working files, index blobs and all reachable Git refs (including fetched PR/checkpoint history) for the shared private-file policy and recognisable credential patterns. A working-file edit cannot hide a staged credential. Packaging and public export apply the same checks to widget contents; public signing certificates and signature XML are allowed. These checks are bounded and do not detect every possible secret. For release validation, also use a clean clone of the candidate branch without unrelated review refs. The generated-path policy rejects any `bin` or `obj` directory in source, plus widget/DLL/debug-symbol/executable files; it is deliberately broader than the native-helper folder.

Optional local commit/push guards are in `.githooks/`. To enable them deliberately for this clone, run `git config --local core.hooksPath .githooks` after checking that this will not replace an existing hooks setup. Run `npm run check:public` before enabling them. That all-ref audit must pass: unrelated fetched PR/checkpoint history can block every commit/push even when the working tree is clean. Use a clean candidate clone when retaining rejected review refs elsewhere. The hooks run `check:public` before committing or pushing. They are not enabled automatically and can be bypassed. Pre-push is the last local preventive check; CI runs after upload and can only detect exposure at that point. A later fix commit does not remove sensitive data from earlier commits. Keep CI and review as additional checks.

If the default browser/cache location is unavailable, use a writable local path for both commands:

```sh
PLAYWRIGHT_BROWSERS_PATH="$PWD/.local/playwright" npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH="$PWD/.local/playwright" npm run check:browser
```

For manual review, use `npm run dev` and open `/home/`. Use the arrow keys, Enter and Escape. Check the changed flow in List and Dock, on Photo, Light and Dark backgrounds. Check a single app and all nine apps when changing app layout. In Settings, browse without applying, apply with OK, return with both Back routes, and cancel a pending resource load. Check editor placement/undo, wallpaper rotation pausing during panels/background time, and restored focus on return when those flows change. Browser preferences are separate from TV preferences.

`CLEANFRAME_PUBLIC_FONTS=1 npm run check:performance` runs the existing 4× CPU-throttled Chromium regression screen. Compare navigation work, frame stalls, retained DOM/heap and live-filter checks before and after rendering changes. This is not a physical-TV benchmark.

## Optional native-profile checks

`python3 -B scripts/native-home/frame-2020/check.py` checks owner-specific source preparation for the experimental LS03T profile. Adding `--dotnet <host-sdk-path>` also compiles its legacy TV targets and runs host-side policy checks with synthetic states. These checks do not call a native TV API or deploy the repackaged templates. The profile is outside the default `check:tools` command; see its [own instructions](../scripts/native-home/frame-2020/README.md).

## Physical TV checks

Run these only under a task that includes TV testing. Announce any installation or launch first, then follow `development.md`. SDK success alone is not a visible result. Ask Nathan to confirm the normal remote behaviour and record the version, firmware, result and any open checks in `tv-status.md`.

1. Move in both directions through each layout and Settings; check focus, response and readable labels from the sofa.
2. Launch Netflix/YouTube, press Home to return, and check the selected app. Treat streaming apps' own Back handling separately.
3. Check Art Mode, Other apps, TV settings and Settings → Samsung → Samsung Home; verify the actual visible destinations.
4. Check saved appearance/app order/wallpaper after relaunch. Check timed rotation pauses while a panel is open or the app is hidden.
5. Test normal power-on after a streaming app and the usual Art Mode routine only when that work is included. Preserve the native Home recovery baseline and restore it before any uninstall/identity change.

The current pending results are listed at the top of `tv-status.md`. Browser CPU throttling is a development comparison, not a TV performance measurement.
