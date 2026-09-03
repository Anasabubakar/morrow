# Third-party notices

## Decimen Optical Transfer

Morrow's optical transport architecture and production extraction plan derive from **Decimen Optical Transfer** by Anas Abubakar:

https://github.com/Pendia/Decimen-Optical-QR-Transfer/tree/v0.3.0

The extracted fountain core is pinned to MIT-licensed tag `v0.3.0`, commit `29cba8fa25dd160c8b6aa18fe3b48fbc5bde2e36`. Copyright (c) 2026 Evan Crawley (Bash Alarmist). The full permission notice is preserved beside the source at `src/vendor/decimen/LICENSE`.

Morrow uses the upstream `LTEncoder`, `LTDecoder`, deterministic logarithm, robust-soliton distribution, and wire-stable frame index derivation unchanged. Do not replace these math routines with platform approximations; cross-engine determinism is part of the wire format. Newer Decimen releases must be license-reviewed before adoption.

## @noble/curves

Morrow Reserve's offline authorization signing (`src/lib/deviceKeys.ts`) uses [`@noble/curves`](https://github.com/paulmillr/noble-curves) by Paul Miller, MIT licensed, for Ed25519 signing and verification. See `docs/RESERVE.md` for how it's used.
