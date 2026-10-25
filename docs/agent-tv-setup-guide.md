# Samsung The Frame Agent Setup Guide

Prepared 20 October 2026. This covers developer access, signing and installing your own launcher, then an optional native Home/startup experiment.

**This is a record of an experiment on my own TV. It is not a recommendation to modify yours. Proceed at your own risk.** Developer access and, especially, the undocumented Home/startup changes can cause faults, interrupt viewing, or leave normal Home/startup behaviour unusable. Firmware updates can break the method and its recovery tools. Recovery may need further technical work, a reset or support. A saved rollback does not guarantee recovery. I can't promise this will work on your TV, even if it looks identical to mine.

You need **your own Samsung account, your own signing certificates and your own application identity**. You can build a simple launcher with your agent or use source you have permission to adapt.

Installing an app and assigning the system Home launcher are separate jobs. You can stop after installation and open your launcher manually.

## What worked on the reference TV

| Item | Recorded result from 19 October 2026 |
| --- | --- |
| Model | Samsung 55-inch The Frame, **QA55LS03DAWXXY**, LS03D |
| Firmware | **T-PTMDUABC-0090-2130.0** |
| Developer capability | **Tizen 9.0, ARMv7, 32-bit** |
| Signed launcher | Installed and opened; Netflix and YouTube launched with the normal remote |
| Native Home routing | Pressing the physical Home button from Netflix returned to the custom launcher |
| Startup | Native settings named the launcher. Normal power-on after Netflix was only tentatively reported and still needs a definite physical check |
| Samsung Home escape and Art Mode | The corrected escape target and native Art Mode behaviour still need physical confirmation |

These are results on one TV. Matching the model alone does not establish compatibility. Your agent must check your firmware and capabilities before attempting native Home changes.

## What you need

- The TV, its normal remote and someone who can watch the screen during testing.
- A computer on the same trusted local network, with an OS and CPU supported by the Samsung development tools.
- **A Samsung account** for Samsung's developer certificate workflow, plus internet access to obtain tools and certificates. Complete sign-in yourself.
- Official Samsung TV SDK tools, including SDB and the Samsung Certificate Extension, plus launcher source that your agent can build and sign.
- A secure local place for your signing keys, device configuration and recovery files, and a time when interrupted viewing is acceptable.

SDB is Samsung's developer connection tool. Your agent should check the current SDK requirements and install any language runtimes needed by your chosen app or helper.

### Values your agent must supply

The labels below are placeholders, not values to paste into the TV or SDK. Ask your agent to replace them with your actual configuration before producing commands.

| Placeholder | Meaning |
| --- | --- |
| `<PC_IP>` and `<TV_IP>` | Your computer's and TV's local addresses, respectively |
| `<TV_DUID>` | Your TV's unique device identifier, used privately for its distributor certificate |
| `<PACKAGE_ID>` and `<APP_ID>` | Your launcher's SDK-generated package and application identities |
| `<SIGNING_PROFILE>` | Your own local certificate profile name |
| `<SIGNED_WIDGET>` | The path to your signed `.wgt` installation package |

The package ID, application ID and signing profile are different values. Let the official SDK create a valid app identity. Give the launcher your own display name and keep its identity and author certificate stable for updates. The native Home helper must target **that same application ID**.

### How you and your agent collect information

The agent should retrieve information directly from your computer, project files or connected TV when it has suitable access. For details visible only on the TV, it should give you the menu path and offer a choice: **send a photo of the relevant screen or type the requested text**. You can also keep a photo locally and let the agent read that file if your tools support it.

The agent should extract the requested fields, repeat them for you to check and flag unclear characters. It must ask for a clearer photo or exact transcription when a value is ambiguous. Crop or cover serial numbers, account details and other fields that aren't needed.

| Information | First route | Alternative |
| --- | --- | --- |
| Model and full firmware string | Photo or typed text from About This TV | Confirm through available device information after connection |
| TV local IP | Photo or typed text from Network Status or IP Settings | An identified entry in your router's device list |
| Computer local IP | Agent checks the active network interface and route to the TV | You read it from the computer's network settings |
| TV DUID | Select the connected TV in Samsung's certificate tools | Read Unique Device ID in the TV's support menu and enter it locally |
| Installed apps and launch IDs | Agent reads the connected TV's application list | A photo or typed list of app names helps choose shortcuts; retrieve the actual IDs after connection |

