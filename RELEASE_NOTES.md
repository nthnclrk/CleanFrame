# CleanFrame 0.7.0

CleanFrame remains a starting point to fork and adapt for your own Samsung TV.

- The web launcher's installation minimum is now Tizen 5.0. Contributor results are recorded by model, firmware and tested flow; the minimum does not establish native Home support or complete verification on every TV.
- Settings → Samsung → Inputs lists the HDMI ports reported by the TV, including disconnected inputs that may contain sleeping devices. Selection errors stay visible, and cancelled or timed-out requests cannot start later switching or viewer handoff. Source routing does not guarantee CEC wake.
- Public packaging excludes Tizen SDK build output. Shared widget and Git validation reject generated build paths, preventing copied private overlays or nested signing output from entering a public download.
- Compatibility reports now include AU8000, S85F, LS03N, LS03F, QN85D and the 2020 Frame, with transport, startup and recovery limits recorded separately.
- The 2020 Frame native profile is optional experimental source for one exact firmware. It does not change the reference helper. Its configurable templates have not been redeployed; packaging, signing, model preflight and recovery verification remain owner tasks.

The release widget is **unsigned and uses public fonts only**. It is a reference export using the source identity. For an independent installation, build from this tag with your own SDK-generated package/application identity and certificates in ignored `.local/signing.json`; follow [the setup guide](docs/for-agents.md). Preserve your own identity and author certificate for updates. Never install another owner's signed widget or reuse their native Home target.

Third-party assets retain the terms in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). No maintainer TV was connected, installed, launched or changed for this release. Browser, adapter and host policy checks are repository evidence, not physical TV verification.

Thanks to Scott Heinrich (#14), Taha Tourougou (#15), Renzo Damian (#18), Christian Puryear (#19/#20), Tomi Äijö (#22), and everyone who supplied the device reports in #16, #17, #21 and #24.
