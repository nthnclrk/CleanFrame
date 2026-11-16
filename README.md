# CleanFrame

A quieter home screen for Samsung The Frame. Your apps, a photograph and the time, with an interface made for the TV remote.

![CleanFrame browser preview using the bundled Manrope font](docs/images/cleanframe-dock.jpg)

I built CleanFrame for one TV: my own Samsung The Frame, running Tizen. I'm sharing the code and setup notes as a starting point for other people to build on.

**Use it at your own risk.** The web launcher targets Tizen 5.0 and later for installation, with [owner reports](docs/compatibility.md) across several models. That minimum is not a promise that every device flow is verified. The TV setup scripts and native Home helpers still reflect specific computers and firmware, so adapt them and test on your own hardware.

I highly recommend forking it and building on top of it, ideally with a coding agent that can help you understand and adapt the setup. Start with the browser preview, make the interface your own, then work through TV installation when you're ready. Native Home/startup changes need particular care; the setup guide covers the risks and recovery steps.

## Try the interface

You need Node.js 22.13+ (22 LTS), or 24+, and Python 3.10+ to run the browser preview.

```sh
git clone https://github.com/nthnclrk/CleanFrame.git
cd CleanFrame
npm ci
npm run dev:public
```

Open [localhost:4795/home/](http://localhost:4795/home/). Use the arrow keys, Enter and Escape, or click the controls. App launches and Samsung screens require a TV; the preview reports that limitation when you select them.

The public preview uses the included Manrope, Geist and Newsreader fonts.

## What you can change

- Choose a List or Dock layout, with icons, names or both.
- Use a photograph, light or dark background, with a simple 12-hour clock.
- Adjust typography, focus and glass materials through the same Settings interface.
- Choose and reorder Home apps; discover installed apps on the TV.
- Select from fifteen wallpapers and save your preferences locally.
- Open Settings → Samsung → Inputs to choose a discovered HDMI source.

The glass and blur are rendered ahead of time. The TV loads the finished images and uses transforms and opacity for focus feedback.

## Use a coding agent

Open this repo in a local coding agent and give it a bounded change:

```text
Read AGENTS.md, docs/development.md and docs/interaction-behaviour.md.
Help me adapt CleanFrame. Start with the public-font browser preview.
My first change is: <describe one change>.
Preserve remote navigation, saved preferences and the ES5 runtime.
Run the source checks and relevant browser checks. Show the result.
This task is browser-only: do not connect to a TV, sign or install a
package, or change Home/startup settings.
```

See [working with an agent](docs/for-agents.md) for the TV setup prompt and the distinction between UI work, app installation and native Home changes. An agent needs local computer access for TV work; a hosted chat cannot reach your TV merely by reading this repo.

## Put it on a TV

Use the staged [Samsung The Frame setup guide](docs/agent-tv-setup-guide.md) to understand the process used on my TV and adapt it to yours. It covers the remote's Developer Mode sequence, official Samsung tools, your own certificates and app identity, installation, visible checks and recovery.

The [latest release](https://github.com/nthnclrk/CleanFrame/releases/latest) includes an unsigned, public-font widget for inspection and adaptation. For your installation, build from source using your own identity in `.local/signing.json` and sign with your own certificates. The download is not a ready-to-install signed package.

Signing supports an ignored `.local/signing.json` based on `signing.example.json`: select your SDK, existing certificate profile and your own SDK-generated app identity. See [local signing setup](docs/development.md#local-tv-tools-and-signing). The TV installation commands and native Home helper still contain reference-machine assumptions. Your agent must check the installed-app IDs and each device stage with you. Installing the app and assigning the remote Home button are separate steps.

| Area | Evidence and limits |
| --- | --- |
| Reference hardware | Samsung QA55LS03DAWXXY / LS03D, firmware 2130.0, Tizen 9.0, 32-bit ARM |
| App installation | Signed installation and launch commands succeeded through 0.6.1. Latest rendering and remote feel still need physical observation. |
| App launch and Home | Netflix/YouTube launch and physical Home from Netflix were confirmed on the reference setup. |
| Still open | Normal power-on after streaming/Art Mode, corrected Smart Hub escape and native Art Mode destinations need definite physical checks. |
| Other TVs | Web installation target: Tizen 5.0+. See the attributed [device reports](docs/compatibility.md) for tested flows and omissions. Android TV, Google TV, LG webOS and Roku need separate implementations. |

The optional [2020 LS03T profile](scripts/native-home/frame-2020/README.md) supplies experimental owner-configured native source. It leaves the reference helper unchanged and is not an unattended installer.

The detailed [device record](docs/tv-status.md) separates observed results from SDK responses. Native Home/startup uses undocumented, guarded helpers; it is optional and can fail after firmware changes. Keep a recovery baseline before attempting that work. The app can be opened manually without it.

## Samsung OLED TVs (S90F) and Windows

CleanFrame was built for The Frame, whose matte LCD panel is meant to show a still picture. A QD-OLED panel such as the S90F can retain static images, so this build changes the defaults:

- **No Art Mode control.** OLED TVs don't offer Samsung's Art Mode as a destination, so Home has All apps and Settings only.
- **Pixel shift.** Every minute the whole stage moves one step through a nine-position pattern of up to 3 screen pixels.
- **Idle protection.** After 3 minutes without a remote key, Home fades to 82% black; after 8 minutes it goes fully black (pixels off). Any key restores it.
- **TV screen saver stays on.** `config.xml` never sets `screen-saver`, so the TV's own screen saver and sleep timers keep working.
- **Fresh-install look.** Photo / Dock / Glass, starting on the darkest bundled photo, with rotation each time Home opens. Saved and legacy preferences are kept. Flat Dark is still available in Settings → Background.
- **Default Home.** Nine streaming apps, including regional services; edit `DEFAULT_HOME` in `app/main.js` for your region, or change them in Apps on Home.

### Extra setup steps on Windows

These steps were needed on top of the [setup guide](docs/agent-tv-setup-guide.md) when building on Windows 11:

1. **Clone with long paths.** Deep folders can exceed Windows' path limit: `git -c core.longpaths=true clone https://github.com/nthnclrk/CleanFrame.git`.
2. **Make `python3` real.** The npm scripts call `python3`, which on Windows is often a Microsoft Store alias. Turn off the `python3` alias in Settings → Apps → Advanced app settings → App execution aliases, or put a `python3.exe` copy of your Python interpreter earlier on `PATH`. Then run `npx playwright install chromium` for the browser checks.
3. **Install Tizen Studio as administrator.** The IDE installer (it includes Certificate Manager) needs elevation. Choose a path without spaces, for example `C:\Users\<you>\tizen-studio`. Then, in Package Manager → **Extension SDK**, install **TV Extensions** and **Samsung Certificate Extension**. Package Manager commands also need elevation.
4. **Developer Mode and the host IP.** In Apps → App Settings, enter `12345` and set the Host PC IP to your computer's current LAN address. Then cut power at the wall for about ten seconds. Before trying SDB, confirm the setting took effect: `http://<TV_IP>:8001/api/v2/` should report `"developerMode": "1"` and your computer's address as `developerIP`. If your computer's DHCP address changes, the TV refuses SDB, so reserve the address in your router.
5. **Connect and read the DUID.** Run `sdb connect <TV_IP>:26101`, `sdb capability` and `sdb shell 0 getduid`. Keep the DUID in `.local/`.
6. **Certificates.** In Certificate Manager choose **+ → Samsung → TV**, create the author and distributor certificates (distributor privilege **Public**, with your DUID) and sign in to your Samsung account yourself.
7. **Your own app identity.** The CLI on this SDK lists no TV-specific template, but `tizen create web-project -p tizen-9.0 -t WebBasicApplication -n CleanFrame -- <temp folder>` generates a valid random package ID. Copy `package` and `id` from its `config.xml` into `.local/signing.json`, set `sdk_path` with forward slashes and keep `password_file` as `null`.
8. **Package, install and launch.** `scripts/package.py` relies on POSIX terminals, so on Windows use `python scripts/package_windows.py`. It runs the same build and identity checks and uses the SDK-managed certificate passwords. Then run `python scripts/tv.py install` and `python scripts/tv.py launch`.
9. **Resetting preferences.** An in-place update keeps the app's saved preferences. To see new defaults, uninstall first with `sdb shell 0 vd_appuninstall <APP_ID>`, but only while no native Home assignment points at the app.

Native Home/startup reassignment has not been attempted on an S90F. Follow the guarded process in the setup guide, including the recovery baseline, before trying it.

## Develop and check

```sh
npm run check
npm run check:tools
npx playwright install chromium
CLEANFRAME_PUBLIC_FONTS=1 npm run check:browser
npm run check:public
npm run export:public
```

`npm run check`, including its `check:device` command, runs only source checks and synthetic device-adapter tests. It never connects to a TV. The browser checks use isolated Chromium profiles and a loopback preview. They never contact a TV. The public export creates `dist/CleanFrame-public-unsigned.wgt`, with public fonts and notices. It needs your own identity and signing before installation. It does not certify asset redistribution rights or device compatibility.

| Location | Purpose |
| --- | --- |
| `app/` | Current packaged UI and runtime assets |
| `scripts/` | Preview, validation, asset generation and reference TV tools |
| [Development](docs/development.md) / [testing](docs/testing.md) | Runtime map, preferences, checks and device boundaries |
| [Assets](docs/assets.md) / [third-party notices](THIRD_PARTY_NOTICES.md) | Rendering recipes, font separation and asset provenance |
| [Asset sources](docs/asset-sources.md) | Photo credits and verification of the bundled third-party assets |
| `.local/`, `dist/` | Ignored private setup, recovery data, generated files and packages |

## Contribute

Fork it, experiment and build something that suits your TV. If you find a useful fix or improve the setup instructions, contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before a larger change. Reports should include model, firmware and the observed result, with private identifiers removed.

## Licence and credits

CleanFrame's original code and documentation use the [MIT licence](LICENSE). Fonts, photographs and logos retain their own terms; read [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Paid Pangram binaries are excluded from Git and public exports. A local package may include them, so keep personal builds separate from public downloads.

The [release review](docs/public-release.md) records the publication checks. Third-party assets retain the terms listed in their notices. CleanFrame is an independent project with no Samsung or streaming-service affiliation.

[TV Detox](https://github.com/Ansub/tv-detox) is a useful example of making an agent-assisted TV project approachable. Its Android setup is a different implementation; the prompts and instructions here are written for CleanFrame and Tizen.
