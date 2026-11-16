# CleanFrame (personal fork)

A home screen for Samsung The Frame. It shows your apps and the time over the current Art Mode photo, and you drive it with the TV remote.

![Dock layout in an earlier upstream build](docs/images/cleanframe-dock.jpg)

*Earlier upstream build. It had a bundled wallpaper and a wallpaper control, and this fork has removed both.*

This is a personal fork of [nthnclrk/CleanFrame](https://github.com/nthnclrk/CleanFrame) for one rooted Frame. It is public so others can read and adapt it. **Use it at your own risk.** The setup scripts and native helpers assume particular computers, models and firmware.

## What it needs

- **A Samsung The Frame running Tizen 5.0 or later.** The manifest's `required_version` is the installation floor. It does not show that every flow works on every model; see the [owner reports](docs/compatibility.md).
- **Root access with [Vetro](docs/art-mode-wallpaper.md).** The CleanFrame Art bridge (`vetro/cleanframe-art`) runs as a Vetro plugin on the TV. It serves the current uploaded Art Mode photo and Art Mode's brightness and colour temperature. Without the bridge, Home shows the last cached photo, or a plain neutral background if nothing is cached yet.
- **Optional: Home Assistant** (through an MQTT rule in Vetro) for the Lights control.
- **Optional: [go2rtc](https://github.com/AlexxIT/go2rtc)** for the Cameras view and the doorbell picture-in-picture.

## What it does

- **Background:** always the current Art Mode photo, shown with a calibrated Art look (`app/art-mode.js`). The look follows Art Mode's brightness and colour temperature as reported by the bridge. Sheets and the dock sit on a frosted copy of the photo. The app makes this copy once per photo at 480×270 with a canvas blur and keeps it between launches. At launch, a small preview of the photo appears straight away.
- **Typeface:** the TV's own system font, One UI Sans, with a standard sans-serif fallback in browsers (`FONT_STACK` in `app/main.js`). No font files are shipped.
- **Home:** up to 24 apps in a List or Dock layout. Focus is either a Glass pill with a spring or Text only. The clock can show the weather. HDMI entries on Home can appear only while their input is connected, or always.
- **All apps:** Live TV and HDMI 1–4 come first, followed by the installed consumer apps in alphabetical order.
- **Settings:** three rows. **Apps on Home** opens the editor, **Visual** holds the appearance choices, and **Samsung Home** opens Samsung's Home screen.
- **Owner controls (optional):** these are configured on the TV in `cleanframe.controls.v1`. **Lights** asks the bridge to fire a Vetro rule that publishes MQTT. **Cameras** shows a go2rtc MJPEG grid and can play a single camera full screen.
- **Doorbell picture-in-picture:** [`native/doorbell-pip`](native/doorbell-pip/README.md) is a separate native overlay. The bridge starts it when an MQTT doorbell ring arrives.

The remote has no on-screen key hints, because the focused control is the cue. The full behaviour is described in [interaction behaviour](docs/interaction-behaviour.md).

## Try the interface

You need Node.js 22.13+ (22 LTS) or 24+, and Python 3.10+.

```sh
git clone https://github.com/adamoberley/CleanFrame.git
cd CleanFrame
npm ci
npm run dev
```

Open [localhost:4795/home/](http://localhost:4795/home/). Use the arrow keys, Enter and Escape, or click the controls. App launches, inputs and Samsung screens need a TV, and the preview says so when you select them.

## Build and install

1. **Bridge:** run `npm run check:art` and then `npm run pack:art`. This writes `dist/cleanframe-art.vplugin`, which you import into Vetro on the TV. If a doorbell picture-in-picture build exists (`npm run build:pip`, which needs a .NET SDK), the packer includes it. See [Art Mode wallpaper sync](docs/art-mode-wallpaper.md).
2. **Widget:** `npm run export:public` writes `dist/CleanFrame-public-unsigned.wgt`, together with its notices.
3. **Owner build:** the packaged widget may only reach origins listed in `config.xml` `<access>` entries. Source lists the loopback bridge (`http://127.0.0.1:8643`) and Open-Meteo. A TV that blocks loopback needs an entry for the bridge's interface address. Cameras need an entry for the go2rtc origin. The owner's local, ignored script makes these changes to the exported widget. It also applies the owner's own package/application identity and seeds the TV's `cleanframe.*` settings. Keep addresses out of Git.
4. **Sign** the widget with your own certificates (for example through Apps2Samsung) and install it. Full-screen camera video plays through AVPlay, which needs the `avplay`, `network.public` and `tv.audio` privileges and a Partner-signed package. When AVPlay can't play, full screen keeps showing the camera's MJPEG stream.

The SDK route (`npm run package`, `tv:install` and `tv:launch` with `.local/signing.json`) and the staged TV setup are covered in [development](docs/development.md#local-tv-tools-and-signing) and the [setup guide](docs/agent-tv-setup-guide.md). Assigning the remote's Home button is a separate native step that can go wrong. Read the guide's recovery steps before trying it.

## Owner configuration on the TV

These are localStorage keys, set on the TV and never committed:

| Key | Purpose |
| --- | --- |
| `cleanframe.art.host` / `cleanframe.art.port` | Bridge address when loopback is blocked or the port has been changed. The value must be loopback or a private IPv4 address. |
| `cleanframe.weather.v1` | `{ lat, lon, unit: 'f' \| 'c' }`. This enables Clock › With weather. |
| `cleanframe.controls.v1` | `{ lights: true, go2rtc: 'http://<private IPv4>:<port>', cameras: [{ name, src, full, ratio }] }`. `src` is the stream for the MJPEG grid, `full` is the optional stream for full screen, `ratio` (for example `"3:4"`) places the tile before the camera has ever been seen, and the grid holds up to six cameras. Shapes learned from each camera's snapshot are kept in `cleanframe.cameras.v1` and win over `ratio`. Each tile shows a quick snapshot before the live stream, a dropped stream reconnects after 10 s, and each stream reconnects behind a fresh snapshot every minute so a silent stall cannot freeze a tile. A camera that stops answering is labelled Offline. |
| `cleanframe.art.key` | The bridge's per-install key (24–256 printable ASCII characters), sent as `X-CleanFrame-Key`. It must match the bridge config `key`. |

## Checks

```sh
npm run check            # ES5 lint, resources, device-adapter and camera-layout tests
npm run check:tools      # signing/packaging tools with a fake SDK
npm run check:art        # Art bridge parser, HTTP contract and widget cache
npx playwright install chromium
npm run check:browser    # UI and Art browser suites on a loopback preview
npm run check:public     # source, index and history policy scan
npm run export:public
```

None of these checks connects to a TV. Physical results are recorded in the [device record](docs/tv-status.md) and in [compatibility](docs/compatibility.md).

| Location | Purpose |
| --- | --- |
| `app/` | Packaged UI (`main.js`, `art-mode.js`, `cameras.js`, `camera-layout.js`, `device.js`) |
| `vetro/cleanframe-art/` | TV-local Art bridge (Vetro plugin) |
| `native/doorbell-pip/` | Doorbell picture-in-picture overlay |
| `scripts/` | Preview, checks, packaging and reference TV tools |
| `.local/`, `dist/` | Ignored private setup and generated packages |

## Licence and credits

Original code and documentation use the [MIT licence](LICENSE). Icons and logos keep their own terms, which are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). CleanFrame is not affiliated with Samsung or any streaming service. Contributions to the shared code are welcome under [CONTRIBUTING.md](CONTRIBUTING.md).
