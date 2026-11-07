# Experimental 2023 Frame Home-only profile

This profile prepares owner-configured source for the reported QN32LS03CBFXZA,
ARMv7, Tizen 9, firmware `T-KSU2ECAKUC-0090-2230.0`. It changes the native
main Home operation only. It does not write the saved Home, startup, autostart,
or Art-return settings. The existing reference helper is unchanged.

The owner observed that changing the saved Home app setting also changed a
startup setting on this TV. After a complete original-state restore, setting
only the native Home operation opened CleanFrame from Samsung's Art screen and
survived a power cycle. The first Home press from artwork opened Samsung's Art
screen; the second opened CleanFrame. Art Mode and the three-minute slideshow
continued to work. Home from streaming apps or HDMI, and an operation-only
restore/reapply on the physical TV, have not been checked.

The configurable source and its policy tests were prepared after that device
experiment. They have not been deployed to that TV. Results on other models,
regions, firmware versions, and owner-built packages are unknown. Do not remove
the exact firmware and identity guards to try another device.

## Prepare source offline

Use the package and application IDs of your own installed, signed CleanFrame
build. Keep those details, certificates, and all backup files private.

```sh
mkdir -p .local
cp scripts/native-home/frame-2023/profile.example.json .local/frame-2023.json
# Edit the launcher identity in .local/frame-2023.json.
python3 scripts/native-home/frame-2023/prepare.py --config .local/frame-2023.json
dotnet build .local/frame-2023/home/Home.csproj -c Release -o .local/frame-2023/home/out
```

Preparation refuses to overwrite prior output or follow a private-output
symlink. It does not sign, install, connect to, or change a TV.

## Device use and recovery

This is experimental source, not an unattended installer. The owner must supply
and review an SDK-user command and output transport. Ordinary `sdb shell` may
be disabled, and some TVs do not allow file pull even when staging works.
There is no persistent background service or independently verified recovery
channel. If the developer connection fails after a write, recovery may be
unavailable. A missing or failed response is an unknown outcome, not evidence
that nothing changed.

Before **each** query, capture, apply or restore, run the read-only preflight
against the intended connected TV, using the owner's SDB installation:

```sh
python3 scripts/native-home/frame-2023/preflight.py --host TV_LOCAL_IPV4 --sdb /path/to/sdb --action query
```

Select the actual action instead of `query`. Preflight checks the live model,
developer connection and device identity; for apply it also checks the exact
installed launcher ID. It writes a private, action-specific preflight file under
`.local/frame-2023/`. Stage the freshly generated file on the **same** verified
TV connection as `/home/owner/share/tmp/sdk_tools/cf2023home-preflight.json`.
The helper consumes it for one action, rejects preflights older than two
minutes, and separately checks SDK UID, 32-bit
architecture and exact firmware on the TV. This host check is not cryptographic
proof of the device executing the helper; do not reuse a preflight or substitute
another connection. The host and TV clocks must be sufficiently synchronized;
a stale or future-dated preflight fails closed.

Stage the built helper DLL and runtime configuration in the SDK tools
directory. Invoke `/usr/bin/dotnet` with the staged DLL and the selected action
through the owner's reviewed SDK-user transport. Preserve the complete output
privately. Stop on incomplete or ambiguous output; inspect the current state
before retrying.

1. Run `query` and review the reported Home and non-Home settings.
2. Run `capture` only while the original Home assignment is present. Save the
   exact JSON payload after `CLEANFRAME_2023_BASELINE=` privately on the host,
   without the prefix or output newline, and preserve a separate copy. This
   payload matches the device baseline and allows backup when SDB pull is
   unavailable. Output can contain private original settings and identity data.
   Do not reconstruct a missing baseline or capture an already-applied target.
3. Re-stage the original baseline as
   `/home/owner/share/tmp/sdk_tools/cf2023home-original.json` for `apply` and
   `restore`. The helper checks its model, firmware, target and identity hash.
4. Run `apply`, query independently, and verify the physical Home button. The
   helper rejects a stale baseline or a missing target. It checks for changes
   to the other captured settings; on failure it attempts a guarded restore.
5. To reverse the change, run `restore` with a fresh preflight and the same
   private baseline, then query and check the physical result. If the owner or
   another captured setting has changed unexpectedly, recovery refuses to
   overwrite it and the assignment may remain partially changed.

The helper uses a temporary device lock. A killed helper can leave that lock
behind, blocking another action. Confirm that no helper is still running before
reviewing lock removal or restarting the TV; never clear it during an active
operation. The lock is not a substitute for an independent recovery path.

Never publish the preflight, baseline, device identity, local addresses,
signing material or raw helper output in an issue or pull request.

## Offline checks

```sh
python3 -B scripts/native-home/frame-2023/check.py
python3 -B scripts/native-home/frame-2023/check.py --dotnet /path/to/dotnet
```

The optional .NET checks build the source and exercise the policy against fake
states. They do not execute the native APIs or verify behavior on a TV.
