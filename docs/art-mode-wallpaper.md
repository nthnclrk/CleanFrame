# Art Mode wallpaper sync (personal fork)

CleanFrame's Home background is always the current unfiltered uploaded Art Mode JPEG. A tiny inline neutral background handles startup without a cache. This feature does not change native Art Mode's selection, launch it, install anything or alter native Home/startup assignments.

The local Vetro shard needs neither Home Assistant nor an admin/session token. It defaults to loopback. TVs that block loopback can use their own interface address; connections from other LAN devices are refused.

## Evidence and limits

The owner supplied evidence from a 2024 Frame running Tizen 9: the `ArtLatestFullScreenData` preference's uploaded content ID matched live `samsungtvws art.get_current()`, and its image path pointed to the original 3840 × 2160 JPEG (about 2.55 MB). That establishes the source for that uploaded image. The bridge has been imported and started in Vetro on that TV: it served an original JPEG with a matching SHA-256, accepted opaque widget origins and rejected web origins. Initial packaged-widget testing found that this TV blocks loopback with ERR_ADDRESS_UNREACHABLE; the interface-address transport below handles that separately. With private interface-address configuration, the installed widget loaded the full-resolution JPEG and saved it in its app-private cache. A request from another LAN device returned 403. An app restart with the bridge stopped recovered the full-resolution JPEG from its private file cache. The owner confirmed the selected picture matches. Home routing and a calibrated visual match still need confirmation.

The bridge accepts only `MY_` uploaded IDs, exact `.jpg` paths in the fixed `my_photo` directory, `PhotoFilter: "None"`, and an empty or `"none"` `UserMatteType`. Paid store art, slideshows, filters, matte rendering, other firmware and older Tizen versions are **not verified support**. Unsupported or corrupt selections return unavailable; CleanFrame keeps its last good image. The Art SQL shard cannot serve these files and is not used.

The result is the original photo with CleanFrame's centred cover crop and localized text contrast, shown through a calibrated Art look. It does not recreate Art Mode's fit or matte.

### Calibrated Art look

Art Mode's picture processing is not documented, so the owner matched it by eye and from filmed side-by-sides on a 2024 Frame with Art brightness 5. The phone's white balance shifts between clips, so only comparisons within the same clip were used. The look is a static, colour-only treatment of the background image: CSS `brightness`, `contrast` and `saturate`, an `feComponentTransfer` gamma curve (`#artCurve`), and a multiply tint on `#bg::after`. Both ends were locked:

| Art colour temperature | brightness | contrast | saturate | tint | gamma R/G/B |
|---|---|---|---|---|---|
| −5 (cool) | 0.41 | 0.86 | 0.50 | rgb(246,238,222) | 1 / 1.02 / 1.15 |
| +5 (warm) | 0.41 | 0.86 | 0.48 | rgb(250,212,160) | 1 / 1.03 / 1.19 |

