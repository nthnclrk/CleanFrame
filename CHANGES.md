# Changes in this fork

A community fork of [nthnclrk/CleanFrame](https://github.com/nthnclrk/CleanFrame) (MIT),
adapted and extended for **non‑Frame Samsung Tizen TVs**. Tested on a 2024 Crystal UHD
(`UN75DU7200FXZA`, Tizen 9). All credit for the original launcher goes to the upstream author.

## Added features

- **Slideshow manager** — create named slideshows, pick wallpapers as selectable cards,
  set a custom transition speed, and play/stop from inside the Wallpaper menu.
- **Apps on Home** redesigned as a **card grid** (was a text list), with a direct
  lift‑and‑move reorder.
- **Long‑press any app** (hold OK) for a context menu: Open, **Move** (in‑place reorder —
  shuffle along the Home row, or rearrange the All‑apps grid), Add/Remove from Home,
  **Hide/Unhide** from All apps, **App info**, and an **Uninstall** helper.
- **Press Down** from the Home row to open **All apps**.
- **Hidden‑apps** review list in Settings; **custom All‑apps ordering** (persisted).
- Native app icons shown everywhere, **auto‑blended to monochrome only on the Home row**
  so the home screen stays consistent while browsing shows real icons.
- **Clock**: white, repositioned, **24‑hour**, with seconds and the **date** beneath.
- **Apple‑TV‑style focus** on the All‑apps grid; reduced glass blur behind Home apps.

## Wallpapers & licensing

- Adds a few city/wildlife photos from **Wikimedia Commons** (CC‑BY / CC‑BY‑SA / CC0),
  credited in [`app/assets/wallpapers/ADDED-CREDITS.md`](app/assets/wallpapers/ADDED-CREDITS.md).
- **Personal wallpapers are not committed.** Drop images in `app/assets/wallpapers/`
  and register them in a git‑ignored `app/assets/wallpapers/catalog.local.js`
  (loaded automatically after the public catalog). This keeps your own collection local.

## Notes for non‑Frame TVs

- Installing the launcher works broadly (Tizen 5.0+). **Art Mode** features are Frame‑only.
- The optional **native‑Home takeover** (making the remote's Home button open CleanFrame)
  uses undocumented, model/firmware‑specific settings. It must be adapted per TV and needs
  a saved exact‑value recovery baseline. See `docs/agent-tv-setup-guide.md` and
  `scripts/native-home/`. Proceed at your own risk.
- Signing requires your **own** Samsung certificate and a `.local/signing.json`; see the
  upstream `docs/development.md`. Nothing in this repo contains signing keys or device IDs.
