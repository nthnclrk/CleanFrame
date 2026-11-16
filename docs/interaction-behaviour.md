# Interaction behaviour — 0.7.0

## Home

- Dock: Left/Right scrolls the apps without wrapping. Up enters the top-right controls, starting with Apps or the last selected control. Left/Right moves between Apps and Settings. Down or Back returns to the selected app. The clock is at the top left.
- List: Up/Down scrolls the apps without wrapping. Right enters the bottom-right controls, aligned with the clock above, at whichever of Apps or Settings is level with the focused row. Up/Down moves between Apps and Settings. Left or Back returns to the selected app. With Glass focus, only one control shows focus: the list row has no plate while Apps or Settings is focused. Seven apps fit before the list fades at both ends as it scrolls. The clock uses the same face and weight as the app names.
- Remote keys: a held arrow moves at once, repeats after 280 ms and then every 110 ms until released, sooner than the TV's own auto-repeat. Presses less than 360 ms apart switch focus without the spring or crossfade so it keeps up; the spring returns when movement pauses. Glass focus on the list is a fully rounded pill sized to the focused name, which grows 6% with a light spring; reduced motion keeps it still.
- OK opens the selected item. Focus alone never launches an app. The app shows no remote-key hints; the focused control is the cue.
- Icons-only apps and controls reveal their names when focused. App presentation and control presentation are independent.
- Back from the app list or Dock opens a choice to stay or open Samsung Home.
- A panel keeps focus within its own controls. Back closes one panel at a time.
- Returning to the running launcher keeps the selected app or panel item. There is no auto-return timer. Held OK and Back keys act once until the key is released.

## Settings and appearance

Settings has three rows: **Apps on Home** (the membership and arrangement editor), **Visual** and **Samsung Home**. Samsung Home is an action: OK opens Samsung's Home screen directly. The background is always the Art Mode photo, and Inter is the only typeface. Visual uses a two-pane screen with visible choices on the left and the committed Home preview on the right.

| Visual row | Choices |
| --- | --- |
| Layout | List or Dock |
| Focus | Glass (default) or Text; on Art Mode, Glass is a translucent frosted pill |
| App display | Text, Icons or Both |
| Home controls | Text, Icons or Both |
| Inputs on Home | When connected (default) or Always, for HDMI entries on Home |
| Clock | Off, Clock (default) or With weather; weather is offered only when a location is configured (`cleanframe.weather.v1`) and comes from Open-Meteo, refreshed at most every 20 minutes |

Up/Down moves between rows. Left/Right moves between choices in a horizontal row. Focus alone changes neither the preview nor saved preferences in these appearance groups. The preview continues to show the committed appearance while a change loads. OK applies the focused value. A checkmark identifies the applied value; the filled plate identifies remote focus. Applying the current value does not write again.

A font or photo change applies only after its resources are ready and storage succeeds. A load or storage failure keeps the previous appearance and checkmark, with a Try again action. Back cancels a pending change, leaves the group and keeps completed changes. Late load callbacks cannot apply a cancelled choice. There is no Save button. Returning to a group restores its last choice focus; returning to Settings restores its category focus. There is no bundled wallpaper picker or rotation menu.

Settings, All apps, the Home editor and Home all use Inter. If Inter is slow or missing, Home remains usable with a local fallback and recovers when the font loads.

## Lights and Cameras

When configured on the TV (`cleanframe.controls.v1`), Home's controls start with **Lights** and **Cameras**; otherwise only Apps and Settings appear. Lights asks the TV-local bridge to fire the owner's Vetro rule, which publishes an MQTT message for Home Assistant; the label briefly confirms "TV lights" or reports "Lights unavailable". Cameras opens a view of go2rtc MJPEG streams that start only when it opens and stop when it closes or CleanFrame is hidden. Each tile keeps its stream's own shape; the arrangement (row, column, a tall or wide tile beside the rest, or two rows) that gives every camera the most picture is chosen. Arrows move between cameras, OK shows one full screen, Back returns. A camera with a `full` stream plays it full screen at full quality through the TV's own player as go2rtc HLS (repackaged, not re-encoded); the page goes clear over the video layer, and the MJPEG frame shows until it runs or if the TV cannot play it. This needs the avplay, network.public and tv.audio privileges and a Partner-signed package; the TV's player refuses the NVR's RTSP directly and streams wider than its decoder (such as 5120×1552).