Values in between are interpolated linearly. The bridge reads Art Mode's `brightness` and `color_temperature` read-only from the TV's own Art channel (`ws://127.0.0.1:8001/api/v2/channels/com.samsung.art-app`; no pairing token, one short connection addressed to the Art app client, at most one read at a time and a new one at most 3 s after the last finished; when the last good look is over 3 s old, `current.json` waits up to 800 ms for that read, see [Loopback HTTP](#loopback-http)) and adds them to `current.json` as `look`. The widget keeps the last good value in `cleanframe.art.look.v1`, so the look survives an unavailable bridge; with no value it uses colour temperature 0. Art brightness was calibrated the same way at 2, 5 and 10 (colour temperature +3), relative to the brightness-5 look above, and is interpolated piecewise-linearly between them (extrapolated below 2, with dimming floored at 0.3):

| Art brightness | dimming | image brightness | contrast | saturate | tint R/G/B |
|---|---|---|---|---|---|
| 2 | ×0.62 | ×1 | 0.97 | +0.016 | ×1 / ×0.98 / ×0.92 |
| 5 | ×1 | ×1 | 0.86 | 0 | ×1 / ×1 / ×1 |
| 10 | ×1 | ×1.55 | 0.78 | −0.064 | ×0.95 / ×1 / ×1 |

Dimming scales the multiply tint instead of CSS `brightness`. Darkening before the gamma curve took proportionally more blue out of dark values and turned shadows olive. Brightening above 5 raises the image's own brightness, because a multiply tint cannot lighten. Art Mode's automatic ambient dimming has no readable value, so in a dark room Art Mode can look slightly darker than CleanFrame. The bridge never changes display settings. Sheets (Settings, Apps, the Samsung Home message and other full-screen views) sit on a frosted copy of the Art photo with the same look and a darker multiply veil. The frost is made once per photo: a 480×270 canvas copy with a one-time canvas `blur` filter (a halve-then-double ladder where canvas filters are missing). It is stored in `cleanframe.art.frost.v1` and reused on later launches while the photo revision is unchanged, and the same draw saves a small unblurred preview (`cleanframe.art.preview.v1`) that is shown at launch before the full image decodes. The dock mat uses the same frost. The one draw per photo is the only canvas work; nothing runs on navigation. If the draw fails, sheets keep the plain matte. There is no blur during navigation, canvas pixel analysis or network activity on arrow-key navigation.

## Build and host contract

```sh
npm ci
npm run check:art
npm run pack:art
```

`dist/cleanframe-art.vplugin` is ignored output. The packer is deterministic and includes only the checked-in `index.js` and manifest, plus the doorbell picture-in-picture build as `pip.b64.json` when `npm run build:pip` has produced one ([`native/doorbell-pip`](../native/doorbell-pip/README.md)); never configuration, a cache or artwork. Its text JSON is:

```json
{"format":"vetro-plugin","version":1,"manifest":{"id":"cleanframe-art","name":"CleanFrame Art bridge","version":"1.5.1","apiVersion":1,"permissions":["exec"],"entry":"index.js"},"files":{"index.js":"<source text>"}}
```

`manifest.json` is not a `files` entry. The packer enforces the 20-file / 512 KiB envelope; this shard uses one file, or two with the doorbell picture-in-picture build. The module is ES5, run by Vetro's Node 12 on the TV, and exports `module.exports(ctx)` returning `{start, stop, status, route}`. It requires this Vetro API version 1 contract:

- `ctx.dir`: an existing directory writable as the process UID; the shard canonicalises it and creates a private `art-cache/` child.
- `ctx.execute(command, timeoutMs)`: root execution, returning a Promise for `{stdout, stderr, exit_code, timed_out}`. The host must enforce the timeout and its 1 MiB output limit. The shard requests 4 seconds per command and rejects excessive output/errors without exposing diagnostics.
- `ctx.config.get/set`: private configuration. The shard reads `port` (absent: `8643`), `address` and `key` (see below) and the optional `pip: { stream, seconds }` for the doorbell picture-in-picture. Only this host-managed `config.json` is expected to survive shard upgrades. The shard does not edit it directly.
- Vetro calls `start()` and `stop()` without awaiting their returned Promises; inspect `status()` and the listener after activation. Repeated starts coalesce. Stop closes the listener, destroys accepted sockets and invalidates pending refresh results; an already-issued root command remains subject to the host timeout. Restart waits for that refresh to settle before cleaning its cache. `status()` is safe local status; optional host `route()` returns 404, never an image or root API.

The parent maintainer handles import/start under a separate device task, after checking the real host's loader/schema and context API against this contract. No unattended installer or admin-token HTTP route is supplied. Build preparation here does not contact Vetro or a TV.

## Loopback HTTP

The shard defaults to **127.0.0.1**, port 8643. Private configuration may set `address` to the TV's own IPv4 interface address when its web runtime blocks loopback. Wildcard and nonlocal bindings are rejected. Every HTTP connection must originate from the exact bound address (including IPv4-mapped notation); other LAN clients receive 403 before any artwork response. It accepts GET, `POST` on `/lights`, and CORS preflight `OPTIONS` on its three paths, and at most eight concurrent TCP connections and eight active responses. Root preference/copy work coalesces into one refresh; successful reads have a 1.5-second reuse window.

| Request | Result |
| --- | --- |
| `GET /current.json` | `{revision, contentId, imageUrl, width, height, look?}`; `look` is Art Mode's `{brightness, colorTemperature}` when read; `Cache-Control: no-store`. When the last good look is over 3 s old, the reply waits up to 800 ms for a fresh read; if that read is slower, it carries the last known look (or none) |
| `POST /lights` | Fires the fixed Vetro rule trigger `cleanframe-lights` (Vetro then publishes MQTT); the body is ignored. 204 on success; 429 while a press is still running or within 1.5 s of the last successful one; 502 if Vetro fails or takes over 5 s (the next press tries again) |
| `OPTIONS` on `/current.json`, `/art/<revision>/image.jpg` or `/lights` | CORS preflight: 204 with `Access-Control-Allow-Methods` (`GET`, or `POST` for `/lights`), `Access-Control-Allow-Headers: X-CleanFrame-Key` and `Access-Control-Max-Age: 600`. Needs no key, but the client and Origin checks still apply |
| Any request other than preflight without the configured `X-CleanFrame-Key` | 403 with no body |
| `GET /art/<64 lowercase hex revision>/image.jpg` | Immutable JPEG for that exact retained revision |
| Unknown/evicted/mismatched revision, query variants, any other path | 404 |
| Unsupported/corrupt preference or failed copy | 503 with only `{"error":"Art unavailable"}` |
| Any other non-GET method or path | 405 |
| HTTP(S), other web, or malformed Origin | 403 |

Opaque `Origin: null` and nonweb `file:`, `widget:`, `wgt:` or `tizen:` origins receive CORS permission. Requests without Origin are accepted for packaged/native clients. An ordinary HTTP browser preview cannot use the real service: browser tests substitute synthetic bridge responses with explicit CORS. No listener address, source path, rule, topic or arbitrary command can be selected by HTTP. There is no artwork access for other LAN devices and no authentication/session endpoint. `/lights` can only fire the one fixed Vetro rule; it is the bridge's only path towards Home Assistant.

### Shared key

The client-address and Origin checks keep other LAN devices out, but not other pages on the TV itself: a plain page or sandboxed iframe in the TV's own browser is also a local client and can send `Origin: null`. Without a key, such a page could read `/current.json` and the photo and press Lights. **The owner should set a key.**

- Set private config `key` to a random string of 24 to 256 printable ASCII characters without spaces (for example `openssl rand -hex 24`), and the widget's localStorage `cleanframe.art.key` to the same value. The widget sends it as the `X-CleanFrame-Key` header.
- With a key, every request except CORS preflight must carry `X-CleanFrame-Key` with exactly that value; anything else gets 403 with no body. The comparison is constant-time (`crypto.timingSafeEqual` on SHA-256 digests of equal length). A key that is set but too short, too long or not a string stops the bridge from starting (`Invalid bridge key`) rather than running unprotected.
- Without a key the bridge behaves as before and `status()` reports `keyed: false`. The key is never returned by HTTP or `status()`. Do not commit it.

Revision is SHA-256 of safe metadata plus the copied bytes. The bridge retains at most two revision files and one bounded temporary copy (up to about 36 MiB). A previous retained URL still serves its own bytes; an evicted URL returns 404 rather than the latest image. An open response holds its own descriptor while cache eviction proceeds. Plugin restart/upgrade discards this disposable bridge cache and rebuilds from the preference; the widget cache is independent.

## Other connections and files

- **Art Mode settings:** read-only `get_artmode_settings` over the TV's own Art channel (`ws://127.0.0.1:8001/api/v2/channels/com.samsung.art-app`), addressed to the Art app's client id, one read at a time and a new one at most 3 s after the last finished; `current.json` waits up to 800 ms for it only when the last good look is over 3 s old. Only integer brightness (0–10) and colour temperature (−5..+5) are kept.
- **Vetro's MQTT login:** with `pip.stream` configured, the shard reads `/opt/usr/home/owner/share/vetro-mqtt.json` (Vetro's broker settings, readable by the shard's user), connects to that broker with its own random client id (plain or TLS as configured), subscribes to `vetro/cleanframe/doorbell` and ignores retained messages. The login never leaves the TV and is never returned by HTTP or status.
- **Doorbell picture-in-picture:** `ring` starts the bundled overlay as root only from a root-only copy whose hashes match those recorded at unpack. Before starting it stops a previous `systemd-run` overlay and, when `pkill` exists, a fallback `setsid` one (a `pkill -f` pattern anchored to `dotnet <root copy's dll>`, so it never matches the root shell itself), and keeps the previous run's log as `pip.log.1`; see [`native/doorbell-pip`](../native/doorbell-pip/README.md).

## Preference and file handling

The only Art preference read is:

```
/opt/usr/home/owner/apps_rw/org.tizen.art-app/data/.pref/0f61537ef36906f51e0fa75852758b33df2df340
```

That filename is SHA-1 of `ArtLatestFullScreenData`. The bounded binary parser requires `uint32 LE 0x17`, the exact 23-byte key without a separator, `uint32 LE type 1`, then JSON with an optional final NUL at that precise boundary. It never scans for a first brace. The preference is capped at 64 KiB; only allowlisted content ID and integer dimensions leave the parser. Content keys and all other preference fields are discarded and never returned through HTTP/status/errors.

The only source pattern is:

```
/opt/usr/home/owner/apps_rw/org.tizen.art-app/shared/trusted/data/my_photo/MY_<safe uploaded ID>.jpg
```

IDs must match `MY_[A-Za-z0-9_]{1,64}`. Paths must match exactly; traversal, alternate extensions, shell syntax, aliases and source symlinks are rejected. Root uses fixed/shell-quoted paths, canonical path checks, a bounded `head` copy, noclobber creation, mode 0600, and numeric process UID/GID ownership. JPEG bytes never pass through root stdout. The process validates file type/size, JPEG markers and dimensions, rereads the preference to reject a changed selection, hashes the copy, then atomically renames it into the private cache. Each image is limited to 12 MiB, each dimension to 16384, and total pixels to 64 million. The web decoder must also successfully load it before app use.

The shard assumes the target's `head`, `base64`, `readlink -f`, `chmod` and `chown` commands, and the supplied root execute semantics. These still need host verification on the owner's TV.

## Widget cache and refresh

`look.source` is `art` inside the existing `cleanframe.home.v1` preferences. Old Gallery, Photo, Light and Dark preferences load as Art Mode; Home-order keys remain intact and retired wallpaper/mode fields are dropped. A new photo is installed only as a decoded, complete bundle. Back or another appearance choice cancels pending work; late responses cannot apply a cancelled choice. A preference-write failure keeps the previous appearance and offers Retry.

On Tizen, the app prefers `wgt-private/cleanframe-art/` through `tizen.filesystem`, never shared storage. A completed temporary JPEG is moved to its revision filename before the small `cleanframe.art.cache.v1` localStorage pointer advances. A new photo is shown as soon as it decodes, without waiting for its save. A save that has started is written in 256 KiB steps and finishes even if the app is hidden or the caller stops waiting, so the photo is not downloaded again. Each save has a unique temporary name, and cleanup never deletes a file an unfinished save still needs, so overlapping saves (hidden and shown again mid-save) each keep their own temporary file; the pointer only moves forward, to the latest save that completes. Cleanup otherwise preserves the pointer, current cache and installed image and removes owned obsolete revisions and temporary files on later saves. Steady success retains at most the previous and current cache. Storage failures keep the old persistent pointer and allow the decoded image in memory for that session.

Browsers, or TVs without usable private filesystem access, use one atomic IndexedDB last-good Blob record. Without either storage facility, the session uses memory only. Object URLs are bounded to the installed bundle, cached record and one candidate. Cache reads, image decode and persistence have deadlines; metadata XHR is capped at 2 KiB/3.5 seconds and image XHR at 12 MiB/8 seconds.

Startup reads and displays the last successful local image before starting a refresh. With a saved Art source but no cache, it immediately builds a neutral local placeholder and keeps the saved source. Startup/focus/visibility of visible Photo Home can refresh asynchronously, with a five-second event throttle. Hidden startup sends no request; hiding cancels active XHRs. There is no polling timer. Settings navigation and remote movement never trigger background bridge requests. Explicitly applying Art Mode can fetch its missing image. A refresh finishing while Settings or another appearance operation is active can update the private cache but cannot replace the committed Settings preview. The next eligible lifecycle return can install that cached/new revision as a complete atomic bundle.

The public widget manifest includes internet, filesystem read/write and the AVPlay privileges, and network access to `http://127.0.0.1:8643` and Open-Meteo (`https://api.open-meteo.com`, for the optional weather). An owner build adds its bridge address and go2rtc origin. For a locally chosen alternate port, set the shard's private `port`, set localStorage `cleanframe.art.port` to the same decimal port (1024–65535), and align the local build's manifest access origin before signing. Keep that installation-specific adjustment local. For a TV that blocks loopback, privately set the shard `address` to its own interface IP, localStorage `cleanframe.art.host` to the same IP, and the personal widget manifest access origin to that address/port before signing. The widget permits only loopback or private IPv4 host values; this is installation configuration, not a discoverable LAN artwork endpoint. Do not commit the owner's address.

## Verification handoff

Offline checks are `npm run check`, `npm run check:art`, `npm run check:tools`, and `npm run check:browser`. The latter runs both the existing UI regression suite and Art-specific browser/cache tests. Screenshots use a bundled synthetic photo under ignored `.local/qa/art-*-public.png`. No owner's photo or diagnostic dump is included. `npm run pack:art` prepares the local shard; public unsigned widget preparation uses the existing `check:public` / `export:public` flow.

Vetro import/start, root copy utilities, packaged-widget interface-address access and app-private file creation were exercised on the owner's TV. Still verify private-file persistence across app/TV restart; the image against the owner's current uploaded Art photo; Home/Art visibility events and change latency; List/Dock readability and remote feel; stopped/missing bridge fallback; and cancellation under actual TV timing. Signing/install, launch and physical observation remain with the parent/owner. Native Home/startup writes are a separate task and are not part of this feature.
