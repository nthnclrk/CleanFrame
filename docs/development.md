# Development

## Browser preview

Start with Node.js 22.13+ or 24+ and Python 3.10+, then `npm ci`. These are the supported development baselines; lower versions have not been checked. Install Chromium once with `npx playwright install chromium` for the optional browser tools. Linux hosts may also need Playwright's documented system dependencies (`npx playwright install --with-deps chromium`).

`npm run dev` starts http://localhost:4795/home/, bound to this computer only. `/home/` serves `app/`, the same source used in the signed widget. Arrow keys, Enter and Escape mirror remote navigation. Device controls report that they require the TV; no success is simulated.

`npm run dev:public` serves the same interface using only the bundled public fonts, even when paid Pangram files exist locally. For a contributor's fresh clone, use the README and `docs/for-agents.md`; the signing/device setup below describes the reference machine and needs adaptation for another owner.

All UI assets, public fonts and the fifteen wallpapers are bundled. An optional preview overlay supports locally installed Pangram families; their binaries are not in the public source tree. Glass materials and blurred panel backgrounds are rendered ahead of time; see app/assets/wallpapers/README.md.

## Runtime map and compatibility

- `app/index.html` loads the shared app catalogue (`assets/apps/catalog.js`), device adapter, gallery/font/palette catalogues, `assets/icons/metrics.js` and `main.js`, with `style.css`.
- `main.js` owns the List and Dock layouts, panel stack, focus, preferences and wallpaper timers. `device.js` owns installed-app discovery and Tizen calls. Keep device details in that adapter.
- The logical stage is 1920 x 1080, scaled uniformly to the viewport. Check at 1920 x 1080 and 1280 x 720. Glass geometry and cached materials must stay aligned.
- Preferences use localStorage key `cleanframe.home.v1`, with a fallback read from `cleanframe.shore.v1`. Legacy fields are `dock`, `wallpaper`, `mode`, `lastApp` and `theme`. The 0.6 migration preserves app order, wallpaper, rotation and selection. Legacy `list` becomes Dark / List / Type; `shore` and `grid` become Photo / Dock / Glass. Appearance axes are stored separately. A saved dynamic app keeps its real app ID and name; discovery refreshes the installed catalogue. Keep migration checks when changing this format.
- `window.ShoreQA.state()` and `.where()` expose state and focus for browser tests. `minuteMs` can shorten rotation intervals in an isolated browser test.

The tested target is the Tizen 9.0 TV in [TV status](tv-status.md). The manifest's `required_version="6.5"` is a package declaration, not proof that Tizen 6.5 has been tested. The exact TV Chromium/WebKit engine version has not been recorded. Keep runtime JavaScript ES5-compatible and verify any new DOM/CSS API on the target before claiming support. `npm run lint` enforces ES5 syntax and checks undefined names, unused code, strict equality and several unsafe constructs. It cannot establish TV API availability.

Keep material rendering in the development tools. See [asset generation](assets.md) and [testing](testing.md).

## Local TV tools and signing

Per-installation settings live in ignored `.local/config.json`. Start with
`config.example.json`; set your SDK location, TV host, SDK-generated package/app
identity and signing profile. Keep author/distributor keys and SDK profiles in
private local storage. See [independent setup](local-testing.md) for this fork's
Linux workflow. Complete Samsung sign-in and certificate-password entry yourself.

`npm run package` runs the public-source guard, builds a public-font widget and
signs it through the official Tizen CLI using the configured profile. It does
not rewrite the SDK profile or copy keys into the widget. The source manifest
keeps a generic template identity; only the generated widget receives the local
installation identity. Keep that identity and author certificate stable for
in-place updates.

Prefer the SDK's saved-password workflow. Set `signing.password_file` to `null`
or omit it when no separate password file is needed. If the SDK prompts for a
password, an optional owner-only file under `.local/` can supply it; the packager
redacts that known password from private failure diagnostics. Different author
and distributor passwords should be handled by the SDK's own profile workflow.

`npm run export:public` is an offline unsigned export. It reads neither device
configuration nor signing credentials and produces
`dist/CleanFrame-public-unsigned.wgt` with public fonts and distribution notices.
Both archive paths reject private-file names and recognizable credential
patterns in runtime assets. These bounded checks do not recognize every secret.

The preview can optionally overlay complete private-font pairs from `.local/`;
the signed and public exports in this fork always use bundled public fonts.
Public checkouts need no proprietary font files.

Install the official [Samsung TV SDK](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html)
and [create your own certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html).
The distributor certificate must include the intended TV's DUID. A generic
emulator certificate does not establish compatibility with a consumer TV.

## Install and launch

`npm run tv:install` uploads the signed widget with a unique build filename and calls Samsung's `vd_appinstall` command. It checks for `install completed` and confirms the app appears in the installed-app list. `sdb install` on this TV only uploaded the widget and did not install it.

`npm run tv:launch` opens the installed test. It does not change startup defaults. Device scripts use the identity in ignored `.local/config.json`; changing that identity would create a different application.

## Sources

- [Samsung developer connection steps](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html)
- [Samsung app-launch sample](https://github.com/SamsungDForum/LaunchApp)
- [Samsung remote input guide](https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html)

## Native Home and recovery

Native Home/startup was configured separately from the app installer. Physical Home from Netflix is confirmed. The one-shot helper runs as the SDK user. See scripts/native-home/README.md and docs/tv-status.md for the tested firmware and pending visual checks.

Query with `python3 scripts/native-home/run.py query`. Restore the saved pre-integration Home/startup values with `python3 scripts/native-home/run.py restore`. The private baseline is `.local/native-home/original.json`; preserve it and do not replace it with the applied state. The legacy `.local/native-home/run.py` command is also retained. Restore before uninstalling CleanFrame or changing its stable app identity.

To rebuild the one-shot helper with this Mac's private verified SDK:

```sh
DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 DOTNET_CLI_HOME="$PWD/.local/native-home/cli" .local/native-home/dotnet-sdk/dotnet build scripts/native-home/Control.csproj -c Release --nologo -p:BaseIntermediateOutputPath="$PWD/.local/native-home/obj/" -o .local/native-home/out
```

The helper's output is not packaged inside the web app. Keep the original values, compiler, runtime output and all device diagnostics ignored.
