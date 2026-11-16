# Development

## Browser preview

Start with Node.js 22.13+ (22 LTS), or 24+, and Python 3.10+, then `npm ci`. These are the supported development baselines; lower versions have not been checked. Install Chromium once with `npx playwright install chromium` for the optional browser tools. Linux hosts may also need Playwright's documented system dependencies (`npx playwright install --with-deps chromium`).

`npm run dev` starts http://localhost:4795/home/, bound to this computer only. `/home/` serves `app/`, the same source used in the signed widget. Arrow keys, Enter and Escape mirror remote navigation. Device controls report that they require the TV; no success is simulated.

The UI uses the TV's system font, One UI Sans (`FONT_STACK` in `app/main.js`, mirrored in `style.css`). Browsers fall back to a standard sans-serif font, and no font files ship. For a contributor's fresh clone, use the README and `docs/for-agents.md`; the signing/device setup below describes the reference machine and needs adaptation for another owner.

Icons are bundled. [Art Mode wallpaper sync](art-mode-wallpaper.md) uses a TV-local Vetro shard and an app-private last-good cache. The Art photo is the only background, and an inline neutral fallback covers the time before the first cache. See [assets](assets.md).

## Runtime map and compatibility

- `app/index.html` loads the device adapter, `assets/icons/metrics.js`, `art-mode.js`, `camera-layout.js`, `cameras.js` and `main.js`, with `style.css`. `camera-layout.js` is the pure camera tile placement (unit-tested in `scripts/test-camera-layout.mjs`); `cameras.js` is the Cameras view's tile lifecycle (snapshots, streams, timers, Offline, the TV player), created by `main.js` with a small host interface.
- `main.js` owns the List and Dock layouts, panel stack, focus, preferences, atomic appearance bundles, the frosted copy and the launch preview it saves, weather, Lights and the Cameras tile markup and routing. `art-mode.js` owns the TV-local bridge fetch, the private photo cache, showing the launch preview and the calibrated Art look, and it does no automatic polling. `device.js` owns installed-app discovery and Tizen calls. Keep device details in that adapter.
- The logical stage is 1920 x 1080, scaled uniformly to the viewport. Check at 1920 x 1080 and 1280 x 720. Glass geometry must stay aligned.
- Preferences use localStorage key `cleanframe.home.v1`, with a fallback read from `cleanframe.shore.v1`. Legacy fields `dock`, `lastApp` and `theme` are still read. The migration preserves app order and selection. Legacy `list` becomes List / Text focus; `shore` and `grid` become Dock / Glass. Retired `wallpaper`, `mode`, `wall`, `material` and `font` fields and Light/Dark backgrounds are accepted and dropped on the next write. Appearance axes are stored separately. A saved dynamic app keeps its real app ID and name; discovery refreshes the installed catalogue. Keep migration checks when changing this format.
- `window.ShoreQA.state()` and `.where()` expose state and focus for browser tests.