## Streaming apps

Fresh Home defaults are Live TV, Stremio, Netflix, Disney+, YouTube, Apple TV, Prime Video, ESPN and Apple Music. ABC iview and SBS are no longer defaults; saved custom Home choices and installed-app discovery remain intact. ESPN uses its existing native target and a white transparent PNG wordmark. Live TV uses a separate TV symbol and source action. Other installed consumer apps can also be added to Home. Launching uses the public `tizen.application.launch` API with the app's native ID. Missing apps and denied launches produce a real error. No web player, placeholder success page or account credential is embedded.

## All apps

The panel reads `tizen.application.getAppsInfo` on entry and shows Live TV and HDMI 1–4 first, then the filtered consumer apps alphabetically. Samsung's visibility flag alone also exposes system utilities, so EP packages, background services, ad players, account utilities, placeholders and duplicates are omitted. Known brands use bundled marks. Other apps use their local installed icon, with initials as a fallback.

The five-column grid scrolls with remote focus. OK launches an app; its On Home badge shows membership. Up from the first row reaches Apps on Home, which opens the editor. An API failure shows a retry and keeps saved Home choices. Browser previews report that installed-app discovery and launching require the TV.

## Apps on Home

Open the editor from Settings or All apps. On Home shows the current order on the left. Not on Home shows Recently removed first, followed by other installed apps on the right. Home holds one to 24 apps; the On Home column scrolls, and a "Then scroll" line marks where Home itself starts scrolling.

- Reorder: OK on an app name picks it up. Up/Down moves it. OK places it and saves the order. Back puts an unplaced app back without saving that move.
- Remove: Right from an app name reaches Remove from Home. OK saves the removal and moves focus to the same app in Recently removed. The app stays installed.
- Add: OK on an app in Not on Home adds it and saves. A recently removed app returns to its previous position within the editing session; another app is added at the end. Focus follows the app to its Remove from Home control, so another OK can reverse the addition.
- Undo reverses a completed addition, removal or reorder from the current editing session. Done or Back closes the editor and keeps completed changes. Undo history ends when the editor closes.

Removing the last Home app or adding a tenth app is prevented. A failed storage write keeps the committed choices and order, with a retry message. Saved native app IDs and names survive a restart or a failed catalogue refresh.

## Art Mode and Samsung screens

Home has no Art Mode control; the remote's own Art Mode/power button covers it. The adapter's Art Mode call remains and sends an application control to the installed `org.tizen.art-app`, with `mode=fullscreen` and `requester=mobile`. This aims to enter native Art Mode with its current artwork, without toggling power or changing the selected artwork.

