# Interaction behaviour — 0.7.0

## Home

- Dock: Left/Right scrolls the apps without wrapping. Up enters the top-right controls (Lights and Cameras when configured, then Apps and Settings), starting at the last selected control. Left/Right moves between them. Down or Back returns to the selected app. The clock is at the top left.
- List: Up/Down scrolls the apps without wrapping. Right enters the right-hand controls at whichever one is level with the focused row. Up/Down moves between the controls. Left or Back returns to the selected app. With Glass focus, only one control shows focus: the list row has no plate while a control is focused. Seven apps fit before the list fades at both ends as it scrolls. The clock uses the same face and weight as the app names.
- Remote keys: a held arrow moves at once, repeats after 280 ms and then every 110 ms until released, sooner than the TV's own auto-repeat. Presses less than 360 ms apart switch focus without the spring or crossfade so it keeps up; the spring returns when movement pauses. Glass focus on the list is a fully rounded pill sized to the focused name, which grows 6% with a light spring; reduced motion keeps it still.
- OK opens the selected item. Focus alone never launches an app. The app shows no remote-key hints; the focused control is the cue.
- Icons-only apps and controls reveal their names when focused. App presentation and control presentation are independent.
- Back from the app list or Dock opens a choice to stay or open Samsung Home.
- A panel keeps focus within its own controls. Back closes one panel at a time.
- Returning to the running launcher keeps the selected app or panel item. There is no auto-return timer. Held OK and Back keys act once until the key is released, or until 1 s after their last event if the TV loses the release.

## Settings and appearance

Settings has three rows: **Apps on Home** (the membership and arrangement editor), **Visual** and **Samsung Home**. Samsung Home is an action: OK opens Samsung's Home screen directly. The background is always the Art Mode photo, and all text uses the TV's system font, One UI Sans (`FONT_STACK`). Visual uses a two-pane screen with visible choices on the left and the committed Home preview on the right.

| Visual row | Choices |
| --- | --- |
| Layout | List or Dock (default) |
| Focus | Glass (default) or Text; on Art Mode, Glass is a translucent frosted pill |
| App display | Text, Icons or Both (default) |
| Home controls | Text, Icons or Both (default) |
| Inputs on Home | When connected (default) or Always, for HDMI entries on Home |
| Clock | Off, Clock (default) or With weather; weather is offered only when a location is configured (`cleanframe.weather.v1`) and comes from Open-Meteo, refreshed at most every 20 minutes; a reading older than 3 hours is hidden |

Up/Down moves between rows. Left/Right moves between choices in a horizontal row. Focus alone changes neither the preview nor saved preferences in these appearance groups. The preview continues to show the committed appearance while a change loads. OK applies the focused value. A checkmark identifies the applied value; the filled plate identifies remote focus. Applying the current value does not write again.

An appearance change applies only after the Art photo is ready (when a new one is needed) and storage succeeds. A load or storage failure keeps the previous appearance and checkmark, with a Try again action. Back cancels a pending change, leaves the group and keeps completed changes. Late load callbacks cannot apply a cancelled choice. There is no Save button. Returning to a group restores its last choice focus; returning to Settings restores its category focus. There is no bundled wallpaper picker or rotation menu.

No font is downloaded, so text is ready at once. In a browser without One UI Sans, the stack falls back to a standard sans-serif font.

## Lights and Cameras

When configured on the TV (`cleanframe.controls.v1`), Home's controls start with **Lights** (`lights: true`) and **Cameras** (a go2rtc origin and up to six cameras); otherwise only Apps and Settings appear. Lights asks the TV-local bridge to fire the owner's Vetro rule, which publishes an MQTT message for Home Assistant; the label briefly confirms "TV lights" or reports "Lights unavailable". Cameras opens a view of go2rtc MJPEG streams that start only when it opens and stop when it closes or CleanFrame is hidden. Tiles open in their final places, from each camera's configured `ratio` or the shape learned from its last snapshot. Each shows a quick JPEG snapshot, then the live stream over it. A dropped stream reconnects after 10 s, a failed snapshot is retried every 10 s, and every minute each stream reconnects behind a fresh snapshot (closing its own connection first: go2rtc is HTTP/1.1 and the browser opens at most six connections to it), since the TV reports no MJPEG frames and a silent stall would otherwise freeze a tile. A camera whose snapshot fails hides its stream and shows its last picture dimmed and labelled Offline, and is rechecked every 10 s until it answers. Each tile keeps its stream's own shape; the arrangement (row, column, a tall or wide tile beside the rest, or two rows) that gives every camera the most picture is chosen. Arrows move between cameras, and OK shows one full screen. In full screen, arrows step to the previous or next camera, and OK or Back returns to the grid. A camera with a `full` stream plays it full screen at full quality through the TV's own player as go2rtc HLS (repackaged, not re-encoded); the page goes clear over the video layer, and the MJPEG frame shows until it runs or if the TV cannot play it. While the video plays, the MJPEG tiles are released; they reconnect when it stops. This needs the `avplay`, `network.public` and `tv.audio` privileges, a Partner-signed package and an `<access>` entry for the go2rtc origin (see [development](development.md#owner-build-access-origins-and-owner-settings)); the TV's player refuses the NVR's RTSP directly and streams wider than its decoder (such as 5120×1552).

