# CleanFrame

A quieter home screen for Samsung The Frame. Your apps, a photograph and the time, with an interface made for the TV remote.

![CleanFrame browser preview using the bundled Manrope font](docs/images/cleanframe-dock.jpg)

I built CleanFrame for one TV: my own Samsung The Frame, running Tizen. I'm sharing the code and setup notes as a starting point for other people to build on.

**Use it at your own risk.** Most of the work has gone into making it work well on my TV. Very little has gone into making it portable. The setup scripts reflect my computer, TV and firmware, so expect to adapt them and test the result on your own hardware.

I highly recommend forking it and building on top of it, ideally with a coding agent that can help you understand and adapt the setup. Start with the browser preview, make the interface your own, then work through TV installation when you're ready. Native Home/startup changes need particular care; the setup guide covers the risks and recovery steps.

## Try the interface

You need Node.js 22.13+ or 24+ and Python 3.10+ to run the browser preview.

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

The signing and TV scripts are specific to my setup. Your agent will need to adapt the paths, signing profile, identity checks and installed-app IDs, then verify each stage with you. Installing the app and assigning the remote Home button are separate steps.

| Area | Evidence and limits |
| --- | --- |
| Reference hardware | Samsung QA55LS03DAWXXY / LS03D, firmware 2130.0, Tizen 9.0, 32-bit ARM |
| App installation | Signed installation and launch commands succeeded through 0.6.1. Latest rendering and remote feel still need physical observation. |
| App launch and Home | Netflix/YouTube launch and physical Home from Netflix were confirmed on the reference setup. |
| Still open | Normal power-on after streaming/Art Mode, corrected Smart Hub escape and native Art Mode destinations need definite physical checks. |
| Other TVs | No compatibility claim. This is Tizen source; Android TV, Google TV, LG webOS and Roku need their own implementations. |

The detailed [device record](docs/tv-status.md) separates observed results from SDK responses. Native Home/startup uses undocumented, guarded helpers; it is optional and can fail after firmware changes. Keep a recovery baseline before attempting that work. The app can be opened manually without it.

## Develop and check

```sh
npm run check
npx playwright install chromium
CLEANFRAME_PUBLIC_FONTS=1 npm run check:browser
npm run check:public
npm run export:public
```

The browser checks use isolated Chromium profiles and a loopback preview. They never contact a TV. The public export creates `dist/CleanFrame-public-unsigned.wgt`, with public fonts and notices. It needs your own identity and signing before installation. It does not certify asset redistribution rights or device compatibility.

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
