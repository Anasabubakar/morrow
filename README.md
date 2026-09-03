# Morrow

**Transactions, device to device.**

Morrow is a native fintech app (Expo / React Native) built around networkless device-to-device payment negotiation with eventual online settlement through BMONI. A merchant creates a request on the **Receive** tab; Morrow serializes it and broadcasts it as a continuous animated QR stream. On another device, the **Send** tab uses the real camera to scan, reconstruct, and verify the request, then pays it — either online through BMONI or offline through Morrow Reserve — and broadcasts a signed confirmation back. The merchant scans that confirmation to close the loop.

Both devices' balances are real, persisted, and actually move — this is a genuine two-device simulation with real signatures at every step, not a scripted animation. Neither balance is connected to BMONI or any shared backend; see "Morrow Wallet + confirmation loop" in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for exactly what's real and what isn't.

> Morrow does not claim fully offline settlement. Only the request handoff is networkless. The settlement step requires connectivity.

## Requirements

- Node **20+** (this project was built and tested on Node 24 via [nvm](https://github.com/nvm-sh/nvm); a `.nvmrc` is included — run `nvm use`).
- A physical iOS or Android device with the [Expo Go](https://expo.dev/go) app, or a configured simulator/emulator, for camera access. Camera scanning does not work in a browser preview.

## Run locally

```bash
nvm use
npm install
npm start
```

Scan the printed QR with Expo Go (or press `i` / `a` for a simulator/emulator). No real funds move; settlement uses the local BMONI sandbox simulator.

### Live BMONI mode (optional)

By default the app never touches the network for settlement. To wire real BMONI sandbox calls and on-device signing:

```bash
cp .env.example .env   # fill in EXPO_PUBLIC_BMONI_MODE=live
npx expo prebuild
npx expo run:android   # or run:ios
```

This requires a native Expo Dev Client, not Expo Go — BMONI's signing SDK ships native code Expo Go can't load — and one-time manual KYC/funding setup per device. See [docs/BMONI_INTEGRATION.md](docs/BMONI_INTEGRATION.md).

## Verify

```bash
npm test          # protocol + optical fountain logic (vitest)
npx tsc --noEmit   # typecheck
```

`npm test` covers the pure protocol/optical logic layer. UI and camera behavior were verified with a static web export (`npx expo export -p web`) rendered through a headless browser — full camera scanning still requires a physical device.

## Demo script (two devices)

1. On device A, open the **Receive** tab, enter an amount and note, and create the request. The screen begins broadcasting an animated QR.
2. On device B, open the **Send** tab and grant camera access. Point the camera at device A's screen — reconstruction is loss-tolerant and works even if frames are missed or arrive out of order.
3. Review the independently reconstructed request and its integrity status on device B.
4. Confirm. Device B's own balance is really debited (check the **Home** tab before and after). Morrow shows device authentication separately from online BMONI settlement.
5. Device B now broadcasts a signed confirmation. On device A, tap "I've been paid — scan confirmation" and point the camera at device B. Device A's balance is really credited once the signature and amount check out.
6. Both receipts are saved to each device's own **Activity** tab — device B's shown as sent (−), device A's as received (+).

Alternatively, at step 4, if device B has an active **Morrow Reserve** (Home tab → "Add to Reserve"), a second button appears — "Pay from Reserve (offline)." This settles with a real signed authorization and zero network calls, landing on "Payment verified — settlement pending" instead of "Payment settled" — steps 5–6 still happen exactly the same way. See [docs/RESERVE.md](docs/RESERVE.md).

## Project structure

```text
src/app/(tabs)/         Home, Receive, Send, Activity screens (Expo Router)
src/lib/protocol.ts      canonical payment payload, SHA-256 (expo-crypto), expiry
src/lib/optical.ts       optical framing and out-of-order fountain reconstruction
src/lib/replay.ts        local duplicate-request guard (AsyncStorage)
src/lib/bmoni.ts         settlement adapter boundary: local sandbox + real BMONI mode
src/lib/bmoniApi.ts      BMONI sandbox REST client
src/lib/bmoniIdentity.ts device wallet + BMONI user/wallet provisioning
src/lib/bmoniSigner.ts   wraps BMONI's native on-device signing SDK
src/lib/history.ts       local receipt history (AsyncStorage)
src/lib/wallet.ts        real per-device persisted balance (AsyncStorage)
src/lib/confirmation.ts  signed PaymentConfirmation: broadcast back after paying, credits the payee
src/lib/deviceKeys.ts    device Ed25519 keypair (@noble/curves), shared by Reserve and confirmations
src/lib/reserve.ts       Morrow Reserve: offline allowance + signed authorizations
src/vendor/decimen/      extracted Decimen v0.3.0 LT fountain core, MIT
src/components/          Morrow branding (real Figma-sourced symbol/wordmark) and UI primitives
docs/                    architecture, BMONI integration handoff, and Morrow Reserve
```

## Production boundary

The app uses `LocalBmoniSandbox`, an explicitly named simulator, because no sandbox credentials are committed. Real BMONI requests belong behind a server-side proxy so the API key never reaches the client bundle. See [docs/BMONI_INTEGRATION.md](docs/BMONI_INTEGRATION.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Decimen attribution

The optical encoder/decoder is extracted from the MIT-licensed [Decimen Optical Transfer v0.3.0](https://github.com/Pendia/Decimen-Optical-QR-Transfer/tree/v0.3.0), pinned to commit `29cba8fa25dd160c8b6aa18fe3b48fbc5bde2e36`. Morrow wraps that LT fountain core in its own payment protocol and optical frame envelope. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
