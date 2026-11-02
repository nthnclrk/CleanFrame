# Working with a coding agent

CleanFrame began on one TV. The web launcher now has a Tizen 5.0 installation floor, with attributed owner reports for other models. Treat the source and setup notes as a starting point to adapt, and explain that use is at the owner’s risk; the minimum does not establish every device flow. Inspect the actual scripts and hardware assumptions before proposing device commands.

Choose the scope before starting: a browser contribution, an independently signed app or a native Home experiment. Each needs a different level of local access and owner authority.

## Change the interface

Use the browser-only prompt in the README. Read `AGENTS.md`, then the development and interaction docs. `npm run check` and `check:device` are offline source/synthetic-adapter checks. Run the public-font preview so the result is reproducible on a clean clone. Finish with source validation, relevant browser checks, a screenshot for visual changes and a clear statement of what needs physical TV observation.

The current app uses List and Dock, fifteen wallpapers and separate appearance settings. `app/main.js` handles interaction; `app/device.js` owns device calls. The existing storage migration keeps older installations usable.

## Install your own copy

Use a local agent with access to your computer. A cloud-only agent can edit the repo but cannot reach your TV through this source alone. Start with this prompt:

```text
Read AGENTS.md and docs/agent-tv-setup-guide.md. Help me install my own
copy of CleanFrame on my Samsung The Frame. My model/firmware is:
<supply it, or help me find it on the TV>.

First preview the public-font app locally. Then inspect the reference
signing/device scripts and make a plan for my OS, SDK and TV. Create
my own Samsung signing profile and app identity; use the installed-app
IDs from my TV. Keep credentials and device details in ignored local
configuration. I will complete account sign-in and verification myself.

Prepare one stage at a time. Ask before the first device connection
and announce installs, launches and restarts. Confirm visible results
with me. Stop before native Home/startup changes; installation alone
does not authorise those changes. Keep a private setup/recovery record.
```

The setup guide supplies the stage-by-stage instructions and completion criteria. For an independent signed build, use `signing.example.json` to create ignored `.local/signing.json` with the owner's SDK, existing certificate profile and SDK-generated identity. Packaging overrides only the output manifest; the installer/launcher use the same local identity and the runtime self-filter reads Tizen's current application ID. Keep the source identity assertions as protection for the reference source. The native helper target and firmware guards still need separate review if that optional stage is requested. The maintainer's stable identity is for updates to the maintainer's installation; it is not another user's signing setup.

## Native Home and startup

This is an optional, undocumented firmware-specific experiment. Read the native section of the setup guide and `scripts/native-home/README.md`. Check the actual model, firmware, API capability, user permissions and original values. Query/inspect also stages temporary files, so it is a device operation. The helper has hard-coded guards for the reference TV and requires private compiled output and a recovery baseline.

Prepare exact-value apply and restore commands for the owner's own app ID before requesting authority to execute them. Test rollback, confirm the physical Home destination and keep unknown power-on/Art Mode behaviour marked unknown. The guide's native-stage prompt is the separate authorisation point. A successful launch callback or settings readback is insufficient proof.

A separate [experimental 2020 LS03T profile](../scripts/native-home/frame-2020/README.md) prepares owner-configured native source offline. It does not widen the reference guard or supply a supported install/transport path. Its Home router registers a key rule during installation, before a C# guard can run. Require exact model/firmware and recovery preflight in the owner’s procedure; do not treat source preparation as authority for device use.

## Public distribution

Run `npm run check:public` and `npm run export:public`. The latter is an offline unsigned export that always excludes proprietary fonts, even on the maintainer's machine. Do not upload a personal signed widget as the public release. Read the third-party notices and publication checklist. Repo visibility, release uploads and history changes need their own explicit instruction.
