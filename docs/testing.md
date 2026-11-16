# Validation

## Offline app changes

```sh
npm ci
npm run check
npm run check:tools
npx playwright install chromium
npm run check:browser
```

`check` runs ES5 runtime lint, validates package identity/version and bundled resources, then tests the production device adapter with a synthetic API/clock. `check:device`, included in this command, runs the synthetic adapter test and the camera tile layout unit tests (`scripts/test-camera-layout.mjs`). Neither command contacts a TV. `check:browser` uses a fresh Playwright Chromium profile and its own loopback preview. It checks List and Dock navigation, single focus, Home controls, grouped Settings, explicit OK application, applied checkmarks, pending-load cancellation, retries, persistence, Art Mode cache recovery, new defaults and Live TV, Inputs on Home, the 24-app Home cap, the system font with no font requests, 720p scaling, migrations, the Home editor and honest browser-only launch errors. Reports and screenshots are in ignored `.local/qa/`. A failed assertion exits with a nonzero status.

Run `npm run check:public` for the bounded source/history checks and `npm run export:public` for the unsigned public widget. The GitHub Actions workflow uses this public path. Browser/package checks do not clear third-party asset rights or validate TV behaviour.

`check:tools` uses synthetic credentials and a fake SDK in isolated temporary folders. It checks local configuration, identity overlays, owner-only password files, both signing modes, failed-build handling, private-file rejection, public signature metadata and real Git index/history blobs. It contacts no TV and reads no real signing credentials. Temporary fixtures are retained for inspection instead of permanently deleted.

`check:public` checks working files, index blobs and all reachable Git refs (including fetched PR/checkpoint history) for the shared private-file policy and recognisable credential patterns. A working-file edit cannot hide a staged credential. Packaging and public export apply the same checks to widget contents; public signing certificates and signature XML are allowed. These checks are bounded and do not detect every possible secret. For release validation, also use a clean clone of the candidate branch without unrelated review refs. The generated-path policy rejects any `bin` or `obj` directory in source, plus widget/DLL/debug-symbol/executable files; it is deliberately broader than the native-helper folder.

Optional local commit/push guards are in `.githooks/`. To enable them deliberately for this clone, run `git config --local core.hooksPath .githooks` after checking that this will not replace an existing hooks setup. Run `npm run check:public` before enabling them. That all-ref audit must pass: unrelated fetched PR/checkpoint history can block every commit/push even when the working tree is clean. Use a clean candidate clone when retaining rejected review refs elsewhere. The hooks run `check:public` before committing or pushing. They are not enabled automatically and can be bypassed. Pre-push is the last local preventive check; CI runs after upload and can only detect exposure at that point. A later fix commit does not remove sensitive data from earlier commits. Keep CI and review as additional checks.

If the default browser/cache location is unavailable, use a writable local path for both commands:

```sh
PLAYWRIGHT_BROWSERS_PATH="$PWD/.local/playwright" npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH="$PWD/.local/playwright" npm run check:browser
```

For manual review, use `npm run dev` and open `/home/`. Use the arrow keys, Enter and Escape. Check the changed flow in List and Dock, with Glass and Text focus. Check a single app, the scroll point (seven in List, five in Dock) and a long Home list when changing app layout. In Settings, browse without applying, apply with OK, return with both Back routes, and cancel a pending resource load. Check editor placement/undo, Art Mode refresh cancellation and restored focus on return when those flows change. Browser preferences are separate from TV preferences.

`npm run check:performance` runs the existing 4× CPU-throttled Chromium regression screen. Compare navigation work, frame stalls, retained DOM/heap and live-filter checks before and after rendering changes. This is not a physical-TV benchmark.

## Optional native-profile checks

`python3 -B scripts/native-home/frame-2020/check.py` checks owner-specific source preparation for the experimental LS03T profile. Adding `--dotnet <host-sdk-path>` also compiles its legacy TV targets and runs host-side policy checks with synthetic states. These checks do not call a native TV API or deploy the repackaged templates. The profile is outside the default `check:tools` command; see its [own instructions](../scripts/native-home/frame-2020/README.md).

## Physical TV checks

Run these only under a task that includes TV testing. Announce any installation or launch first, then follow `development.md`. SDK success alone is not a visible result. Ask Nathan to confirm the normal remote behaviour and record the version, firmware, result and any open checks in `tv-status.md`.

1. Move in both directions through each layout and Settings; check focus, response and readable labels from the sofa.
2. Launch Netflix/YouTube, press Home to return, and check the selected app. Treat streaming apps' own Back handling separately.
3. Check All apps, an HDMI entry, Settings → Samsung Home and Back → Samsung Home; verify the actual visible destinations. When configured, check Lights, the Cameras grid and full screen.
4. Check saved appearance and app order after relaunch. Verify the last-good Art photo appears offline, visible Home refreshes it, and Settings/hidden states preserve the committed appearance. Check Live TV reaches antenna/cable channels and ESPN opens the installed app.
5. Test normal power-on after a streaming app and the usual Art Mode routine only when that work is included. Preserve the native Home recovery baseline and restore it before any uninstall/identity change.

The current pending results are listed at the top of `tv-status.md`. Browser CPU throttling is a development comparison, not a TV performance measurement.

## Art Mode wallpaper sync

`npm run check:art` tests the typed binary parser, strict uploaded-path allowlist, corrupt/oversized images, HTTP/CORS contract, revision eviction, copy/selection and stop/start races, deterministic text packing, ES5 shard grammar, synthetic Tizen private-cache promotion/failure/cancellation and overlapping saves, the shared bridge key, `/lights`, the MQTT doorbell subscriber (a local test broker) and the PiP unpack, hash check and root copy. The generated ring command runs unprivileged in a sandboxed `/bin/sh` with stub `systemctl`, `systemd-run` and `pkill`; nothing runs as root and no TV is contacted. `npm run check:browser` also runs `scripts/check-art-browser.mjs` with synthetic loopback responses: migration of old backgrounds to Art Mode, frosted sheets and dock, the calibrated Art look, last-good IndexedDB reload, corruption, hidden boot and visible Home refresh. Screenshots are ignored `.local/qa/art-*-public.png` and `home-defaults*-public.png`; test Art responses use a tiny synthetic JPEG outside the widget. The real shard denies HTTP(S) browser Origins, so these browser fixtures do not establish packaged-widget CORS or TV compatibility. See the physical [handoff checklist](art-mode-wallpaper.md#verification-handoff).
