# JumpYard Personal Android APK — #345

The Android app opens `https://staff-checkin.jumpyard.se/` in an Android System WebView, using the existing staff PIN, queue, scanner, entrance/café flow and server API. It has no duplicate frontend, native JavaScript bridge, Roller integration or additional cloud service. Normal protected web releases update the UI used by installed APKs. Connectivity and a maintained Android System WebView are required; this is not an offline handout app.

Love approved this extension on September 9, 2026. Kiosk locking is explicitly delegated to his colleague using AirDroid and is **outside this implementation and the issue's closure gates**. No device owner, enrollment, factory reset or device policy has been configured.

## Package and operation

| Property | Pilot release |
|---|---|
| App label | JumpYard Personal |
| Package / launcher | `se.jumpyard.staff` / `se.jumpyard.staff.MainActivity` |
| Version | `1.0.0` / versionCode `1` |
| Android | 9 / API 28 or newer; compile/target SDK 36 |
| Runtime permissions | Internet and camera only; camera requested when scanning |
| APK SHA-256 | `b28c9b4c3960fdda02d2c3e53eb6576884ea23ab7e062102196f6c7c55b15ead` |
| Signing certificate SHA-256 | `0a639c821c8f667a092b964426120ad3cfdeb1de5c5ec49abfbffddcb50d25d1` |
| Size | 34,480 bytes; UI/assets load from the staff origin |

Only the staff root is navigable. Admin/Cognito belongs in the browser. External URLs, arbitrary startup intents, cleartext traffic, file/content access, microphone and third-party camera requests are blocked. TLS errors are cancelled. Runtime camera grants are restricted to `VIDEO_CAPTURE` and the trusted staff origin. Backup/device transfer is disabled, remote debugging is disabled in release, and credentials are never stored by native code. Web PIN session expiry/logout behavior remains unchanged. A process restart or APK update requires signing in again; Android does not persist the session into an Activity bundle.

System/keyboard insets keep controls above Android navigation and the keyboard. The app pauses/hides its WebView in the background and resumes it on return. A failed top-level load or renderer termination shows a short retry screen. Retry loads the staff root; it does not replay a collection POST. Existing server receipts/recovery remain authoritative after uncertain saves. The manifest cooperates with managed lock-task allowlisting; the app does not enroll or lock the device itself.

## Build and verify

Java 17, Android SDK platform 36/build-tools 36.0.0, Android Gradle Plugin 8.12.2 and Gradle 8.13. The Gradle distribution SHA-256 is pinned in the wrapper. Android/JDK are build dependencies; there are no third-party app runtime dependencies. JUnit 4.13.2 is test-only. CI lints both variants, tests the origin/camera policy and builds an unsigned release; CI has no signing key and publishes no installable production APK.

From this directory, with `JAVA_HOME` and `ANDROID_HOME` set:

```powershell
./gradlew.bat lintDebug lintRelease testDebugUnitTest testReleaseUnitTest assembleRelease --console=plain
```

On Linux/macOS use `bash gradlew`. `assembleRelease` is unsigned unless all four signing environment variables are supplied. Never distribute the unsigned output or the `.test` debug package as the pilot app.

For signing, set `JY_ANDROID_KEYSTORE`, `JY_ANDROID_STORE_PASSWORD`, `JY_ANDROID_KEY_ALIAS`, `JY_ANDROID_KEY_PASSWORD`, then run `assemblePilot`. That task fails when signing material is absent. Never put passwords in command arguments, Gradle properties, logs, Git or APK artifacts.

On Love's Windows machine, `build-pilot.ps1` loads the pilot PKCS12 keystore and DPAPI-encrypted PSCredential from `%USERPROFILE%/.codex/signing/jumpyard-staff/`, exposes the passwords only to the child build environment, and restores the previous environment afterwards. Directory access is restricted to the Windows user and SYSTEM. The credential uses alias `jumpyard-staff-pilot`; `pilot-signing.p12` and `pilot-credential.xml` must not be committed. Run:

```powershell
./build-pilot.ps1
& "$env:ANDROID_HOME/build-tools/36.0.0/apksigner.bat" verify --verbose --print-certs app/build/outputs/apk/release/app-release.apk
Get-FileHash -Algorithm SHA256 app/build/outputs/apk/release/app-release.apk
```

The initial RSA-4096 signing key was generated locally for this pilot. **A team-controlled encrypted backup is still needed** before wider device distribution. DPAPI credentials only decrypt for the originating Windows user/machine; simply copying the XML is not a portable backup. Transfer/escrow the signing material through the team's approved secure credential process, never through the issue or a PR. Future updates must keep this package and certificate and increase versionCode. Losing/replacing the key prevents in-place updates; uninstalling also removes the device's app state.