This mode comes from [research on Samsung's Art app](https://github.com/TheFab21/ha-samsungtv-smart/blob/master/notes/QN55LS03FAFXZA/ART_MODE_DECOMPILED.md), on another Tizen 9 Frame model. It is an internal Samsung contract, not a documented public Art API. Its visible behaviour on this exact firmware must be confirmed on the TV.

Samsung Home explicitly launches the original `com.samsung.tv.csfs` app, independently of the new Home assignment. The earlier `com.samsung.tv.coba.newhome` component did not open Smart Hub visibly and is no longer the escape target. TV settings still uses `com.samsung.tv.coba.setting`. Exact on-device destinations are recorded in docs/tv-status.md; launch callbacks alone are not visual proof. There is no blind power-key fallback.

All calls have bounded response handling. A failure leaves CleanFrame usable. No simulated device success views remain. Browser validation cannot confirm the visible Samsung destination.

Installed-app discovery allows up to 20 seconds for large TV catalogues; launch controls retain an 8-second limit. Opening All apps or the editor refreshes the catalogue while retaining saved Home choices. No discovery polling runs during hidden startup.

## HDMI inputs

Settings → Samsung → Inputs opens the HDMI chooser. The adapter reads the TV’s actual connected and disconnected source records, including sleeping devices that may be listed as disconnected. It does not guess a universal port count or add a fourth default Home control. Missing APIs, denied access and discovery failure produce an unavailable/error state rather than invented ports. The active source comes from the synchronous `tvwindow.getSource()` return value.

Up/Down selects an input. OK requests that exact source; Back returns to Samsung Settings. Retry after a failed load rereads the available sources. A routing error remains an error, and a failed handoff leaves the launcher usable. Timed-out or cancelled requests cannot start a later routing or viewer action; a native request already sent to the TV may itself be uncancellable.

Selecting a source, opening Samsung’s viewer, seeing the expected HDMI picture and waking a CEC device are separate results. The portable implementation does not import firmware-specific viewer payloads or claim to wake a sleeping device. No input discovery or polling runs during hidden startup.

## Preferences and wallpaper

The launcher stores appearance, Home order, recently removed apps, the last launched Home app, wallpaper and rotation locally. List and Dock share these preferences. The existing `cleanframe.home.v1` key is retained, with a fallback read from `cleanframe.shore.v1`. Legacy List maps to Dark + List + Type; Glass Dock and Glass Grid map to Photo + Dock + Glass. App order, wallpaper, rotation and the last Home app are preserved.

Home backgrounds are Art Mode, Light or Dark. The bundled gallery and generated material files have been removed to reduce widget size. Existing `photo` preferences migrate to Art Mode; Light and Dark stay unchanged. Safe legacy wallpaper IDs and rotation modes remain stored for preference compatibility, but no corresponding file is loaded and rotation has no timer or menu.

Art Mode reads the last-good app-private image before asynchronously refreshing on visible Home lifecycle events. Arrow-key navigation performs no networking, and hidden startup does not poll. Back, hiding, failed loads and preference-write failures keep the previous completed appearance. If no image has ever been cached, startup uses an inline neutral background while the bridge is unavailable. Unmeasured Art photos use outlined text, a static frosted Glass focus and neutral panels; no generated gallery materials are requested. [Setup and cache details](art-mode-wallpaper.md) include physical checks still required.

## Live TV

The main Live TV entry means antenna/cable channels, not Samsung TV Plus. On explicit OK, the adapter discovers `TV` records from `VIDEOSOURCE`, selects the active tuner when available or the sole reported tuner, then opens `org.tizen.tv-viewer`. It does not invent tuner number zero or merely reopen a viewer that might still be on HDMI. Missing, ambiguous or denied sources produce an honest error. Back, timeout, hiding or a newer source action prevents late discovery/selection callbacks from opening the viewer. An already-issued native selection may be uncancellable. No source discovery runs on focus or hidden startup. Actual broadcast picture/channel availability remains a physical TV check.

## Sources

- [Samsung Application API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/application-api.html): installed-app discovery and application control.
- [Samsung application termination guide](https://developer.samsung.com/smarttv/develop/guides/fundamentals/terminating-applications.html): exiting is not treated as a deterministic Samsung Home route.

The native Home operation and startup configuration from 19 October remain separate from this app update. Home from Netflix was confirmed for that configuration; power-on after Netflix remains provisional. Streaming apps retain their own Back navigation. Netflix did not exit on repeated Back in the observed test, so there was no app-exit destination to verify. No global Back interception or key-filter hook was installed. See [TV status](tv-status.md) for device evidence; this behaviour specification is not an installation or visual-verification record for 0.6.0.

## Clock and rendering

Both layouts show the TV's local time in 12-hour format, without AM/PM or seconds. It updates at the minute boundary and on return to the launcher. No date or clock panel is shown.

Art Mode photos keep their original brightness without full-screen scrims; Glass focus is a static translucent frosted pane with outlined text, without precomputed photo metadata. Navigation does not sample image pixels, run an optics engine or apply live backdrop blur. Flat backgrounds use matching light or dark panel colours. Focus feedback uses transforms and opacity; reduced motion removes animated scaling and movement while retaining opacity feedback.

Hidden prelaunch can install a fully loaded wallpaper bundle without waiting for an animation frame. A valid loaded image remains usable if detached-image decoding rejects. A failed startup bundle retries when the launcher becomes visible; pending appearance cancellation keeps the last committed preview. Font recovery clears fallback measurements and cached markup. This readiness fallback uses a completed load and nonzero image dimensions; it does not prove a TV has painted the image, and an accepted bundle is not automatically decoded again on return. These paths have browser regression coverage; physical cold-boot behaviour still needs owner observation.