Keep certificates, passwords, account tokens and recovery files in private local storage. Complete account passwords and verification codes yourself in Samsung's sign-in window. The agent should record the certificate/profile paths and completion status without collecting your login secrets.

### Keep a local setup record

The agent should maintain one private setup record with each value, where it came from and whether it has been verified. Generated values such as the app ID and signing profile belong in this record too. Before producing an install or native Home command, it must resolve every placeholder against that record.

## First prompt for your agent

Copy this prompt, then use the stage prompts one at a time:

> Help me set up my own custom launcher on Samsung The Frame using this walkthrough. Use current Samsung developer documentation for the SDK, Developer Mode, certificates and packaging. I need my own Samsung account, signing certificates, SDK-generated package/application IDs and signing profile. Do not reuse the reference owner's app identity, credentials or device configuration. Retrieve setup details directly where possible. For TV screens, give me the menu path and let me send a photo or type the requested text. Confirm ambiguous values with me. Generate the project identity, create the signing profile and verify both in the resulting files. Discover my installed apps and ask which shortcuts I want. Treat native Home/startup changes as a separate unsupported experiment. Keep a short record of confirmed results and open checks. Prepare each stage before running it and announce any launch or restart. Confirm visible results with me. Stop before native Home/startup writes until I explicitly authorise them. Do not factory-reset, downgrade firmware, obtain root, change security policy or install a resident helper as part of this walkthrough.

## Stage 1 Record the TV and network details

**On the TV:** open **Settings → Support → About This TV**. Send your agent a cropped photo showing the model and software version, or type both exactly as displayed. Menu wording can vary. Find the TV's local IP address under Network Status or IP Settings and supply that in the same way.

**On the computer:** have the agent inspect the active network interface and identify the local address used to reach the TV. If it lacks local tools, it should guide you to the computer's network settings and ask for a photo, screenshot or typed address. A VPN address or another adapter's address may be wrong.

| Where the address goes | Use |
| --- | --- |
| TV Developer Mode popup, Host PC IP | **Computer's local IP**, `<PC_IP>` |
| Computer's SDB connection | **TV's local IP**, `<TV_IP>` |

Keep the setup record private and leave actual addresses and device identifiers out of shared copies of this guide. If DHCP changes an address later, update the relevant configuration.

**Agent prompt**

> Show me where to find the TV model, complete firmware string and TV IP. Let me send a cropped settings photo or type those fields. Read my computer's active local address yourself if you can; otherwise guide me to its network settings. Repeat the values for checking and resolve unclear characters. Explain which address goes where, save a private setup record and check local connectivity. Flag differences from the reference TV before proceeding.

**Done when:** the model, firmware and both addresses are recorded without ambiguity.

## Stage 2 Enable Developer Mode on the TV

1. Open **Home → Apps → App Settings**.
2. Open the remote's number pad with its **123** button. On some remotes this shares a button with other controls; cycle to the numeric pad.
3. Select **1, 2, 3, 4, 5** in order. Select Done if shown. The Developer Mode popup should appear.
4. Set **Developer Mode → On**. Enter the **computer's local IP** as Host PC IP, then save.
5. Restart as instructed by the TV. Reopen Apps and check for the Developer Mode indication.

**The easy-to-miss step:** App Settings does not provide a text field or automatically open a keyboard. Use the remote's number pad. If you cannot find the keypad, send a photo of the remote. If the popup or menu differs, send a screen photo or type the visible labels so the agent can guide the next action.

