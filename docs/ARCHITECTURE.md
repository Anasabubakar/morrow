# Architecture

## Boundaries

```text
Merchant surface (Receive tab)
  → Morrow Protocol (canonical request + SHA-256 + nonce + expiry)
  → Morrow Optical (continuous framed QR transport, rendered with react-native-qrcode-svg)
  → Customer surface (Send tab, real device camera via expo-camera)
  → out-of-order reconstruction + verification
  → device authentication / signature boundary
  → BMONI adapter (online)
  → settlement receipt on both surfaces + local activity history
```

### App surfaces (Expo Router tabs)

- `src/app/(tabs)/index.tsx` — Home: sandbox balance, quick actions, recent activity.
- `src/app/(tabs)/receive.tsx` — create a payment request and broadcast it as an animated fountain-coded QR stream.
- `src/app/(tabs)/send.tsx` — scan the merchant's screen with the real device camera, review, authenticate, settle.
- `src/app/(tabs)/activity.tsx` — full local receipt history.

Testing the optical handoff end-to-end requires two devices (or two Expo Go instances): one showing Receive, one scanning with Send. This is intentional — it is real device-to-device transport, not a single-screen simulation.

### Morrow Protocol (`src/lib/protocol.ts`)

Versioned payment messages contain a request ID, merchant identity, amount in minor units, currency, note, one-time nonce, creation and expiry timestamps, and a SHA-256 checksum computed with `expo-crypto`. The checksum detects accidental or malicious mutation in transit; in production, the request must additionally carry a merchant signature chained to a trusted merchant identity. Serialization uses `js-base64` rather than `btoa`/`atob`, which do not exist in the React Native runtime.

### Morrow Optical (`src/lib/optical.ts`, `src/vendor/decimen/fountain.ts`)

The transport uses Decimen's LT fountain encoder to emit an effectively endless sequence of independently useful blocks. Each Morrow envelope includes the session ID, sequence, source block geometry and an FNV-1a transport checksum. The matching Decimen peeling decoder accepts out-of-order frames, ignores duplicates, rejects cross-session frames, and only releases complete payloads. Final application payload integrity is verified again with SHA-256.

`send.tsx` wires `expo-camera`'s `CameraView` (`barcodeScannerSettings={{ barcodeTypes: ['qr'] }}`) directly into `OpticalReceiver.add()` — every barcode the camera detects is fed straight into the fountain decoder, exactly as a physical device-to-device handoff would work. No frame simulation is used on the scanning path.

### BMONI adapter (`src/lib/bmoni.ts`, `src/lib/bmoniApi.ts`, `src/lib/bmoniIdentity.ts`, `src/lib/bmoniSigner.ts`)

`BmoniAdapter` isolates signing and settlement behind two implementations, chosen by `EXPO_PUBLIC_BMONI_MODE`:

- `LocalBmoniSandbox` (default) — a named, deterministic simulator. Never touches the network or the native module.
- `RealBmoniAdapter` (`EXPO_PUBLIC_BMONI_MODE=live`) — real REST calls to BMONI's sandbox (`bmoniApi.ts`) plus real on-device signing via BMONI's native React Native SDK (`bmoniSigner.ts`, wrapping `@bkey-inc/bmoni_embedded_sdk`). `bmoniIdentity.ts` ensures a device wallet, BMONI user, and smart wallet exist before every call, caching the result in AsyncStorage.

`bmoniSigner.ts` imports a native TurboModule that Expo Go can't load. Every import of it — directly or transitively through `bmoniIdentity.ts` — is a dynamic `import()` inside `RealBmoniAdapter`'s methods, never a static top-level import, so that simply loading `bmoni.ts` (which every screen does) can't crash a non-live build. See [BMONI_INTEGRATION.md](./BMONI_INTEGRATION.md) for the full lifecycle, the one-time manual KYC/funding setup this depends on, and the native build requirements.

### Replay protection (`src/lib/replay.ts`) and history (`src/lib/history.ts`)

Both are backed by `@react-native-async-storage/async-storage` and are async. Request IDs and nonces must additionally be stored atomically on the settlement service with a unique constraint in production; the on-device registry only improves the local demo experience and is not a production security boundary.

## State model (Send flow)

`scan → review → auth → settling → done`

Errors return to the nearest recoverable stage (usually back to `scan`). Authentication and settlement are separate so the product never suggests that local signing alone moved funds.

### Morrow Reserve (`src/lib/reserve.ts`, `src/lib/reserveKeys.ts`)

From `review`, if the request amount fits within an active on-device Reserve allowance, `send.tsx` offers a second path — `payFromReserve()` — that never touches `auth`/`settling`/BMONI at all. It signs an `OfflineAuthorization` with a device-generated Ed25519 keypair (`@noble/curves`, pure JS, no native module), self-verifies it, and lands on `done` with `receipt.status === 'pending'`, rendered as "Payment verified — settlement pending," never "Payment settled." See [RESERVE.md](./RESERVE.md) for what's genuinely cryptographically enforced here versus what still requires online reconciliation.
