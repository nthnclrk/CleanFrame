# Native Home control

For the separate 2020 LS03T report and experimental source templates, see
[the 2020 profile](frame-2020/README.md). It does not change this helper’s runtime
or reference-firmware guard.

This one-shot development helper is scoped to Nathan's Frame and firmware 2130.0. It does not run inside CleanFrame or remain active on the TV. It uses the existing SDB developer connection and the published package-name command workaround to execute as SDK UID 901. It does not request root or change security policy.

`Control.cs` exposes read-only query, guarded apply, and exact-value restore through native Home and vconf APIs. It refuses other firmware, root, changed original values, or an ineligible/missing app. Apply failures attempt immediate restore. The baseline and compiled tools remain in ignored `.local/native-home/`.

From the project root:

```sh
python3 scripts/native-home/run.py query
python3 scripts/native-home/run.py restore
```

The existing private `original.json` is the tested rollback baseline. Do not overwrite it with the applied state. The runner re-stages the helper and baseline each time. The query/apply/restore/inspect shell source is retained beside the runner. It needs the compiled output in `.local/native-home/out/`; build with the private verified Microsoft SDK when the C# source changes. No local address, device identifier, compiled binary or signing secret belongs in this source folder.

Even query/inspect stages temporary helper files on the device. These are device operations, not offline repository checks. A clone without the private baseline, SDK and compiled output cannot perform the tested rollback. Preserve the local recovery folder separately; GitHub is a source backup only.

The implementation was reviewed against the [published S90D native Home work](https://github.com/splitcipher/couchroot/blob/83906b468836869933012da03a4018fb339462b3/docs/devices/s90d/README.md). This Frame's native query, apply/restore/reapply and physical Home-from-Netflix test were checked independently. Source review does not replace device testing after future firmware changes.

Other owners' reports are recorded in [TV compatibility evidence](../../docs/compatibility.md). They do not extend this helper's firmware/runtime guards. The current snapshot validator rejects empty Home and string values; it has no absent-key reset implementation. Restore depends on the same SDB transport as apply, with no independently verified fallback if that transport becomes unavailable.

The reference helper is not Home-only: apply assigns the Home operation, writes the Home app setting and enables autostart. The original snapshot may contain autostart `0` or `1`, but it must still match the TV before apply. A settings change makes an older snapshot stale. Do not use this path for an experiment that excludes startup changes.