## Install and hand to the AirDroid owner

```powershell
& "$env:ANDROID_HOME/platform-tools/adb.exe" devices -l
& "$env:ANDROID_HOME/platform-tools/adb.exe" -s <serial> install -r app/build/outputs/apk/release/app-release.apk
& "$env:ANDROID_HOME/platform-tools/adb.exe" -s <serial> shell am start -n se.jumpyard.staff/se.jumpyard.staff.MainActivity
```

Use the exact signed APK and verify its SHA-256/certificate. Updates can use `install -r` or the colleague's AirDroid distribution process. Do not clear app data or uninstall to work around a signing mismatch. Give the colleague the package/launcher above, APK and signing fingerprint. AirDroid configuration, automatic launch and locking are their responsibility. Leave Android System WebView enabled and maintained. No Play Store account, MDM purchase or AWS change was made for this APK.

## Device validation — September 9, 2026

Motorola Moto G55 5G, Android 15 / API 35, Android System WebView 152.0.7977.86; portrait viewport 432 CSS px. Test package `se.jumpyard.staff.test` uses a separate sandbox and an isolated USB-local Next.js app/API/PostgreSQL fixture. No real customer writes, payment or Roller calls were made by automation.

- Both release/debug lint and policy tests pass (three tests per variant covering origin, URL, camera and debug/release boundaries). Signed release verifies with APK signature v2 and contains only internet/camera permissions; no native ABI dependency.
- Native installation and staff PIN screen render. Synthetic Noah PIN works, `0005` finds `APK Testgäst`, and list/detail show one entrance. No horizontal overflow.
- Actual hardware camera permission denial produces a recoverable error; granting camera starts the existing QR reader with a live 480×640 video stream. Microphone capture returns `NotAllowedError`. Returning from Home preserves the staff session and restores the visible camera view. This proves camera startup/resume, not optical decoding of a real ticket.
- Café collects one of two coffees before admission. SQL confirms a completed café receipt with quantity 1 and `needs_admission=false`; session remains `ready_for_staff`. Entrance Select all collects exactly four entrance goods and changes the session to `redeemed`; the other coffee and both pizzas remain in café. Completion shows Noah and the time. All data is synthetic/local.
- Staff switching returns to PIN. Removing the app's USB-local connection and reloading shows the native retry screen; restoring it and retrying recovers to PIN. The phone's own Wi-Fi and live service were not altered.
- Signed `se.jumpyard.staff` installed separately and opened against the real HTTPS staff origin. An in-place `adb install -r` preserved the first-install timestamp and advanced the update timestamp. The APK pulled back from the phone matched the delivered SHA-256 above. This update check was at the PIN screen; it does not prove signed-in process restart behavior. Kiosk locking was excluded by explicit request.

Love accepted the installed app on September 9: **“Jag testade och jag är nöjd.”** This records general owner acceptance, without attributing individual optical ticket-QR or two-phone scenarios that were not separately reported. [PR #401](https://github.com/wrlds-creations/jumpyard-check-in/pull/401) merged as `822384309ece85fc95f0e5e951e048c6eca39601` after source review and all six [CI jobs](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34334993759) passed at head `66f1f007b3a134897db3770de9d707a8c5e2aa93`. Full local repository validation, Android lint, both policy test variants and the signed build had also passed. Review was by the implementation agent; no independent human code review is claimed.

The tested v1.0.0 APK is retained unchanged; the merge does not require rebuilding or reinstalling it. Signing-key escrow before wider distribution is recorded as the separate Project draft **Escrow staff Android signing key before wider device rollout**.

Test build only, when reproducing local QA:

```powershell
./gradlew.bat assembleDebug '-PdebugStartUrl=http://127.0.0.1:3002/'
adb -s <serial> reverse tcp:3002 tcp:3002
adb -s <serial> reverse tcp:4005 tcp:4005
```

Release ignores this property and always targets the public HTTPS staff root. Only the debug manifest allows loopback cleartext; no local API, fixture, PIN or database ships in the release. APK delivery and native screenshots are in Love's local `gh345-android-20260909` artifact folder. Source changes are isolated from #396 and #389. Main merges automatically build Park release artifacts but deploy nothing. No new web/cloud deployment, rollback or re-promotion was needed for the APK or acceptance closeout; the live web artifact remains `971d901` (release `34327287544`, Park `34327943053`, public `34328439965`).
