# CleanFrame

`app/` is the current packaged UI. Read `docs/development.md` and `docs/interaction-behaviour.md` before app changes. For a new contributor or a separate TV installation, also read `docs/for-agents.md`.

Use simple HTML, CSS and ES5-compatible JavaScript for the TV. Node tooling can use modern JavaScript. Preserve remote focus/navigation, preference migrations and cached rendering. Read `docs/assets.md` before changing images, glass geometry or icon sizing; keep live blur and pixel analysis off the TV animation path.

Run `npm run check` for app changes, `npm run check:art` for Art bridge changes and `npm run check:tools` for signing or validation-tool changes. For interaction changes, run the browser preview and `npm run check:browser`. The UI uses the TV's system font (One UI Sans, `FONT_STACK` in `app/main.js`) and ships no font files; do not add font binaries. Run `npm run check:public` and `npm run export:public` before preparing a public download. Follow `CONTRIBUTING.md` and retain third-party notices.

Browser/repository tasks do not authorise device access. Read `docs/tv-status.md` before compatibility claims and `docs/agent-tv-setup-guide.md` before a new TV setup. An explicit device task is required even for queries that stage a helper. Announce any installation, app launch or restart; confirm visible results with the owner. Treat native Home/startup writes as a separate task with explicit authority and an exact-value recovery baseline.

On the maintainer's TV, preserve the stable package/application identity, author certificate and existing native Home assignment. For an independent user's signed build, create their own SDK-generated identity and certificates, then select them in ignored `.local/signing.json` using `signing.example.json`; read the signing section in `docs/development.md`. The generated manifest and install/launch tools use that identity; the runtime reads its own ID. Keep the source identity guards intact. Native Home targets and firmware guards need separate review and authority. The TV tools and native helper retain reference-machine assumptions; they are not an unattended installer.

Keep signing keys, passwords, device identifiers, addresses, SDKs, recovery values and generated packages in ignored `.local/` or `dist/`. Never commit font binaries or owner configuration (bridge address, go2rtc origin, camera names, weather location). Public-code licensing does not replace the terms in `THIRD_PARTY_NOTICES.md`.

On Nathan's Mac, use `/Users/nathan/.local/bin/gh-for-repo` for GitHub CLI work. On another machine, use the contributor's own authenticated GitHub account. Preserve shared or uncommitted work. Use reversible deletion; never reset, force-push or rewrite history without explicit authority. Publication/visibility changes require a separate instruction.
