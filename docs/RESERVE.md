# Morrow Reserve

Real BMONI settlement requires connectivity to call BMONI's API — there is no way around that, and Morrow does not claim otherwise. Morrow Reserve is the answer to a narrower, achievable question: how do you let a device keep *spending* after connectivity drops, without pretending a network call happened when it didn't?

The model is not "move money offline." It's **pre-authorize spendable value while online, then transfer a signed claim to that value offline.**

```
Morrow Transport   optical device-to-device communication (existing)
Morrow Reserve     pre-authorized offline purchasing power (this)
Morrow Settlement  BMONI-backed online redemption (existing, gated on real BMONI KYC — see BMONI_INTEGRATION.md)
```

## What's real here, and what isn't

**Real:**
- Reserve provisioning, spending, and verification (`src/lib/reserve.ts`, `src/lib/deviceKeys.ts`) use genuine Ed25519 public-key signatures via [`@noble/curves`](https://github.com/paulmillr/noble-curves), a pure-JS, audited implementation with no native module dependency — it works in Expo Go, no dev client needed. The same device keypair also signs `PaymentConfirmation`s (`src/lib/confirmation.ts`) — see the "Morrow Wallet + confirmation loop" section of `docs/ARCHITECTURE.md`.
- Each device generates and persists its own keypair on first use (`AsyncStorage`, not hardware-backed — see Limitations).
- A `ReserveAllowance` (amount, currency, expiry) is signed by the device the moment it's provisioned.
- Each spend produces a signed `OfflineAuthorization` chained to the previous state via `previousStateHash`, with a monotonic `sequence` counter, bound to one specific `PaymentRequest.id` (so it's useless if intercepted and replayed against a different recipient), and checked against the remaining allowance balance before being issued.
- Verification (`verifyOfflineAuthorization`) is independently computable from the authorization alone — no shared secret, no network call. `src/lib/reserve.test.ts` proves: a genuine authorization verifies, a tampered one doesn't, one bound to the wrong request doesn't, spending more than what remains throws, an expired allowance is inert.

**Not real — and can't be, honestly, without more infrastructure:**
- **Funds are not actually segregated at BMONI.** There is no documented BMONI hold/reserve/escrow primitive (checked against their public docs). `createReserve()` produces a *device-signed commitment*, not a custodial guarantee. A production version would need BMONI to expose a real hold primitive, or Morrow would need to actually transfer the reserved amount into a Morrow-controlled wallet while online — which raises custody, licensing, and consumer-protection questions well beyond this app.
- **Double-spend prevention is partial.** `verifyOfflineAuthorization` catches a given `(allowanceId, sequence)` being redeemed twice *on the same device*, and the sequence/balance bookkeeping prevents the *issuing* device from producing two authorizations that together exceed the allowance. It cannot stop someone from cloning device state and presenting the same authorization to two different merchants before either reconnects — that requires either hardware-backed monotonic counters (Secure Enclave / StrongBox) or online reconciliation at redemption time. Full stop: this is the same limitation any offline-cash system has, and no amount of clever protocol design fully removes it without one of those two.
- **Redemption is not wired to BMONI yet.** A pending payment currently just sits in local history as `status: 'pending'`. Turning that into an actual BMONI transfer at redemption time is future work, and depends on the BMONI KYC/document-upload wall described in `docs/BMONI_INTEGRATION.md` being resolved first.

The UI reflects this honestly: a Reserve payment shows **"Payment verified — settlement pending,"** never "Payment settled." Only a real BMONI-confirmed transfer earns "Settled."

## How it works

1. **Provision** (Home tab, online): pick an amount, tap "Add to Reserve." The device signs a `ReserveAllowance` with its own keypair and stores it locally. Default validity: 24 hours.
2. **Spend** (Send tab, works with zero connectivity): scan a merchant's request as usual. If the amount fits within what's left in the Reserve, a second button appears — "Pay ₦X from Reserve (offline)." Tapping it deducts from the local allowance, signs an `OfflineAuthorization` bound to that specific request, and self-verifies it (proving the same check a receiving device would run actually passes) before showing the pending receipt.
3. **Redeem** (not yet built): when connectivity returns, the pending authorization needs to reach BMONI as a real transfer. This is the next piece — see the "Not real" section above for why it isn't done yet.

## Upgrade path

The device keypair here is Morrow's own, independent of BMONI's wallet key, specifically so Reserve works without the BMONI native SDK / Expo Dev Client (see `docs/BMONI_INTEGRATION.md` for why that SDK can't run in Expo Go). A production version could instead sign with the same secp256k1 key BMONI's wallet uses, or move key storage into Secure Enclave / StrongBox via `expo-secure-store`, closing the "cloned device state" gap described above.