This follows [Samsung's developer connection procedure](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html). Developer Mode is separate from the service menu; no service-menu changes are part of this process.

**Agent prompt**

> Walk me through Apps → App Settings, opening the remote's numeric pad and entering 12345. If my screen or remote differs, work from a photo or my description. Help me enter the verified computer IP. Ask me to confirm the popup values and complete the TV's restart instruction, then verify the developer connection.

**Done when:** Developer Mode is visibly enabled and the correct computer address is saved.

## Stage 3 Establish the developer connection

Install the official tools using [Samsung's TV SDK setup](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html). Include the TV Extension and Samsung Certificate Extension. Your agent must check compatibility with your computer and record the actual SDK/SDB locations.

Use Device Manager or SDB to connect to **your TV's address on port 26101**. Have your agent prepare the exact commands for the installed tools. Confirm both a connection and real capability information, including Tizen version and CPU architecture. Read the installed-app list for the later shortcut setup.

**If the connection is refused:** check both addresses and network isolation first. A responding TV information endpoint on port 8001 does not establish an SDB connection. On the reference Frame, the prompted restart was insufficient: developer access worked after switching off at the wall, waiting ten seconds and restoring power. Arrange this with the owner; never interrupt an update. A short Power press may enter Art Mode rather than restart the TV. Samsung also describes unplugging and reconnecting in its [developer debugging instructions](https://developer.samsung.com/smarttv/develop/extension-libraries/smart-view-sdk/receiver-apps/debugging.html).

Keep developer access on the trusted LAN. Do not add router port forwarding to solve a connection failure.

**Agent prompt**

> Set up the official Samsung tools for my computer and prepare the exact connection commands. I authorise a developer connection and capability/app-list checks on my TV. Record the actual Tizen version and architecture. If it fails, diagnose the addresses, network and restart state first. Don't launch an app or change Home/startup yet.

**Done when:** the developer connection returns capabilities and the installed-app list. A port check alone is insufficient.

## Stage 4 Create your own signing certificates

### Account and certificate profile

1. Open Samsung's developer sign-in. Use your Samsung account, or create one through the sign-up flow. Complete verification and any required developer terms yourself.
2. In Tizen Studio, open **Tools → Certificate Manager → + → Samsung → TV**. Choose a profile name for `<SIGNING_PROFILE>`.
3. Create an author certificate, enter your author details, complete Samsung sign-in and choose a secure certificate backup location.
4. Create a distributor certificate with the required privilege level. Add **your TV's DUID** using the connected-device selector or manual entry.
5. Finish the wizard and confirm the profile contains both certificates. Keep the author certificate for updates.

These are [Samsung's Certificate Manager steps](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html). The author certificate signs your app as its author; the distributor certificate includes the target TV's DUID.

If using Samsung's VS Code extension, its [certificate workflow](https://developer.samsung.com/smarttv/develop/tools/additional-tools/vscode/creating-certificates.html) starts at **Actions → Create Certificate**. Supply a profile name and author details, select the distributor settings and target DUID, then complete Samsung sign-in. The agent should choose the workflow supported by the installed tools.

### Obtain and check the DUID

Prefer selecting the connected TV in the certificate tools. For manual entry, Samsung lists **Menu → Support → Contact Samsung → Unique Device ID**; menu wording may differ. The agent can guide you from a photo of the menu labels or typed text. Enter the identifier locally and check every character. A serial number or model code is a different value.

### Verify the profile works

The agent should inspect the saved profile, record its name and file paths in the private setup record, and check that the selected distributor certificate covers the intended TV. It should configure the packager to use this profile explicitly, then sign the launcher in Stage 5. A completed sign-in window alone does not establish that usable certificates were saved.

Keep certificate passwords in private local storage. The agent can prepare directories, launch the tools, configure paths and inspect results with its available tools; you handle account sign-in, verification codes and any password entry that requires your input. If the agent cannot operate a wizard, it should give one screen's instructions at a time and use a screenshot or your typed description to continue.

**Agent prompt**

> Check which official Samsung certificate tools are installed. Help me sign in or create my Samsung account, then walk through the supported certificate wizard. Create my own profile, author certificate and distributor certificate for my TV. Obtain the DUID from the connected-device selector where possible; otherwise guide me to Unique Device ID and help me enter it locally. Use photos or typed screen labels when needed. Let me enter passwords and verification codes myself. Inspect the saved profile, configure the packager with its actual paths and help me back up the author certificate. Confirm success from saved files and a signed package.

**Done when:** both certificates are saved, the target DUID is checked, the profile is configured and the author certificate is backed up. Successful packaging is checked in the next stage.

## Stage 5 Prepare and install your own launcher

### Create the app and its identity

The application ID is created in the project. The agent should generate and read it, rather than ask you to find it in the TV's settings.

1. Ask you to choose the launcher's display name and confirm a local project location.
2. Use the official project wizard, **File → New → Tizen Project**, to create a TV Web Application from a Basic or Empty template. Select a platform supported by the installed TV Extension and target TV. An agent using the CLI should inspect its installed template/profile options and generate the equivalent project.
3. Read the generated `config.xml`. Record the `package` and `id` attributes from `<tizen:application>` as `<PACKAGE_ID>` and `<APP_ID>`, and set the display name in `<name>`.
4. Configure the app's required features and privileges for its actual functions. Check that every installer, self-filter and native helper uses the recorded identity.
5. Validate the manifest and build the app. Check the packaged manifest again before installation so the generated widget and planned launch commands agree.

Samsung documents the [project wizard and configuration file](https://developer.samsung.com/smarttv/develop/getting-started/creating-tv-applications.html). The agent can inspect project files directly; if only the editor is accessible, it can guide you to open `config.xml` and use its text or a screenshot.

For existing source, have the agent inspect its manifest first and create a consistent identity for your independent app. If an installed launcher already owns native Home routing, restore that routing before changing its identity.

### Use the apps installed on your TV

Your agent must read **your installed-app list**, present the app names for you to choose from, and map those choices to the actual launch IDs. If the connection is not ready, a photo of your Apps screen or a typed list can establish your preferences; the agent must retrieve and verify the IDs after connection. Don't assume Netflix, YouTube or any other service is installed, and don't install extra services to match the reference setup.

| Area | Required behaviour |
| --- | --- |
| Home shortcuts | Include your chosen installed apps and use their actual launch IDs |
| Missing apps | Omit or clearly mark unavailable shortcuts; don't fabricate a successful launch |
| App chooser | If included, discover installed consumer apps and check filtering on your TV |
| Updates | Preserve your choices and order; check again if installed apps or launch IDs change |

If adapting an app with a fixed catalogue, the agent must adjust it. A remove/reorder editor does not automatically support adding arbitrary apps. Check icons and navigation for the chosen set.

### Package and install

Have the agent validate the app locally, build a `.wgt`, and sign it using **Samsung's official SDK packager and your own signing profile**. Record the resulting `<SIGNED_WIDGET>` path. The agent should produce the exact build and signing commands using the verified local SDK, project and profile paths.

Use the [SDK's installation workflow](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/command-line-interface.html) for the connected TV. Its documented prerequisites include **Permit to install applications** in Device Manager for the selected target. Have the agent perform or guide that step with your signing profile ready.

The agent should resolve the target from the connected-device list and use the signed widget's actual filename and directory. For TV launch commands, the SDK requires the **application ID**, even where an option is named `pkgid`. Confirm the installed ID, launch the app and watch the screen. Report what appears, or send a photo if the result is unclear.

**Two failures to avoid:** the reference TV rejected a hand-built XML signature; official SDK packaging worked. Also, `sdb install` only uploaded the widget on that TV. The working installer separately invoked Samsung's `vd_appinstall`, checked for `install completed`, then confirmed the app in the installed list. If the normal SDK workflow stalls at transfer, have the agent inspect the result and prepare the correct install command for **your app ID and uploaded file**. A file-transfer message is insufficient.

**Agent prompt**

> Ask for my launcher name and project location. Generate a TV web project with the official tools, inspect config.xml and record its real package/application IDs. Read my installed apps and show me the names so I can choose shortcuts; use a photo or typed list for preferences if needed, then verify launch IDs through the TV. Configure and validate the app, sign it with my saved Samsung profile and inspect the packaged manifest and signatures. Resolve the actual target, widget path and install/launch commands. I authorise installation and launch. Announce the interruption, verify installation and ask what I see on screen. Leave native Home/startup unchanged.

**Done when:** the TV lists your app under the expected identity and you can see it running.

## Stage 6 Prove the basic launcher works

Use the normal remote to navigate and test every configured shortcut. Test at least two apps if available. Check any app chooser against your installed services. Netflix and YouTube were reference tests; use your own services and keep account sign-in inside those apps.

Before native Home changes, verify a usable route back to Samsung's normal interface. The original Home app read from the reference TV was **`com.samsung.tv.csfs`**. An earlier **`com.samsung.tv.coba.newhome`** target did not visibly open Smart Hub. Those are Samsung component IDs, not personal app identities. Verify your TV's original Home assignment and the actual visible destination before relying on a target.

**Agent prompt**

> Help me test remote navigation, every Home shortcut, any app chooser and a visible route to Samsung Home. Use my installed services and actual app IDs. Record each visible result and correct unavailable shortcuts. Treat Home, streaming-app Back and native Art Mode separately. Don't change native routing until the app and recovery access have passed.

**Done when:** the launcher and shortcuts work and access to Samsung Home is verified. You can stop here and open your launcher manually.

## Stage 7 Prepare the optional native Home change

**This is the higher-risk, unsupported part.** A developer app's manifest does not make it the system Home launcher. The reference method used an undocumented package-name command-execution workaround to run a temporary .NET helper as Samsung's SDK user, **UID 901**. It went beyond public web-app APIs. It did not request root or install a resident helper.

The helper assigned the native main Home operation, `http://tizen.org/appcontrol/operation/main`, with `app_operation_set_current_app`. It set the Home app ID through `vconf_set_str` and Home autostart through `vconf_set_int`. Later readback also named the custom launcher in the derived startup and boot-backup fields. Setting values alone did not establish normal power-on behaviour.

The [published S90D native Home work](https://github.com/splitcipher/couchroot/blob/83906b468836869933012da03a4018fb339462b3/docs/devices/s90d/README.md) explains the underlying method on a different model. It is a technical reference, not a universal installer. Review its native Home implementation with your own app IDs, addresses and saved originals before preparing any command.

Your agent must review or adapt a native helper implementation for your exact firmware and `<APP_ID>`, then prepare concrete query, apply and restore commands. Replacing an app name in a command is insufficient.

### A TV where the method is unavailable

A contributor checked a 2018 Samsung UE43NU7099 (Tizen 4.0, ARMv7, platform build `TIZEN-4.0-TRUNK2018-KantSU-HOTFIX-RELEASE_20260402.1`) on 25 October 2026, read-only. Its developer capability reported `sdbd_rootperm`, `rootonoff_support`, `intershell_support` and `appcmd_support` as disabled. SDB ran only `0 applist`, `0 debug` and `0 kill`; every other shell command, including `id` and `vconftool get`, returned `closed`. With no way to stage or run a helper, the method stops at the first recovery step on that TV. No native setting was read or written there. A signed web launcher still installed and ran normally.

Check `sdb capability` and a harmless shell command such as `sdb shell id` before preparing a helper for an older TV.

### Prepare recovery before any native write

1. Verify the exact model, firmware, architecture, SDK identity, native libraries and runtime. The reference helper used the TV's .NET 6 runtime on 32-bit ARM. Confirm your installed launcher is eligible for boot. Stop if compatibility differs; don't disable guards to force it through.
2. Prepare a bounded helper targeting **your application ID and package**, with firmware/model checks, readback and exact-value restore. Review its source and transport before running it. A read-only query may still upload temporary files and needs device-operation permission.
3. Capture **your TV's** original native Home operation and the typed settings below before applying anything. Save a private original snapshot once. Never substitute another owner's values or overwrite it with the applied state.
4. Back up the snapshot, helper/source revision, compiled outputs and exact recovery instructions outside the working project. Ensure restore can reconnect and re-stage its files after temporary device files disappear.
5. Show the owner the resolved target ID, proposed changes, query/apply/restore commands and risks. Obtain explicit authorisation before native settings are changed.

The baseline must include the native Home assignment plus:

| Setting | Type |
| --- | --- |
| `db/appfw/home_appid` | String |
| `db/appfw/startup_appid` | String |
| `db/appfw/booting_appid_backup` | String |
| `db/first_screen/type` | String |
| `db/menu/smart_hub/ontvsetting/auto_start` | Integer |

Use native value setters rather than direct database edits. Preserve permissions and unrelated settings. Keep the original snapshot and diagnostics private.

**Agent prompt**

> Review whether the reference native Home method is compatible with my exact TV and firmware. Prepare or adapt a bounded helper for my own application ID, with compatibility guards, readback and exact-value rollback. I authorise the reviewed compatibility queries and temporary staging, but no Home/startup writes. Capture my original typed values and prepare a complete recovery folder and exact commands. Show me the implementation, proposed changes and risks before asking for apply approval. If the method needs root, security-policy changes or bypassing compatibility checks, stop this walkthrough.

**Done when:** compatibility is established, your own originals and recovery tools are preserved, and concrete commands are ready for review. Native apply remains pending.

## Stage 8 Apply and verify native Home routing

Proceed only after the owner explicitly accepts the risks and authorises the prepared implementation. Run the reviewed **apply**, then **query** commands for your setup. Confirm that the native assignment points to your exact `<APP_ID>` and that the intended setting values read back correctly.

An incomplete transport or error is not evidence that nothing changed. An automatic rollback attempt can also fail. Inspect current values after an uncertain result; don't apply repeatedly.

Exercise **restore**, query the values and check the physical Home destination before keeping the experiment. Reapply only after exact-value rollback passes and the owner wants to retain the change. Apply, restore and reapply passed on the reference firmware; you must establish this on yours.

**Avoid the startup-setting trap:** “Start with Smart Hub Home” off and “Autorun Last App” on proved last-app resume only. It did not establish a fixed launcher after another app was used. With the later native Home assignment, **Home autostart was intentionally enabled**. Don't blindly repeat the earlier toggle instructions after native routing. Samsung's [start-screen guide](https://www.samsung.com/sg/support/tv-audio-video/enable-or-disable-the-start-screen-option-on-your-2025-samsung-smart-tv/) describes ordinary startup options, not this reassignment.

### Physical checks before calling it complete

| Check | Required observation |
| --- | --- |
| Home from your first chosen app | Physical Home opens your launcher |
| Home from another installed app | Physical Home opens your launcher |
| Samsung Home escape | Explicit Samsung Home action visibly opens Smart Hub; Home returns to your launcher |
| Power after streaming | Use your normal Power routine after streaming, wait, then wake the TV; record the screen that actually appears |
| Art Mode and full restart | Check your usual Art Mode/wake routine and a separately agreed full restart; record them separately from standby |

Netflix kept Back inside its own app in the reference test. Repeated Back is not a universal exit command. A wallpaper inside your launcher also does not establish native Art Mode behaviour.

**Agent prompt**

> I accept the stated risks and authorise the reviewed native Home change for my app ID, its rollback test and reapply if rollback passes. Announce each interruption. Apply once and read back settings. Restore and verify the exact original values and physical Home destination. Reapply only after that succeeds. Walk me through the physical checks. Record passes, failures and unknowns separately. Don't claim power-on or Art Mode success from settings alone. If anything becomes uncertain, stop, inspect current state and use the prepared recovery route.

**Done when:** apply and rollback work on your TV and the physical behaviours you need are confirmed. Leave untested behaviours marked untested.

## Recovery and future updates

**Restore original Home/startup values before uninstalling your launcher or changing its app identity.** Run your prepared restore command, query the result and confirm Samsung Home physically. Removing the app first can leave Home pointing to a missing application.

Keep your author certificate for in-place app updates. Preserve recovery files for as long as native routing is active. A source backup alone cannot restore the setup.

Firmware updates require a new compatibility check. A guarded helper may refuse to run after an update, including when asked to restore. Review recovery before a planned firmware change. Samsung's standard development guidance calls for current firmware; that does not establish compatibility with this experiment or justify a downgrade.

If recovery fails, stop further writes and preserve the outputs for diagnosis. A factory reset is not an automatic troubleshooting step in this walkthrough.