The tested target is the Tizen 9.0 TV in [TV status](tv-status.md); [contributor reports](compatibility.md) cover other TVs. The manifest’s `required_version="5.0"` admits Tizen 5.0 and later for web installation. It is an installation floor, not proof that every device flow works on every admitted TV. Current-source and adapted-build reports are identified separately in the compatibility table; Tizen 4.0 remains an owner experiment. The exact reference TV Chromium/WebKit engine version has not been recorded. `npm run lint` uses ESLint's ES5 grammar for all runtime JavaScript and checks undefined names, unused code and dynamic evaluation. This does not check DOM/CSS or TV API availability; verify new APIs on the target before claiming support. The CSS guard rejects `inset` and flex `gap` declarations; use explicit top/right/bottom/left edges and child margins. The child-margin spacing targets the older engine reported in PR #11. The manifest minimum was lowered separately from those rendering changes. Geometry checks cover both Home layouts, all three control modes and both preview sizes; they do not establish TV compositor support. Tooling stays in development dependencies and outside the widget. See [ESLint's language options](https://eslint.org/docs/latest/use/configure/language-options).

`npm run check` and `npm run check:device` are offline. The latter uses a synthetic Tizen API and clock; its name does not authorise or perform a device connection.

See [assets](assets.md) and [testing](testing.md).

## Local TV tools and signing

This Mac's setup lives under `.local/` and is excluded from Git:

- `tizen-sdk/`: official Tizen SDK command-line tools, embedded Java and SDB.
- `certificates/private/`: Samsung-issued author/distributor certificates, private keys, protected PKCS12 files and their generated password.
- `certificates/ca/`: CA certificates from Samsung's Certificate Extension.
- `device.json`: TV host address.

`npm run package` builds the widget from `app/` and signs it with an existing official SDK profile. It does not rewrite `profiles.xml`, certificate paths or SDK configuration. It writes `dist/CleanFrame-unsigned.wgt` and promotes a successful build to `dist/CleanFrame.wgt`. Each attempt uses a fresh ignored `dist/signed-*` folder, retained for inspection; a failed attempt keeps the previous successful widget. Check the packaging exit status before installing, since `tv:install` does not establish that this is the latest source build.

For another owner, copy `signing.example.json` to `.local/signing.json` and replace its placeholders with the installed SDK path, certificate profile name and the package/application IDs generated by the official project wizard. An existing local config must explicitly select `profile`; the maintainer default applies only when no config exists. Paths may be absolute or relative to the repo; `~` is supported. The SDK path resolves symlinks before invoking its tools. If the SDK launcher fails on spaces in its real installation path, select a space-free SDK installation; a repository symlink can still contain spaces. The password filename remains unresolved so the no-follow check can reject a symlink. The example contains no real credentials. Both identity fields must be set together. Packaging changes only these two attribute values in the generated manifest; tracked source and the maintainer's identity remain unchanged. The installed app reads its own identity from Tizen when filtering All apps. Native Home helpers retain their separate reference-machine guards and must be reviewed independently.

Select the profile's existing `profiles.xml` through the official SDK configuration if needed; see [Samsung's CLI configuration and packaging documentation](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/command-line-interface.html). Certificate Manager can store certificates in its own folders. CleanFrame uses those existing paths without moving or rewriting them.

`npm run export:public` is a separate offline, unsigned export. It includes the project/third-party notices and writes `dist/CleanFrame-public-unsigned.wgt`. It reads no signing credentials and contacts no TV. Use it for public build preparation; `npm run package` remains the signed personal build. Asset release checks are listed in `docs/public-release.md`.

### Owner build: access origins and owner settings

A packaged widget can only reach origins listed in `config.xml` `<access>` entries. Source lists `http://127.0.0.1:8643` (the bridge on loopback) and `https://api.open-meteo.com`. If the TV blocks loopback, the build needs an entry for the bridge's interface address. Cameras need an entry for the go2rtc origin (`http://<private IPv4>:<port>`). The owner's build applies these entries to the exported widget, along with the owner's own package/application identity, `webapis.js` for AVPlay, and a script that seeds the `cleanframe.art.host`, `cleanframe.art.key`, `cleanframe.weather.v1` and `cleanframe.controls.v1` localStorage values (the key is kept in an ignored local file and also set as the bridge's config `key`). The build script lives in ignored `.local/`, so addresses and camera names never enter Git. Full-screen cameras also need a Partner-signed package (the `avplay`, `network.public` and `tv.audio` privileges). Without one, full screen shows the MJPEG stream.

