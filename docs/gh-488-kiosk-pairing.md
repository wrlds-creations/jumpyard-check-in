# GH-488 Kiosk Pairing (D0243)

Issue [#488](https://github.com/wrlds-creations/jumpyard-check-in/issues/488) with kiosk issue [wrlds-creations/jumpyard-check-in-kiosk#171](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/171). It extends the #327/#86 installation binding (D0220, [docs](gh-327-kiosk-terminal-binding.md)).

## Model

- **Kiosk names are server-owned.** Each name belongs to one venue, has a kind (`operational` or `test`) and binds exactly one terminal alias: Nacka K1–K5 use Nacka T1–T5 (five Verifone P630), Test K1 uses Test T1 (the office P400). The V210 is the spare Test T2 with no kiosk.
- **A kiosk installation claims a name.** The installation proves itself with its opaque id and capability, as in #327. The claim needs a personal staff PIN of someone on the pairing allowlist (initially Love and Gustav). The pairing is stored in `jumpyard.kiosk_installations`; the partial unique index keeps one active installation per venue and name.
- **Payments follow the name.** Drafts and add-products resolve installation → active pairing → kiosk name → terminal alias → provider terminal. A profile sent by the device is ignored once the kiosk is paired. The D0220 installation and terminal claims are unchanged.
- **Legacy profiles keep working until pairing.** An unpaired installation that still sends an authorized `kioskProfileId` keeps its #327 terminal. An unpaired installation without a profile is refused with `409 kiosk_installation_not_paired` before any ROLLER call.

## Routes

- `POST /v1/kiosk/status` returns the installation's own pairing (`paired`, `name`, `kind`, `terminalName`) or `{ paired: false, legacy }`, plus the venue's offered names with `taken`/`mine`. Only a paired installation writes last-seen data. No ROLLER call; it stays available during an emergency stop.
- `POST /v1/staff/kiosk-pairing` checks the PIN in the Session Lambda (shared login limiter, no staff session, D0160 preserved) and forwards only the pseudonymous staff identity id to the Booking Lambda.
- The Booking Lambda requires the allowlist, an offered name and no unresolved claim on this kiosk, the replaced kiosk or the terminal. It then revokes a replaced holder, upserts the pairing and writes one `kiosk.installation_paired` audit event.
- Error codes and shapes: [JUMPYARD_CLOUD_CONTRACT.md](../JUMPYARD_CLOUD_CONTRACT.md#post-v1kioskstatus).

## Provider Secret Shape

The existing `/jumpyard-check-in-park-test/roller/credentials` secret carries the configuration. The values below are placeholders; real terminal ids, lock ids and staff identity ids are never committed or printed.

```json
{
  "kioskNames": {
    "nacka-k1": { "active": true, "displayName": "Nacka K1", "kind": "operational", "paymentTerminalAlias": "nacka-t1", "venueId": "50871" },
    "test-k1": { "active": true, "displayName": "Test K1", "kind": "test", "paymentTerminalAlias": "primary", "venueId": "50871" }
  },
  "paymentTerminals": {
    "nacka-t1": { "terminalId": "<P630 terminal id from ROLLER case 00249007>", "lockId": "kt_<32 hex>", "displayName": "Nacka T1" },
    "primary": { "terminalId": "<existing>", "deviceId": "<existing>", "lockId": "<existing>", "displayName": "Test T1" }
  },
  "kioskPairingStaffIdentityIds": ["<staff identity id>"]
}
```

- `kioskNames` ids match `^[a-z0-9][a-z0-9-]{1,31}$`. A name is offered only while it is active, belongs to Nacka `50871`, and its alias resolves to a mapping with a valid, unshared lock.
- `displayName` is only a label. It is kept in a separate map and never reaches ROLLER.
- Each physical terminal has exactly one `lockId`. Two aliases that point at one terminal must share it (D0220).
- Adding a person or a terminal is a version-guarded secret edit. It takes effect within the five-minute provider cache.

## Monday Setup (2026-10-12)

Developer, before the install (after the protected Park release):
1. Read the five P630 terminal ids from ROLLER's reply in case 00249007. Match them to tapes 1–5 by serial.
2. Read Love's and Gustav's staff identity ids with a read-only query. Each needs an active personal PIN; create one in Personaladmin if missing.
3. Make one version-guarded edit of the provider secret. Add `kioskNames`, the five `nacka-t*` aliases with new lock ids and labels, labels on the existing P400/V210 mappings, and `kioskPairingStaffIdentityIds`. Preserve every other field. Print only key names and counts.

On site, per kiosk (see the kiosk checklist "Ny kiosk"):
1. Install the APK and finish Chrome's first run.
2. Connect the kiosk and its terminal to the park network. The terminal shows JumpYard Nacka Forum.
3. Hold the logo 4 s, pick the label's name, enter the PIN.
4. Start a purchase until the amount shows on the terminal next to the kiosk, then press the red X.

## Verification And Rollback

- Automated: `npm run validate:gh488-kiosk-pairing` (unit, handler and session tests; PostgreSQL case in CI), plus the updated T0193/T0194 route and resource validators.
- Live, after deploy:
  - one status call per kiosk shows its name;
  - one cancelled purchase per kiosk prompts only its own terminal;
  - the office kiosk keeps paying through its legacy profile until it is paired as Test K1.
- Rollback: redeploy the previous release artifact. Migration `0025` is forward-only and inert for older code. Legacy profiles still route the office kiosk, but kiosks paired only through the registry stop selling until this release is back.