## Streaming apps

Fresh Home defaults (`DEFAULT_HOME`) are Live TV, YouTube, Netflix, ESPN, Prime Video, Browser and HDMI 4. Saved Home choices are kept; other built-in and installed apps can be added. ESPN uses its existing native target and a white transparent PNG wordmark. Live TV uses a separate TV symbol and source action. Launching uses the public `tizen.application.launch` API with the app's native ID. Missing apps and denied launches produce a real error. No web player, placeholder success page or account credential is embedded.

## All apps

The panel reads `tizen.application.getAppsInfo` on entry and shows the sources (Live TV and HDMI 1–4) first, then the filtered consumer apps alphabetically. Samsung's visibility flag alone also exposes system utilities, so EP packages, background services, ad players, account utilities, placeholders and duplicates are omitted. Known brands use bundled marks. Other apps use their local installed icon, with initials as a fallback.

The five-column grid scrolls with remote focus. OK launches an app or selects the source; an On Home badge shows membership. The header has no buttons. After a discovery error the grid is empty and focus rests on the only header control, **Try again**. Saved Home choices are kept. Apps on Home is opened from Settings. Browser previews report that installed-app discovery and launching require the TV.

## Apps on Home

Open the editor from Settings › Apps on Home, or with Add apps when Home is empty. On Home shows the current order on the left. Not on Home shows Recently removed first, followed by other installed apps on the right. Home holds one to 24 apps; the On Home column scrolls, and a "Then scroll" line marks where Home itself starts scrolling (after seven apps in List, five in Dock).

- Reorder: OK on an app name picks it up. Up/Down moves it. OK places it and saves the order. Back puts an unplaced app back without saving that move.
- Remove: Right from an app name reaches Remove from Home. OK saves the removal and moves focus to the same app in Recently removed. The app stays installed.
- Add: OK on an app in Not on Home adds it and saves. A recently removed app returns to its previous position within the editing session; another app is added at the end. Focus follows the app to its Remove from Home control, so another OK can reverse the addition.
- Undo reverses a completed addition, removal or reorder from the current editing session. Done or Back closes the editor and keeps completed changes. Undo history ends when the editor closes.

Removing the last Home app or adding a 25th app is prevented. A failed storage write keeps the committed choices and order, with a retry message. Saved native app IDs and names survive a restart or a failed catalogue refresh.

## Art Mode and Samsung screens

Home has no Art Mode control; the remote's own Art Mode/power button covers it.

