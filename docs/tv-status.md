# Reference TV and verification status

Recorded through 20 October 2026. These results describe the maintainer's TV. Other models, firmware and operating systems need their own checks. Repo-only work must not contact the TV.

Reports from other owners are listed separately in [TV compatibility evidence](compatibility.md). They do not change the reference results below.

## Hardware and OS

| Item | Reference setup |
| --- | --- |
| TV | Samsung 55-inch The Frame, QA55LS03DAWXXY / LS03D |
| Firmware | 2130.0; displayed firmware string T-PTMDUABC-0090-2130.0 |
| OS and architecture | Tizen 9.0.0, ARMv7 / 32-bit ARM, confirmed by developer capability and native probe |
| Native helper environment | SDK user UID 901, .NET 6 runtime and required native libraries confirmed on this TV |
| Web engine | Exact Chromium/WebKit version has not been recorded; keep runtime ES5-compatible |

Developer Mode is enabled. The developer connection needed a full mains power cycle after enabling it. Network address, device identifier, signing material and diagnostic dumps are private local configuration.

## Current app and identity

CleanFrame 0.6.1 was signed, installed in place and launched on 20 October. The SDK reported installation complete, retained the app in its installed list and returned a successful launch. The author certificate and application identity stayed stable. The original Home/startup recovery snapshot and previous signed 0.6.0 package remain local.

- Package: `nClrkHome1`
- Application: `nClrkHome1.FrameHome`
- Display name: `CleanFrame` (earlier builds used `Frame Home Test`)

The current interface has List and Dock, independent appearance choices, an app editor, grouped Settings and fifteen wallpapers. Public builds contain Manrope, Geist and Newsreader. The public-source cleanup changed neither the installed widget nor the native configuration.

## Physically confirmed

The maintainer confirmed that the custom interface appears, opens Netflix and YouTube using the normal remote, and opens Other apps. The physical Home button from Netflix returns to CleanFrame. Netflix handles repeated Back inside its own app; an exit destination was not observed.

Netflix uses `org.tizen.netflix-app`. YouTube uses `9Ur5IzDKqV.TizenYouTube`, with `com.samsung.tv.cobalt-yt` as a fallback. These IDs came from this TV's installed-app list. Other TVs must discover their own IDs.

## Pending physical checks

The 0.6.1 installation and launch responses are command evidence. Current rendering, fonts, expanded catalogue, Settings and remote feel still need physical observation. Also pending are native Art Mode's destination, TV settings, corrected Samsung Home escape through `com.samsung.tv.csfs`, and normal power-on after streaming or Art Mode. An earlier report of startup after Netflix was provisional.

Browser and package checks establish source behaviour and archive contents. CPU-throttled Chromium timings are development comparisons; they are not TV benchmarks. Current browser checks are described in [testing](testing.md).

The USB photo source is verified in the browser preview against a synthetic Tizen filesystem: drive enumeration, reading only each drive's `CleanFrame` folder, extension filtering and ordering, rotation, drive removal and reinsertion. On this TV (17 November) a FAT32 stick was mounted by the stock stack at `/opt/media/USBDriveA1`, reported by `listStorages` as `removable_sda1` with `type` EXTERNAL and state MOUNTED, and `listDirectory` returned plain names. `filesystem.read` alone was enough for reads; `externalstorage` was not required for storage enumeration or folder reads. Twelve JPEGs of 1.5–4.1 MB painted as USB slides with the owner watching, and the web process grew from roughly 104 MB to 227 MB resident while a full-resolution picture was on screen, releasing it after the slide was dropped. `addStorageStateChangeListener` is refused to this locally signed app with `SecurityError: Permission denied`, with or without `externalstorage` declared, so insertions and removals are noticed only at the documented re-reads: a fresh start, returning to Home, and opening Background. A drive pulled while Home stays open therefore keeps its current picture until the next re-read; that is a platform limit, not a rendering choice. Large-JPEG load time against the eight-second deadline and the softened surfaces under real household photos still deserve a closer look.

## Native Home and recovery

Native Home/startup was configured separately on 19 October. A guarded one-shot helper ran as the SDK user. Original typed values were saved privately before apply; exact-value restore/readback and reapply passed. The latest recorded readback assigns CleanFrame to Home, startup and boot-backup, with Home autostart enabled. The first-screen type still names Samsung Home.

Preserve this configuration and `.local/native-home/original.json`. Restore the original Home/startup values before uninstalling CleanFrame or changing its identity. The maintained command is `python3 scripts/native-home/run.py restore`; use it only in an explicitly authorised TV task. The earlier last-app-resume menu experiment does not describe the current native assignment.

The helper uses undocumented native operations, guarded for the reference identity and firmware. Its source is in `scripts/native-home/`; compiled tools, original values and diagnostics stay private. See [development](development.md), the [setup guide](agent-tv-setup-guide.md) and the [native helper notes](../scripts/native-home/README.md).

Implementation reference: [S90D firmware 2130 native Home work](https://github.com/splitcipher/couchroot/blob/83906b468836869933012da03a4018fb339462b3/docs/devices/s90d/README.md). That is a different model; it does not establish compatibility with another TV.
