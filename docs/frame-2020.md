# 2020 The Frame: LS03T compatibility report and experimental source

Reported 31 October 2026 for **QE65LS03TAUXXH**, platform `20_NIKEM_FRAME`,
Tizen **5.5**, ARMv7 / 32-bit, firmware **T-NKMDEUC-2743.0**.
This is one owner's adapted installation. It does not establish support for every
2020 Samsung TV or change the upstream package minimum.

## Recorded evidence

| Area | Result on the reported TV |
| --- | --- |
| Signed web widget | Installed with the owner's Samsung certificates and a separate SDK-generated app identity. The adapted manifest requires Tizen 5.5. |
| Home and remote | Dock navigation and launching the selected installed apps confirmed on the TV. Saved app choices survive in-place updates. |
| Native Home operation | The 2024 helper's getter contract did not apply. The TV-specific operation API was used instead; apply, restore of the original absence, and reapply were checked. |
| Physical Home | Home from YouTube opened the launcher in the native-operation trial. Later HDMI use showed that this assignment alone was insufficient. |
| Additional Home key rule | A separate signed package added an `XF86Home` route. Install/removal restored the original registry rows. A subsequent source → Home command test returned to the launcher. This is not proof for every physical-key/source combination. |
| First-screen target | A separate native first-screen assignment was applied, restored, and reapplied, with readback at each step. |
| Native Art Mode | A local photo slideshow is independent of the web launcher. Its rotation setting survived an Art app restart and a verified TV reboot on this firmware. |

The current launcher package and the reference helper are separate compatibility
decisions. A successful widget installation does not establish that native Home
or first-screen control works. Samsung's bottom Home bar can still appear before
the launcher; the additional key rule does not remove Samsung's original rule.

## Prepare the web launcher

Follow [the staged TV setup guide](agent-tv-setup-guide.md) and use the owner's own
Samsung account, author/distributor certificates, SDK profile, and app identity.
Keep the existing author certificate and identity for in-place updates.

The upstream web launcher now has a Tizen 5.0 installation minimum. This
reported installation predates that change and used a local manifest adjustment
to 5.5. Its device results remain evidence for the owner’s adapted build, not
verification of every flow in the current release. The installation gate and
this firmware-specific native profile remain separate decisions.

Use `scripts/tv.py install` and confirm `install completed` plus the installed-app
entry. On this TV, plain `sdb install` could upload a package without completing
the widget installation. Follow the signing/configuration instructions in
[development](development.md); do not copy another owner's signed widget.

If the developer connection is unavailable after a restart, open Samsung's Apps
screen and restart the local SDB server, then query again. Do not treat a cached
SDB device entry as proof that a new command succeeded. The Developer Mode Host
PC address must belong to the owner's current developer computer.

## Experimental native runtime and APIs

The source in [the 2020 helper directory](../scripts/native-home/frame-2020/README.md)
uses `netcoreapp3.0` instead of the reference helper's .NET 6 target. It keeps the
reference helper unchanged. Native helpers remain ARM32 SDK-user operations;
they do not require root or a security-policy change.

There are three independent components:

1. **Home operation:** `app_operation_get_current_app` and
   `app_operation_set_current_app` from the TV-specific operation library.
2. **First-screen target:** the existing `db/first_screen/type` string, with
   firmware/library checks and an eligibility query for the selected launcher.
3. **Home key route:** a separately signed package that declares one overriding
   `XF86Home` rule. Its package identity must differ from the web launcher's.

Do not create the missing `db/appfw/home_appid` or `db/appfw/startup_appid` keys to
imitate another firmware. Those keys were unavailable on the reported target.
Do not replace the reference helper's firmware guard with a general Tizen-version
check. The 2020 source checks the exact firmware and hashes of the reviewed
native implementations.

### Original absence is a state to restore

The Home getter can return `-2` with a null app pointer. The 2020 helper checks
the corresponding owner/global/SDK operation records through **read-only** SQLite
connections. It accepts only the reviewed absence contract; an empty string,
another app's assignment, a getter error, or unrelated default rows is rejected.

Restore uses `aul_svc_unset_defapp_for_uid` for the TV owner. That API can remove
all defaults for an app, so the helper first proves that the selected launcher
has only its single trial Home record. It performs no direct database writes.
After restore it checks both the native getter and record absence. An unexpected
state is a reason to stop, not to substitute Samsung Home for the missing value.

The contributed source adds explicit, non-overwriting baseline capture and
requires that baseline before apply/restore. Capture files stay private and must
be copied back to the developer computer before any write. These checks and
owner-identity substitutions have offline coverage; the repackaged source has
not been deployed again solely to prepare this contribution.

### The extra Home key route is separate

The original Samsung manifest contains an `XF86Home` rule. The owner-installed
router package adds a new rule rather than patching that manifest or changing
the registry directly. Removal of the router package is its restore path.

Router installation itself registers the Home rule; the C# helper guards are
not an installation guard. Before packaging or installing it, the owner must
review the exact model/firmware preflight, signing and transport procedure.
Those steps are not supplied by this source contribution.

Before installation, save the original `managed_app`, `key_filter`, and
`task_filter` records privately. Verify the new rule after installation, then
verify exact original rows after removal. The recorded installation/removal
checks passed on this TV. The preparation script supplies source and a manifest,
not a general router installer or an independent recovery channel.

Restore/remove all integration before uninstalling the launcher. Keep operation,
first-screen, and router recovery records separate. Recovery still requires the
developer connection.

## HDMI observations

[PR #14](https://github.com/nthnclrk/CleanFrame/pull/14) proposed input selection.
The portable chooser is under Settings → Samsung → Inputs. The
2020 TV exposed an important case: a sleeping Chromecast could appear in the
`VIDEOSOURCE.disconnected` list. Do not reject an input solely because it is
currently disconnected. Source routing and waking a CEC device are separate
results.

On this installation, selecting the source through the public `tvwindow` path
could leave a no-signal screen, while Samsung's own source tile activated the
device. A model-specific `org.tizen.tv-viewer` app-control request was investigated.
It is not included here as a portable API or a completed CEC fix. Test device
wake, correct HDMI picture, and physical Home return as distinct checks. The
portable chooser retains disconnected source records without importing the
private source-activation payload or claiming CEC wake support.

## Native Art Mode notes

The local-photo rotation belongs to Samsung's Art app, rather than CleanFrame.
Selecting an individual photo can cancel rotation. After a photo-selection or
upload check, reapply the intended category, interval, and shuffle choice, then
read them back. The reported device used a 15-minute shuffled local-photo set.

The native slideshow and a foreground web gallery are different modes. Weather
drawn by the web launcher is not an always-visible overlay on native Art Mode.
These observations do not require sharing the owner's photographs or Art tokens.

## Sharing a report

Share the model, firmware, source revision, tests, and unresolved device results.
Keep account tokens, DUIDs, local addresses, signed packages, private fonts,
original recovery snapshots, and photographs without redistribution rights out
of issues and pull requests. No proprietary firmware binaries or decompiled Art
app code are part of this contribution.