This mode comes from [research on Samsung's Art app](https://github.com/TheFab21/ha-samsungtv-smart/blob/master/notes/QN55LS03FAFXZA/ART_MODE_DECOMPILED.md), on another Tizen 9 Frame model. It is an internal Samsung contract, not a documented public Art API. Its visible behaviour on this exact firmware must be confirmed on the TV.

Samsung Home explicitly launches the original `com.samsung.tv.csfs` app, independently of the new Home assignment. The earlier `com.samsung.tv.coba.newhome` component did not open Smart Hub visibly and is no longer the escape target. Exact on-device destinations are recorded in docs/tv-status.md; launch callbacks alone are not visual proof. There is no blind power-key fallback.

All calls have bounded response handling. A failure leaves CleanFrame usable. No simulated device success views remain. Browser validation cannot confirm the visible Samsung destination.

Installed-app discovery allows up to 20 seconds for large TV catalogues; launch controls retain an 8-second limit. Opening All apps or the editor refreshes the catalogue while retaining saved Home choices. No discovery polling runs during hidden startup.

## HDMI inputs

HDMI 1–4 appear after Live TV in All apps and can be added to Home like apps (HDMI 4 is a default). OK on one rereads the TV's source records, selects that exact port with `tvwindow.setSource` and opens `org.tizen.tv-viewer`. A missing port, a different selected source, denied access or a failed handoff produce an error; the launcher stays usable. Timed-out, cancelled or Back-interrupted requests cannot start a later routing or viewer action; a native request already sent to the TV may itself be uncancellable.

**Inputs on Home** decides which HDMI entries Home lists. With **When connected** (default), Home shows an HDMI entry only while the TV reports that port connected, watching `VIDEOSOURCE` changes while Home is visible; with **Always**, every HDMI entry on Home is shown. The adapter records connected and disconnected sources (a sleeping device can be listed as disconnected) and does not invent ports.

Selecting a source, seeing the expected HDMI picture and waking a CEC device are separate results. The portable implementation does not import firmware-specific viewer payloads or claim to wake a sleeping device. No source discovery runs during hidden startup.

## Preferences and background

The launcher stores appearance, Home order, recently removed apps and the last launched Home app locally. List and Dock share these preferences. The existing `cleanframe.home.v1` key is retained, with a fallback read from `cleanframe.shore.v1`. Legacy List maps to List + Text focus; Glass Dock and Glass Grid map to Dock + Glass. App order and the last Home app are preserved.

The Art Mode photo is the only Home background. Saved Light, Dark, Photo or gallery backgrounds load as Art Mode. Retired fields (`wallpaper`, `mode`, `wall`, `material`, `font`) are accepted when reading old preferences and dropped on the next write.

Art Mode reads the last-good app-private image before asynchronously refreshing on visible Home lifecycle events. Arrow-key navigation performs no networking, and hidden startup does not poll. Back, hiding, failed loads and preference-write failures keep the previous completed appearance. If no image has ever been cached, startup uses an inline neutral background while the bridge is unavailable. After the first frost is made, later launches show a small stored preview of the photo at once while the full image decodes. Art photos use outlined text, a static frosted Glass focus and a frosted copy of the photo behind panels and the dock (480×270 with a one-time canvas blur, stored across launches). [Setup and cache details](art-mode-wallpaper.md) include physical checks still required.

## Live TV

The main Live TV entry means antenna/cable channels, not Samsung TV Plus. On explicit OK, the adapter discovers `TV` records from `VIDEOSOURCE`, selects the active tuner when available or the sole reported tuner, then opens `org.tizen.tv-viewer`. It does not invent tuner number zero or merely reopen a viewer that might still be on HDMI. Missing, ambiguous or denied sources produce an honest error. Back, timeout, hiding or a newer source action prevents late discovery/selection callbacks from opening the viewer. An already-issued native selection may be uncancellable. No source discovery runs on focus or hidden startup. Actual broadcast picture/channel availability remains a physical TV check.

## Sources

- [Samsung Application API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/application-api.html): installed-app discovery and application control.
- [Samsung application termination guide](https://developer.samsung.com/smarttv/develop/guides/fundamentals/terminating-applications.html): exiting is not treated as a deterministic Samsung Home route.

The native Home operation and startup configuration from 19 October remain separate from this app update. Home from Netflix was confirmed for that configuration; power-on after Netflix remains provisional. Streaming apps retain their own Back navigation. Netflix did not exit on repeated Back in the observed test, so there was no app-exit destination to verify. No global Back interception or key-filter hook was installed. See [TV status](tv-status.md) for device evidence; this behaviour specification is not an installation or visual-verification record.

## Clock and rendering

Both layouts show the TV's local time in 12-hour format, without AM/PM or seconds. It updates at the minute boundary and on return to the launcher. No date or clock panel is shown.

Art Mode photos are shown through the static calibrated Art look (see [Art Mode wallpaper sync](art-mode-wallpaper.md#calibrated-art-look)) with no other full-screen scrim; Glass focus is a static translucent frosted pane with outlined text, without precomputed photo metadata. Navigation does not sample image pixels, run an optics engine or apply live backdrop blur. Focus feedback uses transforms and opacity; reduced motion removes animated scaling and movement while retaining opacity feedback.

Hidden prelaunch can install a fully loaded background bundle without waiting for an animation frame. A valid loaded image remains usable if detached-image decoding rejects. A failed startup bundle retries when the launcher becomes visible; pending appearance cancellation keeps the last committed preview. This readiness fallback uses a completed load and nonzero image dimensions; it does not prove a TV has painted the image, and an accepted bundle is not automatically decoded again on return. These paths have browser regression coverage; physical cold-boot behaviour still needs owner observation.