Leave `password_file` as `null` or omit it to use the SDK's saved password access. No extra plaintext copy is required. An unexpected password prompt fails immediately; configure password access in the official tools or explicitly select a password file. The optional file must be owned by the current user, have mode `600` or `400`, and reside in `.local/` or outside the repo. A symlink at the final filename and files inside `app/` or `.git/` are rejected; parent symlinks are resolved before the location check. This fallback supplies one password to at most two certificate prompts and declines password-saving prompts; use SDK-managed access for certificates with different passwords. SDK signing output is suppressed so credentials cannot enter diagnostics. Fixed validation messages identify password-prompt, timeout, failed-command, missing-signature and identity errors without copying SDK output.

With no `.local/signing.json`, the original maintainer defaults remain: `.local/tizen-sdk`, profile `FrameHome`, the source manifest identity, and the existing private password file if present. Its permissions must satisfy the same checks. The SDK must already be configured; automatic SDK/profile repair has been removed. Actual signing with an owner's certificates requires a separate local check; offline tests use a fake SDK.

The initial custom XML-signature implementation was rejected by the TV. Use the official SDK packager for future builds; the installed test was signed with Tizen CLI 2.5.25.

## Another checkout or Mac

Install the official [Samsung TV SDK](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html) and select its path in `.local/signing.json`. The signing runner uses POSIX terminal/process APIs and is supported by these tools on macOS/Linux; Windows needs its own adapted runner. To retain in-place updates to your own existing app, securely transfer its author certificate and password. Keep those credentials local.

For new certificates, use Samsung's [certificate setup](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html). The distributor certificate must include the target TV's DUID. A generic emulator certificate does not establish compatibility with this consumer TV.

Create `.local/device.json` with:

```json
{"host": "YOUR_TV_IP_ADDRESS"}
```

For developer access, connect the TV and Mac to the same network, enable Developer Mode in Apps → App Settings → 12345 and enter the Mac's local address. Fully restart the TV if the developer port remains closed.

## Install and launch

`npm run tv:install` uploads the signed widget with a unique build filename and calls Samsung's `vd_appinstall` command. It checks for `install completed` and confirms the app appears in the installed-app list. `sdb install` on this TV only uploaded the widget and did not install it.

`npm run tv:launch` opens the selected app. It does not change startup defaults. The TV tools use the SDK path and identity selected in `.local/signing.json`, falling back to the reference SDK and source manifest. Before any install connection, the installer checks the signed widget's identity and private-file policy. Changing an installed app's identity creates a different application; preserve existing identity and author certificates for updates. These tools remain reference installation commands, not an unattended installer for every TV.

## Sources

- [Samsung developer connection steps](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html)
- [Samsung app-launch sample](https://github.com/SamsungDForum/LaunchApp)
- [Samsung remote input guide](https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html)

## Native Home and recovery

The [experimental 2020 LS03T profile](../scripts/native-home/frame-2020/README.md) is separate owner-configured source for one reported firmware. It does not change the reference helper below, and its packaging, signing, model preflight and transport still need an owner-reviewed procedure. The repackaged templates have not been deployed.

Native Home/startup was configured separately from the app installer. Physical Home from Netflix is confirmed. The one-shot helper runs as the SDK user. See scripts/native-home/README.md and docs/tv-status.md for the tested firmware and pending visual checks.

Query with `python3 scripts/native-home/run.py query`. Restore the saved pre-integration Home/startup values with `python3 scripts/native-home/run.py restore`. The private baseline is `.local/native-home/original.json`; preserve it and do not replace it with the applied state. The legacy `.local/native-home/run.py` command is also retained. Restore before uninstalling CleanFrame or changing its stable app identity.

To rebuild the one-shot helper with this Mac's private verified SDK:

```sh
DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 DOTNET_CLI_HOME="$PWD/.local/native-home/cli" .local/native-home/dotnet-sdk/dotnet build scripts/native-home/Control.csproj -c Release --nologo -p:BaseIntermediateOutputPath="$PWD/.local/native-home/obj/" -o .local/native-home/out
```

The helper's output is not packaged inside the web app. Keep the original values, compiler, runtime output and all device diagnostics ignored.
