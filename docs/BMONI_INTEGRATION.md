# BMONI integration handoff

- Sandbox base URL: `https://embedded-dev.bmoni.com`
- Production base URL: `https://embedded.bmoni.com`
- Auth: `x-api-key` header on every request
- BMONI publishes a shared dev-only sandbox key in their own docs at [/api-reference/introduction](https://bkey.mintlify.app/api-reference/introduction) — confirmed live and working as of 2026-09-03 by calling `POST /v1/users` and `PATCH /kyc` with it directly. Deliberately not reproduced here to keep this repo free of any live credential value; get it from that page, or request your own at [/request-test-tokens](https://bkey.mintlify.app/request-test-tokens) or by emailing developers@bkey.me.
- There is no self-serve dashboard for API keys. The only documented path — for a dedicated sandbox key or a production key — is emailing **developers@bkey.me**. Say explicitly if you want production access; the docs don't describe a separate flow for it.

Never place a real production key in an `EXPO_PUBLIC_*` environment variable — those are inlined into the client bundle at build time and readable by anyone with the app. Route production calls through a server-side proxy. The sandbox key above is safe to ship client-side because BMONI publishes it themselves and it's dev-only.

## What's actually confirmed vs. what's still just from the docs

BMONI's docs (https://bkey.mintlify.app) describe the general shape of the API, but several concrete details turned out to be wrong or incomplete when exercised against the real sandbox on 2026-09-03. **Confirmed** below means "verified by an actual request/response against `embedded-dev.bmoni.com`"; everything else in this file is transcribed from docs and unverified.

**Confirmed — `POST /v1/users`** (`bmoniApi.createUser` in `src/lib/bmoniApi.ts`):
- The docs describe an empty-body call. It's not — `firstName`, `email`, and `phoneNumber` are required (`lastName` appears optional).
- The response nests the id: `{ user: { bmoniUserId, firstName, lastName, email, phoneNumber, partnerName, ... } }`, not a top-level `{ bmoniUserId }`.
- The shared key's partner account is named `"BMONI Hackathon"`.
- User creation is scoped to the partner account, and `phoneNumber` must be unique within it. Because the shared key is public, the *documented test persona phone numbers* (`+2348000000000`, `+2348000000001`) are likely already claimed by someone else's test user under that same shared account — expect `409 Conflict` and use a different number if so.

**Confirmed — `PATCH /v1/users/{userId}/kyc`** (`bmoniApi.submitKyc`):
- This is a **partial-update endpoint**, not a single flat submission. Each call supplies one or more of these top-level sections, and the response tells you what's saved and what's still missing:
  ```json
  { "address": { "countryCode": "NGA", "state": "Lagos", "postalCode": "100001", "streetLine1": "1 Test Street", "city": "Lagos" },
    "personalInfo": { "dateOfBirth": "1990-01-01" },
    "sourceOfFunds": "salary" }
  ```
  Response: `{ success, saved: {section: true, ...}, canActivate, missing: [...] }`.
- The endpoint strictly whitelists fields — extra/misplaced fields (e.g. a flat `firstName`/`bvn`) are rejected with `"property X should not exist"`, not silently ignored.
- **BVN/NIN submission is unresolved.** Neither a flat `{ bvn }` nor `{ identity: { bvn } }` is accepted by `PATCH /kyc`. It appears to belong to the document-upload endpoint instead (see below), matching the original docs' phrasing of `bvn` as `type: 'bvn'` on an identification *document*, not a KYC profile field.

**Confirmed — `POST /v1/users/{userId}/kyc/activate`** (`bmoniApi.activateKyc`):
- The docs claim NGN and CAD activate with an empty body. False — `sumsubLevelName` is required for every region. Confirmed valid values for this sandbox account: `id-only | id-and-liveness | idv-and-phone-verification | bmoni-monerium` (the full enum also includes `id-liveness-and-poa`, `bmoni-etherfuse`, and two values used elsewhere in BMONI's system, `"KYC via API"` / `"KYC via API (with POA)"`, which this account rejected).
- Activation requires **identification and proof-of-address document images**, even for NGN — directly contradicting the docs, which describe NGN as document-upload-free. Confirmed response on an incomplete profile: `{ "activated": false, "message": "Profile incomplete. Missing: proofOfAddressDocuments, identificationDocuments, biometricDocuments" }`.

**Not confirmed — document upload** (`POST /v1/users/{userId}/kyc/documents/identification`):
- Confirmed to require a file: `type=bvn` + `documentNumber=<bvn>` with no file → `"At least one file (front) is required"`.
- The actual multipart field name for the file is **not** `front` — sending a file under that name returns `"Unexpected field - front"`, despite the error message above naming it. This wasn't resolved by guessing further. Options: ask developers@bkey.me for the exact multipart contract, or inspect a real request from BMONI's Flutter reference app (`example/lib/main.dart` in the `bmoni-proxy-api` repo, referenced by their docs but not a public URL this environment could fetch).
- Not attempted: `POST /v1/users/{userId}/kyc/documents/proof-of-address`, `POST /v1/users/{userId}/kyc/documents/biometric`.

**Not confirmed — everything past KYC**: `POST /onboarding/start-nigeria`, wallet provisioning (`owner-proof-challenges` / `create-managed`), and the transfer proposal lifecycle are all still exactly as described in BMONI's docs, unverified against a live call, because nothing got past the document-upload wall above. None of it is implemented in code yet either — `bmoniApi.ts` has no `startNigeriaOnboarding` call. In particular `ngnWalletIndex` in the `start-nigeria` body is undocumented anywhere; when this gets built, `0` (the standard single-wallet default) is the value to try first, unconfirmed.

## How Morrow uses it

- **App code wires stages 1, 2, and 6** of BMONI's six-stage lifecycle (create user, provision wallet, move money) — see `src/lib/bmoniApi.ts`, `src/lib/bmoniIdentity.ts`, `src/lib/bmoniSigner.ts`, and `RealBmoniAdapter` in `src/lib/bmoni.ts`.
- **Stages 3–5 (KYC, rail activation, funding) are manual, one-time, per-device setup** — see below. They involve document upload and human review; they cannot run inline in a payment flow.
- Set `EXPO_PUBLIC_BMONI_MODE=live` in `.env` to use the real adapter. Unset (or any other value) uses `LocalBmoniSandbox`, which never touches the network or the native signer — this is the default.
- **Live mode requires a native Expo Dev Client, not Expo Go.** The BMONI React Native SDK (`@bkey-inc/bmoni_embedded_sdk`) ships its own native iOS/Android code — a TurboModule for signing, Android Keystore / iOS Secure Enclave integration — which Expo Go cannot load at runtime. Run `npx expo prebuild` and `npx expo run:android` / `npx expo run:ios` (or an EAS development build) to test live mode. Requirements: React Native New Architecture (default since 0.76, and the only option on this project's SDK/RN version), iOS 15.1+, Android minSdk 24+, Android **arm64-v8a only** — BMONI's Android signer AAR ships a single ABI slice.

## One-time manual setup (per device, before live mode can settle anything)

1. Run the app once in live mode on the device. It provisions a wallet and calls `POST /v1/users`, then shows the resulting `bmoniUserId` on the **Home** tab under "Live mode: BMONI account". Copy it.
2. Run `npm run bmoni:setup setup <bmoniUserId> bunch-dillon` (or `samson-jabo`). This submits address/personal-info/source-of-funds and prints exactly what BMONI still reports missing — as of this writing, that's the document uploads described above. Resolve the multipart field-name question first (ask developers@bkey.me), then extend `scripts/bmoni-setup.mjs` to actually upload the identification and proof-of-address images before rerunning it.
3. Once `activate` returns `{ "activated": true }`, start Nigeria rail onboarding — not yet scripted; see the confirmed `POST /v1/users/{userId}/onboarding/start-nigeria` shape above and the `ngnWalletIndex` caveat.
4. Request sandbox test tokens at [/request-test-tokens](https://bkey.mintlify.app/request-test-tokens) with the phone number the account was created with. Each approved request grants NGN 1,000 and USD $10.00 — usually within one business day. Verify with `npm run bmoni:setup balance <bmoniUserId>`.
5. Repeat for the second device (the one playing the other role — merchant or customer). **A transfer proposal's `toUserId` must belong to your own partner account or it 404s** — both demo users must be created under the same `x-api-key`.

Only after both devices have completed every step will `RealBmoniAdapter.settle()` actually complete instead of hanging in the poll loop.

## P2P transfer lifecycle (what `RealBmoniAdapter.settle()` does — unverified, see above)

1. `POST /v1/users/{userId}/smart-wallets/{smartWalletId}/proposals` — `{ proposal: { type: 'TRANSFER', toUserId, amount, currency, description } }`. `toUserId` is the recipient's `bmoniUserId`; the address is resolved server-side.
2. `POST .../proposals/{proposalId}/approve`
3. `GET .../proposals/{proposalId}/sign-payload` → `hashToSign`
4. Sign `hashToSign` on-device as a **raw 32-byte digest** via `BmoniEmbeddedSdk.signTransactionHash` — no EIP-191 prefix, unlike the owner-proof-challenge signature in stage 2.
5. `POST .../proposals/{proposalId}/sign` with the signature
6. Poll `GET .../proposals/{proposalId}` until `status` is `COMPLETED` (or `FAILED`/`REJECTED`)

Smart-wallet and transfer calls take the **stablecoin** code, not the fiat one: `USDB`, `CNGN`, `CADC`, `EURe`, `GBPe`, `MEXe`. `src/lib/bmoniApi.ts`'s `stablecoinFor()` maps Morrow's `NGN`/`USD` currencies accordingly.

`smartWalletId` is assumed equal to the smart wallet's `address` field — the `create-managed` response BMONI documents doesn't show a separate `id` field. Given how much else in this section turned out to differ from the docs, verify this against a real response before relying on it.

## Required production work beyond this demo

- Confirm every request/response schema against BMONI's current OpenAPI source, not this docs scrape — and note that even the docs scrape needed real-API correction in several places (see above), so budget time for the rest of the flow to have similar surprises.
- A device PIN currently defaults to a fixed demo value (`DEMO_PIN` in `src/lib/bmoniIdentity.ts`) so the flow is runnable without a PIN-entry screen. A real app must collect this from the user.
- Add idempotency and a database unique constraint on Morrow request ID + nonce, server-side.
- Add webhook signature verification, audit logs, timeout/retry policy, and explicit `failed`/`pending`/`reversed` receipt states.
- Never log API keys, owner keys, PINs, raw signatures, BVNs, or identity documents.
- `RealBmoniAdapter` still treats `pollProposalStatus` reaching `COMPLETED` as settlement truth, which is correct, but the client-side poll should eventually move to a webhook so the app doesn't need to stay foregrounded.
